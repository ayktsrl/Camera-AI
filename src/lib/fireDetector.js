// Heuristic fire/flame detector — zero ML, browser-native pixel analysis.
//
// Approach:
//   1. Sample every Nth pixel from an ImageData buffer.
//   2. For each sampled pixel, score "flame-likeness" using:
//        - dominant orange/red channel ordering (R > G > B)
//        - high brightness  (R + G + B > brightnessMin)
//        - high saturation  ((max - min) / max > satMin)
//   3. Count flame pixels per active "Fire Watch Zone" (point-in-polygon).
//   4. Track per-zone history (last N samples). Flicker = variance of recent
//      counts; static lamps / sunlit windows fail this test.
//   5. A zone is "on fire" when:
//        - fireRatio >= ratioThreshold (>3% pixels by default)
//        - flickerScore >= flickerThreshold
//
// Pure JS. No deps. Safe to import from React.

const SAMPLE_STRIDE = 4;            // every 4th pixel (4x speedup)
const HISTORY_SIZE = 5;             // last 5 samples for flicker test
const DEFAULT_RATIO_THRESHOLD = 0.03;  // 3% of sampled zone pixels
const DEFAULT_FLICKER_THRESHOLD = 0.18; // normalized stdev of recent ratios
const DEFAULT_BRIGHTNESS_MIN = 400; // R + G + B
const DEFAULT_SAT_MIN = 0.4;        // (max-min)/max

// Sensitivity 1..10 — maps to ratioThreshold (lower = more sensitive)
export function sensitivityToRatio(sensitivity) {
  const s = Math.max(1, Math.min(10, Number(sensitivity) || 5));
  // sensitivity 10 -> 0.008, sensitivity 1 -> 0.08
  return 0.08 - ((s - 1) / 9) * 0.072;
}

// Returns true if pixel (r,g,b) looks like flame.
export function isFlamePixel(r, g, b, brightnessMin = DEFAULT_BRIGHTNESS_MIN, satMin = DEFAULT_SAT_MIN) {
  // Color test — narıncı/kırmızı dominant.
  if (!(r > 200 && g > 80 && g < 200 && b < 100 && r - b > 100)) return false;
  // Brightness test.
  if (r + g + b < brightnessMin) return false;
  // Channel ordering — R > G > B strictly.
  if (!(r >= g && g >= b)) return false;
  // Saturation test — avoid white/grey near-saturation.
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return false;
  const sat = (max - min) / max;
  if (sat < satMin) return false;
  return true;
}

