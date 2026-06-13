// Push-up egzersiz tanımı — veri + saf metrik fonksiyonu (squat.js şablonu).
//
// Hoca notu (owner programı): "Eller göğüs hizasında, boyun kırılmasın, karın sık."
// Kurallara çeviri:
//   "karın sık / kalça düşmesi" → bodyLine: omuz-kalça-ayakBileği DÜZ HAT (~180°);
//     kalça sarkması (pike/sag) açıyı düşürür. Sapma eşiği < 156° ≈ >24° kırılma.
//   "boyun kırılmasın"          → neckLine: kulak(burun)-omuz-kalça hizası;
//     baş düşmesi/aşırı kaldırma açıyı bozar.
//   derinlik                    → elbowAngle dip eşiği (rep FSM attemptClose).
//
// Açılar 3D world landmark'tan (kamera açısı bağımsız), One Euro filtreli (mevcut altyapı).
// Push-up yatay düzlemde — kamera önerisi YAN (side), tüm gövde tek karede.

import { LM, isPointReliable } from "../lib/pose";
import { angleAtPoint } from "../lib/angles";
import { angleAtPoint3D, midpoint3D } from "../lib/angles3d";
import { DEFAULT_TUNINGS } from "../lib/thresholds";

// Eşikler MERKEZİ config'ten (lib/thresholds.js) — tanım yeri orası.
const T = DEFAULT_TUNINGS.pushup;

const SIDE_ARM = {
  left: { shoulder: LM.LEFT_SHOULDER, elbow: LM.LEFT_ELBOW, wrist: LM.LEFT_WRIST },
  right: { shoulder: LM.RIGHT_SHOULDER, elbow: LM.RIGHT_ELBOW, wrist: LM.RIGHT_WRIST },
};

function armReliable(lm, side) {
  const j = SIDE_ARM[side];
  return (
    isPointReliable(lm[j.shoulder]) &&
    isPointReliable(lm[j.elbow]) &&
    isPointReliable(lm[j.wrist])
  );
}

/** Taraf dirsek açısı — world 3D varsa 3D, yoksa 2D fallback. */
function sideElbowAngle(lm, wlm, side) {
  if (!armReliable(lm, side)) return null;
  const j = SIDE_ARM[side];
  if (wlm) {
    const a3 = angleAtPoint3D(wlm[j.shoulder], wlm[j.elbow], wlm[j.wrist]);
    if (a3 != null) return a3;
  }
  return angleAtPoint(lm[j.shoulder], lm[j.elbow], lm[j.wrist]);
}

export const pushup = {
  id: "pushup",
  name: "Push Up",
  cameraHint: "Kamera: yandan, tüm gövde karede (~2 m)",

  // Rep FSM: faz kararı DİRSEK açısından sürülür (squat'ta diz idi).
  // Üstte (kollar düz) ≈ 170°+ → "standing"; dipte (göğüs aşağı) ≤ 95° → "bottom".
  tracking: {
    primaryMetric: "elbowAngle",
    phases: { ...T.phases },
    attemptBelow: T.attemptBelow, // belirgin iniş var ama dibe ulaşılmadı → derinlik hatası
  },
  phases: { ...T.phases },
  phaseConfirmFrames: T.phaseConfirmFrames,
  attemptBelow: T.attemptBelow,

  phaseLabels: {
    standing: "Yukarı",
    descent: "İniş",
    bottom: "Aşağı",
    ascent: "Çıkış",
    idle: "Hazır",
  },

  // Push-up'ta kalibrasyon yok (zemin/topuk kuralı squat'a özgü).
  calibration: null,

  faultRules: [
    {
      id: "depth",
      label: "Derinlik",
      metric: "minElbowAngle", // attempt bazlı — repEngine deneme kapanışında uygular
      space: "world3d",
      joints: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
      phases: ["attemptClose"],
      predicate: { op: "gt", threshold: T.faults.depth.threshold, tolerance: T.faults.depth.tolerance }, // dip ≤eşik tam tekrar
      severity: "major",
      minVisibility: 0.6,
      cameraHint: "side",
      message: "Daha aşağı in, göğsünü yere yaklaştır",
      speech: "Daha aşağı in",
    },
    {
      id: "bodyLine",
      label: "Gövde hattı (kalça)",
      metric: "bodyLineAngle", // omuz-kalça-ayakBileği; düz hat ≈ 180°
      space: "world3d",
      joints: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
      phases: ["descent", "bottom", "ascent"],
      // <156° ≈ >24° kırılma (kalça sarkması VEYA pike). Histerezis ±4°.
      predicate: { op: "lt", threshold: T.faults.bodyLine.threshold, tolerance: T.faults.bodyLine.tolerance },
      minFrames: 6,
      cooldownMs: 4000,
      severity: "critical",
      minVisibility: 0.6,
      cameraHint: "side",
      message: "Karnını sık, kalçanı düşürme — vücudun düz bir hat olsun",
      speech: "Karnını sık, kalçanı düşürme",
    },
    {
      id: "neckLine",
      label: "Boyun hizası",
      metric: "neckLineAngle", // burun-omuz-kalça; düz duruşta ≈ 160°+
      space: "world3d",
      joints: [LM.NOSE, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP],
      phases: ["descent", "bottom", "ascent"],
      // Baş düşmesi/aşırı kaldırma açıyı 130° altına bozar. Histerezis ±5°.
      predicate: { op: "lt", threshold: T.faults.neckLine.threshold, tolerance: T.faults.neckLine.tolerance },
      minFrames: 6,
      cooldownMs: 5000,
      severity: "major",
      minVisibility: 0.5, // burun yan görüşte kısmen kapanabilir
      cameraHint: "side",
      message: "Boynunu kırma, başını gövdenle aynı hizada tut",
      speech: "Boynunu kırma, başını nötr tut",
    },
  ],

  /**
   * Landmark'lardan push-up metriklerini üretir.
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {elbowAngle, elbowAngleLeft, elbowAngleRight,
   *   bodyLineAngle, neckLineAngle}
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

    // Gövde hattı — omuz ortası → kalça ortası → ayak bileği ortası açısı.
    // Düz plank ≈ 180°; kalça sarkması/pike açıyı düşürür.
    let bodyLineAngle = null;
    let neckLineAngle = null;
    if (wlm) {
      const shoulderMid = midpoint3D(wlm[LM.LEFT_SHOULDER], wlm[LM.RIGHT_SHOULDER]);
      const hipMid = midpoint3D(wlm[LM.LEFT_HIP], wlm[LM.RIGHT_HIP]);
      const ankleMid = midpoint3D(wlm[LM.LEFT_ANKLE], wlm[LM.RIGHT_ANKLE]);
      bodyLineAngle = angleAtPoint3D(shoulderMid, hipMid, ankleMid);

      // Boyun hizası — burun → omuz ortası → kalça ortası.
      const nose = wlm[LM.NOSE];
      neckLineAngle = angleAtPoint3D(nose, shoulderMid, hipMid);
    }

    return {
      elbowAngle,
      elbowAngleLeft: left,
      elbowAngleRight: right,
      bodyLineAngle,
      neckLineAngle,
    };
  },
};
