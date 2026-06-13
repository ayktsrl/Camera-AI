// plank — izometrik computeMetrics (geçerli plank tespiti + yön-ayrımlı hat açıları)
// + holdEngine (geçerli plank → timer ilerler, bozulma → timer durur, visibility
//   susturma, otomatik bitiş) + hipSag/hipPike fault kuralı senaryosu.

import { describe, it, expect } from "vitest";
import { plank } from "../plank";
import { createHoldEngine } from "../../lib/holdEngine";
import { createFaultRuleEngine } from "../../lib/faultRules";
import { LM } from "../../lib/pose";

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

// Yandan görünüm, world (x ileri, y yukarı). Plank: omuz→kalça→ayak YATAY düz hat.
// hipDrop > 0 → kalça aşağı (sarkma); hipUp > 0 → kalça yukarı (pike).
function plankWorld({ hipDrop = 0, hipUp = 0 } = {}) {
  const bodyY = 0.6;
  const hipY = bodyY - hipDrop + hipUp;
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: 0, y: bodyY, z: -0.18 },
    [LM.RIGHT_SHOULDER]: { x: 0, y: bodyY, z: 0.18 },
    [LM.LEFT_HIP]: { x: 0.6, y: hipY, z: -0.12 },
    [LM.RIGHT_HIP]: { x: 0.6, y: hipY, z: 0.12 },
    [LM.LEFT_ANKLE]: { x: 1.15, y: bodyY, z: -0.12 },
    [LM.RIGHT_ANKLE]: { x: 1.15, y: bodyY, z: 0.12 },
  });
}

// DİKEY gövde (ayakta) — plank değil: omuz üstte, ayak altta.
function standingWorld() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: 0, y: 1.4, z: -0.18 },
    [LM.RIGHT_SHOULDER]: { x: 0, y: 1.4, z: 0.18 },
    [LM.LEFT_HIP]: { x: 0, y: 0.9, z: -0.12 },
    [LM.RIGHT_HIP]: { x: 0, y: 0.9, z: 0.12 },
    [LM.LEFT_ANKLE]: { x: 0, y: 0.05, z: -0.12 },
    [LM.RIGHT_ANKLE]: { x: 0, y: 0.05, z: 0.12 },
  });
}

describe("plank.computeMetrics — geçerli plank tespiti + yön ayrımı", () => {
  it("düz yatay plank: yatay + düz hat (≈180°), iki yön kuralı da temiz (180)", () => {
    const m = plank.computeMetrics(makeLm2d(), plankWorld());
    expect(m.isHorizontal).toBe(true);
    expect(m.bodyLineAngle).toBeGreaterThan(170);
    expect(m.horizontalTilt).toBeGreaterThan(80); // ~90 = tam yatay
    expect(m.bodyLineSag).toBe(180); // sarkma yok
    expect(m.bodyLinePike).toBe(180); // pike yok
  });

  it("kalça sarkması: bodyLineSag eşik altına düşer, bodyLinePike temiz kalır", () => {
    const m = plank.computeMetrics(makeLm2d(), plankWorld({ hipDrop: 0.35 }));
    expect(m.bodyLineSag).toBeLessThan(156 - 4); // hipSag tetik bandı
    expect(m.bodyLinePike).toBe(180); // ters yön — pike kuralı susar
  });

  it("kalça yukarı (pike): bodyLinePike eşik altına düşer, bodyLineSag temiz kalır", () => {
    const m = plank.computeMetrics(makeLm2d(), plankWorld({ hipUp: 0.35 }));
    expect(m.bodyLinePike).toBeLessThan(160 - 4); // hipPike tetik bandı
    expect(m.bodyLineSag).toBe(180); // ters yön — sag kuralı susar
  });

  it("dikey gövde (ayakta) yatay değildir → isHorizontal false", () => {
    const m = plank.computeMetrics(makeLm2d(), standingWorld());
    expect(m.isHorizontal).toBe(false);
  });

  it("worldLandmarks yoksa metrik null (izometrik 3D gerektirir)", () => {
    expect(plank.computeMetrics(makeLm2d(), null)).toBeNull();
  });

  it("gövde landmark'ları görünmüyorsa metrik null (susturma)", () => {
    const lm = makeLm2d({
      [LM.LEFT_HIP]: { visibility: 0.1 },
      [LM.RIGHT_HIP]: { visibility: 0.1 },
    });
    expect(plank.computeMetrics(lm, plankWorld())).toBeNull();
  });
});

