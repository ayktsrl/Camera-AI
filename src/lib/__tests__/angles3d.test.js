// 3D açı utilleri — bilinen geometri + kamera (rotasyon) bağımsızlığı testleri.

import { describe, it, expect } from "vitest";
import {
  angleAtPoint3D,
  verticalTiltDeg3D,
  midpoint3D,
  fppaDeg,
} from "../angles3d";

/** Y ekseni etrafında döndürme — kişinin kameraya dönük açısını simüle eder. */
function rotateY(p, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: p.x * cos + p.z * sin,
    y: p.y,
    z: -p.x * sin + p.z * cos,
  };
}

describe("angleAtPoint3D", () => {
  it("düz bacak 180° verir", () => {
    const hip = { x: 0, y: 0, z: 0 };
    const knee = { x: 0, y: -0.4, z: 0 };
    const ankle = { x: 0, y: -0.8, z: 0 };
    expect(angleAtPoint3D(hip, knee, ankle)).toBeCloseTo(180, 4);
  });

  it("dik eklem 90° verir", () => {
    const hip = { x: 0, y: 0, z: 0 };
    const knee = { x: 0, y: -0.4, z: 0 };
    const ankle = { x: 0, y: -0.4, z: 0.4 };
    expect(angleAtPoint3D(hip, knee, ankle)).toBeCloseTo(90, 4);
  });

  it("kamera açısından bağımsızdır — 30° dönük aynı açıyı verir", () => {
    const hip = { x: 0.1, y: 0, z: 0 };
    const knee = { x: 0.1, y: -0.35, z: 0.15 };
    const ankle = { x: 0.1, y: -0.7, z: 0 };

    const straight = angleAtPoint3D(hip, knee, ankle);
    const rotated = angleAtPoint3D(
      rotateY(hip, 30),
      rotateY(knee, 30),
      rotateY(ankle, 30)
    );

    expect(rotated).toBeCloseTo(straight, 6);
  });

  it("eksik nokta için null döner", () => {
    expect(angleAtPoint3D(null, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
  });
});

describe("verticalTiltDeg3D", () => {
  it("dimdik gövde 0° verir", () => {
    const hip = { x: 0, y: 0, z: 0 };
    const shoulder = { x: 0, y: 0.5, z: 0 };
    expect(verticalTiltDeg3D(hip, shoulder)).toBeCloseTo(0, 4);
  });

  it("45° öne eğilme 45° verir — kameraya dönmekten etkilenmez", () => {
    const hip = { x: 0, y: 0, z: 0 };
    const shoulder = { x: 0, y: 0.5, z: 0.5 }; // öne 45°
    expect(verticalTiltDeg3D(hip, shoulder)).toBeCloseTo(45, 4);

    // Kişi 40° dönükken aynı eğim — 2D'deki yanlış pozitif burada yok.
    expect(
      verticalTiltDeg3D(rotateY(hip, 40), rotateY(shoulder, 40))
    ).toBeCloseTo(45, 4);
  });

  it("yere paralel gövde 90° verir", () => {
    const hip = { x: 0, y: 0, z: 0 };
    const shoulder = { x: 0, y: 0, z: 0.5 };
    expect(verticalTiltDeg3D(hip, shoulder)).toBeCloseTo(90, 4);
  });
});

describe("fppaDeg (valgus)", () => {
  const hipL = { x: -0.15, y: 0, z: 0 };
  const hipR = { x: 0.15, y: 0, z: 0 };

  it("düz bacak 180° verir", () => {
    const knee = { x: -0.15, y: -0.4, z: 0 };
    const ankle = { x: -0.15, y: -0.8, z: 0 };
    expect(fppaDeg(hipL, knee, ankle, hipL, hipR)).toBeCloseTo(180, 3);
  });

  it("medial diz çökmesi açıyı 165° altına düşürür", () => {
    // Sol diz içeri (medial = +x yönü) kaymış.
    const knee = { x: -0.05, y: -0.4, z: 0 };
    const ankle = { x: -0.15, y: -0.8, z: 0 };
    const fppa = fppaDeg(hipL, knee, ankle, hipL, hipR);
    expect(fppa).toBeLessThan(165);
    expect(fppa).toBeGreaterThan(140);
  });

  it("öne-arkaya diz hareketi (sagittal) FPPA'yı bozmaz", () => {
    // Diz öne çıkmış (derin squat'ta normal) ama medial kayma yok.
    const knee = { x: -0.15, y: -0.4, z: 0.25 };
    const ankle = { x: -0.15, y: -0.8, z: 0 };
    expect(fppaDeg(hipL, knee, ankle, hipL, hipR)).toBeCloseTo(180, 3);
  });

  it("kişi 30° dönükken aynı FPPA'yı verir (gövde-frontal düzlem projeksiyonu)", () => {
    const knee = { x: -0.07, y: -0.4, z: 0.1 };
    const ankle = { x: -0.15, y: -0.8, z: 0 };

    const front = fppaDeg(hipL, knee, ankle, hipL, hipR);
    const rotated = fppaDeg(
      rotateY(hipL, 30),
      rotateY(knee, 30),
      rotateY(ankle, 30),
      rotateY(hipL, 30),
      rotateY(hipR, 30)
    );

    expect(rotated).toBeCloseTo(front, 4);
  });
});

describe("midpoint3D", () => {
  it("orta noktayı verir, eksikte null", () => {
    expect(
      midpoint3D({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: -2 })
    ).toEqual({ x: 1, y: 2, z: -1 });
    expect(midpoint3D(null, { x: 0, y: 0, z: 0 })).toBeNull();
  });
});
