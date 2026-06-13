// lunge — computeMetrics (3D diz açısı + screen2d kneeOverToe + gövde) + rep FSM
// (genel repEngine, ön diz açısı) + fault kuralları (kneeOverToe tetik/tetiklememe,
// derinlik, gövde toleransı, visibility susturma).

import { describe, it, expect } from "vitest";
import { lunge } from "../lunge";
import { createRepEngine } from "../../lib/repEngine";
import { createFaultRuleEngine } from "../../lib/faultRules";
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

// World: y yukarı, z ileri (sagittal). Ayakta her iki bacak düz (diz ≈ 180°).
function standingWorld() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: -0.18, y: 1.4, z: 0 },
    [LM.RIGHT_SHOULDER]: { x: 0.18, y: 1.4, z: 0 },
    [LM.LEFT_HIP]: { x: -0.12, y: 0.9, z: 0 },
    [LM.RIGHT_HIP]: { x: 0.12, y: 0.9, z: 0 },
    [LM.LEFT_KNEE]: { x: -0.12, y: 0.45, z: 0 },
    [LM.RIGHT_KNEE]: { x: 0.12, y: 0.45, z: 0 },
    [LM.LEFT_ANKLE]: { x: -0.12, y: 0.0, z: 0 },
    [LM.RIGHT_ANKLE]: { x: 0.12, y: 0.0, z: 0 },
  });
}

// Lunge dip: SOL bacak ön (öne adım, z ileri), ön diz ~90° bükük; arka (sağ) bacak uzanmış.
function lungeBottomWorld() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: -0.18, y: 1.05, z: 0.2 },
    [LM.RIGHT_SHOULDER]: { x: 0.18, y: 1.05, z: 0.2 },
    [LM.LEFT_HIP]: { x: -0.12, y: 0.5, z: 0 },
    [LM.RIGHT_HIP]: { x: 0.12, y: 0.5, z: 0 },
    // Ön (sol) bacak: kalça(z0,y0.5)→diz(ileri z0.45, y0.45)→ayak(z0.45, y0).
    // Uyluk ~yatay, baldır ~dikey → diz açısı ~90°.
    [LM.LEFT_KNEE]: { x: -0.12, y: 0.45, z: 0.45 },
    [LM.LEFT_ANKLE]: { x: -0.12, y: 0.0, z: 0.45 },
    // Arka (sağ) bacak: geride uzanmış (diz hafif bükük, ~150°+).
    [LM.RIGHT_KNEE]: { x: 0.12, y: 0.25, z: -0.4 },
    [LM.RIGHT_ANKLE]: { x: 0.12, y: 0.0, z: -0.8 },
  });
}

