// Standing Knee Raise egzersiz tanımı — veri + saf metrik fonksiyonu (lunge.js şablonu).
//
// PDF: "sağ sol 12" → alternat diz kaldırma. Denge ısınması → öncelik DOĞRU SAYIM;
// form kuralı minimal (tek "kalça hizasına kaldır" derinlik kontrolü, frame uyarısı yok).
//
// Rep FSM: faz, AKTİF (kalkan = daha bükük) bacağın KALÇA fleksiyon açısından sürülür
// (lunge'daki "aktif = daha bükük diz" deseninin kalça versiyonu). Ayakta düz bacak ≈
// 175° (uyluk gövdeyle hizalı) → "standing"; diz kalça hizasına kalkınca ≈ 90° → "bottom".
// Bir tekrar = bir diz kaldırma (down → up → down). Sol/sağ ayrımı `activeSide` olarak
// raporlanır ama P0'da TOPLAM sayım yeterli (alternat ayrım şart değil).
//
// Açılar 3D world landmark'tan (kamera bağımsız), One Euro filtreli; world yoksa 2D
// fallback. Düşük visibility → metrik null → motor bekler (sayım donar, yanlış saymaz).
//
// NOT (kalibrasyon adayı): eşikler MAKUL başlangıç; "kalça hizası" esnekliğe göre
// değişir → owner canlı testiyle ince ayar yapılacak.

import { LM, isPointReliable } from "../lib/pose";
import { angleAtPoint } from "../lib/angles";
import { angleAtPoint3D } from "../lib/angles3d";
import { DEFAULT_TUNINGS } from "../lib/thresholds";

// Eşikler MERKEZİ config'ten (lib/thresholds.js) — tanım yeri orası.
const T = DEFAULT_TUNINGS.kneeRaise;

const SIDE_JOINTS = {
  left: { shoulder: LM.LEFT_SHOULDER, hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE },
  right: { shoulder: LM.RIGHT_SHOULDER, hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE },
};

/** Tarafın kalça-fleksiyon eklemleri 2D visibility/presence ile güvenilir mi? */
function sideReliable(lm, side) {
  const j = SIDE_JOINTS[side];
  return (
    isPointReliable(lm[j.shoulder]) &&
    isPointReliable(lm[j.hip]) &&
    isPointReliable(lm[j.knee])
  );
}

/**
 * Taraf kalça fleksiyon açısı (omuz→kalça→diz). Ayakta düz bacak ≈ 175°;
 * diz kalça hizasına kalktığında ≈ 90°. world 3D varsa 3D, yoksa 2D fallback.
 */
function sideHipAngle(lm, wlm, side) {
  if (!sideReliable(lm, side)) return null;
  const j = SIDE_JOINTS[side];
  if (wlm) {
    const a3 = angleAtPoint3D(wlm[j.shoulder], wlm[j.hip], wlm[j.knee]);
    if (a3 != null) return a3;
  }
  return angleAtPoint(lm[j.shoulder], lm[j.hip], lm[j.knee]);
}

export const kneeRaise = {
  id: "kneeRaise",
  name: "Standing Knee Raise",
  cameraHint: "Kamera: önden veya 45°, ~2.5 m",
  framing: "full", // diz yükselişi → tüm vücut

  // Rep FSM: faz AKTİF (daha bükük) bacağın kalça açısından sürülür.
  // Ayakta düz ≈ 175° → "standing"; diz kalça hizasında ≈ 90° → "bottom".
  tracking: {
    primaryMetric: "hipAngle", // = aktif (min) kalça açısı
    phases: { ...T.phases },
    attemptBelow: T.attemptBelow, // belirgin kalkış ama hizaya gelmedi → "daha yukarı" uyarısı
  },
  phases: { ...T.phases },
  phaseConfirmFrames: T.phaseConfirmFrames,
  attemptBelow: T.attemptBelow,

  phaseLabels: {
    standing: "Ayakta",
    descent: "Kalkıyor",
    bottom: "Tepede",
    ascent: "İniyor",
    idle: "Hazır",
  },

  calibration: null,

  // Isınma/denge → form kuralı MİNİMAL. Tek attemptClose "kalça hizasına kaldır";
  // frame kuralı yok (valgus/torso uyarısı denge ısınmasında zorlamaz).
  faultRules: [
    {
      id: "depth",
      label: "Diz yüksekliği",
      metric: "minKneeAngle", // repEngine attemptClose minAngle (hipAngle min)
      space: "world3d",
      joints: [
        LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE,
        LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE,
      ],
      phases: ["attemptClose"],
      predicate: { op: "gt", threshold: T.faults.depth.threshold, tolerance: T.faults.depth.tolerance }, // tepe ≤eşik hiza
      severity: "minor",
      minVisibility: 0.5,
      cameraHint: "front45",
      message: "Dizini kalça hizasına kaldır",
      speech: "Dizini kalça hizasına kaldır",
    },
  ],

  /**
   * Landmark'lardan knee raise metriklerini üretir.
   * Aktif (kalkan) bacak = daha bükük (küçük) kalça açısı olan; FSM bunu okur.
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {hipAngle, hipAngleLeft, hipAngleRight, activeSide}
   */
  computeMetrics(lm, wlm) {
    if (!lm) return null;

    const left = sideHipAngle(lm, wlm, "left");
    const right = sideHipAngle(lm, wlm, "right");

    // Aktif (kalkan) bacak = daha bükük (küçük açı) olan.
    let hipAngle = null;
    let activeSide = null;
    if (left != null && right != null) {
      if (left <= right) {
        hipAngle = left;
        activeSide = "left";
      } else {
        hipAngle = right;
        activeSide = "right";
      }
    } else if (left != null) {
      hipAngle = left;
      activeSide = "left";
    } else if (right != null) {
      hipAngle = right;
      activeSide = "right";
    }

    if (hipAngle == null) return null;

    return {
      hipAngle,
      hipAngleLeft: left,
      hipAngleRight: right,
      activeSide,
    };
  },
};
