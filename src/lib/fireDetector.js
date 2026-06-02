// Multi-factor flame detector — zero ML, browser-native pixel analysis.
//
// Replaces the previous heuristic RGB-only scorer. Now combines 4 independent
// signals per sampled pixel:
//
//   1. colorScore       — HSV-based flame color (hue near orange, saturated, bright).
//   2. motionScore      — delta vs slowly-updated background buffer (kills static lamps).
//   3. flickerScore     — coefficient-of-variation of last 8 zone ratios (kills sun glare).
//   4. persistencyScore — same grid cell hot for 3+ consecutive frames (kills camera flash).
//
// Per-pixel final score:
//     pixelScore = colorScore*0.40 + motionScore*0.20 + flickerScore*0.25 + persistencyScore*0.15
//
// Zone-level decision uses hysteresis:
//   - rising  edge: avgScore >= 0.60  AND  ratio(pixelScore > 0.5) >= sensRatio
//   - falling edge: avgScore <  0.35  OR   ratio < sensRatio*0.5
//
// Pure JS. No deps. Safe to import from React.
// ---------------------------------------------------------------------------

const SAMPLE_STRIDE = 4;            // every 4th pixel inside zone bbox
const HISTORY_SIZE = 8;             // last 8 ratios for flicker CV
const PERSIST_GRID_W = 16;          // persistency map cells (x)
const PERSIST_GRID_H = 9;           // persistency map cells (y)
const PERSIST_DECAY = 1;            // how many frames an inactive cell drops by
const PERSIST_FULL_FRAMES = 5;      // active >=5 frames -> persistencyScore 1.0
const BG_ALPHA = 0.05;              // EMA weight for new frame into background
const BG_WARMUP_FRAMES = 30;        // before this, motionScore = 0 (no false alarms)

const RISE_AVG_SCORE = 0.60;
const FALL_AVG_SCORE = 0.35;

// Per-pixel weights — sum to 1.0.
const W_COLOR = 0.40;
const W_MOTION = 0.20;
const W_FLICKER = 0.25;
const W_PERSIST = 0.15;

// Sensitivity 1..10 -> ratio threshold for "high-scoring pixel" fraction.
// Slider only moves THIS knob; the per-pixel score function is fixed.
// Sensitivity 1  -> 0.10  (very strict)
// Sensitivity 5  -> 0.04  (default)
// Sensitivity 10 -> 0.012 (loose)
export function sensitivityToRatio(sensitivity) {
  const s = Math.max(1, Math.min(10, Number(sensitivity) || 5));
  return 0.10 - ((s - 1) / 9) * 0.088;
}

// ---------- color: RGB -> HSV (cheap inline form) -------------------------
function rgbToHsv(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = rn > gn ? (rn > bn ? rn : bn) : (gn > bn ? gn : bn);
  const min = rn < gn ? (rn < bn ? rn : bn) : (gn < bn ? gn : bn);
  const v = max;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

// Color score in [0,1] — peaks at hue=30 (orange), needs sat & value.
function colorScoreHSV(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);
  // Hue gate: only 0..60 deg counts as flame-colored.
  if (h > 60 && h < 360) return 0;
  // Folded hue distance from 30 deg (clamps wrap-around).
  const hueDist = Math.abs(h - 30);
  const hueTerm = Math.max(0, (60 - hueDist) / 60); // 1 at 30, 0 at 60 or -30
  if (s < 0.4 || v < 0.5) return 0;
  return hueTerm * s * v;
}

// ---------- polygon helpers ----------------------------------------------
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

// ---------- flicker (coefficient of variation of last N ratios) -----------
function flickerCV(ratios) {
  if (ratios.length < 3) return 0;
  let mean = 0;
  for (const v of ratios) mean += v;
  mean /= ratios.length;
  if (mean < 0.005) return 0; // ratios essentially zero -> no signal
  let sq = 0;
  for (const v of ratios) sq += (v - mean) * (v - mean);
  const sd = Math.sqrt(sq / ratios.length);
  return sd / mean;
}