// pointInPolygon for normalized [0..1] coordinates.
function pointInPolygonNorm(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || 0.0000001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Computes axis-aligned bbox in normalized coords for a polygon.
function zoneBBox(points) {
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

// Welford-style stdev / mean of last N values.
function stdev(values) {
  if (values.length < 2) return 0;
  let mean = 0;
  for (const v of values) mean += v;
  mean /= values.length;
  let sq = 0;
  for (const v of values) sq += (v - mean) * (v - mean);
  return Math.sqrt(sq / values.length);
}

// Normalized flicker — stdev divided by (mean + epsilon).
function flickerScore(ratios) {
  if (ratios.length < 2) return 0;
  let mean = 0;
  for (const v of ratios) mean += v;
  mean /= ratios.length;
  const sd = stdev(ratios);
  return sd / (mean + 0.005);
}

/**
 * Analyze one video frame for flame presence inside Fire Watch zones.
 *
 * @param {ImageData} imageData          - Pixel buffer from offscreen canvas.
 * @param {Array}     fireZones          - Array of { id, label, points: [{x,y}] }.
 * @param {Object}    history            - Per-zone history map; mutated in-place.
 *                                         Shape: { [zoneId]: { ratios: [], sampledHits: [] } }.
 * @param {Object}    options
 * @param {number}    options.ratioThreshold   - Min fireRatio to flag (default 0.03).
 * @param {number}    options.flickerThreshold - Min normalized stdev (default 0.18).
 * @param {number}    options.brightnessMin
 * @param {number}    options.satMin
 *
 * @returns {Object} Map of zoneId -> { firePixels, sampledPixels, fireRatio, flicker, isOnFire, samplePoints }
 *                   samplePoints is an array of { x, y } in normalized coords for debug overlay.
 */
export function analyzeFrame(imageData, fireZones, history, options = {}) {
  const {
    ratioThreshold = DEFAULT_RATIO_THRESHOLD,
    flickerThreshold = DEFAULT_FLICKER_THRESHOLD,
    brightnessMin = DEFAULT_BRIGHTNESS_MIN,
    satMin = DEFAULT_SAT_MIN,
    debugSamples = false,
  } = options;

  const result = {};
  if (!imageData || !fireZones || fireZones.length === 0) return result;

  const { data, width, height } = imageData;

  for (const zone of fireZones) {
    if (!zone.points || zone.points.length < 3) {
      result[zone.id] = {
        firePixels: 0,
        sampledPixels: 0,
        fireRatio: 0,
        flicker: 0,
        isOnFire: false,
        samplePoints: [],
      };
      continue;
    }

    const bbox = zoneBBox(zone.points);
    const x0 = Math.max(0, Math.floor(bbox.minX * width));
    const x1 = Math.min(width - 1, Math.ceil(bbox.maxX * width));
    const y0 = Math.max(0, Math.floor(bbox.minY * height));
    const y1 = Math.min(height - 1, Math.ceil(bbox.maxY * height));

    let firePixels = 0;
    let sampled = 0;
    const samplePoints = debugSamples ? [] : null;

    for (let y = y0; y <= y1; y += SAMPLE_STRIDE) {
      for (let x = x0; x <= x1; x += SAMPLE_STRIDE) {
        const nx = x / width;
        const ny = y / height;
        if (!pointInPolygonNorm(nx, ny, zone.points)) continue;
        sampled++;
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (isFlamePixel(r, g, b, brightnessMin, satMin)) {
          firePixels++;
          if (debugSamples) samplePoints.push({ x: nx, y: ny });
        }
      }
    }

    const fireRatio = sampled > 0 ? firePixels / sampled : 0;

    if (!history[zone.id]) {
      history[zone.id] = { ratios: [] };
    }
    const h = history[zone.id];
    h.ratios.push(fireRatio);
    if (h.ratios.length > HISTORY_SIZE) h.ratios.shift();

    const flicker = flickerScore(h.ratios);
    const isOnFire =
      fireRatio >= ratioThreshold && flicker >= flickerThreshold;

    result[zone.id] = {
      firePixels,
      sampledPixels: sampled,
      fireRatio,
      flicker,
      isOnFire,
      samplePoints: samplePoints || [],
    };
  }

  return result;
}

// Small built-in 8-bit PCM beep, base64 WAV (~0.4s, 880Hz square).
// Generated offline, embedded here to avoid asset files.
// Approx 6 KB encoded; trimmed for short alarm chirp.
export const ALARM_BEEP_DATA_URL = (() => {
  // Build a tiny WAV in-memory at module init.
  const sampleRate = 8000;
  const duration = 0.45;
  const total = Math.floor(sampleRate * duration);
  const buf = new Uint8Array(44 + total);

  // RIFF header.
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i);
  };
  const writeU32 = (off, v) => {
    buf[off] = v & 0xff;
    buf[off + 1] = (v >> 8) & 0xff;
    buf[off + 2] = (v >> 16) & 0xff;
    buf[off + 3] = (v >> 24) & 0xff;
  };
  const writeU16 = (off, v) => {
    buf[off] = v & 0xff;
    buf[off + 1] = (v >> 8) & 0xff;
  };

  writeStr(0, "RIFF");
  writeU32(4, 36 + total);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  writeU32(16, 16);
  writeU16(20, 1);
  writeU16(22, 1);
  writeU32(24, sampleRate);
  writeU32(28, sampleRate);
  writeU16(32, 1);
  writeU16(34, 8);
  writeStr(36, "data");
  writeU32(40, total);

  // Square wave 880Hz, with gentle envelope.
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 12) * Math.min(1, (duration - t) * 12);
    const square = Math.sin(2 * Math.PI * 880 * t) > 0 ? 1 : -1;
    const sample = 128 + Math.round(square * 60 * env);
    buf[44 + i] = sample;
  }

  // base64
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(bin)
      : Buffer.from(buf).toString("base64");
  return `data:audio/wav;base64,${b64}`;
})();
