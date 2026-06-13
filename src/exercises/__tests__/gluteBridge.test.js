// gluteBridge — computeMetrics (bridgeAngle = 180 - kalça açısı, yön çevirme) + rep FSM
// (genel repEngine, yat→köprü→yat = bir tekrar) + fault (depth / hyperextension) +
// visibility susturma. Yön kritik: köprü (efor) = YÜKSEK kalça açısı = DÜŞÜK bridgeAngle
// = FSM "bottom" (squat'ın tersi; jumpingJack tekniğiyle çevrildi).

import { describe, it, expect } from "vitest";
import { gluteBridge } from "../gluteBridge";
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

// YAT (sırtüstü, bükük diz): gövde yerde (z ekseni), diz yukarı (y+) → kalça açısı
// (omuz→kalça→diz) ~90°. Yan görünüm; her iki taraf simetrik.
function lyingWorld() {
  return makeWlm({
    // Gövde yerde uzanmış: omuz baş tarafında (z-), kalça ayak tarafında (z+).
    [LM.LEFT_SHOULDER]: { x: -0.12, y: 0.1, z: -0.5 },
    [LM.RIGHT_SHOULDER]: { x: 0.12, y: 0.1, z: -0.5 },
    [LM.LEFT_HIP]: { x: -0.12, y: 0.1, z: 0 },
    [LM.RIGHT_HIP]: { x: 0.12, y: 0.1, z: 0 },
    // Diz yukarı (y+, bükük) → omuz-kalça-diz açısı ~90°.
    [LM.LEFT_KNEE]: { x: -0.12, y: 0.5, z: 0.1 },
    [LM.RIGHT_KNEE]: { x: 0.12, y: 0.5, z: 0.1 },
  });
}

// KÖPRÜ (kalça yukarı, gövde-uyluk düz hat): omuz→kalça→diz neredeyse doğrusal →
// kalça açısı ~170°. bridgeAngle ~10 → FSM "bottom" (efor).
function bridgeWorld() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: -0.12, y: 0.1, z: -0.5 },
    [LM.RIGHT_SHOULDER]: { x: 0.12, y: 0.1, z: -0.5 },
    // Kalça yukarı kalkmış (y+), omuz ile diz arasında düz hatta.
    [LM.LEFT_HIP]: { x: -0.12, y: 0.45, z: 0.0 },
    [LM.RIGHT_HIP]: { x: 0.12, y: 0.45, z: 0.0 },
    // Diz, omuzun karşı ucunda düz hattı tamamlar (omuz-kalça-diz ~180).
    [LM.LEFT_KNEE]: { x: -0.12, y: 0.8, z: 0.5 },
    [LM.RIGHT_KNEE]: { x: 0.12, y: 0.8, z: 0.5 },
  });
}

describe("gluteBridge.computeMetrics — bridgeAngle yön çevirme", () => {
  it("yat: kalça açısı küçük → bridgeAngle YÜKSEK (standing)", () => {
    const m = gluteBridge.computeMetrics(makeLm2d(), lyingWorld());
    expect(m.hipAngle).toBeLessThan(110);
    // bridgeAngle = 180 - hipAngle → yüksek (standing bandı, standingMin=50 üstü)
    expect(m.bridgeAngle).toBeGreaterThan(50);
  });

  it("köprü: kalça açısı büyük → bridgeAngle DÜŞÜK (bottom/efor)", () => {
    const m = gluteBridge.computeMetrics(makeLm2d(), bridgeWorld());
    expect(m.hipAngle).toBeGreaterThan(150);
    // bridgeAngle düşük → bottomMax=25 altına iner (efor fazı)
    expect(m.bridgeAngle).toBeLessThan(25);
  });

  it("worldLandmarks yokken 2D'ye düşer (sayım sürer)", () => {
    // 2D yan profil: omuz-kalça-diz dik açı civarı.
    const lm = makeLm2d({
      [LM.LEFT_SHOULDER]: { x: 0.3, y: 0.6 },
      [LM.LEFT_HIP]: { x: 0.5, y: 0.6 },
      [LM.LEFT_KNEE]: { x: 0.5, y: 0.4 },
      [LM.RIGHT_SHOULDER]: { x: 0.3, y: 0.62 },
      [LM.RIGHT_HIP]: { x: 0.5, y: 0.62 },
      [LM.RIGHT_KNEE]: { x: 0.5, y: 0.42 },
    });
    const m = gluteBridge.computeMetrics(lm, null);
    expect(m).not.toBeNull();
    expect(m.hipAngle).toBeCloseTo(90, 0);
    expect(m.bridgeAngle).toBeCloseTo(90, 0);
  });

  it("hiçbir taraf güvenilir değilse null (sayım donar)", () => {
    const lm = makeLm2d({
      [LM.LEFT_SHOULDER]: { visibility: 0.1 },
      [LM.LEFT_HIP]: { visibility: 0.1 },
      [LM.LEFT_KNEE]: { visibility: 0.1 },
      [LM.RIGHT_SHOULDER]: { visibility: 0.1 },
      [LM.RIGHT_HIP]: { visibility: 0.1 },
      [LM.RIGHT_KNEE]: { visibility: 0.1 },
    });
    expect(gluteBridge.computeMetrics(lm, null)).toBeNull();
  });
});