function flickerToScore(cv) {
  // CV ~0.15 -> 0 (normal scene), ~0.65+ -> 1 (flame).
  if (cv <= 0.15) return 0;
  const x = (cv - 0.15) / 0.5;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ---------- background buffer ---------------------------------------------
// Buffer layout: width*height*3 Uint8ClampedArray storing rolling EMA in RGB.
// Updated incrementally for every SAMPLED pixel (not every pixel).

export function createBackgroundBuffer(width, height) {
  return {
    width,
    height,
    rgb: new Uint8ClampedArray(width * height * 3),
    frameCount: 0,
  };
}

function bgGet(buf, x, y) {
  const i = (y * buf.width + x) * 3;
  return [buf.rgb[i], buf.rgb[i + 1], buf.rgb[i + 2]];
}

function bgUpdate(buf, x, y, r, g, b) {
  const i = (y * buf.width + x) * 3;
  if (buf.frameCount === 0) {
    buf.rgb[i] = r; buf.rgb[i + 1] = g; buf.rgb[i + 2] = b;
    return;
  }
  // EMA
  buf.rgb[i]     = (1 - BG_ALPHA) * buf.rgb[i]     + BG_ALPHA * r;
  buf.rgb[i + 1] = (1 - BG_ALPHA) * buf.rgb[i + 1] + BG_ALPHA * g;
  buf.rgb[i + 2] = (1 - BG_ALPHA) * buf.rgb[i + 2] + BG_ALPHA * b;
}

function motionScoreFromDelta(delta) {
  // delta 0..120+, score saturates at 40.
  if (delta <= 8) return 0;        // dead-zone to ignore sensor noise
  const x = (delta - 8) / 32;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ---------- persistency map ----------------------------------------------
// One map per camera. Stored as { cells: Int16Array(W*H), zoneCells: { [zoneId]: Set<idx> } }.

export function createPersistencyMap() {
  return {
    w: PERSIST_GRID_W,
    h: PERSIST_GRID_H,
    cells: new Int16Array(PERSIST_GRID_W * PERSIST_GRID_H),
    seenThisFrame: new Uint8Array(PERSIST_GRID_W * PERSIST_GRID_H),
  };
}

function persistCellIdx(nx, ny) {
  const cx = Math.min(PERSIST_GRID_W - 1, Math.max(0, Math.floor(nx * PERSIST_GRID_W)));
  const cy = Math.min(PERSIST_GRID_H - 1, Math.max(0, Math.floor(ny * PERSIST_GRID_H)));
  return cy * PERSIST_GRID_W + cx;
}

function persistScore(activeFrames) {
  if (activeFrames <= 0) return 0;
  const x = activeFrames / PERSIST_FULL_FRAMES;
  return x > 1 ? 1 : x;
}

// ---------- main entry ----------------------------------------------------

/**
 * Analyze one video frame.
 *
 * @param {ImageData} imageData
 * @param {Array}     fireZones
 * @param {Object}    history   - mutated. Shape: { [zoneId]: { ratios:[], onFire:bool } }
 * @param {Object}    options
 * @param {number}    options.sensRatio        - fraction-of-hot-pixels threshold (1..0).
 * @param {Object}    options.backgroundBuffer - createBackgroundBuffer() result, mutated.
 * @param {Object}    options.persistencyMap   - createPersistencyMap() result, mutated.
 * @param {boolean}   options.debugSamples
 *
 * @returns {Object} zoneId -> {
 *   firePixels, sampledPixels, fireRatio, avgScore, isOnFire,
 *   samplePoints, breakdown: { color, motion, flicker, persistency, final }
 * }
 */
export function analyzeFrame(imageData, fireZones, history, options = {}) {
  const {
    sensRatio = 0.04,
    backgroundBuffer = null,
    persistencyMap = null,
    debugSamples = false,
  } = options;

  const result = {};
  if (!imageData || !fireZones || fireZones.length === 0) return result;

  const { data, width, height } = imageData;
  const bg = backgroundBuffer;
  const pm = persistencyMap;

  // Clear "seen this frame" for persistency aging at the end.
  if (pm) pm.seenThisFrame.fill(0);

  const warmingUp = bg && bg.frameCount < BG_WARMUP_FRAMES;

  for (const zone of fireZones) {
    if (!zone.points || zone.points.length < 3) {
      result[zone.id] = emptyZoneResult();
      continue;
    }

    const bbox = zoneBBox(zone.points);
    const x0 = Math.max(0, Math.floor(bbox.minX * width));
    const x1 = Math.min(width - 1, Math.ceil(bbox.maxX * width));
    const y0 = Math.max(0, Math.floor(bbox.minY * height));
    const y1 = Math.min(height - 1, Math.ceil(bbox.maxY * height));

    let firePixels = 0;      // high-score (>0.5) pixels
    let sampled = 0;
    let sumScore = 0;
    let sumColor = 0;
    let sumMotion = 0;
    const samplePoints = debugSamples ? [] : null;

    // Compute previous-frame flicker score once per zone.
    const histEntry = ensureHistory(history, zone.id);
    const flickScore = flickerToScore(flickerCV(histEntry.ratios));

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

        // 1. color
        const cScore = colorScoreHSV(r, g, b);

        // 2. motion
        let mScore = 0;
        if (bg && !warmingUp) {
          const [br, bg2, bb] = bgGet(bg, x, y);
          const delta = Math.abs(r - br) + Math.abs(g - bg2) + Math.abs(b - bb);
          mScore = motionScoreFromDelta(delta);
        }
        if (bg) bgUpdate(bg, x, y, r, g, b);

        // 3. flicker (zone-level, same for every pixel in this pass)
        const fScore = flickScore;

        // 4. persistency (cell-level from previous frame)
        let pScore = 0;
        if (pm) {
          const cellIdx = persistCellIdx(nx, ny);
          pScore = persistScore(pm.cells[cellIdx]);
        }

        const pixelScore =
          cScore * W_COLOR +
          mScore * W_MOTION +
          fScore * W_FLICKER +
          pScore * W_PERSIST;

        sumScore += pixelScore;
        sumColor += cScore;
        sumMotion += mScore;

        if (pixelScore > 0.5) {
          firePixels++;
          if (debugSamples) samplePoints.push({ x: nx, y: ny });
          // Mark cell as active this frame -> next frame persistency bumps.
          if (pm) {
            const cellIdx = persistCellIdx(nx, ny);
            pm.seenThisFrame[cellIdx] = 1;
          }
        }
      }
    }

    const fireRatio = sampled > 0 ? firePixels / sampled : 0;
    const avgScore = sampled > 0 ? sumScore / sampled : 0;
    const avgColor = sampled > 0 ? sumColor / sampled : 0;
    const avgMotion = sampled > 0 ? sumMotion / sampled : 0;

    // Update zone ratio history (for next-frame flicker).
    histEntry.ratios.push(fireRatio);
    if (histEntry.ratios.length > HISTORY_SIZE) histEntry.ratios.shift();

    // Hysteresis.
    const wasOnFire = !!histEntry.onFire;
    let isOnFire;
    if (warmingUp) {
      isOnFire = false;
    } else if (wasOnFire) {
      // Falling edge — easier to leave.
      isOnFire =
        avgScore >= FALL_AVG_SCORE && fireRatio >= sensRatio * 0.5;
    } else {
      // Rising edge — strict.
      isOnFire =
        avgScore >= RISE_AVG_SCORE && fireRatio >= sensRatio;
    }
    histEntry.onFire = isOnFire;

    // Average persistency across active cells, only for debug breakdown.
    let avgPersist = 0;
    if (pm && samplePoints && samplePoints.length) {
      let sumP = 0;
      for (const p of samplePoints) {
        sumP += persistScore(pm.cells[persistCellIdx(p.x, p.y)]);
      }
      avgPersist = sumP / samplePoints.length;
    }

    result[zone.id] = {
      firePixels,
      sampledPixels: sampled,
      fireRatio,
      avgScore,
      isOnFire,
      samplePoints: samplePoints || [],
      breakdown: {
        color: avgColor,
        motion: avgMotion,
        flicker: flickScore,
        persistency: avgPersist,
        final: avgScore,
      },
    };
  }

  // After all zones processed, age the persistency map exactly once.
  if (pm) {
    for (let i = 0; i < pm.cells.length; i++) {
      if (pm.seenThisFrame[i]) {
        pm.cells[i] = Math.min(PERSIST_FULL_FRAMES + 2, pm.cells[i] + 1);
      } else {
        pm.cells[i] = Math.max(0, pm.cells[i] - PERSIST_DECAY);
      }
    }
  }

  if (bg) bg.frameCount = Math.min(BG_WARMUP_FRAMES * 4, bg.frameCount + 1);

  return result;
}

