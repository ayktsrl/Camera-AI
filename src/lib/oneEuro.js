// One Euro filter — pose landmark'ları için adaptif low-pass (Casiez et al. 2012).
// Yavaş harekette jitter'ı ezer, hızlı harekette kesim frekansını açıp lag'i düşürür.
//
// Tuning prosedürü (Casiez):
//   1. beta = 0, minCutoff = 1.0 Hz ile başla; dururken jitter kaybolana dek
//      minCutoff'u ayarla (düşür = daha pürüzsüz, daha çok lag).
//   2. Hızlı harekette (squat inişi) lag rahatsız ediyorsa beta'yı artır.
// v0.2 başlangıç değerleri (world landmark, metre): minCutoff 1.5 Hz, beta 0.3.

export const DEFAULT_ONE_EURO_PARAMS = {
  minCutoff: 1.5, // Hz — dururken jitter'ı ezen taban kesim
  beta: 0.3, // hız başına kesim artışı — inişte lag'i açar
  dCutoff: 1.0, // Hz — türev sinyalinin kesimi
};

function smoothingAlpha(cutoffHz, dt) {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
}

/**
 * Tek skaler kanal için One Euro filter.
 * dt dinamiktir: her örnekte saniye cinsinden timestamp verilir (rAF değişken).
 */
export function createOneEuro({
  minCutoff = DEFAULT_ONE_EURO_PARAMS.minCutoff,
  beta = DEFAULT_ONE_EURO_PARAMS.beta,
  dCutoff = DEFAULT_ONE_EURO_PARAMS.dCutoff,
} = {}) {
  let prevValue = null;
  let prevDerivative = 0;
  let prevTime = null;

  /**
   * @param {number} value ham örnek
   * @param {number} timeSec saniye cinsinden timestamp
   * @returns {number} filtrelenmiş değer
   */
  function filter(value, timeSec) {
    if (prevValue === null || prevTime === null || timeSec <= prevTime) {
      prevValue = value;
      prevDerivative = 0;
      prevTime = timeSec;
      return value;
    }

    const dt = Math.max(timeSec - prevTime, 1e-6);
    prevTime = timeSec;

    const rawDerivative = (value - prevValue) / dt;
    const alphaD = smoothingAlpha(dCutoff, dt);
    const derivative =
      alphaD * rawDerivative + (1 - alphaD) * prevDerivative;
    prevDerivative = derivative;

    const cutoff = minCutoff + beta * Math.abs(derivative);
    const alpha = smoothingAlpha(cutoff, dt);
    const filtered = alpha * value + (1 - alpha) * prevValue;
    prevValue = filtered;

    return filtered;
  }

  /** Track kaybında çağrılır — eski state ile sıçrama olmasın. */
  function reset() {
    prevValue = null;
    prevDerivative = 0;
    prevTime = null;
  }

  return { filter, reset };
}

/**
 * 33 noktalı landmark dizisi için filtre seti — nokta başına x/y/z ayrı kanal.
 * visibility/presence ham geçer (güven sinyali filtrelenmez).
 * Track başına bir instance oluşturulur; track kaybolunca reset edilir.
 */
export function createLandmarkSetFilter(params, pointCount = 33) {
  const channels = Array.from({ length: pointCount }, () => ({
    x: createOneEuro(params),
    y: createOneEuro(params),
    z: createOneEuro(params),
  }));

  /**
   * @param {Array<{x,y,z,visibility?,presence?}>|null} landmarks
   * @param {number} timeSec saniye cinsinden timestamp
   * @returns {Array|null} filtrelenmiş kopya (girdi mutate edilmez)
   */
  function apply(landmarks, timeSec) {
    if (!landmarks) return null;

    return landmarks.map((point, i) => {
      const ch = channels[i];
      if (!point || !ch) return point;
      return {
        ...point,
        x: ch.x.filter(point.x, timeSec),
        y: ch.y.filter(point.y, timeSec),
        z: point.z != null ? ch.z.filter(point.z, timeSec) : point.z,
      };
    });
  }

  function reset() {
    channels.forEach((ch) => {
      ch.x.reset();
      ch.y.reset();
      ch.z.reset();
    });
  }

  return { apply, reset };
}