describe("lunge.computeMetrics — diz açısı / aktif bacak / gövde / kneeOverToe", () => {
  it("ayakta: aktif diz açısı ~180° (her iki bacak düz)", () => {
    const m = lunge.computeMetrics(makeLm2d(), standingWorld());
    expect(m.kneeAngle).toBeGreaterThan(155);
  });

  it("lunge dip: aktif (ön) bacak daha bükük → kneeAngle düşer, activeSide ön bacak", () => {
    const m = lunge.computeMetrics(makeLm2d(), lungeBottomWorld());
    expect(m.kneeAngle).toBeLessThan(110); // ön diz belirgin bükük
    expect(m.activeSide).toBe("left"); // ön bacak = daha bükük olan
    expect(m.kneeAngleLeft).toBeLessThan(m.kneeAngleRight); // ön < arka
  });

  it("worldLandmarks yokken 2D diz açısına düşer (rep sayımı sürer)", () => {
    const lm = makeLm2d({
      [LM.LEFT_HIP]: { x: 0.5, y: 0.4 },
      [LM.LEFT_KNEE]: { x: 0.5, y: 0.6 },
      [LM.LEFT_ANKLE]: { x: 0.5, y: 0.8 },
      [LM.RIGHT_HIP]: { x: 0.55, y: 0.4 },
      [LM.RIGHT_KNEE]: { x: 0.55, y: 0.6 },
      [LM.RIGHT_ANKLE]: { x: 0.55, y: 0.8 },
    });
    const m = lunge.computeMetrics(lm, null);
    expect(m.kneeAngle).toBeCloseTo(180, 0);
  });

  it("kneeOverToe: diz ayak ucunun ÖNÜNDE → pozitif yüzde", () => {
    // Yan görüş (screen): ön ayak ucu ileride (sağda, ~yatay); diz ayak ucundan
    // DAHA sağda → ileri yönde ayak ucunu geçmiş.
    const lm = makeLm2d({
      [LM.LEFT_KNEE]: { x: 0.7, y: 0.55 }, // diz ayak ucundan ileride (sağda)
      [LM.LEFT_ANKLE]: { x: 0.5, y: 0.82 },
      [LM.LEFT_FOOT_INDEX]: { x: 0.62, y: 0.83 }, // ayak ucu ileri (yatay) yönü tanımlar
      [LM.RIGHT_KNEE]: { x: 0.5, y: 0.55 },
      [LM.RIGHT_ANKLE]: { x: 0.5, y: 0.82 },
      [LM.RIGHT_FOOT_INDEX]: { x: 0.5, y: 0.83 },
    });
    // Sol bacak aktif olsun diye sol diz daha bükük: world ile activeSide=left.
    const m = lunge.computeMetrics(lm, lungeBottomWorld());
    expect(m.activeSide).toBe("left");
    expect(m.kneeOverToePct).toBeGreaterThan(0); // diz ayak ucunu geçmiş
  });
});

// --- rep FSM: ön diz açısıyla sürülen tekrar sayımı (genel motor) ---

function kneeExercise() {
  return {
    id: "lunge-test",
    phaseConfirmFrames: 2,
    tracking: {
      primaryMetric: "kneeAngle",
      phases: { standingMin: 155, bottomMax: 95 },
      attemptBelow: 130,
    },
    faultRules: [
      {
        id: "depth",
        label: "Derinlik",
        metric: "minKneeAngle",
        phases: ["attemptClose"],
        predicate: { op: "gt", threshold: 95, tolerance: 0 },
        severity: "major",
        message: "Biraz daha derine in",
        speech: "Biraz daha derine in",
      },
    ],
    computeMetrics: (lm) => (lm ? { kneeAngle: lm.kneeAngle } : null),
  };
}

function drive(engine, angles) {
  const events = [];
  let t = 0;
  for (const a of angles) {
    t += 50;
    const frame = { landmarks: { kneeAngle: a }, worldLandmarks: null };
    for (const e of engine.step(frame, t)) events.push(e);
  }
  return events;
}

// Bir tam tekrar: ayakta(180) → iniş → dip(80) → çıkış → ayakta(180).
function fullRep(bottom = 80) {
  return [180, 180, 140, 110, bottom, bottom, 110, 140, 180, 180];
}

describe("lunge rep FSM (genel repEngine, ön diz açısı)", () => {
  it("dipten geçen tam iniş-kalkış +1 sayılır", () => {
    const engine = createRepEngine(kneeExercise());
    const reps = drive(engine, fullRep(80)).filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
    expect(reps[0].faulty).toBe(false);
  });

  it("3 ardışık tekrar 3 kez sayılır (alternat bacak ayrımı olmadan)", () => {
    const engine = createRepEngine(kneeExercise());
    const seq = [...fullRep(80), ...fullRep(88), ...fullRep(85)];
    const reps = drive(engine, seq).filter((e) => e.type === "rep");
    expect(reps.map((r) => r.count)).toEqual([1, 2, 3]);
  });

  it("yarım lunge (dibe inmeyen) sayılmaz, derinlik uyarısı verir", () => {
    const engine = createRepEngine(kneeExercise());
    // 110'a iner (attemptBelow 130 altı, bottomMax 95 üstü) → derinlik hatası.
    const events = drive(engine, [180, 180, 140, 110, 110, 140, 180, 180]);
    expect(events.filter((e) => e.type === "rep")).toHaveLength(0);
    const warn = events.find((e) => e.type === "warning" && e.rule === "depth");
    expect(warn).toBeTruthy();
    expect(warn.speech).toBe("Biraz daha derine in");
  });
});

