// squat.computeMetrics — sentetik 3D world landmark geometrisiyle metrik testleri.

import { describe, it, expect } from "vitest";
import { squat } from "../squat";
import { LM } from "../../lib/pose";

/** 33 noktalı 2D landmark dizisi — tüm noktalar güvenilir. */
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

/** 33 noktalı 3D world dizisi (metre) — verilenler dışındakiler orijinde. */
function makeWlm(positions = {}) {
  const wlm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [idx, pos] of Object.entries(positions)) {
    wlm[idx] = pos;
  }
  return wlm;
}

/** Dimdik ayakta duruş (world, y yukarı): bacaklar düz, gövde dik. */
function standingWorld() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: -0.18, y: 0.5, z: 0 },
    [LM.RIGHT_SHOULDER]: { x: 0.18, y: 0.5, z: 0 },
    [LM.LEFT_HIP]: { x: -0.15, y: 0, z: 0 },
    [LM.RIGHT_HIP]: { x: 0.15, y: 0, z: 0 },
    [LM.LEFT_KNEE]: { x: -0.15, y: -0.45, z: 0 },
    [LM.RIGHT_KNEE]: { x: 0.15, y: -0.45, z: 0 },
    [LM.LEFT_ANKLE]: { x: -0.15, y: -0.9, z: 0 },
    [LM.RIGHT_ANKLE]: { x: 0.15, y: -0.9, z: 0 },
  });
}

/** 90° diz açılı duruş — dizler öne, ayak bilekleri altta. */
function deepSquatWorld() {
  const legs = (sx) => ({
    hip: { x: sx, y: 0, z: 0 },
    knee: { x: sx, y: -0.35, z: 0.35 },
    ankle: { x: sx, y: -0.7, z: 0 },
  });
  const l = legs(-0.15);
  const r = legs(0.15);
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: -0.18, y: 0.5, z: 0 },
    [LM.RIGHT_SHOULDER]: { x: 0.18, y: 0.5, z: 0 },
    [LM.LEFT_HIP]: l.hip,
    [LM.RIGHT_HIP]: r.hip,
    [LM.LEFT_KNEE]: l.knee,
    [LM.RIGHT_KNEE]: r.knee,
    [LM.LEFT_ANKLE]: l.ankle,
    [LM.RIGHT_ANKLE]: r.ankle,
  });
}

describe("squat.computeMetrics — 3D açılar", () => {
  it("ayakta: diz açısı ≈ 180°, gövde ≈ 0°, FPPA temiz, asimetri 0", () => {
    const m = squat.computeMetrics(makeLm2d(), standingWorld(), null);

    expect(m.kneeAngle).toBeCloseTo(180, 2);
    expect(m.torsoTilt3d).toBeCloseTo(0, 2);
    expect(m.kneeValgusFPPA).toBeCloseTo(180, 2);
    expect(m.kneeAsymmetry).toBeCloseTo(0, 4);
  });

  it("derin squat: 3D diz açısı ≈ 90° (dip eşiği 100° altı)", () => {
    const m = squat.computeMetrics(makeLm2d(), deepSquatWorld(), null);
    expect(m.kneeAngle).toBeCloseTo(90, 2);
  });

  it("medial diz çökmesi FPPA'yı 165° altına düşürür (valgus eşiği)", () => {
    const wlm = deepSquatWorld();
    // Sol diz içeri (medial, +x yönü) kaymış.
    wlm[LM.LEFT_KNEE] = { x: -0.05, y: -0.35, z: 0.35 };
    const m = squat.computeMetrics(makeLm2d(), wlm, null);

    expect(m.kneeValgusFPPA).toBeLessThan(165 - 3); // histerezis bandı altı
  });

  it("öne eğilmiş gövde 3D tilt verir (torso kuralı 55° eşiği)", () => {
    const wlm = standingWorld();
    // Omuzlar 60° öne: tan(60°) ≈ 1.732 → y 0.3, z 0.52
    wlm[LM.LEFT_SHOULDER] = { x: -0.18, y: 0.3, z: 0.52 };
    wlm[LM.RIGHT_SHOULDER] = { x: 0.18, y: 0.3, z: 0.52 };
    const m = squat.computeMetrics(makeLm2d(), wlm, null);

    expect(m.torsoTilt3d).toBeGreaterThan(55 + 3);
  });

  it("bacaklar arası açı farkı asimetri metriği üretir", () => {
    const wlm = standingWorld();
    // Sol diz bükük (≈90°), sağ düz (180°).
    wlm[LM.LEFT_KNEE] = { x: -0.15, y: -0.35, z: 0.35 };
    wlm[LM.LEFT_ANKLE] = { x: -0.15, y: -0.7, z: 0 };
    const m = squat.computeMetrics(makeLm2d(), wlm, null);

    expect(m.kneeAsymmetry).toBeGreaterThan(14 + 3);
  });

  it("bir bacak görünmüyorsa asimetri null (kural susar), diz açısı tek bacaktan", () => {
    const lm = makeLm2d({
      [LM.RIGHT_HIP]: { visibility: 0.1 },
      [LM.RIGHT_KNEE]: { visibility: 0.1 },
      [LM.RIGHT_ANKLE]: { visibility: 0.1 },
    });
    const m = squat.computeMetrics(lm, standingWorld(), null);

    expect(m.kneeAsymmetry).toBeNull();
    expect(m.kneeAngle).toBeCloseTo(180, 2);
  });
});

