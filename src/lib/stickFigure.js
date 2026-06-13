// Çöp adam (stick figure) animasyon util'i — SALT GÖRSEL.
// Eklem koordinatları arası yumuşak interpolasyon + ping-pong döngü fazı.
// Pose/repEngine/programPlayer/exercise mantığından TAMAMEN bağımsız (önizleme için).
// Dış bağımlılık YOK, offline, link YOK. viewBox 0 0 100 100.
//
// Bir hareketin "ne yaptığını" basitçe canlandırır: kare dizisi (2-3 poz) arasında
// gidip-gel (ping-pong), ease-in-out ile yumuşak. Owner: "çöp adam gibi basit bir
// şey bile hangi hareketi yapacağımı gösterse yeterli."

/**
 * @typedef {object} Joints
 * @property {[number,number]} head     Kafa merkezi
 * @property {[number,number]} shoulder
 * @property {[number,number]} hip
 * @property {[number,number]} knee
 * @property {[number,number]} ankle
 * @property {[number,number]} [elbow]
 * @property {[number,number]} [wrist]
 */

/** Cosine tabanlı ease-in-out: [0,1] → [0,1], uçlarda yavaş. */
export function easeInOut(t) {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return 0.5 - 0.5 * Math.cos(clamped * Math.PI);
}

/** Tek nokta lineer interpolasyon. */
function lerpPoint(a, b, t) {
  if (!a || !b) return a || b || null;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * İki poz arası eklem-bazlı interpolasyon. Sadece HER İKİSİNDE de bulunan
 * eklemler interpole edilir; tek tarafta olan eklem olduğu gibi taşınır.
 * @param {Joints} a
 * @param {Joints} b
 * @param {number} t  [0,1]
 * @returns {Joints}
 */
export function lerpJoints(a, b, t) {
  const out = {};
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    out[k] = lerpPoint(a?.[k], b?.[k], t);
  }
  return out;
}

/**
 * Çok-kareli ping-pong faz hesabı: elapsed (ms) → o anki interpolasyonlu poz.
 * N kare için tam döngü: kare0 → kare1 → ... → kareN-1 → ... → kare1 → kare0.
 * (Gidiş + dönüş, başa zıplama yok → kesintisiz akış.)
 * @param {Joints[]} frames  En az 1 kare
 * @param {number} elapsed   ms cinsinden geçen süre
 * @param {number} period    Tek yön (ileri) süresi ms — tam döngü = 2*period
 * @returns {Joints}
 */
export function poseAt(frames, elapsed, period) {
  if (!frames || frames.length === 0) return {};
  if (frames.length === 1) return frames[0];

  const segments = frames.length - 1; // ileri yöndeki ara sayısı
  const full = period * 2; // ileri + geri
  const phase = ((elapsed % full) + full) % full; // [0, full)

  // 0..period ileri, period..2period geri.
  let progress; // 0..segments (kesirli kare indeksi)
  if (phase <= period) {
    progress = (phase / period) * segments;
  } else {
    progress = (1 - (phase - period) / period) * segments;
  }

  const i = Math.min(Math.floor(progress), segments - 1);
  const localT = progress - i;
  return lerpJoints(frames[i], frames[i + 1], easeInOut(localT));
}

// ── Keyframe pozları (viewBox 0 0 100 100) ──────────────────────────────────
// Her hareket: 2-3 anahtar kare. Yan görünüm (squat/lunge/pushup),
// önden görünüm (jumping-jack), profil (lateral raise / curl).

const STAND = {
  head: [50, 16],
  shoulder: [50, 26],
  hip: [50, 52],
  knee: [50, 72],
  ankle: [50, 90],
};

