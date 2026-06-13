// lateralRaise — computeMetrics (loweredAngle = 180 - kol abduction) + rep FSM
// (genel repEngine, aşağı→omuz hizası→aşağı) + tooHigh frame kuralı + visibility susturma.

import { describe, it, expect } from "vitest";
import { lateralRaise } from "../lateralRaise";
import { createRepEngine } from "../../lib/repEngine";
import { LM } from "../../lib/pose";

/** 33 noktalı 2D landmark — tümü güvenilir (veya override visibility). */
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

// Kol YANDA (aşağı): bilek omzun hemen altında → kalça→omuz→bilek küçük abduction.
function armsDownLm() {
  return makeLm2d({
    [LM.LEFT_HIP]: { x: 0.45, y: 0.6 },
    [LM.LEFT_SHOULDER]: { x: 0.45, y: 0.35 },
    [LM.LEFT_WRIST]: { x: 0.44, y: 0.58 },
    [LM.RIGHT_HIP]: { x: 0.55, y: 0.6 },
    [LM.RIGHT_SHOULDER]: { x: 0.55, y: 0.35 },
    [LM.RIGHT_WRIST]: { x: 0.56, y: 0.58 },
  });
}

// Kol OMUZ HİZASINDA: bilek omuzla aynı yükseklikte, yana açık → abduction ~90°.
function armsAtShoulderLm() {
  return makeLm2d({
    [LM.LEFT_HIP]: { x: 0.45, y: 0.6 },
    [LM.LEFT_SHOULDER]: { x: 0.45, y: 0.35 },
    [LM.LEFT_WRIST]: { x: 0.2, y: 0.35 }, // bilek omuz hizası, yana açık
    [LM.RIGHT_HIP]: { x: 0.55, y: 0.6 },
    [LM.RIGHT_SHOULDER]: { x: 0.55, y: 0.35 },
    [LM.RIGHT_WRIST]: { x: 0.8, y: 0.35 },
  });
}

describe("lateralRaise.computeMetrics — loweredAngle yönü", () => {
  it("kol aşağıda → loweredAngle YÜKSEK (FSM standing)", () => {
    const m = lateralRaise.computeMetrics(armsDownLm(), null);
    expect(m.loweredAngle).toBeGreaterThan(150);
  });

  it("kol omuz hizasında → loweredAngle DÜŞÜK (FSM bottom)", () => {
    const m = lateralRaise.computeMetrics(armsAtShoulderLm(), null);
    expect(m.loweredAngle).toBeLessThan(100);
  });

  it("loweredAngle = 180 - abduction (yön çevirme tutarlı)", () => {
    const m = lateralRaise.computeMetrics(armsAtShoulderLm(), null);
    expect(m.loweredAngle).toBeCloseTo(180 - m.abduction, 5);
  });

  it("hiçbir kol güvenilir değilse null (sayım donar)", () => {
    const lm = makeLm2d({
      [LM.LEFT_SHOULDER]: { visibility: 0.1 },
      [LM.LEFT_WRIST]: { visibility: 0.1 },
      [LM.LEFT_HIP]: { visibility: 0.1 },
      [LM.RIGHT_SHOULDER]: { visibility: 0.1 },
      [LM.RIGHT_WRIST]: { visibility: 0.1 },
      [LM.RIGHT_HIP]: { visibility: 0.1 },
    });
    expect(lateralRaise.computeMetrics(lm, null)).toBeNull();
  });
});

// --- rep FSM: loweredAngle ile sürülen sayım (lunge.test deseni: izole sayısal sürüş) ---
function fsmExercise() {
  return {
    ...lateralRaise,
    computeMetrics: (lm) => (lm ? { loweredAngle: lm.loweredAngle } : null),
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
    const frame = { landmarks: { loweredAngle: a }, worldLandmarks: null };
    for (const e of engine.step(frame, t)) events.push(e);
  }
  return events;
}

const HOLD = lateralRaise.phaseConfirmFrames + 1;
const hold = (v) => Array(HOLD).fill(v);
// Bir tam tekrar: aşağı(165) → kalkıyor(ara 120) → omuz hizası(bottom) → iniyor(120) → aşağı(165).
function fullRep(bottom = 90) {
  return [...hold(165), ...hold(120), ...hold(bottom), ...hold(120), ...hold(165)];
}

describe("lateralRaise rep FSM (genel repEngine, loweredAngle)", () => {
  it("tam aşağı→omuz hizası→aşağı +1 sayılır", () => {
    const reps = drive(makeEngine(), fullRep(90)).filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
    expect(reps[0].faulty).toBe(false);
  });

  it("3 ardışık tekrar 3 kez sayılır", () => {
    const seq = [...fullRep(90), ...fullRep(95), ...fullRep(85)];
    const reps = drive(makeEngine(), seq).filter((e) => e.type === "rep");
    expect(reps.map((r) => r.count)).toEqual([1, 2, 3]);
  });

  it("yarım tekrar (omuz hizasına gelmeyen) sayılmaz, derinlik uyarısı verir", () => {
    // 115'e iner (attemptBelow 130 altı, bottomMax 100 üstü) → yarım.
    const events = drive(makeEngine(), [...hold(165), 130, ...hold(115), 130, ...hold(165)]);
    expect(events.filter((e) => e.type === "rep")).toHaveLength(0);
    const warn = events.find((e) => e.type === "warning" && e.rule === "depth");
    expect(warn).toBeTruthy();
    expect(warn.speech).toBe("Kolu omuz hizasına kaldır");
  });
});

// --- tooHigh frame kuralı: omuz hizasını belirgin geçme (abduction >100°) ---
// Gerçek landmark (visibility=1) + enjekte metrik: rule engine visibility'yi
// frame.landmarks'tan, değeri override computeMetrics'ten okur.
describe("lateralRaise tooHigh kuralı", () => {
  // Enjekte metrik dizisi sürer; landmark sabit (tüm joint'ler güvenilir).
  function runWithMetrics(metricsSeq, frames = 30) {
    let i = 0;
    const engine = createRepEngine({
      ...lateralRaise,
      computeMetrics: () => metricsSeq[Math.min(i++, metricsSeq.length - 1)],
    });
    const lm = makeLm2d(); // tüm noktalar visibility 1 → susturma yok
    const events = [];
    let t = 0;
    for (let k = 0; k < frames; k++) {
      t += 40;
      for (const e of engine.step({ landmarks: lm, worldLandmarks: lm }, t)) {
        events.push(e);
      }
    }
    return events;
  }

  it("abduction omuz hizasının belirgin üstünde (>105°) → tooHigh tetiklenir", () => {
    // bottom fazına geçmek için loweredAngle düşük (abduction yüksek).
    // abduction 115 → loweredAngle 65 (bottom). tooHigh threshold 100+tol5 → >105 tetikler.
    const lead = { loweredAngle: 165, abduction: 15 };
    const high = { loweredAngle: 65, abduction: 115 };
    const events = runWithMetrics([lead, lead, lead, lead, lead, lead, ...Array(30).fill(high)], 40);
    expect(events.some((e) => e.type === "warning" && e.rule === "tooHigh")).toBe(true);
  });

  it("abduction omuz hizasında (~90°) → tooHigh tetiklenmez", () => {
    const lead = { loweredAngle: 165, abduction: 15 };
    const ok = { loweredAngle: 90, abduction: 90 };
    const events = runWithMetrics([lead, lead, lead, lead, lead, lead, ...Array(30).fill(ok)], 40);
    expect(events.some((e) => e.type === "warning" && e.rule === "tooHigh")).toBe(false);
  });
});