// --- holdEngine: geçerli plank → timer ilerler; bozulma → timer durur ---

/** Motoru bir dizi (frame, dt) ile sürer; toplanan event'leri + son state'i döner. */
function driveHold(engine, steps) {
  const events = [];
  let t = 0;
  for (const { lm, wlm, dt = 100 } of steps) {
    t += dt;
    const frame = wlm === null && lm === null ? null : { landmarks: lm, worldLandmarks: wlm };
    for (const e of engine.step(frame, t)) events.push(e);
  }
  return { events, state: engine.getState() };
}

/** N kare geçerli plank. */
function holdFrames(n, opts = {}) {
  const lm = makeLm2d();
  const wlm = plankWorld(opts);
  return Array.from({ length: n }, () => ({ lm, wlm, dt: 100 }));
}

describe("plank holdEngine — geçerli tutuş timer'ı ilerletir", () => {
  it("geçerli plank pozisyonunda hold timer ilerler (süre birikir)", () => {
    const engine = createHoldEngine(plank);
    // enterFrames=4 onay + 10 kare tutuş (her kare 100ms).
    const { state } = driveHold(engine, holdFrames(20));
    expect(state.phase).toBe("holding");
    expect(state.heldMs).toBeGreaterThan(0);
    // ~ (20 - 4 onay) * 100ms civarı; en az birkaç yüz ms birikmeli.
    expect(state.heldSeconds).toBeGreaterThanOrEqual(1);
  });

  it("pozisyon bozulunca (ayakta) timer DURUR — biriken süre korunur, geri gitmez", () => {
    const engine = createHoldEngine(plank);
    const lmS = makeLm2d();
    // Önce tut, sonra dikey gövdeye geç (bozulma).
    const seq = [
      ...holdFrames(14), // tutuş → süre birikir
      ...Array.from({ length: 6 }, () => ({ lm: lmS, wlm: standingWorld(), dt: 100 })),
    ];
    const { state } = driveHold(engine, seq);
    const heldAfterBreak = state.heldMs;
    expect(state.phase).toBe("broken"); // tutuş koptu
    expect(heldAfterBreak).toBeGreaterThan(0); // birikmiş süre korundu

    // Bozuk kalmaya devam → süre artmaz (durdu).
    const { state: state2 } = driveHold(engine, [
      { lm: lmS, wlm: standingWorld(), dt: 100 },
      { lm: lmS, wlm: standingWorld(), dt: 100 },
    ]);
    expect(state2.heldMs).toBe(heldAfterBreak); // hiç artmadı
  });

  it("tekrar geçerli pozisyona dönülünce süre kaldığı yerden devam eder", () => {
    const engine = createHoldEngine(plank);
    const lmS = makeLm2d();
    driveHold(engine, holdFrames(14));
    const afterFirst = engine.getState().heldMs;
    // boz → tekrar tut
    driveHold(engine, [
      ...Array.from({ length: 3 }, () => ({ lm: lmS, wlm: standingWorld(), dt: 100 })),
      ...holdFrames(14),
    ]);
    expect(engine.getState().phase).toBe("holding");
    expect(engine.getState().heldMs).toBeGreaterThan(afterFirst); // devam etti
  });

  it("uzun süre bozuk kalınca 'end' sinyali verir (hands-free otomatik bitiş)", () => {
    const engine = createHoldEngine(plank);
    const lmS = makeLm2d();
    // tut → breakEndMs (6000) üstü bozuk kal (büyük dt'lerle hızla aş).
    const { events } = driveHold(engine, [
      ...holdFrames(8),
      { lm: lmS, wlm: standingWorld(), dt: 100 }, // broken'a düş
      { lm: lmS, wlm: standingWorld(), dt: 3500 },
      { lm: lmS, wlm: standingWorld(), dt: 3500 }, // toplam > 6000ms bozuk
    ]);
    expect(events.some((e) => e.type === "end")).toBe(true);
  });

  it("hiç tutuş olmadan (hep dikey) end sinyali çıkmaz", () => {
    const engine = createHoldEngine(plank);
    const lmS = makeLm2d();
    const { events } = driveHold(engine, [
      { lm: lmS, wlm: standingWorld(), dt: 4000 },
      { lm: lmS, wlm: standingWorld(), dt: 4000 },
    ]);
    expect(events.some((e) => e.type === "end")).toBe(false);
  });

  it("metrik kaybı (frame null) uzun sürerse tutuş kopar (timer durur)", () => {
    const engine = createHoldEngine(plank);
    driveHold(engine, holdFrames(14));
    expect(engine.getState().phase).toBe("holding");
    // 30+ null frame → tutuş koptu say.
    const nulls = Array.from({ length: 35 }, () => ({ lm: null, wlm: null, dt: 33 }));
    driveHold(engine, nulls);
    expect(engine.getState().phase).toBe("broken");
  });
});