// --- fault kuralları (frame motoru, gerçek lunge kuralları) ---

function fireFaults(metrics, phase, frames = 8, lm = makeLm2d()) {
  const engine = createFaultRuleEngine(lunge.faultRules);
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

describe("lunge fault kuralları — sayısal senaryo", () => {
  it("kneeOverToe: diz ayak ucunu belirgin geçti (%8) → kritik uyarı", () => {
    const events = fireFaults(
      { kneeAngle: 95, kneeOverToePct: 8, torsoTilt3d: 15 },
      "bottom"
    );
    const fire = events.find((e) => e.rule === "kneeOverToe");
    expect(fire).toBeTruthy();
    expect(fire.severity).toBe("critical");
    expect(fire.speech).toBe("Dizin ayak ucunu geçmesin");
  });

  it("kneeOverToe: diz ayak ucunun gerisinde (%2) → uyarı YOK", () => {
    const events = fireFaults(
      { kneeAngle: 95, kneeOverToePct: 2, torsoTilt3d: 15 },
      "bottom"
    );
    expect(events.find((e) => e.rule === "kneeOverToe")).toBeFalsy();
  });

  it("torso: hafif öne eğilme (25°) NORMAL → uyarı YOK (yanlış pozitif yok)", () => {
    const events = fireFaults(
      { kneeAngle: 95, kneeOverToePct: 2, torsoTilt3d: 25 },
      "bottom"
    );
    expect(events.find((e) => e.rule === "torso")).toBeFalsy();
  });

  it("torso: aşırı öne eğilme (50°) → uyarı tetiklenir", () => {
    const events = fireFaults(
      { kneeAngle: 95, kneeOverToePct: 2, torsoTilt3d: 50 },
      "bottom"
    );
    expect(events.find((e) => e.rule === "torso")).toBeTruthy();
  });

  it("düşük visibility'de kneeOverToe DEĞERLENDİRİLMEZ (sessiz PASS yok, susturulur)", () => {
    const lowVis = makeLm2d({
      [LM.LEFT_KNEE]: { visibility: 0.2 },
      [LM.LEFT_FOOT_INDEX]: { visibility: 0.2 },
      [LM.RIGHT_KNEE]: { visibility: 0.2 },
      [LM.RIGHT_FOOT_INDEX]: { visibility: 0.2 },
    });
    const events = fireFaults(
      { kneeAngle: 95, kneeOverToePct: 8, torsoTilt3d: 15 },
      "bottom",
      8,
      lowVis
    );
    // Görünürlük altında → kural fire ETMEZ (donar).
    expect(events.find((e) => e.rule === "kneeOverToe")).toBeFalsy();
    const summary = createFaultRuleEngine(lunge.faultRules);
    // Susturma kontrolü: aynı düşük-vis akışı özet "değerlendirilemedi" demeli.
    let t = 0;
    for (let i = 0; i < 8; i++) {
      t += 100;
      summary.step({
        metrics: { kneeAngle: 95, kneeOverToePct: 8, torsoTilt3d: 15 },
        landmarks: lowVis,
        phase: "bottom",
        timestamp: t,
      });
    }
    const knee = summary.getSummary().find((r) => r.id === "kneeOverToe");
    expect(knee.unevaluated).toBe(true);
  });

  it("faz dışında (idle) hiçbir frame kuralı tetiklenmez", () => {
    const events = fireFaults(
      { kneeAngle: 95, kneeOverToePct: 8, torsoTilt3d: 50 },
      "idle"
    );
    expect(events).toHaveLength(0);
  });
});