describe("squat.computeMetrics — topuk (screen-2D + kalibrasyon)", () => {
  it("kalibre zeminden kalkan topuk bbox-% lift verir", () => {
    const calib = { floorY: 0.9, bboxHeight: 0.5 };
    const lm = makeLm2d({
      [LM.LEFT_HEEL]: { y: 0.88 }, // 0.02 / 0.5 = %4
      [LM.RIGHT_HEEL]: { y: 0.9 },
    });
    const m = squat.computeMetrics(lm, standingWorld(), calib);

    expect(m.heelLiftPct).toBeCloseTo(4, 4);
  });

  it("topuk yerdeyken lift ≈ 0, kalibrasyon yokken null", () => {
    const calib = { floorY: 0.9, bboxHeight: 0.5 };
    const grounded = makeLm2d({
      [LM.LEFT_HEEL]: { y: 0.9 },
      [LM.RIGHT_HEEL]: { y: 0.9 },
    });
    expect(
      squat.computeMetrics(grounded, standingWorld(), calib).heelLiftPct
    ).toBeCloseTo(0, 4);
    expect(
      squat.computeMetrics(grounded, standingWorld(), null).heelLiftPct
    ).toBeNull();
  });
});

describe("squat.computeMetrics — fallback ve kalibrasyon spec'i", () => {
  it("worldLandmarks yokken 2D diz açısına düşer (rep sayımı sürer)", () => {
    const lm = makeLm2d({
      [LM.LEFT_HIP]: { x: 0.4, y: 0.3 },
      [LM.LEFT_KNEE]: { x: 0.4, y: 0.5 },
      [LM.LEFT_ANKLE]: { x: 0.4, y: 0.7 },
      [LM.RIGHT_HIP]: { x: 0.6, y: 0.3 },
      [LM.RIGHT_KNEE]: { x: 0.6, y: 0.5 },
      [LM.RIGHT_ANKLE]: { x: 0.6, y: 0.7 },
    });
    const m = squat.computeMetrics(lm, null, null);

    expect(m.kneeAngle).toBeCloseTo(180, 2);
    expect(m.kneeValgusFPPA).toBeNull(); // 3D gerektiren metrik susar
  });

  it("calibration.capture topukların en alt noktasını zemin alır", () => {
    const lm = makeLm2d({
      [LM.LEFT_HEEL]: { y: 0.88 },
      [LM.RIGHT_HEEL]: { y: 0.91 },
    });
    const sample = squat.calibration.capture(lm);

    expect(sample.floorY).toBeCloseTo(0.91, 6);
    expect(sample.bboxHeight).toBeGreaterThan(0);
  });

  it("calibration.isStable yalnız dik ayakta duruşta true", () => {
    expect(squat.calibration.isStable({ kneeAngle: 170, torsoTilt3d: 5 })).toBe(
      true
    );
    expect(squat.calibration.isStable({ kneeAngle: 150, torsoTilt3d: 5 })).toBe(
      false
    );
    expect(
      squat.calibration.isStable({ kneeAngle: 170, torsoTilt3d: 30 })
    ).toBe(false);
  });
});