// --- hipSag / hipPike fault kuralları — sayısal senaryo (frame motoru) ---

function fireFaults(metrics, phase, frames = 12) {
  const engine = createFaultRuleEngine(plank.faultRules);
  const lm = makeLm2d();
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

describe("plank fault kuralları — hipSag / hipPike sayısal senaryo", () => {
  it("hipSag: kalça düşük (sag 140°, pike temiz) → kritik uyarı", () => {
    const events = fireFaults(
      { bodyLineSag: 140, bodyLinePike: 180 },
      "holding"
    );
    const fire = events.find((e) => e.rule === "hipSag");
    expect(fire).toBeTruthy();
    expect(fire.severity).toBe("critical");
    // ters yön kuralı tetiklenmez
    expect(events.find((e) => e.rule === "hipPike")).toBeFalsy();
  });

  it("hipPike: kalça yukarı (pike 145°, sag temiz) → major uyarı", () => {
    const events = fireFaults(
      { bodyLineSag: 180, bodyLinePike: 145 },
      "holding"
    );
    const fire = events.find((e) => e.rule === "hipPike");
    expect(fire).toBeTruthy();
    expect(fire.severity).toBe("major");
    expect(events.find((e) => e.rule === "hipSag")).toBeFalsy();
  });

  it("düz hat (her iki yön 178°) → uyarı YOK", () => {
    const events = fireFaults(
      { bodyLineSag: 178, bodyLinePike: 178 },
      "holding"
    );
    expect(events).toHaveLength(0);
  });

  it("holding dışı fazda (broken/idle) hiçbir kural tetiklenmez", () => {
    const broken = fireFaults({ bodyLineSag: 130, bodyLinePike: 130 }, "broken");
    const idle = fireFaults({ bodyLineSag: 130, bodyLinePike: 130 }, "idle");
    expect(broken).toHaveLength(0);
    expect(idle).toHaveLength(0);
  });

  it("düşük visibility (gövde örtülü) → kural susar (fire yok)", () => {
    const engine = createFaultRuleEngine(plank.faultRules);
    // 6 joint ort. visibility < 0.6 olmalı (gövdenin yarısı örtülü).
    const lm = makeLm2d({
      [LM.LEFT_HIP]: { visibility: 0.2 },
      [LM.RIGHT_HIP]: { visibility: 0.2 },
      [LM.LEFT_SHOULDER]: { visibility: 0.2 },
      [LM.RIGHT_SHOULDER]: { visibility: 0.2 },
    });
    const events = [];
    let t = 0;
    for (let i = 0; i < 12; i++) {
      t += 100;
      for (const e of engine.step({
        metrics: { bodyLineSag: 130, bodyLinePike: 180 },
        landmarks: lm,
        phase: "holding",
        timestamp: t,
      })) {
        events.push(e);
      }
    }
    expect(events).toHaveLength(0);
    // özet: değerlendirilemedi
    const sag = engine.getSummary().find((r) => r.id === "hipSag");
    expect(sag.unevaluated).toBe(true);
  });
});
