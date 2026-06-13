// mountainClimber — computeMetrics (aktif=daha bükük bacağın kalça fleksiyonu +
// plank-hattı pike metriği) + rep FSM (genel repEngine, alternat diz çekme toplam
// sayım) + hipPike fault kuralı (plank hattını koru). kneeRaise.test.js + plank.test.js
// desenleri.

import { describe, it, expect } from "vitest";
import { mountainClimber } from "../mountainClimber";
import { createRepEngine } from "../../lib/repEngine";
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

// Plank, her iki bacak GERİDE uzanmış (yatay düz hat). World: x ileri, y yukarı.
// omuz→kalça→diz açısı ~180° (uyluk gövdeyle hizalı, geride).
function plankBothExtended() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: 0, y: 0.6, z: -0.18 },
    [LM.RIGHT_SHOULDER]: { x: 0, y: 0.6, z: 0.18 },
    [LM.LEFT_HIP]: { x: 0.6, y: 0.6, z: -0.12 },
    [LM.RIGHT_HIP]: { x: 0.6, y: 0.6, z: 0.12 },
    // Dizler kalçanın GERİSİNDE (x büyür), gövdeyle aynı hat → kalça ~180°.
    [LM.LEFT_KNEE]: { x: 0.9, y: 0.6, z: -0.12 },
    [LM.RIGHT_KNEE]: { x: 0.9, y: 0.6, z: 0.12 },
    [LM.LEFT_ANKLE]: { x: 1.15, y: 0.6, z: -0.12 },
    [LM.RIGHT_ANKLE]: { x: 1.15, y: 0.6, z: 0.12 },
  });
}

// Plank, SOL diz göğse (ileriye, omuza doğru) çekilmiş → sol kalça fleksiyonu ~90°.
// Sağ bacak geride uzanmış (~180°). Aktif = sol (daha bükük).
function plankLeftKneeIn() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: 0, y: 0.6, z: -0.18 },
    [LM.RIGHT_SHOULDER]: { x: 0, y: 0.6, z: 0.18 },
    [LM.LEFT_HIP]: { x: 0.6, y: 0.6, z: -0.12 },
    [LM.RIGHT_HIP]: { x: 0.6, y: 0.6, z: 0.12 },
    // Sol diz göğse doğru (x küçülür, omuza doğru) + yukarı → kalça ~90°.
    [LM.LEFT_KNEE]: { x: 0.6, y: 0.9, z: -0.12 },
    [LM.LEFT_ANKLE]: { x: 0.6, y: 1.1, z: -0.12 },
    // Sağ bacak geride uzanmış (~180°).
    [LM.RIGHT_KNEE]: { x: 0.9, y: 0.6, z: 0.12 },
    [LM.RIGHT_ANKLE]: { x: 1.15, y: 0.6, z: 0.12 },
  });
}

// Kalça PIKE (ters V) — kalça omuz-ayak hattının ÜSTÜNE çıkmış (y büyük).
function pikeWorld() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: 0, y: 0.6, z: -0.18 },
    [LM.RIGHT_SHOULDER]: { x: 0, y: 0.6, z: 0.18 },
    // Kalça yukarı kalkık (y = 1.0, hattın üstü) → ters V.
    [LM.LEFT_HIP]: { x: 0.6, y: 1.0, z: -0.12 },
    [LM.RIGHT_HIP]: { x: 0.6, y: 1.0, z: 0.12 },
    [LM.LEFT_KNEE]: { x: 0.9, y: 0.6, z: -0.12 },
    [LM.RIGHT_KNEE]: { x: 0.9, y: 0.6, z: 0.12 },
    [LM.LEFT_ANKLE]: { x: 1.15, y: 0.3, z: -0.12 },
    [LM.RIGHT_ANKLE]: { x: 1.15, y: 0.3, z: 0.12 },
  });
}

