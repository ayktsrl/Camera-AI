// angles — saf 2D açı matematiği (normalize landmark koordinatları, x/y).
// computeMetrics ve tüm form tespitinin temeli; bu yüzden bilinen geometriyle doğrulanır.
//
// Not: Ekran koordinatlarında y AŞAĞI doğru artar. Testler bu konvansiyona göre kurulu.
// 3D varyantları ayrı dosyada test edilir (angles3d.test.js).
//
// Kapsanan davranış:
//   angleAtPoint   — 3 nokta eklem açısı (düz/dik/keskin/açık), kolineer, simetri,
//                    eksik nokta ve sıfır-uzunluk (aynı nokta) guard'ı
//   verticalTiltDeg— iki noktanın dikey eksenle açısı (dik/yatay/45°), yön bağımsızlığı
//   midpoint       — iki landmark ortası, eksik nokta guard'ı

import { describe, it, expect } from "vitest";
import { angleAtPoint, verticalTiltDeg, midpoint } from "../angles";

describe("angleAtPoint", () => {
  it("düz çizgi (kolineer, b ortada) 180° verir", () => {
    // a — b — c aynı doğru üzerinde, b ikisinin arasında.
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    const c = { x: 2, y: 0 };
    expect(angleAtPoint(a, b, c)).toBeCloseTo(180, 6);
  });

  it("dik açı 90° verir", () => {
    // ba yukarı, bc sağa → 90°.
    const a = { x: 0, y: 1 };
    const b = { x: 0, y: 0 };
    const c = { x: 1, y: 0 };
    expect(angleAtPoint(a, b, c)).toBeCloseTo(90, 6);
  });

  it("45° keskin açı verir", () => {
    const a = { x: 0, y: 1 }; // ba = (0, 1)
    const b = { x: 0, y: 0 };
    const c = { x: 1, y: 1 }; // bc = (1, 1) → ba ile 45°
    expect(angleAtPoint(a, b, c)).toBeCloseTo(45, 6);
  });

  it("135° açık açı verir", () => {
    const a = { x: 0, y: 1 }; // ba = (0, 1)
    const b = { x: 0, y: 0 };
    const c = { x: -1, y: -1 }; // bc = (-1, -1) → ba ile 135°
    expect(angleAtPoint(a, b, c)).toBeCloseTo(135, 6);
  });

  it("0° verir — a ve c aynı yönde, b dışarıda (kolineer, çakışık kollar)", () => {
    // ba ve bc aynı yönü gösterir → aralarındaki açı 0.
    const a = { x: 1, y: 0 };
    const b = { x: 0, y: 0 };
    const c = { x: 2, y: 0 };
    expect(angleAtPoint(a, b, c)).toBeCloseTo(0, 6);
  });

  it("nokta sırasına simetriktir (a↔c takası açıyı değiştirmez)", () => {
    const a = { x: 0, y: 1 };
    const b = { x: 0, y: 0 };
    const c = { x: 1, y: 0 };
    expect(angleAtPoint(a, b, c)).toBeCloseTo(angleAtPoint(c, b, a), 9);
  });

  it("gerçekçi diz açısı — hafif bükülmüş bacak ~170°", () => {
    // kalça yukarıda, diz ortada, ayak bileği aşağıda; çok hafif büküm.
    const hip = { x: 0.5, y: 0.4 };
    const knee = { x: 0.5, y: 0.6 };
    const ankle = { x: 0.52, y: 0.8 };
    const ang = angleAtPoint(hip, knee, ankle);
    expect(ang).toBeGreaterThan(160);
    expect(ang).toBeLessThan(180);
  });

  it("ölçekten bağımsızdır — kol uzunluğu açıyı değiştirmez", () => {
    const aShort = { x: 0, y: 0.1 };
    const aLong = { x: 0, y: 1 };
    const b = { x: 0, y: 0 };
    const c = { x: 0.05, y: 0 };
    expect(angleAtPoint(aShort, b, c)).toBeCloseTo(
      angleAtPoint(aLong, b, c),
      9
    );
  });

  it("her zaman 0–180 aralığında döner (yönden bağımsız, işaretsiz)", () => {
    const a = { x: -1, y: -1 };
    const b = { x: 0, y: 0 };
    const c = { x: 1, y: -0.2 };
    const ang = angleAtPoint(a, b, c);
    expect(ang).toBeGreaterThanOrEqual(0);
    expect(ang).toBeLessThanOrEqual(180);
  });

  it("eksik nokta için null döner", () => {
    const p = { x: 0, y: 0 };
    expect(angleAtPoint(null, p, p)).toBeNull();
    expect(angleAtPoint(p, null, p)).toBeNull();
    expect(angleAtPoint(p, p, null)).toBeNull();
    expect(angleAtPoint(undefined, p, p)).toBeNull();
  });

  it("sıfır-uzunluk vektör (a === b) için null döner — NaN sızdırmaz", () => {
    const b = { x: 0.5, y: 0.5 };
    const c = { x: 0.8, y: 0.5 };
    expect(angleAtPoint({ x: 0.5, y: 0.5 }, b, c)).toBeNull();
  });

  it("sıfır-uzunluk vektör (c === b) için null döner", () => {
    const a = { x: 0.2, y: 0.5 };
    const b = { x: 0.5, y: 0.5 };
    expect(angleAtPoint(a, b, { x: 0.5, y: 0.5 })).toBeNull();
  });

  it("üç nokta da çakışıksa null döner (iki sıfır vektör)", () => {
    const p = { x: 0.3, y: 0.3 };
    expect(angleAtPoint({ ...p }, { ...p }, { ...p })).toBeNull();
  });
});

