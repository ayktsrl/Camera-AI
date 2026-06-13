// Shoulder / Dumbbell Press egzersiz tanımı — veri + saf metrik fonksiyonu (squat.js şablonu).
//
// Hoca notu (owner programı, AYNEN): "Press'te dirsekleri çok açma, biraz öne al" +
// (makine notu) "dirsek kulak hizasını biraz geçsin". Kurallara çeviri:
//   "dirsekleri çok açma, biraz öne al" → elbowFlare (frame): üst kolun gövdeye göre
//      SAF YANA açılması (frontal abduction) belirginse uyarı. İdealde dirsek hafif
//      önde → yan abduction düşük. severity major.
//   "kulak hizasını biraz geçsin" → tam uzanma ≈ derinlik kuralıyla yaklaşık karşılanır
//      (ayrı over-extension kuralı gürültülü → eklenmedi).
//   derinlik → dirsek uzanma tepe eşiği (attemptClose): yukarı tam uzanılmazsa yarım.
//
// Rep FSM yön uyumu: genel repEngine standing(YÜKSEK açı) → bottom(DÜŞÜK açı) → standing.
// Press'in "aşağı" (rest) pozu = eller omuzda, dirsek BÜKÜK; "yukarı" (efor) = uzanmış.
// Motora uydurmak için metrik = pressDownAngle = (180 - dirsek açısı):
//   eller OMUZDA (bükük, dirsek ~80°)  → pressDownAngle ~100 → "standing"
//   eller YUKARI (uzanmış, dirsek ~170°) → pressDownAngle ~10  → "bottom"
// Bir tekrar = omuzda → yukarı → omuzda (squat/jumping jack ile aynı tek-metrik döngü).
//
// Açılar 3D world landmark'tan (kamera bağımsız), One Euro filtreli; world yoksa 2D
// fallback. Düşük visibility → metrik null → motor bekler (sayım donar, yanlış saymaz).
//
// NOT (kalibrasyon adayı): eşikler MAKUL başlangıç; owner canlı testiyle (kol uzunluğu,
// kamera mesafesi) ince ayar yapılacak — özellikle bottomMax ve elbowFlare eşiği.

import { LM, isPointReliable } from "../lib/pose";
import { angleAtPoint } from "../lib/angles";
import { angleAtPoint3D } from "../lib/angles3d";
import { DEFAULT_TUNINGS } from "../lib/thresholds";

// Eşikler MERKEZİ config'ten (lib/thresholds.js) — tanım yeri orası.
const T = DEFAULT_TUNINGS.shoulderPress;

const SIDE_JOINTS = {
  left: { hip: LM.LEFT_HIP, shoulder: LM.LEFT_SHOULDER, elbow: LM.LEFT_ELBOW, wrist: LM.LEFT_WRIST },
  right: { hip: LM.RIGHT_HIP, shoulder: LM.RIGHT_SHOULDER, elbow: LM.RIGHT_ELBOW, wrist: LM.RIGHT_WRIST },
};

/** Tarafın press eklemleri (omuz/dirsek/bilek) 2D visibility/presence ile güvenilir mi? */
function sideReliable(lm, side) {
  const j = SIDE_JOINTS[side];
  return (
    isPointReliable(lm[j.shoulder]) &&
    isPointReliable(lm[j.elbow]) &&
    isPointReliable(lm[j.wrist])
  );
}

/**
 * Taraf dirsek açısı (omuz→dirsek→bilek). Omuzda bükük ≈ 70–90°; yukarı uzanmış ≈ 160–175°.
 * world 3D varsa 3D (kamera bağımsız), yoksa 2D fallback.
 */
function sideElbowAngle(lm, wlm, side) {
  if (!sideReliable(lm, side)) return null;
  const j = SIDE_JOINTS[side];
  if (wlm) {
    const a3 = angleAtPoint3D(wlm[j.shoulder], wlm[j.elbow], wlm[j.wrist]);
    if (a3 != null) return a3;
  }
  return angleAtPoint(lm[j.shoulder], lm[j.elbow], lm[j.wrist]);
}

/**
 * Taraf kol abduction açısı (kalça→omuz→dirsek) — üst kolun gövdeye göre yana açılması.
 * Dirsek hafif önde/aşağıda ≈ küçük açı; dirsek saf yana açılırsa (flare) açı büyür.
 * Kalça hattının dışına saf-yana açılma frontal düzlemde abduction'ı yükseltir.
 * Bilek değil DİRSEK kullanılır → press'in başlangıç (omuzda) pozunda dirsek konumu
 * "açıklığı" temsil eder. world 3D varsa 3D, yoksa 2D fallback.
 * @returns {number|null}
 */
