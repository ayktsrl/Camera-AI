// jumpingJack — computeMetrics (closedAngle = 180 - kol abduction) + rep FSM
// (genel repEngine, kapalı→açık→kapalı) + visibility susturma.
// Isınma → form kuralı minimal (tek attemptClose "tam aç"); frame kuralı yok.

import { describe, it, expect } from "vitest";
import { jumpingJack } from "../jumpingJack";
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

// Eller YANDA (kapalı): kalça→omuz→bilek neredeyse dikey dizi → küçük abduction.
// 2D ekran: omuz üstte, bilek omzun hemen altında-yanında → kol gövdeye yakın.
function closedArmsLm() {
  return makeLm2d({
    [LM.LEFT_HIP]: { x: 0.45, y: 0.6 },
    [LM.LEFT_SHOULDER]: { x: 0.45, y: 0.35 },
    [LM.LEFT_WRIST]: { x: 0.44, y: 0.58 }, // bilek aşağıda (kol yanda)
    [LM.RIGHT_HIP]: { x: 0.55, y: 0.6 },
    [LM.RIGHT_SHOULDER]: { x: 0.55, y: 0.35 },
    [LM.RIGHT_WRIST]: { x: 0.56, y: 0.58 },
  });
}

// Eller BAŞ ÜSTÜ (açık): bilek omzun ÜSTÜNDE → kalça→omuz→bilek ~düz (büyük abduction).
function openArmsLm() {
  return makeLm2d({
    [LM.LEFT_HIP]: { x: 0.45, y: 0.6 },
    [LM.LEFT_SHOULDER]: { x: 0.45, y: 0.35 },
    [LM.LEFT_WRIST]: { x: 0.45, y: 0.12 }, // bilek baş üstü (kol yukarı)
    [LM.RIGHT_HIP]: { x: 0.55, y: 0.6 },
    [LM.RIGHT_SHOULDER]: { x: 0.55, y: 0.35 },
    [LM.RIGHT_WRIST]: { x: 0.55, y: 0.12 },
  });
}

describe("jumpingJack.computeMetrics — closedAngle yönü", () => {
  it("eller yanda (kapalı) → closedAngle YÜKSEK (FSM standing)", () => {
    const m = jumpingJack.computeMetrics(closedArmsLm(), null);
    expect(m.closedAngle).toBeGreaterThan(150);
  });

  it("eller baş üstü (açık) → closedAngle DÜŞÜK (FSM bottom)", () => {
    const m = jumpingJack.computeMetrics(openArmsLm(), null);
    expect(m.closedAngle).toBeLessThan(60);
  });

  it("closedAngle = 180 - abduction (yön çevirme tutarlı)", () => {
    const m = jumpingJack.computeMetrics(openArmsLm(), null);
    expect(m.closedAngle).toBeCloseTo(180 - m.abduction, 5);
  });

  it("hiçbir kol güvenilir değilse null (sayım donar, yanlış saymaz)", () => {
    const lm = makeLm2d({
      [LM.LEFT_SHOULDER]: { visibility: 0.1 },
      [LM.LEFT_WRIST]: { visibility: 0.1 },
      [LM.LEFT_HIP]: { visibility: 0.1 },
      [LM.RIGHT_SHOULDER]: { visibility: 0.1 },
      [LM.RIGHT_WRIST]: { visibility: 0.1 },
      [LM.RIGHT_HIP]: { visibility: 0.1 },
    });
    expect(jumpingJack.computeMetrics(lm, null)).toBeNull();
  });
});

// --- rep FSM: closedAngle ile sürülen tekrar sayımı (genel motor) ---
// FSM, GERÇEK jumpingJack config'iyle (tracking eşikleri + phaseConfirmFrames +
// attemptClose depth kuralı) sürülür; yalnız computeMetrics, izole sayısal sürüş
// için closedAngle'ı doğrudan okuyacak şekilde sarmalanır (lunge.test.js deseni).
function fsmExercise() {
  return {
    ...jumpingJack,
    computeMetrics: (lm) => (lm ? { closedAngle: lm.closedAngle } : null),
  };
}

function makeEngine() {
  return createRepEngine(fsmExercise());
}

function drive(engine, angles) {
  const events = [];
  let t = 0;
  for (const a of angles) {
    t += 40; // hızlı tempo
    const frame = { landmarks: { closedAngle: a }, worldLandmarks: null };
    for (const e of engine.step(frame, t)) events.push(e);
  }
  return events;
}

// Bir tam tekrar: kapalı(165) → AÇILIYOR(descent ara bant) → açık(open) →
// KAPANIYOR(ascent ara bant) → kapalı(165). attempt yalnız standing→descent
// geçişinde başladığından, ARA BANT (descent/ascent) phaseConfirmFrames kadar tutulur.
const HOLD = jumpingJack.phaseConfirmFrames + 1; // 4 frame onay payı
const rep5 = (v) => Array(HOLD).fill(v);
function fullRep(open = 30) {
  // 100 = ara bant (60<x<150) → descent/ascent onaylanır.
  return [...rep5(165), ...rep5(100), ...rep5(open), ...rep5(100), ...rep5(165)];
}

describe("jumpingJack rep FSM (genel repEngine, closedAngle)", () => {
  it("tam kapalı→açık→kapalı +1 sayılır", () => {
    const engine = makeEngine();
    const reps = drive(engine, fullRep(30)).filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
    expect(reps[0].faulty).toBe(false);
  });

  it("3 ardışık tekrar 3 kez sayılır", () => {
    const engine = makeEngine();
    const seq = [...fullRep(30), ...fullRep(40), ...fullRep(35)];
    const reps = drive(engine, seq).filter((e) => e.type === "rep");
    expect(reps.map((r) => r.count)).toEqual([1, 2, 3]);
  });

  it("yarım açılma (tam açılmayan) sayılmaz, 'tam aç' uyarısı verir", () => {
    const engine = makeEngine();
    // 90'a iner (attemptBelow 110 altı, bottomMax 60 üstü) → tam açılmadı.
    // Standing onayı için lead-in; sonra 90'da takılıp standing'e döner.
    const events = drive(engine, [...rep5(165), 130, ...rep5(90), 130, ...rep5(165)]);
    expect(events.filter((e) => e.type === "rep")).toHaveLength(0);
    const warn = events.find((e) => e.type === "warning" && e.rule === "depth");
    expect(warn).toBeTruthy();
    expect(warn.speech).toBe("Kollarını tam yukarı aç");
  });

  it("metrik kaybı uzun sürerse idle'a döner (yanlış sayım yok)", () => {
    const engine = makeEngine();
    drive(engine, [...rep5(165), 100, ...rep5(30)]); // açık faz onaylı
    const events = [];
    let t = 1000;
    for (let i = 0; i < 35; i++) {
      t += 40;
      for (const e of engine.step(null, t)) events.push(e);
    }
    expect(events.some((e) => e.type === "phase" && e.phase === "idle")).toBe(true);
  });
});
