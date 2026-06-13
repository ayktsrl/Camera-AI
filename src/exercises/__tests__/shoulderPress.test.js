// shoulderPress — computeMetrics (pressDownAngle = 180 - dirsek açısı) + rep FSM
// (genel repEngine, omuzda→yukarı→omuzda) + elbowFlare frame kuralı + visibility susturma.

import { describe, it, expect } from "vitest";
import { shoulderPress } from "../shoulderPress";
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

// Eller OMUZDA (bükük): bilek omuz hizasında, dirsek yanda/altta → dirsek ~80°.
function atShoulderLm() {
  return makeLm2d({
    [LM.LEFT_HIP]: { x: 0.45, y: 0.7 },
    [LM.LEFT_SHOULDER]: { x: 0.45, y: 0.35 },
    [LM.LEFT_ELBOW]: { x: 0.3, y: 0.5 },
    [LM.LEFT_WRIST]: { x: 0.42, y: 0.33 },
    [LM.RIGHT_HIP]: { x: 0.55, y: 0.7 },
    [LM.RIGHT_SHOULDER]: { x: 0.55, y: 0.35 },
    [LM.RIGHT_ELBOW]: { x: 0.7, y: 0.5 },
    [LM.RIGHT_WRIST]: { x: 0.58, y: 0.33 },
  });
}

// Eller YUKARI (uzanmış): omuz→dirsek→bilek düz dikey dizi → dirsek ~175°.
function overheadLm() {
  return makeLm2d({
    [LM.LEFT_HIP]: { x: 0.45, y: 0.7 },
    [LM.LEFT_SHOULDER]: { x: 0.45, y: 0.35 },
    [LM.LEFT_ELBOW]: { x: 0.45, y: 0.2 },
    [LM.LEFT_WRIST]: { x: 0.45, y: 0.05 },
    [LM.RIGHT_HIP]: { x: 0.55, y: 0.7 },
    [LM.RIGHT_SHOULDER]: { x: 0.55, y: 0.35 },
    [LM.RIGHT_ELBOW]: { x: 0.55, y: 0.2 },
    [LM.RIGHT_WRIST]: { x: 0.55, y: 0.05 },
  });
}

describe("shoulderPress.computeMetrics — pressDownAngle yönü", () => {
  it("eller omuzda (bükük) → pressDownAngle YÜKSEK (FSM standing)", () => {
    const m = shoulderPress.computeMetrics(atShoulderLm(), null);
    expect(m.pressDownAngle).toBeGreaterThan(90);
  });

  it("eller yukarı (uzanmış) → pressDownAngle DÜŞÜK (FSM bottom)", () => {
    const m = shoulderPress.computeMetrics(overheadLm(), null);
    expect(m.pressDownAngle).toBeLessThan(30);
  });

  it("pressDownAngle = 180 - elbowAngle (yön çevirme tutarlı)", () => {
    const m = shoulderPress.computeMetrics(overheadLm(), null);
    expect(m.pressDownAngle).toBeCloseTo(180 - m.elbowAngle, 5);
  });

  it("hiçbir kol güvenilir değilse null (sayım donar)", () => {
    const lm = makeLm2d({
      [LM.LEFT_SHOULDER]: { visibility: 0.1 },
      [LM.LEFT_ELBOW]: { visibility: 0.1 },
      [LM.LEFT_WRIST]: { visibility: 0.1 },
      [LM.RIGHT_SHOULDER]: { visibility: 0.1 },
      [LM.RIGHT_ELBOW]: { visibility: 0.1 },
      [LM.RIGHT_WRIST]: { visibility: 0.1 },
    });
    expect(shoulderPress.computeMetrics(lm, null)).toBeNull();
  });
});

// --- rep FSM: pressDownAngle ile sürülen sayım ---
function fsmExercise() {
  return {
    ...shoulderPress,
    computeMetrics: (lm) => (lm ? { pressDownAngle: lm.pressDownAngle } : null),
  };
}
function makeEngine() {
  return createRepEngine(fsmExercise());
}
function drive(engine, angles) {
  const events = [];
  let t = 0;
  for (const a of angles) {
    t += 40;
    const frame = { landmarks: { pressDownAngle: a }, worldLandmarks: null };
    for (const e of engine.step(frame, t)) events.push(e);
  }
  return events;
}

const HOLD = shoulderPress.phaseConfirmFrames + 1;
const hold = (v) => Array(HOLD).fill(v);
// Bir tam tekrar: omuzda(100) → itiliyor(ara 60) → yukarı(bottom) → iniyor(60) → omuzda(100).
function fullRep(bottom = 10) {
  return [...hold(100), ...hold(60), ...hold(bottom), ...hold(60), ...hold(100)];
}

describe("shoulderPress rep FSM (genel repEngine, pressDownAngle)", () => {
  it("tam omuzda→yukarı→omuzda +1 sayılır", () => {
    const reps = drive(makeEngine(), fullRep(10)).filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
    expect(reps[0].faulty).toBe(false);
  });

  it("3 ardışık tekrar 3 kez sayılır", () => {
    const seq = [...fullRep(10), ...fullRep(15), ...fullRep(5)];
    const reps = drive(makeEngine(), seq).filter((e) => e.type === "rep");
    expect(reps.map((r) => r.count)).toEqual([1, 2, 3]);
  });

  it("yarım uzanma (tam uzanmayan) sayılmaz, derinlik uyarısı verir", () => {
    // 50'ye iner (attemptBelow 70 altı, bottomMax 30 üstü) → yarım.
    const events = drive(makeEngine(), [...hold(100), 60, ...hold(50), 60, ...hold(100)]);
    expect(events.filter((e) => e.type === "rep")).toHaveLength(0);
    const warn = events.find((e) => e.type === "warning" && e.rule === "depth");
    expect(warn).toBeTruthy();
    expect(warn.speech).toBe("Yukarı tam uzan");
  });
});

// --- elbowFlare frame kuralı: dirsek saf-yana açılma (abduction >75°) ---
// standing/descent/ascent fazlarında aktif (omuzda başlangıç pozu).
describe("shoulderPress elbowFlare kuralı", () => {
  function runWithMetrics(metricsSeq, frames = 40) {
    let i = 0;
    const engine = createRepEngine({
      ...shoulderPress,
      computeMetrics: () => metricsSeq[Math.min(i++, metricsSeq.length - 1)],
    });
    const lm = makeLm2d();
    const events = [];
    let t = 0;
    for (let k = 0; k < frames; k++) {
      t += 40;
      for (const e of engine.step({ landmarks: lm, worldLandmarks: lm }, t)) events.push(e);
    }
    return events;
  }

  it("dirsek saf yana açık (abduction >80°) → elbowFlare tetiklenir", () => {
    // standing fazında kalıp (pressDownAngle yüksek) flare metriği yüksek tutulur.
    const flare = { pressDownAngle: 100, elbowAbduction: 95 };
    const events = runWithMetrics(Array(40).fill(flare));
    expect(events.some((e) => e.type === "warning" && e.rule === "elbowFlare")).toBe(true);
  });

  it("dirsek hafif önde (abduction ~60°) → elbowFlare tetiklenmez", () => {
    const ok = { pressDownAngle: 100, elbowAbduction: 60 };
    const events = runWithMetrics(Array(40).fill(ok));
    expect(events.some((e) => e.type === "warning" && e.rule === "elbowFlare")).toBe(false);
  });
});