export const KEYFRAMES = {
  // Squat — ayakta → çömelmiş (kalça-diz iner, gövde hafif öne) → ayakta.
  squat: [
    STAND,
    {
      head: [44, 30],
      shoulder: [45, 40],
      hip: [46, 62],
      knee: [62, 64],
      ankle: [60, 90],
    },
  ],

  // Push-up — yandan: gövde düz, dirsek açık (yukarı) → dirsek bükük (iniş).
  pushup: [
    {
      head: [16, 40],
      shoulder: [30, 46],
      hip: [62, 52],
      knee: [80, 56],
      ankle: [94, 60],
      elbow: [30, 70],
      wrist: [30, 88],
    },
    {
      head: [16, 52],
      shoulder: [30, 58],
      hip: [62, 60],
      knee: [80, 62],
      ankle: [94, 64],
      elbow: [44, 78],
      wrist: [30, 88],
    },
  ],

  // Lunge — ayakta → öne hamle (ön diz ~90° bükük, gövde hafif öne) → ayakta.
  lunge: [
    STAND,
    {
      head: [46, 26],
      shoulder: [48, 36],
      hip: [50, 60],
      knee: [66, 74],
      ankle: [68, 90],
    },
  ],

  // Jumping jack — önden: kol+bacak kapalı → kol baş üstü + bacak açık.
  "jumping-jack": [
    {
      head: [50, 16],
      shoulder: [50, 28],
      hip: [50, 56],
      knee: [50, 76],
      ankle: [50, 92],
      elbow: [42, 40],
      wrist: [40, 54],
    },
    {
      head: [50, 16],
      shoulder: [50, 28],
      hip: [50, 56],
      knee: [40, 74],
      ankle: [30, 90],
      elbow: [36, 18],
      wrist: [28, 8],
    },
  ],

  // Standing knee raise — önden: ayakta düz → bir diz kalça hizasına yukarı
  // (uyluk yatay, baldır sarkık), diğer bacak basılı.
  "knee-raise": [
    STAND,
    {
      head: [50, 16],
      shoulder: [50, 28],
      hip: [50, 56],
      // Sol bacak kalkık: diz kalça hizasında ileri/yukarı, ayak bileği sarkık.
      knee: [38, 56],
      ankle: [40, 72],
    },
  ],

  // Lateral raise — profil: kol aşağı (yanda) → kol omuz hizasında yana kalkık.
  "db-lateral-raise": [
    {
      ...STAND,
      elbow: [50, 40],
      wrist: [50, 54],
    },
    {
      ...STAND,
      elbow: [62, 28],
      wrist: [74, 26],
    },
  ],

  // Hammer curl — profil: önkol aşağı → önkol yukarı (dirsek sabit).
  "db-hammer-curl": [
    {
      ...STAND,
      elbow: [50, 40],
      wrist: [52, 54],
    },
    {
      ...STAND,
      elbow: [50, 40],
      wrist: [42, 28],
    },
  ],

  // Generic — nötr "egzersiz": kol hafif iner-kalkar (takip-edilemez hareketler).
  generic: [
    {
      ...STAND,
      elbow: [40, 40],
      wrist: [34, 52],
    },
    {
      ...STAND,
      elbow: [42, 36],
      wrist: [38, 26],
    },
  ],
};

/**
 * Hareketten keyframe anahtarı seç. Önce takipli ruleSetRef (squat/pushup/lunge),
 * sonra library id (jumping-jack vb.); eşleşme yoksa generic'e düşer.
 * @param {{ruleSetRef?:string, id?:string}} exercise
 * @returns {string}  KEYFRAMES anahtarı
 */
export function keyframeKeyFor(exercise) {
  const ref = exercise?.ruleSetRef;
  if (ref && KEYFRAMES[ref]) return ref;

  // ruleSetRef (camelCase egzersiz id'si) → keyframe anahtarı (kebab-case) eşlemesi.
  const REF_TO_KEY = { jumpingJack: "jumping-jack", kneeRaise: "knee-raise" };
  if (ref && REF_TO_KEY[ref]) return REF_TO_KEY[ref];

  // library id eşlemesi (özel programdaki hareket id'si kökü "lunge-2" gibi olabilir)
  const id = exercise?.id || "";
  for (const key of ["jumping-jack", "knee-raise", "db-lateral-raise", "db-hammer-curl"]) {
    if (id === key || id.startsWith(`${key}-`)) return key;
  }
  // "standing-knee-raise" id'si → knee-raise keyframe'i.
  if (id === "standing-knee-raise" || id.startsWith("standing-knee-raise-")) {
    return "knee-raise";
  }
  return "generic";
}

/** Hareketin keyframe dizisini getir. */
export function keyframesFor(exercise) {
  return KEYFRAMES[keyframeKeyFor(exercise)];
}

/** Animasyon durduğunda gösterilecek statik kare (orta/dip poz). */
export function staticFrame(exercise) {
  const frames = keyframesFor(exercise);
  return frames[frames.length - 1];
}

/** Push-up gibi yatay düzlemde zemin çizgisi konumu farklı. */
export function groundYFor(exercise) {
  return keyframeKeyFor(exercise) === "pushup" ? 90 : 92;
}

/** Bir döngünün (ileri) süresi — ms. Tam ping-pong = 2x. */
export const POSE_PERIOD_MS = 900; // ileri 0.9s → tam döngü ~1.8s
