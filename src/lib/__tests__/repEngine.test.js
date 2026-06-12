// repEngine — FSM + fault-rule entegrasyonu, sentetik metrik dizileriyle.
// Sahte egzersiz config'i kullanılır (geometri squat.test.js'te ayrıca test edilir).

import { describe, it, expect } from "vitest";
import { createRepEngine } from "../repEngine";

const FRAME_MS = 33;

const depthRule = {
  id: "depth",
  label: "Derinlik",
  metric: "minKneeAngle",
  joints: [25, 26],
  phases: ["attemptClose"],
  predicate: { op: "gt", threshold: 100, tolerance: 0 },
  severity: "major",
  cameraHint: "side",
  message: "Biraz daha derine in",
  speech: "Biraz daha derine in",
};

const valgusRule = {
  id: "valgus",
  label: "Diz içe çökmesi",
  metric: "kneeValgusFPPA",
  joints: [23, 25, 27, 24, 26, 28],
  phases: ["descent", "bottom", "ascent"],
  predicate: { op: "lt", threshold: 165, tolerance: 3 },
  minFrames: 5,
  cooldownMs: 4000,
  severity: "critical",
  minVisibility: 0.6,
  cameraHint: "front45",
  message: "Dizlerini dışarı it",
  speech: "Dizlerini dışarı it",
};

function makeExercise(overrides = {}) {
  return {
    phases: { standingMin: 160, bottomMax: 100 },
    phaseConfirmFrames: 2,
    attemptBelow: 140,
    faultRules: [depthRule, valgusRule],
    computeMetrics: (lm) => lm?.metrics ?? null,
    ...overrides,
  };
}

/** Sentetik frame: metrikler landmark dizisine iliştirilir (sahte computeMetrics okur). */
function frame(metrics, visibility = 1) {
  const lm = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility,
  }));
  lm.metrics = metrics;
  return { landmarks: lm, worldLandmarks: null };
}

/** Frame dizisini motora sürer; tüm event'leri toplar. */
function run(engine, frames) {
  const events = [];
  frames.forEach((f, i) => {
    events.push(...engine.step(f, i * FRAME_MS));
  });
  return events;
}

/** kneeAngle dizisinden temiz frame'ler üretir. */
function squatFrames(angles, extra = {}, visibility = 1) {
  return angles.map((kneeAngle) =>
    frame({ kneeAngle, kneeValgusFPPA: 178, ...extra }, visibility)
  );
}

const rep = (n, v) => Array.from({ length: n }, () => v);

describe("createRepEngine — temel sayım", () => {
  it("derin squat tam tekrar sayılır, temiz (PASS)", () => {
    const engine = createRepEngine(makeExercise());
    const angles = [
      ...rep(5, 170), // standing
      ...rep(5, 130), // descent
      ...rep(6, 95), // bottom (≤100°)
      ...rep(5, 130), // ascent
      ...rep(6, 170), // standing → rep
    ];
    const events = run(engine, squatFrames(angles));

    const reps = events.filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
    expect(reps[0]).toMatchObject({ count: 1, faulty: false, faults: [] });
    expect(engine.getState().faultyCount).toBe(0);
  });

  it("yarım tekrar (100–140°) sayılmaz, derinlik uyarısı verir", () => {
    const engine = createRepEngine(makeExercise());
    const angles = [...rep(5, 170), ...rep(8, 120), ...rep(6, 170)];
    const events = run(engine, squatFrames(angles));

    expect(events.filter((e) => e.type === "rep")).toHaveLength(0);
    const warnings = events.filter((e) => e.type === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      rule: "depth",
      severity: "major",
      speech: "Biraz daha derine in",
    });
    expect(engine.getState().faultyCount).toBe(1);
  });

  it("attemptBelow üstünde kalan ufak diz bükmesi sessizce yok sayılır", () => {
    const engine = createRepEngine(makeExercise());
    const angles = [...rep(5, 170), ...rep(6, 150), ...rep(6, 170)];
    const events = run(engine, squatFrames(angles));

    expect(events.filter((e) => e.type !== "phase")).toHaveLength(0);
  });
});

describe("createRepEngine — fault entegrasyonu", () => {
  it("valgus tetiklenir, tekrar hatalı sayılır ve faults listesi döner", () => {
    const engine = createRepEngine(makeExercise());
    const frames = [
      ...squatFrames(rep(5, 170)),
      // İnişte sürekli valgus (FPPA 150 < 162) — ilk 2 frame faz onayında geçer,
      // descent onaylandıktan sonra 6 değerlendirilen frame > minFrames 5.
      ...rep(8, 0).map(() => frame({ kneeAngle: 130, kneeValgusFPPA: 150 })),
      ...squatFrames(rep(6, 95)),
      ...squatFrames(rep(5, 130)),
      ...squatFrames(rep(6, 170)),
    ];
    const events = run(engine, frames);

    const warnings = events.filter((e) => e.type === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ rule: "valgus", severity: "critical" });

    const reps = events.filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
    expect(reps[0]).toMatchObject({ faulty: true, faults: ["valgus"] });
    expect(engine.getState().faultyCount).toBe(1);
  });

  it("düşük visibility'de valgus SUSTURULUR — uyarı yok ama özette 'değerlendirilemedi'", () => {
    const engine = createRepEngine(makeExercise());
    // Tüm hareket düşük visibility + ihlalde FPPA — sessiz PASS olmamalı.
    const frames = [
      ...squatFrames(rep(5, 170), {}, 0.3),
      ...rep(5, 0).map(() => frame({ kneeAngle: 130, kneeValgusFPPA: 150 }, 0.3)),
      ...rep(6, 0).map(() => frame({ kneeAngle: 95, kneeValgusFPPA: 150 }, 0.3)),
      ...rep(5, 0).map(() => frame({ kneeAngle: 130, kneeValgusFPPA: 150 }, 0.3)),
      ...squatFrames(rep(6, 170), {}, 0.3),
    ];
    const events = run(engine, frames);

    expect(events.filter((e) => e.type === "warning")).toHaveLength(0);
    expect(events.filter((e) => e.type === "rep")).toHaveLength(1);

    const summary = engine.getSummary();
    const valgusStat = summary.rules.find((r) => r.id === "valgus");
    expect(valgusStat.unevaluated).toBe(true);
    expect(valgusStat.cameraHint).toBe("front45");
  });

  it("set özeti depth dahil kural başına ihlal sayısı verir", () => {
    const engine = createRepEngine(makeExercise());
    const angles = [
      ...rep(5, 170),
      ...rep(8, 120),
      ...rep(6, 170), // yarım tekrar → depth
      ...rep(8, 120),
      ...rep(6, 170), // ikinci yarım tekrar → depth
    ];
    run(engine, squatFrames(angles));

    const summary = engine.getSummary();
    expect(summary.repCount).toBe(0);
    expect(summary.faultyCount).toBe(2);
    const depthStat = summary.rules.find((r) => r.id === "depth");
    expect(depthStat.fires).toBe(2);
    expect(depthStat.label).toBe("Derinlik");
  });
});