describe("mountainClimber.computeMetrics — aktif bacak + plank hattı", () => {
  it("her iki bacak geride: aktif kalça açısı yüksek (~180°)", () => {
    const m = mountainClimber.computeMetrics(makeLm2d(), plankBothExtended());
    expect(m.hipAngle).toBeGreaterThan(160);
    expect(m.bodyLinePike).toBe(180); // düz hat → pike kuralı susar
  });

  it("sol diz çekili: aktif (bükük) bacak sol → hipAngle düşer, activeSide=left", () => {
    const m = mountainClimber.computeMetrics(makeLm2d(), plankLeftKneeIn());
    expect(m.hipAngle).toBeLessThan(110);
    expect(m.activeSide).toBe("left");
    expect(m.hipAngleLeft).toBeLessThan(m.hipAngleRight);
  });

  it("kalça pike (ters V): bodyLinePike eşik altına düşer (kural tetiklenebilir)", () => {
    const m = mountainClimber.computeMetrics(makeLm2d(), pikeWorld());
    expect(m.bodyLinePike).toBeLessThan(156 - 4); // hipPike tetik bandı
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
    expect(mountainClimber.computeMetrics(lm, null)).toBeNull();
  });
});

// --- rep FSM: hipAngle ile sürülen tekrar sayımı (genel motor) ---
// FSM GERÇEK mountainClimber config'iyle (tracking eşikleri + phaseConfirmFrames:3 +
// attemptClose yok → depth kuralsız) sürülür; computeMetrics izole sayısal sürüş için
// hipAngle'ı doğrudan okuyacak şekilde sarmalanır (kneeRaise.test.js deseni).
function fsmExercise() {
  return {
    ...mountainClimber,
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

// Bir diz çekme: bacak geride(170) → çekiyor(ara bant) → göğüste(top) →
// uzatıyor(ara bant) → geride(170). phaseConfirmFrames:3 → 4 frame onay payı.
const HOLD = mountainClimber.phaseConfirmFrames + 1; // 4
const rep4 = (v) => Array(HOLD).fill(v);
function fullRep(top = 90) {
  // 125 = ara bant (100<x<155) → descent/ascent onaylanır.
  return [...rep4(170), ...rep4(125), ...rep4(top), ...rep4(125), ...rep4(170)];
}

describe("mountainClimber rep FSM — alternat diz çekme toplam sayım", () => {
  it("bir diz çekme (geride→göğüste→geride) +1 sayılır", () => {
    const engine = makeEngine();
    const reps = drive(engine, fullRep(90)).filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
  });

  it("alternat 4 diz çekme 4 kez sayılır (sol/sağ ayrımı olmadan TOPLAM)", () => {
    const engine = makeEngine();
    // Sol(90)/sağ(92)/sol(88)/sağ(94) — aktif bacak değişse de FSM hipAngle min'i okur,
    // toplam sayım: her çekme +1.
    const seq = [...fullRep(90), ...fullRep(92), ...fullRep(88), ...fullRep(94)];
    const reps = drive(engine, seq).filter((e) => e.type === "rep");
    expect(reps.map((r) => r.count)).toEqual([1, 2, 3, 4]);
  });
});

// --- hipPike fault kuralı — plank hattını koru (sayısal senaryo, frame motoru) ---

function fireFaults(metrics, phase, frames = 12) {
  const engine = createFaultRuleEngine(mountainClimber.faultRules);
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

describe("mountainClimber hipPike kuralı — plank hattını koru", () => {
  it("kalça pike (bodyLinePike 140°) → major uyarı 'pike yapma'", () => {
    const events = fireFaults({ bodyLinePike: 140 }, "bottom");
    const fire = events.find((e) => e.rule === "hipPike");
    expect(fire).toBeTruthy();
    expect(fire.severity).toBe("major");
    expect(fire.speech).toBe("Kalçanı sabit tut, pike yapma");
  });

  it("düz hat (bodyLinePike 180) → uyarı YOK", () => {
    expect(fireFaults({ bodyLinePike: 180 }, "bottom")).toHaveLength(0);
  });

  it("standing fazında değerlendirilmez (yalnız çekme fazları)", () => {
    expect(fireFaults({ bodyLinePike: 140 }, "standing")).toHaveLength(0);
  });
});
