// kneeRaise — computeMetrics (kalça fleksiyon açısı, aktif=daha bükük bacak) + rep FSM
// (genel repEngine, ayakta→tepe→ayakta = bir diz kaldırma) + visibility susturma.
// Denge ısınması → form kuralı minimal (tek attemptClose "kalça hizasına kaldır").

import { describe, it, expect } from "vitest";
import { kneeRaise } from "../kneeRaise";
import { createRepEngine } from "../../lib/repEngine";
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

// Ayakta: her iki bacak düz, uyluk gövdeyle hizalı → kalça açısı ~180°.
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

// SOL diz kalça hizasına kalkık: omuz(yukarı)→kalça→diz(ileri, kalça hizasında).
// Uyluk yatay-ileri (z+), gövde dikey → kalça açısı ~90°. Sağ bacak basılı (düz).
function leftKneeRaisedWorld() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: -0.18, y: 1.4, z: 0 },
    [LM.RIGHT_SHOULDER]: { x: 0.18, y: 1.4, z: 0 },
    [LM.LEFT_HIP]: { x: -0.12, y: 0.9, z: 0 },
    [LM.RIGHT_HIP]: { x: 0.12, y: 0.9, z: 0 },
    // Sol diz kalça hizasında, ileride (z+) → uyluk yatay → kalça ~90°.
    [LM.LEFT_KNEE]: { x: -0.12, y: 0.9, z: 0.45 },
    [LM.LEFT_ANKLE]: { x: -0.12, y: 0.45, z: 0.45 },
    // Sağ bacak basılı (düz, ~180°).
    [LM.RIGHT_KNEE]: { x: 0.12, y: 0.45, z: 0 },
    [LM.RIGHT_ANKLE]: { x: 0.12, y: 0.0, z: 0 },
  });
}

describe("kneeRaise.computeMetrics — kalça açısı / aktif bacak", () => {
  it("ayakta: aktif kalça açısı ~180° (her iki bacak düz)", () => {
    const m = kneeRaise.computeMetrics(makeLm2d(), standingWorld());
    expect(m.hipAngle).toBeGreaterThan(160);
  });

  it("sol diz kalkık: aktif (kalkan) bacak daha bükük → hipAngle düşer, activeSide=left", () => {
    const m = kneeRaise.computeMetrics(makeLm2d(), leftKneeRaisedWorld());
    expect(m.hipAngle).toBeLessThan(110);
    expect(m.activeSide).toBe("left");
    expect(m.hipAngleLeft).toBeLessThan(m.hipAngleRight);
  });

  it("worldLandmarks yokken 2D kalça açısına düşer (sayım sürer)", () => {
    const lm = makeLm2d({
      [LM.LEFT_SHOULDER]: { x: 0.5, y: 0.3 },
      [LM.LEFT_HIP]: { x: 0.5, y: 0.5 },
      [LM.LEFT_KNEE]: { x: 0.5, y: 0.7 },
      [LM.RIGHT_SHOULDER]: { x: 0.55, y: 0.3 },
      [LM.RIGHT_HIP]: { x: 0.55, y: 0.5 },
      [LM.RIGHT_KNEE]: { x: 0.55, y: 0.7 },
    });
    const m = kneeRaise.computeMetrics(lm, null);
    expect(m.hipAngle).toBeCloseTo(180, 0);
  });

  it("hiçbir bacak güvenilir değilse null (sayım donar)", () => {
    const lm = makeLm2d({
      [LM.LEFT_SHOULDER]: { visibility: 0.1 },
      [LM.LEFT_HIP]: { visibility: 0.1 },
      [LM.LEFT_KNEE]: { visibility: 0.1 },
      [LM.RIGHT_SHOULDER]: { visibility: 0.1 },
      [LM.RIGHT_HIP]: { visibility: 0.1 },
      [LM.RIGHT_KNEE]: { visibility: 0.1 },
    });
    expect(kneeRaise.computeMetrics(lm, null)).toBeNull();
  });
});

// --- rep FSM: hipAngle ile sürülen tekrar sayımı (genel motor) ---
// FSM, GERÇEK kneeRaise config'iyle (tracking eşikleri + phaseConfirmFrames +
// attemptClose depth kuralı) sürülür; yalnız computeMetrics, izole sayısal sürüş
// için hipAngle'ı doğrudan okuyacak şekilde sarmalanır (lunge.test.js deseni).
function fsmExercise() {
  return {
    ...kneeRaise,
    computeMetrics: (lm) => (lm ? { hipAngle: lm.hipAngle } : null),
  };
}

function makeEngine() {
  return createRepEngine(fsmExercise());
}

function drive(engine, angles) {
  const events = [];
  let t = 0;
  for (const a of angles) {
    t += 50;
    const frame = { landmarks: { hipAngle: a }, worldLandmarks: null };
    for (const e of engine.step(frame, t)) events.push(e);
  }
  return events;
}

// Bir diz kaldırma: ayakta(178) → KALKIYOR(descent ara bant) → tepe(top) →
// İNİYOR(ascent ara bant) → ayakta(178). attempt yalnız standing→descent
// geçişinde başladığından, ARA BANT (descent/ascent) phaseConfirmFrames kadar tutulur.
const HOLD = kneeRaise.phaseConfirmFrames + 1; // 5 frame onay payı
const rep5 = (v) => Array(HOLD).fill(v);
function fullRep(top = 88) {
  // 130 = ara bant (100<x<155) → descent/ascent onaylanır.
  return [...rep5(178), ...rep5(130), ...rep5(top), ...rep5(130), ...rep5(178)];
}

describe("kneeRaise rep FSM (genel repEngine, kalça açısı)", () => {
  it("bir diz kaldırma (ayakta→tepe→ayakta) +1 sayılır", () => {
    const engine = makeEngine();
    const reps = drive(engine, fullRep(88)).filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
    expect(reps[0].faulty).toBe(false);
  });

  it("alternat 4 kaldırma 4 kez sayılır (sol/sağ ayrımı olmadan toplam)", () => {
    const engine = makeEngine();
    const seq = [...fullRep(88), ...fullRep(92), ...fullRep(85), ...fullRep(95)];
    const reps = drive(engine, seq).filter((e) => e.type === "rep");
    expect(reps.map((r) => r.count)).toEqual([1, 2, 3, 4]);
  });

  it("yarım kaldırma (kalça hizasına gelmeyen) sayılmaz, uyarı verir", () => {
    const engine = makeEngine();
    // 120'ye iner (attemptBelow 135 altı, bottomMax 100 üstü) → hizaya gelmedi.
    const events = drive(engine, [...rep5(178), 140, ...rep5(120), 140, ...rep5(178)]);
    expect(events.filter((e) => e.type === "rep")).toHaveLength(0);
    const warn = events.find((e) => e.type === "warning" && e.rule === "depth");
    expect(warn).toBeTruthy();
    expect(warn.speech).toBe("Dizini kalça hizasına kaldır");
  });

  it("metrik kaybı uzun sürerse idle'a döner (yanlış sayım yok)", () => {
    const engine = makeEngine();
    drive(engine, [...rep5(178), 140, ...rep5(88)]);
    const events = [];
    let t = 2000;
    for (let i = 0; i < 35; i++) {
      t += 50;
      for (const e of engine.step(null, t)) events.push(e);
    }
    expect(events.some((e) => e.type === "phase" && e.phase === "idle")).toBe(true);
  });
});
