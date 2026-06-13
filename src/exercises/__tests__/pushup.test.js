// push-up — computeMetrics (3D geometri) + rep FSM (genel repEngine, dirsek açısı)
// + 3 fault kuralı sayısal senaryosu (derinlik, bodyLine, neckLine).

import { describe, it, expect } from "vitest";
import { pushup } from "../pushup";
import { createRepEngine } from "../../lib/repEngine";
import { LM } from "../../lib/pose";

/** 33 noktalı 2D landmark — tüm noktalar güvenilir (veya override visibility). */
function makeLm2d(positions = {}) {
  const lm = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 1,
    presence: 1,
  }));
  for (const [idx, pos] of Object.entries(positions)) {
    lm[idx] = { visibility: 1, presence: 1, ...lm[idx], ...pos };
  }
  return lm;
}

function makeWlm(positions = {}) {
  const wlm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [idx, pos] of Object.entries(positions)) {
    wlm[idx] = pos;
  }
  return wlm;
}

// Yandan görünüm, world (y yukarı, x ileri). Gövde düz yatay hat: omuz→kalça→ayak.
// Kollar düz aşağı (yukarı poz, dirsek ≈ 180°).
function topPushupWorld({ elbowBend = 0, hipDrop = 0, headDrop = 0 } = {}) {
  // Yatay gövde: omuz x=0, kalça x=0.6, ayak x=1.1 (hepsi y≈0.6 = destek üstü).
  const bodyY = 0.6;
  return makeWlm({
    [LM.NOSE]: { x: -0.25, y: bodyY + headDrop, z: 0 },
    [LM.LEFT_SHOULDER]: { x: 0, y: bodyY, z: -0.18 },
    [LM.RIGHT_SHOULDER]: { x: 0, y: bodyY, z: 0.18 },
    [LM.LEFT_HIP]: { x: 0.6, y: bodyY - hipDrop, z: -0.12 },
    [LM.RIGHT_HIP]: { x: 0.6, y: bodyY - hipDrop, z: 0.12 },
    [LM.LEFT_ANKLE]: { x: 1.15, y: bodyY, z: -0.12 },
    [LM.RIGHT_ANKLE]: { x: 1.15, y: bodyY, z: 0.12 },
    // Dirsek/bilek: yukarıda kollar düz (dirsek 180°); elbowBend büküm açısını düşürür.
    // Basit: omuz altında bilek y=0; dirsek elbowBend ile öne kayar.
    [LM.LEFT_ELBOW]: { x: 0 + elbowBend * 0.3, y: bodyY - 0.3, z: -0.18 },
    [LM.RIGHT_ELBOW]: { x: 0 + elbowBend * 0.3, y: bodyY - 0.3, z: 0.18 },
    [LM.LEFT_WRIST]: { x: 0, y: bodyY - 0.6, z: -0.18 },
    [LM.RIGHT_WRIST]: { x: 0, y: bodyY - 0.6, z: 0.18 },
  });
}

describe("pushup.computeMetrics — gövde/boyun/dirsek açıları", () => {
  it("düz plank: bodyLine ≈ 180°, neckLine geniş, dirsek düz kollarda yüksek", () => {
    const m = pushup.computeMetrics(makeLm2d(), topPushupWorld());
    expect(m.bodyLineAngle).toBeGreaterThan(170); // omuz-kalça-ayak düz hat
    expect(m.elbowAngle).toBeGreaterThan(150); // kollar uzanmış
  });

  it("kalça sarkması bodyLine açısını eşik altına düşürür (bodyLine kuralı)", () => {
    const sag = pushup.computeMetrics(makeLm2d(), topPushupWorld({ hipDrop: 0.35 }));
    expect(sag.bodyLineAngle).toBeLessThan(156 - 4); // histerezis bandı altı
  });

  it("dirsek bükümü elbowAngle'ı düşürür (faz/derinlik sinyali)", () => {
    const straight = pushup.computeMetrics(makeLm2d(), topPushupWorld());
    const bent = pushup.computeMetrics(makeLm2d(), topPushupWorld({ elbowBend: 1 }));
    expect(bent.elbowAngle).toBeLessThan(straight.elbowAngle);
  });

  it("bir kol görünmüyorsa dirsek açısı tek koldan, kural susmaz", () => {
    const lm = makeLm2d({
      [LM.RIGHT_SHOULDER]: { visibility: 0.1 },
      [LM.RIGHT_ELBOW]: { visibility: 0.1 },
      [LM.RIGHT_WRIST]: { visibility: 0.1 },
    });
    const m = pushup.computeMetrics(lm, topPushupWorld());
    expect(m.elbowAngle).not.toBeNull();
  });

  it("worldLandmarks yokken 2D dirsek açısına düşer (rep sayımı sürer)", () => {
    const lm = makeLm2d({
      [LM.LEFT_SHOULDER]: { x: 0.3, y: 0.3 },
      [LM.LEFT_ELBOW]: { x: 0.3, y: 0.5 },
      [LM.LEFT_WRIST]: { x: 0.3, y: 0.7 },
      [LM.RIGHT_SHOULDER]: { x: 0.7, y: 0.3 },
      [LM.RIGHT_ELBOW]: { x: 0.7, y: 0.5 },
      [LM.RIGHT_WRIST]: { x: 0.7, y: 0.7 },
    });
    const m = pushup.computeMetrics(lm, null);
    expect(m.elbowAngle).toBeCloseTo(180, 1);
    expect(m.bodyLineAngle).toBeNull(); // 3D gerektiren metrik susar
  });
});

