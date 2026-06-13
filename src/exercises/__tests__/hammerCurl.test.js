// hammerCurl — computeMetrics (elbowAngle dirsek fleksiyonu, DİREKT) + rep FSM
// (genel repEngine, açık→bükük→açık) + elbowDrift frame kuralı + visibility susturma.

import { describe, it, expect } from "vitest";
import { hammerCurl } from "../hammerCurl";
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

// Kol AÇIK: omuz→dirsek→bilek neredeyse düz dizi (dirsek ~170°). Üst kol dikey,
// önkol da dikey (aşağı uzanmış).
function openArmLm() {
  return makeLm2d({
    [LM.LEFT_SHOULDER]: { x: 0.45, y: 0.3 },
    [LM.LEFT_ELBOW]: { x: 0.45, y: 0.55 },
    [LM.LEFT_WRIST]: { x: 0.45, y: 0.8 },
    [LM.RIGHT_SHOULDER]: { x: 0.55, y: 0.3 },
    [LM.RIGHT_ELBOW]: { x: 0.55, y: 0.55 },
    [LM.RIGHT_WRIST]: { x: 0.55, y: 0.8 },
  });
}

// Kol BÜKÜK: önkol yukarı katlanmış → bilek dirseğin üstünde, omuza yakın (dirsek ~40°).
function bentArmLm() {
  return makeLm2d({
    [LM.LEFT_SHOULDER]: { x: 0.45, y: 0.3 },
    [LM.LEFT_ELBOW]: { x: 0.45, y: 0.55 },
    [LM.LEFT_WRIST]: { x: 0.46, y: 0.33 }, // bilek dirseğin üstünde (katlanmış)
    [LM.RIGHT_SHOULDER]: { x: 0.55, y: 0.3 },
    [LM.RIGHT_ELBOW]: { x: 0.55, y: 0.55 },
    [LM.RIGHT_WRIST]: { x: 0.54, y: 0.33 },
  });
}

describe("hammerCurl.computeMetrics — elbowAngle (direkt fleksiyon)", () => {
  it("kol açık → elbowAngle YÜKSEK (FSM standing)", () => {
    const m = hammerCurl.computeMetrics(openArmLm(), null);
    expect(m.elbowAngle).toBeGreaterThan(150);
  });

  it("kol bükük → elbowAngle DÜŞÜK (FSM bottom)", () => {
    const m = hammerCurl.computeMetrics(bentArmLm(), null);
    expect(m.elbowAngle).toBeLessThan(65);
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
    expect(hammerCurl.computeMetrics(lm, null)).toBeNull();
  });
});

// --- rep FSM: elbowAngle ile sürülen sayım ---
function fsmExercise() {
  return {
    ...hammerCurl,
    computeMetrics: (lm) => (lm ? { elbowAngle: lm.elbowAngle } : null),
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
    const frame = { landmarks: { elbowAngle: a }, worldLandmarks: null };
    for (const e of engine.step(frame, t)) events.push(e);
  }
  return events;
}

const HOLD = hammerCurl.phaseConfirmFrames + 1;
const hold = (v) => Array(HOLD).fill(v);
// Bir tam tekrar: açık(165) → bükülüyor(ara 110) → bükük(bottom) → açılıyor(110) → açık(165).
function fullRep(bottom = 50) {
  return [...hold(165), ...hold(110), ...hold(bottom), ...hold(110), ...hold(165)];
}

describe("hammerCurl rep FSM (genel repEngine, elbowAngle)", () => {
  it("tam açık→bükük→açık +1 sayılır", () => {
    const reps = drive(makeEngine(), fullRep(50)).filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
    expect(reps[0].faulty).toBe(false);
  });

  it("3 ardışık tekrar 3 kez sayılır", () => {
    const seq = [...fullRep(50), ...fullRep(55), ...fullRep(45)];
    const reps = drive(makeEngine(), seq).filter((e) => e.type === "rep");
    expect(reps.map((r) => r.count)).toEqual([1, 2, 3]);
  });

  it("yarım bükme (tam bükülmeyen) sayılmaz, derinlik uyarısı verir", () => {
    // 90'a iner (attemptBelow 120 altı, bottomMax 65 üstü) → yarım.
    const events = drive(makeEngine(), [...hold(165), 110, ...hold(90), 110, ...hold(165)]);
    expect(events.filter((e) => e.type === "rep")).toHaveLength(0);
    const warn = events.find((e) => e.type === "warning" && e.rule === "depth");
    expect(warn).toBeTruthy();
    expect(warn.speech).toBe("Tam bük");
  });
});

// --- elbowDrift frame kuralı: üst kol dikeyden belirgin sapma (>25°) ---
describe("hammerCurl elbowDrift kuralı", () => {
  function runWithMetrics(metricsSeq, frames = 40) {
    let i = 0;
    const engine = createRepEngine({
      ...hammerCurl,
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

  it("üst kol dikeyden >30° saparsa → elbowDrift tetiklenir", () => {
    // bottom'a inmek için elbowAngle düşük; drift için upperArmTiltDeg yüksek.
    const lead = { elbowAngle: 165, upperArmTiltDeg: 5 };
    const drift = { elbowAngle: 55, upperArmTiltDeg: 40 };
    const events = runWithMetrics([lead, lead, lead, lead, lead, lead, ...Array(30).fill(drift)]);
    expect(events.some((e) => e.type === "warning" && e.rule === "elbowDrift")).toBe(true);
  });

  it("üst kol sabit (dikeye yakın, ~10°) → elbowDrift tetiklenmez", () => {
    const lead = { elbowAngle: 165, upperArmTiltDeg: 5 };
    const stable = { elbowAngle: 55, upperArmTiltDeg: 10 };
    const events = runWithMetrics([lead, lead, lead, lead, lead, lead, ...Array(30).fill(stable)]);
    expect(events.some((e) => e.type === "warning" && e.rule === "elbowDrift")).toBe(false);
  });
});