// --- rep FSM: bridgeAngle ile sürülen tekrar sayımı (gerçek gluteBridge config) ---
// FSM gerçek tracking eşikleri + phaseConfirmFrames + attemptClose depth ile sürülür;
// computeMetrics yalnız bridgeAngle'ı doğrudan okuyacak şekilde sarmalanır.
function fsmExercise() {
  return {
    ...gluteBridge,
    computeMetrics: (lm) =>
      lm ? { bridgeAngle: lm.bridgeAngle, hipAngle: 180 - lm.bridgeAngle } : null,
  };
}

function makeEngine() {
  return createRepEngine(fsmExercise());
}

// Frame landmark'ı = 33 görünür nokta dizisi (fault visibility kapısı geçsin) +
// metriği taşıyan ek alan (wrapper computeMetrics bunu okur).
function frameLm(bridgeAngle) {
  const lm = Array.from({ length: 33 }, () => ({ visibility: 1, presence: 1 }));
  lm.bridgeAngle = bridgeAngle;
  return lm;
}

function drive(engine, angles) {
  const events = [];
  let t = 0;
  for (const a of angles) {
    t += 50;
    const frame = { landmarks: frameLm(a), worldLandmarks: null };
    for (const e of engine.step(frame, t)) events.push(e);
  }
  return events;
}

const HOLD = gluteBridge.phaseConfirmFrames + 1;
const rep = (v) => Array(HOLD).fill(v);
// Bir köprü: yat (bridgeAngle 70, standing) → ara (38) → köprü tepe (15, bottom) →
// ara (38) → yat (70). standingMin=50, bottomMax=25 → 38 ara bant (descent/ascent).
function fullRep(top = 15) {
  return [...rep(70), ...rep(38), ...rep(top), ...rep(38), ...rep(70)];
}

describe("gluteBridge rep FSM (genel repEngine, bridgeAngle)", () => {
  it("bir köprü (yat→köprü→yat) +1 sayılır, hatasız", () => {
    const reps = drive(makeEngine(), fullRep(15)).filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
    expect(reps[0].faulty).toBe(false);
  });

  it("3 köprü 3 kez sayılır", () => {
    const seq = [...fullRep(15), ...fullRep(12), ...fullRep(18)];
    const reps = drive(makeEngine(), seq).filter((e) => e.type === "rep");
    expect(reps.map((r) => r.count)).toEqual([1, 2, 3]);
  });

  it("yarım köprü (tam kalkmayan) sayılmaz, depth uyarısı verir", () => {
    // bridgeAngle 35'e iner: attemptBelow=42 altı (deneme başladı) ama bottomMax=25 üstü
    // (tam köprü değil) → rep YOK + depth uyarısı.
    const events = drive(makeEngine(), [...rep(70), 38, ...rep(35), 38, ...rep(70)]);
    expect(events.filter((e) => e.type === "rep")).toHaveLength(0);
    const warn = events.find((e) => e.type === "warning" && e.rule === "depth");
    expect(warn).toBeTruthy();
    expect(warn.speech).toBe("Kalçanı daha yukarı kaldır");
  });

  it("metrik kaybı uzun sürerse idle'a döner (yanlış sayım yok)", () => {
    const engine = makeEngine();
    drive(engine, [...rep(70), 38, ...rep(15)]);
    const events = [];
    let t = 2000;
    for (let i = 0; i < 35; i++) {
      t += 50;
      for (const e of engine.step(null, t)) events.push(e);
    }
    expect(events.some((e) => e.type === "phase" && e.phase === "idle")).toBe(true);
  });
});

// --- fault: hyperextension (köprü fazında bridgeAngle çok düşük = aşırı bel kalkması) ---
describe("gluteBridge fault — hyperextension", () => {
  it("aşırı bel kalkması (bridgeAngle çok düşük) bottom fazında uyarı verir", () => {
    // Köprüde bridgeAngle 2'ye iner (hyperextension threshold 5, tolerance 1 → <4 ihlal).
    // minFrames=5 → ihlal bandında yeterince tutulmalı.
    const events = drive(makeEngine(), [
      ...rep(70), 38, ...rep(2), ...rep(2), ...rep(2), 38, ...rep(70),
    ]);
    const warn = events.find(
      (e) => e.type === "warning" && e.rule === "hyperextension"
    );
    expect(warn).toBeTruthy();
    expect(warn.speech).toBe("Beli aşırı kaldırma, kalçayı sık");
  });

  it("normal köprü (bridgeAngle ~15) hyperextension uyarısı VERMEZ", () => {
    const events = drive(makeEngine(), fullRep(15));
    expect(
      events.some((e) => e.type === "warning" && e.rule === "hyperextension")
    ).toBe(false);
  });
});