describe("verticalTiltDeg", () => {
  it("dimdik dikey hat 0° verir (yalnız y değişir)", () => {
    const from = { x: 0.5, y: 0.8 };
    const to = { x: 0.5, y: 0.2 };
    expect(verticalTiltDeg(from, to)).toBeCloseTo(0, 6);
  });

  it("yere paralel (yatay) hat 90° verir (yalnız x değişir)", () => {
    const from = { x: 0.2, y: 0.5 };
    const to = { x: 0.8, y: 0.5 };
    expect(verticalTiltDeg(from, to)).toBeCloseTo(90, 6);
  });

  it("eşit dx/dy 45° verir", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 0.3, y: 0.3 };
    expect(verticalTiltDeg(from, to)).toBeCloseTo(45, 6);
  });

  it("yöne işaretsiz duyarsızdır — sola/sağa eğim aynı dereceyi verir", () => {
    const from = { x: 0.5, y: 0.5 };
    const right = { x: 0.7, y: 0.2 };
    const left = { x: 0.3, y: 0.2 };
    expect(verticalTiltDeg(from, right)).toBeCloseTo(
      verticalTiltDeg(from, left),
      9
    );
  });

  it("from/to takası açıyı değiştirmez (Math.abs simetrisi)", () => {
    const from = { x: 0.2, y: 0.8 };
    const to = { x: 0.6, y: 0.3 };
    expect(verticalTiltDeg(from, to)).toBeCloseTo(verticalTiltDeg(to, from), 9);
  });

  it("ölçekten bağımsızdır — uzun/kısa hat aynı eğimi verir", () => {
    const from = { x: 0, y: 0 };
    const shortTo = { x: 0.1, y: 0.2 };
    const longTo = { x: 0.5, y: 1.0 };
    expect(verticalTiltDeg(from, shortTo)).toBeCloseTo(
      verticalTiltDeg(from, longTo),
      9
    );
  });

  it("0–90 aralığında döner", () => {
    const from = { x: 0.1, y: 0.9 };
    const to = { x: 0.9, y: 0.1 };
    const t = verticalTiltDeg(from, to);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(90);
  });

  it("eksik nokta için null döner", () => {
    const p = { x: 0, y: 0 };
    expect(verticalTiltDeg(null, p)).toBeNull();
    expect(verticalTiltDeg(p, null)).toBeNull();
    expect(verticalTiltDeg(undefined, p)).toBeNull();
  });

  it("aynı nokta (dx=0 && dy=0) için null döner — atan2(0,0) sızdırmaz", () => {
    expect(verticalTiltDeg({ x: 0.4, y: 0.4 }, { x: 0.4, y: 0.4 })).toBeNull();
  });
});

describe("midpoint", () => {
  it("iki noktanın tam ortasını verir", () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 2, y: 4 })).toEqual({ x: 1, y: 2 });
  });

  it("negatif koordinatlarla çalışır", () => {
    expect(midpoint({ x: -1, y: -3 }, { x: 1, y: 3 })).toEqual({ x: 0, y: 0 });
  });

  it("aynı nokta için kendisini verir", () => {
    expect(midpoint({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("değişimli (a,b ↔ b,a) aynı sonucu verir", () => {
    const a = { x: 0.2, y: 0.7 };
    const b = { x: 0.8, y: 0.1 };
    expect(midpoint(a, b)).toEqual(midpoint(b, a));
  });

  it("eksik nokta için null döner", () => {
    const p = { x: 0, y: 0 };
    expect(midpoint(null, p)).toBeNull();
    expect(midpoint(p, null)).toBeNull();
    expect(midpoint(undefined, p)).toBeNull();
  });
});