describe("createRepEngine — kalibrasyon (zemin referansı)", () => {
  const heelRule = {
    id: "heel",
    label: "Topuk kalkması",
    metric: "heelLiftPct",
    joints: [29, 30],
    phases: ["descent", "bottom", "ascent"],
    predicate: { op: "gt", threshold: 2, tolerance: 0.5 },
    minFrames: 2,
    cooldownMs: 4000,
    severity: "major",
    minVisibility: 0.5,
    cameraHint: "side",
    message: "Topuklarını yerde tut",
    speech: "Topuklarını yerde tut",
  };

  function makeCalibratedExercise() {
    return makeExercise({
      faultRules: [depthRule, heelRule],
      calibration: {
        minStableFrames: 3,
        isStable: (m) => m.kneeAngle >= 160,
        capture: (lm) => ({ floorY: lm.heelY, bboxHeight: 0.5 }),
        finalize: (samples) => ({
          floorY:
            samples.reduce((s, x) => s + x.floorY, 0) / samples.length,
          bboxHeight: 0.5,
        }),
      },
      computeMetrics: (lm, wlm, calib) => {
        if (!lm?.metrics) return null;
        return {
          ...lm.metrics,
          heelLiftPct:
            calib && lm.heelY != null
              ? ((calib.floorY - lm.heelY) / calib.bboxHeight) * 100
              : null,
        };
      },
    });
  }

  function heelFrame(kneeAngle, heelY) {
    const f = frame({ kneeAngle });
    f.landmarks.heelY = heelY;
    return f;
  }

  it("set başı stabil ayakta karelerden zemin alınır; topuk kalkınca uyarı", () => {
    const engine = createRepEngine(makeCalibratedExercise());
    const frames = [
      // Ayakta 6 frame — 3'üncüden sonra kalibre (floorY ≈ 0.9)
      ...rep(6, 0).map(() => heelFrame(170, 0.9)),
      // İnişte topuk 0.86'ya kalkar → lift %8 > %2.5 (eşik+tol)
      ...rep(5, 0).map(() => heelFrame(130, 0.86)),
      ...rep(6, 0).map(() => heelFrame(95, 0.86)),
      ...rep(5, 0).map(() => heelFrame(130, 0.9)),
      ...rep(6, 0).map(() => heelFrame(170, 0.9)),
    ];
    const events = run(engine, frames);

    expect(engine.getState().calibrated).toBe(true);
    const heelWarnings = events.filter(
      (e) => e.type === "warning" && e.rule === "heel"
    );
    expect(heelWarnings).toHaveLength(1);
    expect(heelWarnings[0].speech).toBe("Topuklarını yerde tut");

    const reps = events.filter((e) => e.type === "rep");
    expect(reps).toHaveLength(1);
    expect(reps[0].faults).toContain("heel");
  });

  it("kalibrasyon yokken heel metriği null → kural susturulur, uyarı yok", () => {
    const engine = createRepEngine(makeCalibratedExercise());
    // Stabil ayakta faz yok — direkt iniş (kalibre edilemez).
    const frames = [
      ...rep(2, 0).map(() => heelFrame(170, 0.9)), // 2 < minStableFrames 3
      ...rep(8, 0).map(() => heelFrame(130, 0.8)),
      ...rep(6, 0).map(() => heelFrame(170, 0.9)),
    ];
    const events = run(engine, frames);

    expect(
      events.filter((e) => e.type === "warning" && e.rule === "heel")
    ).toHaveLength(0);
  });
});

describe("createRepEngine — kayıp ve reset", () => {
  it("metrik kaybında idle'a döner, reset sonrası temiz başlar", () => {
    const engine = createRepEngine(makeExercise());
    run(engine, squatFrames(rep(5, 170)));
    expect(engine.getState().phase).toBe("standing");

    // 30 boş frame → idle
    const lostEvents = run(
      engine,
      rep(31, 0).map(() => null)
    );
    expect(lostEvents.some((e) => e.type === "phase" && e.phase === "idle")).toBe(
      true
    );

    engine.reset();
    const state = engine.getState();
    expect(state).toMatchObject({ phase: "idle", repCount: 0, faultyCount: 0 });
    expect(engine.getSummary().rules.every((r) => r.fires === 0)).toBe(true);
  });
});
