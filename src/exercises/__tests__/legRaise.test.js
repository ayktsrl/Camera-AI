// legRaise — computeMetrics (kalça fleksiyonu omuz→kalça→ayakbileği, squat yönü) +
// rep FSM (genel repEngine, bacak yerde→yukarı→yerde = bir tekrar) + fault
// (depth / kneeBend) + visibility susturma. Yön: efor=bacak yukarı=DÜŞÜK açı (çevirme yok).

import { describe, it, expect } from "vitest";
import { legRaise } from "../legRaise";
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

// BACAK YERDE (sırtüstü, düz bacak): omuz-kalça-ayakbileği doğrusal (gövde+bacak tek hat
// yerde, z ekseni) → kalça açısı ~180°. Diz de düz (~180).
function legDownWorld() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: -0.12, y: 0.1, z: -0.5 },
    [LM.RIGHT_SHOULDER]: { x: 0.12, y: 0.1, z: -0.5 },
    [LM.LEFT_HIP]: { x: -0.12, y: 0.1, z: 0 },
    [LM.RIGHT_HIP]: { x: 0.12, y: 0.1, z: 0 },
    [LM.LEFT_KNEE]: { x: -0.12, y: 0.1, z: 0.45 },
    [LM.RIGHT_KNEE]: { x: 0.12, y: 0.1, z: 0.45 },
    [LM.LEFT_ANKLE]: { x: -0.12, y: 0.1, z: 0.9 },
    [LM.RIGHT_ANKLE]: { x: 0.12, y: 0.1, z: 0.9 },
  });
}

// BACAK YUKARI (dikey, düz): gövde yerde (z), bacak dikey yukarı (y+) → omuz-kalça-ayak
// açısı ~90°. Diz düz tutulmuş (kalça-diz-ayak ~180).
function legUpWorld() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: -0.12, y: 0.1, z: -0.5 },
    [LM.RIGHT_SHOULDER]: { x: 0.12, y: 0.1, z: -0.5 },
    [LM.LEFT_HIP]: { x: -0.12, y: 0.1, z: 0 },
    [LM.RIGHT_HIP]: { x: 0.12, y: 0.1, z: 0 },
    // Bacak dikey yukarı, düz: diz ve ayak kalçanın üstünde (y+) artan.
    [LM.LEFT_KNEE]: { x: -0.12, y: 0.5, z: 0 },
    [LM.RIGHT_KNEE]: { x: 0.12, y: 0.5, z: 0 },
    [LM.LEFT_ANKLE]: { x: -0.12, y: 0.9, z: 0 },
    [LM.RIGHT_ANKLE]: { x: 0.12, y: 0.9, z: 0 },
  });
}

// BACAK YUKARI ama DİZ BÜKÜK: ayak kalçaya doğru kıvrık → kalça-diz-ayak açısı küçük.
function legUpBentKneeWorld() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: -0.12, y: 0.1, z: -0.5 },
    [LM.RIGHT_SHOULDER]: { x: 0.12, y: 0.1, z: -0.5 },
    [LM.LEFT_HIP]: { x: -0.12, y: 0.1, z: 0 },
    [LM.RIGHT_HIP]: { x: 0.12, y: 0.1, z: 0 },
    [LM.LEFT_KNEE]: { x: -0.12, y: 0.5, z: 0 },
    [LM.RIGHT_KNEE]: { x: 0.12, y: 0.5, z: 0 },
    // Ayak diz seviyesinin gerisine (z+) kıvrık → diz açısı ~90°.
    [LM.LEFT_ANKLE]: { x: -0.12, y: 0.4, z: 0.4 },
    [LM.RIGHT_ANKLE]: { x: 0.12, y: 0.4, z: 0.4 },
  });
}

describe("legRaise.computeMetrics — kalça fleksiyonu (squat yönü)", () => {
  it("bacak yerde: kalça açısı yüksek (~180, standing)", () => {
    const m = legRaise.computeMetrics(makeLm2d(), legDownWorld());
    expect(m.hipAngle).toBeGreaterThan(150);
  });

  it("bacak yukarı: kalça açısı düşük (~90, bottom/efor)", () => {
    const m = legRaise.computeMetrics(makeLm2d(), legUpWorld());
    expect(m.hipAngle).toBeLessThan(110);
    // Düz bacak → diz açısı yüksek (kneeBend tetiklenmez)
    expect(m.kneeAngle).toBeGreaterThan(150);
  });

  it("diz bükükse kneeAngle düşer (kneeBend kuralı için)", () => {
    const m = legRaise.computeMetrics(makeLm2d(), legUpBentKneeWorld());
    expect(m.kneeAngle).toBeLessThan(140);
  });

  it("worldLandmarks yokken 2D'ye düşer (sayım sürer)", () => {
    const lm = makeLm2d({
      [LM.LEFT_SHOULDER]: { x: 0.5, y: 0.5 },
      [LM.LEFT_HIP]: { x: 0.5, y: 0.6 },
      [LM.LEFT_ANKLE]: { x: 0.5, y: 0.8 },
      [LM.RIGHT_SHOULDER]: { x: 0.52, y: 0.5 },
      [LM.RIGHT_HIP]: { x: 0.52, y: 0.6 },
      [LM.RIGHT_ANKLE]: { x: 0.52, y: 0.8 },
    });
    const m = legRaise.computeMetrics(lm, null);
    expect(m).not.toBeNull();
    expect(m.hipAngle).toBeCloseTo(180, 0);
  });

  it("hiçbir bacak güvenilir değilse null (sayım donar)", () => {
    const lm = makeLm2d({
      [LM.LEFT_SHOULDER]: { visibility: 0.1 },
      [LM.LEFT_HIP]: { visibility: 0.1 },
      [LM.LEFT_ANKLE]: { visibility: 0.1 },
      [LM.RIGHT_SHOULDER]: { visibility: 0.1 },
      [LM.RIGHT_HIP]: { visibility: 0.1 },
      [LM.RIGHT_ANKLE]: { visibility: 0.1 },
    });
    expect(legRaise.computeMetrics(lm, null)).toBeNull();
  });
});