function ensureHistory(history, zoneId) {
  if (!history[zoneId]) history[zoneId] = { ratios: [], onFire: false };
  return history[zoneId];
}

function emptyZoneResult() {
  return {
    firePixels: 0,
    sampledPixels: 0,
    fireRatio: 0,
    avgScore: 0,
    isOnFire: false,
    samplePoints: [],
    breakdown: { color: 0, motion: 0, flicker: 0, persistency: 0, final: 0 },
  };
}

// Kept for backwards compatibility — callers in App.jsx may still import it.
// Now returns the HSV color score > 0.3 as a coarse boolean.
export function isFlamePixel(r, g, b) {
  return colorScoreHSV(r, g, b) > 0.3;
}

// ---------------------------------------------------------------------------
// Small built-in 8-bit PCM beep, base64 WAV (~0.45s, 880Hz square).
// Generated at module init to avoid asset files.
// ---------------------------------------------------------------------------
export const ALARM_BEEP_DATA_URL = (() => {
  const sampleRate = 8000;
  const duration = 0.45;
  const total = Math.floor(sampleRate * duration);
  const buf = new Uint8Array(44 + total);

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

  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 12) * Math.min(1, (duration - t) * 12);
    const square = Math.sin(2 * Math.PI * 880 * t) > 0 ? 1 : -1;
    const sample = 128 + Math.round(square * 60 * env);
    buf[44 + i] = sample;
  }

  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(bin)
      : Buffer.from(buf).toString("base64");
  return `data:audio/wav;base64,${b64}`;
})();
