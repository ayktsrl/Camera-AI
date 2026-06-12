// One Euro filter — sentetik sinyal testleri (spec §2.2 parametreleriyle).

import { describe, it, expect } from "vitest";
import { createOneEuro, createLandmarkSetFilter } from "../oneEuro";

const FPS = 30;
const DT = 1 / FPS;

describe("createOneEuro", () => {
  it("sabit sinyali değiştirmez", () => {
    const f = createOneEuro();
    let out = 0;
    for (let i = 0; i < 60; i++) {
      out = f.filter(0.42, i * DT);
    }
    expect(out).toBeCloseTo(0.42, 6);
  });

  it("durağan jitter'ı ezer — filtreli sapma ham sapmadan belirgin küçük", () => {
    const f = createOneEuro(); // minCutoff 1.5, beta 0.3
    const base = 0.5;
    const rawDevs = [];
    const filteredDevs = [];

    for (let i = 0; i < 300; i++) {
      // Deterministik yüksek frekanslı jitter (~±0.01, landmark gürültüsü ölçeği)
      const noise =
        0.006 * Math.sin(i * 2.39) + 0.004 * Math.sin(i * 5.17 + 1.3);
      const raw = base + noise;
      const out = f.filter(raw, i * DT);
      if (i > 30) {
        rawDevs.push(Math.abs(raw - base));
        filteredDevs.push(Math.abs(out - base));
      }
    }

    const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    expect(mean(filteredDevs)).toBeLessThan(mean(rawDevs) * 0.5);
  });

  it("adım girdisine yakınsar (step response — lag sınırlı)", () => {
    const f = createOneEuro();
    for (let i = 0; i < 30; i++) f.filter(0, i * DT);

    let out = 0;
    for (let i = 30; i < 60; i++) out = f.filter(1, i * DT);

    // 1 saniye içinde hedefin %90'ından fazlasına ulaşmalı.
    expect(out).toBeGreaterThan(0.9);
  });

  it("hızlı harekette yavaş harekete göre daha az lag bırakır (beta etkisi)", () => {
    const lagFor = (slopePerSec) => {
      const f = createOneEuro();
      let out = 0;
      let target = 0;
      for (let i = 0; i < 90; i++) {
        target = slopePerSec * i * DT;
        out = f.filter(target, i * DT);
      }
      return (target - out) / slopePerSec; // saniye cinsinden lag
    };

    const slowLag = lagFor(0.1); // yavaş sürüklenme
    const fastLag = lagFor(3.0); // hızlı squat inişi ölçeği
    expect(fastLag).toBeLessThan(slowLag);
  });

  it("reset sonrası eski state ile sıçrama yapmaz", () => {
    const f = createOneEuro();
    for (let i = 0; i < 30; i++) f.filter(100, i * DT);
    f.reset();
    // Reset sonrası ilk örnek olduğu gibi döner (100'e çekilme yok).
    expect(f.filter(0, 31 * DT)).toBe(0);
  });
});

describe("createLandmarkSetFilter", () => {
  const makeLandmarks = (x) =>
    Array.from({ length: 33 }, () => ({
      x,
      y: x + 0.1,
      z: x - 0.1,
      visibility: 0.9,
      presence: 0.8,
    }));

  it("visibility/presence'ı ham geçirir, girdiyi mutate etmez", () => {
    const filter = createLandmarkSetFilter();
    const input = makeLandmarks(0.5);
    const out = filter.apply(input, 0);

    expect(out[0].visibility).toBe(0.9);
    expect(out[0].presence).toBe(0.8);
    expect(input[0].x).toBe(0.5); // girdi değişmedi
    expect(out).not.toBe(input);
  });

  it("nokta başına bağımsız kanalları filtreler ve reset eder", () => {
    const filter = createLandmarkSetFilter();
    for (let i = 0; i < 30; i++) filter.apply(makeLandmarks(0.5), i * DT);

    // Ani sıçrama tek frame'de tam geçmez (low-pass çalışıyor).
    const jumped = filter.apply(makeLandmarks(0.9), 30 * DT);
    expect(jumped[5].x).toBeGreaterThan(0.5);
    expect(jumped[5].x).toBeLessThan(0.9);

    // Reset sonrası ilk örnek olduğu gibi döner.
    filter.reset();
    const fresh = filter.apply(makeLandmarks(0.2), 31 * DT);
    expect(fresh[5].x).toBeCloseTo(0.2, 9);
  });

  it("null landmark dizisinde null döner", () => {
    const filter = createLandmarkSetFilter();
    expect(filter.apply(null, 0)).toBeNull();
  });
});