// --- rep FSM: hipAngle ile sürülen tekrar sayımı (gerçek legRaise config) ---
function fsmExercise() {
  return {
    ...legRaise,
    computeMetrics: (lm) =>
      lm ? { hipAngle: lm.hipAngle, kneeAngle: lm.kneeAngle ?? 180 } : null,
  };
}

function makeEngine() {
  return createRepEngine(fsmExercise());
}

function drive(engine, frames) {
  const events = [];
  let t = 0;
  for (const f of frames) {
    t += 50;
    const frame = { landmarks: f, worldLandmarks: null };
    for (const e of engine.step(frame, t)) events.push(e);
  }
  return events;
}

const HOLD = legRaise.phaseConfirmFrames + 1;
// hipAngle frame = 33 görünür nokta dizisi (fault visibility kapısı) + metrik alanları
// (wrapper computeMetrics bunları okur). kneeAngle düz (180) varsayılan.
const hip = (v, knee = 180) => {
  const lm = Array.from({ length: 33 }, () => ({ visibility: 1, presence: 1 }));
  lm.hipAngle = v;
  lm.kneeAngle = knee;
  return lm;
};
const rep = (v, knee) => Array(HOLD).fill(hip(v, knee));
// Bir tekrar: yerde(175,standing) → ara(125) → yukarı(90,bottom) → ara(125) → yerde(175).
// standingMin=150, bottomMax=100 → 125 ara bant.
function fullRep(top = 90) {
  return [...rep(175), ...rep(125), ...rep(top), ...rep(125), ...rep(175)];
}

describe("legRaise rep FSM (genel repEngine, kalça açısı)", () => {
  it("bir bacak kaldırma (yerde→yukarı→yerde) +1 sayılır, hatasız", () => {
    const reps = drive(makeEngine(), fullRep(90)).filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
    expect(reps[0].faulty).toBe(false);
  });

  it("3 kaldırma 3 kez sayılır", () => {
    const seq = [...fullRep(90), ...fullRep(85), ...fullRep(95)];
    const reps = drive(makeEngine(), seq).filter((e) => e.type === "rep");
    expect(reps.map((r) => r.count)).toEqual([1, 2, 3]);
  });

  it("yarım kaldırma (yeterince kalkmayan) sayılmaz, depth uyarısı verir", () => {
    // 120'ye iner: attemptBelow=135 altı (deneme başladı), bottomMax=100 üstü (tam değil).
    const events = drive(makeEngine(), [
      ...rep(175), hip(130), ...rep(120), hip(130), ...rep(175),
    ]);
    expect(events.filter((e) => e.type === "rep")).toHaveLength(0);
    const warn = events.find((e) => e.type === "warning" && e.rule === "depth");
    expect(warn).toBeTruthy();
    expect(warn.speech).toBe("Bacaklarını daha yukarı kaldır");
  });

  it("metrik kaybı uzun sürerse idle'a döner (yanlış sayım yok)", () => {
    const engine = makeEngine();
    drive(engine, [...rep(175), hip(130), ...rep(90)]);
    const events = [];
    let t = 2000;
    for (let i = 0; i < 35; i++) {
      t += 50;
      for (const e of engine.step(null, t)) events.push(e);
    }
    expect(events.some((e) => e.type === "phase" && e.phase === "idle")).toBe(true);
  });
});

// --- fault: kneeBend (bacak yukarıda diz aşırı bükük = düz tutulmadı) ---
describe("legRaise fault — kneeBend (düz bacak)", () => {
  it("diz bükük (kneeAngle düşük) hareket boyunca uyarı verir", () => {
    // Diz açısı 120 (threshold 150, tolerance 5 → <145 ihlal). minFrames=6.
    const bent = (v) => Array(HOLD).fill(hip(v, 120));
    const events = drive(makeEngine(), [
      ...rep(175), hip(125, 120), ...bent(90), ...bent(90), hip(125, 120), ...rep(175),
    ]);
    const warn = events.find((e) => e.type === "warning" && e.rule === "kneeBend");
    expect(warn).toBeTruthy();
    expect(warn.speech).toBe("Bacaklarını düz tut");
  });

  it("düz bacak (kneeAngle ~180) kneeBend uyarısı VERMEZ", () => {
    const events = drive(makeEngine(), fullRep(90));
    expect(events.some((e) => e.type === "warning" && e.rule === "kneeBend")).toBe(false);
  });
});