// --- rep FSM: dirsek açısıyla sürülen tekrar sayımı (genel motor) ---

/** Belirli dirsek açısı + düz gövde veren sahte frame (metrik enjekte etmek yerine
 *  computeMetrics'i atlayıp doğrudan motorun gördüğü açıyı kontrol için sentetik
 *  exercise kullanırız: gerçek pushup.computeMetrics'le elbowAngle üretmek zor olduğundan
 *  motoru izole etmek için elbowAngle'ı doğrudan veren minimal bir egzersiz kuruyoruz. */
function elbowExercise() {
  return {
    id: "pushup-test",
    phaseConfirmFrames: 2,
    tracking: {
      primaryMetric: "elbowAngle",
      phases: { standingMin: 155, bottomMax: 95 },
      attemptBelow: 130,
    },
    faultRules: [
      {
        id: "depth",
        label: "Derinlik",
        metric: "minElbowAngle",
        phases: ["attemptClose"],
        predicate: { op: "gt", threshold: 95, tolerance: 0 },
        severity: "major",
        message: "Daha aşağı in",
        speech: "Daha aşağı in",
      },
    ],
    computeMetrics: (lm) => (lm ? { elbowAngle: lm.elbowAngle } : null),
  };
}

/** Motoru bir dizi dirsek açısıyla sürer; toplanan event'leri döner. */
function drive(engine, angles) {
  const events = [];
  let t = 0;
  for (const a of angles) {
    t += 50;
    const frame = { landmarks: { elbowAngle: a }, worldLandmarks: null };
    for (const e of engine.step(frame, t)) events.push(e);
  }
  return events;
}

/** Bir tam tekrar dizisi: yukarı(180) → iniş → dip(80) → çıkış → yukarı(180). */
function fullRep(bottom = 80) {
  return [180, 180, 140, 120, bottom, bottom, 120, 140, 180, 180];
}

describe("push-up rep FSM (genel repEngine, dirsek açısı)", () => {
  it("dipten geçen tam tekrar +1 sayılır", () => {
    const engine = createRepEngine(elbowExercise());
    const events = drive(engine, [...fullRep(80)]);
    const reps = events.filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
    expect(reps[0].count).toBe(1);
    expect(reps[0].faulty).toBe(false);
  });

  it("3 ardışık tekrar 3 kez sayılır", () => {
    const engine = createRepEngine(elbowExercise());
    const seq = [...fullRep(80), ...fullRep(85), ...fullRep(82)];
    const reps = drive(engine, seq).filter((e) => e.type === "rep");
    expect(reps.map((r) => r.count)).toEqual([1, 2, 3]);
  });

  it("dibe ulaşmayan yarım tekrar sayılmaz, derinlik uyarısı verir", () => {
    const engine = createRepEngine(elbowExercise());
    // 120'ye kadar iner (attemptBelow 130 altı ama bottomMax 95 üstü) → derinlik hatası.
    const events = drive(engine, [180, 180, 140, 120, 120, 140, 180, 180]);
    expect(events.filter((e) => e.type === "rep")).toHaveLength(0);
    const warn = events.find((e) => e.type === "warning" && e.rule === "depth");
    expect(warn).toBeTruthy();
    expect(warn.speech).toBe("Daha aşağı in");
  });
});

// --- 3 fault kuralı sayısal senaryosu (gerçek pushup kuralları, frame motoru) ---

import { createFaultRuleEngine } from "../../lib/faultRules";

/** Verilen metrikleri frameRules motoruna minFrames kez besler; fire'ları döner. */
function fireFaults(metrics, phase, frames = 8) {
  const engine = createFaultRuleEngine(pushup.faultRules);
  const lm = makeLm2d(); // tüm landmark'lar görünür
  const events = [];
  let t = 0;
  for (let i = 0; i < frames; i++) {
    t += 100;
    for (const e of engine.step({ metrics, landmarks: lm, phase, timestamp: t })) {
      events.push(e);
    }
  }
  return events;
}

describe("push-up fault kuralları — sayısal senaryo", () => {
  it("bodyLine: kalça düşük (140°) → kritik uyarı tetiklenir", () => {
    const events = fireFaults(
      { elbowAngle: 100, bodyLineAngle: 140, neckLineAngle: 160 },
      "bottom"
    );
    const fire = events.find((e) => e.rule === "bodyLine");
    expect(fire).toBeTruthy();
    expect(fire.severity).toBe("critical");
  });

  it("bodyLine: düz gövde (178°) → uyarı YOK", () => {
    const events = fireFaults(
      { elbowAngle: 100, bodyLineAngle: 178, neckLineAngle: 160 },
      "bottom"
    );
    expect(events.find((e) => e.rule === "bodyLine")).toBeFalsy();
  });

  it("neckLine: boyun kırık (115°) → uyarı tetiklenir", () => {
    const events = fireFaults(
      { elbowAngle: 100, bodyLineAngle: 178, neckLineAngle: 115 },
      "descent"
    );
    expect(events.find((e) => e.rule === "neckLine")).toBeTruthy();
  });

  it("faz dışında (idle) hiçbir frame kuralı tetiklenmez", () => {
    const events = fireFaults(
      { elbowAngle: 100, bodyLineAngle: 140, neckLineAngle: 115 },
      "idle"
    );
    expect(events).toHaveLength(0);
  });
});