function sideElbowAbduction(lm, wlm, side) {
  if (!sideReliable(lm, side)) return null;
  if (!isPointReliable(lm[SIDE_JOINTS[side].hip])) return null;
  const j = SIDE_JOINTS[side];
  if (wlm) {
    const a3 = angleAtPoint3D(wlm[j.hip], wlm[j.shoulder], wlm[j.elbow]);
    if (a3 != null) return a3;
  }
  return angleAtPoint(lm[j.hip], lm[j.shoulder], lm[j.elbow]);
}

export const shoulderPress = {
  id: "shoulderPress",
  name: "Dumbbell Shoulder Press",
  cameraHint: "Kamera: önden veya 45°, ~2.5 m (kol yukarı uzanışı görünür)",

  // Rep FSM: faz, pressDownAngle (= 180 - dirsek açısı) ile sürülür.
  // Omuzda bükük → pressDownAngle yüksek → "standing".
  // Yukarı uzanmış → pressDownAngle düşük → "bottom".
  tracking: {
    primaryMetric: "pressDownAngle",
    phases: { ...T.phases },
    attemptBelow: T.attemptBelow, // belirgin itiş ama tam uzanmadı → "derinlik"
  },
  phases: { ...T.phases },
  phaseConfirmFrames: T.phaseConfirmFrames,
  attemptBelow: T.attemptBelow,

  phaseLabels: {
    standing: "Omuzda",
    descent: "İtiliyor",
    bottom: "Yukarı",
    ascent: "İniyor",
    idle: "Hazır",
  },

  calibration: null,

  faultRules: [
    {
      id: "elbowFlare",
      label: "Dirsek aşırı yana",
      metric: "elbowAbduction", // kalça→omuz→dirsek; saf-yana açılma açıyı yükseltir
      space: "world3d",
      joints: [
        LM.LEFT_HIP, LM.LEFT_SHOULDER, LM.LEFT_ELBOW,
        LM.RIGHT_HIP, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW,
      ],
      phases: ["standing", "descent", "ascent"], // başlangıç (omuzda) ve geçişlerde anlamlı
      // >eşik = üst kol saf yana açık (öne almıyor). Hoca "biraz öne al".
      predicate: { op: "gt", threshold: T.faults.elbowFlare.threshold, tolerance: T.faults.elbowFlare.tolerance },
      minFrames: 6,
      cooldownMs: 4500,
      severity: "major",
      minVisibility: 0.5,
      cameraHint: "front45",
      message: "Dirsekleri biraz öne al, çok yana açma",
      speech: "Dirsekleri biraz öne al",
    },
    {
      id: "depth",
      label: "Tam uzanma",
      metric: "minKneeAngle", // repEngine attemptClose minAngle (pressDownAngle min)
      space: "world3d",
      joints: [
        LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST,
        LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST,
      ],
      phases: ["attemptClose"],
      // tepe pressDownAngle ≤eşik (dirsek ≥150°, tam uzanma) tam tekrar.
      predicate: { op: "gt", threshold: T.faults.depth.threshold, tolerance: T.faults.depth.tolerance },
      severity: "major",
      minVisibility: 0.5,
      cameraHint: "front45",
      message: "Yukarı tam uzan, kolları aç",
      speech: "Yukarı tam uzan",
    },
  ],

  /**
   * Landmark'lardan shoulder press metriklerini üretir.
   * pressDownAngle = 180 - ortalama dirsek açısı (iki koldan güvenilir olanlar).
   * elbowAbduction = en kötü (en büyük) taraf abduction'ı (flare uyarısı).
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {pressDownAngle, elbowAngle, elbowAngleLeft, elbowAngleRight, elbowAbduction}
   */
  computeMetrics(lm, wlm) {
    if (!lm) return null;

    const left = sideElbowAngle(lm, wlm, "left");
    const right = sideElbowAngle(lm, wlm, "right");

    let elbowAngle = null;
    if (left != null && right != null) elbowAngle = (left + right) / 2;
    else if (left != null) elbowAngle = left;
    else if (right != null) elbowAngle = right;

    if (elbowAngle == null) return null;

    // Yön çevirme: omuzda bükük (dirsek küçük) → pressDownAngle yüksek → FSM "standing".
    const pressDownAngle = 180 - elbowAngle;

    // Dirsek flare — ölçülebilen tarafların EN KÖTÜSÜ (en büyük abduction).
    const abdLeft = sideElbowAbduction(lm, wlm, "left");
    const abdRight = sideElbowAbduction(lm, wlm, "right");
    const elbowAbduction =
      abdLeft != null && abdRight != null
        ? Math.max(abdLeft, abdRight)
        : (abdLeft ?? abdRight);

    return {
      pressDownAngle,
      elbowAngle,
      elbowAngleLeft: left,
      elbowAngleRight: right,
      elbowAbduction,
    };
  },
};
