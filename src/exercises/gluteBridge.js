// Glute Bridge egzersiz tanımı — veri + saf metrik fonksiyonu (squat.js / jumpingJack.js şablonu).
//
// Poz: SIRTÜSTÜ, kalça köprüsü, YAN görünüm. Metrik = kalça açısı (omuz→kalça→diz).
//   Yat (kalça yerde, gövde+uyluk bükük) → kalça açısı KÜÇÜK (~70–100°).
//   Köprü (kalça yukarı, gövde-uyluk düz hat) → kalça açısı BÜYÜK (~160–175°).
//
// Rep FSM yön uyumu (jumpingJack ile AYNI teknik): genel repEngine döngüsü
// standing(YÜKSEK açı) → bottom(DÜŞÜK açı) → standing = +1 bekler. Burada "efor"
// pozisyonu YÜKSEK kalça açısı (köprü) — squat'ın TERSİ. Yönü çevirmek için
// metrik = bridgeAngle = (180 - kalça açısı):
//   yat (kalça açısı küçük) → bridgeAngle YÜKSEK → "standing" (dinlenme)
//   köprü (kalça açısı büyük) → bridgeAngle DÜŞÜK → "bottom" (efor)
// Bir tekrar = köprüye çık → in (squat'la birebir aynı tek-metrik döngüsü).
//
// Açılar 3D world landmark'tan (kamera açısı bağımsız), One Euro filtreli; world yoksa
// 2D fallback (sayım sürer). Düşük visibility → metrik null → motor bekler (yanlış saymaz).
// İki taraftan güvenilir olanları ortalar (yan görüşte uzak taraf kısmen kapanabilir).
//
// NOT (kalibrasyon adayı): eşikler MAKUL başlangıç; supine poz + esneklik + kamera
// açısına göre değişir → owner canlı testiyle ince ayar yapılacak.

import { LM, isPointReliable } from "../lib/pose";
import { angleAtPoint } from "../lib/angles";
import { angleAtPoint3D } from "../lib/angles3d";
import { DEFAULT_TUNINGS } from "../lib/thresholds";

// Eşikler MERKEZİ config'ten (lib/thresholds.js) — tanım yeri orası.
const T = DEFAULT_TUNINGS.gluteBridge;

const SIDE_JOINTS = {
  left: { shoulder: LM.LEFT_SHOULDER, hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE },
  right: { shoulder: LM.RIGHT_SHOULDER, hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE },
};

/** Tarafın kalça-açısı eklemleri 2D visibility/presence ile güvenilir mi? */
function sideReliable(lm, side) {
  const j = SIDE_JOINTS[side];
  return (
    isPointReliable(lm[j.shoulder]) &&
    isPointReliable(lm[j.hip]) &&
    isPointReliable(lm[j.knee])
  );
}

/**
 * Taraf kalça açısı (omuz→kalça→diz). Yat ≈ 70–100°; tam köprü ≈ 160–175°.
 * world 3D varsa 3D (kamera açısı bağımsız), yoksa 2D fallback.
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

export const gluteBridge = {
  id: "gluteBridge",
  name: "Glute Bridge",
  cameraHint: "Kamera: yandan, ~2 m (sırtüstü tüm vücut yan profil)",
  framing: "full", // alt gövde + gövde hattı → tüm vücut yan profil

  // Rep FSM: faz, bridgeAngle (= 180 - kalça açısı) ile sürülür.
  // Yat (kalça açısı küçük) → bridgeAngle yüksek → "standing".
  // Köprü (kalça açısı büyük) → bridgeAngle düşük → "bottom".
  tracking: {
    primaryMetric: "bridgeAngle",
    phases: { ...T.phases },
    attemptBelow: T.attemptBelow, // belirgin kalkış var ama tam köprü değil → "daha yukarı"
  },
  phases: { ...T.phases },
  phaseConfirmFrames: T.phaseConfirmFrames,
  attemptBelow: T.attemptBelow,

  phaseLabels: {
    standing: "Yat",
    descent: "Kalkıyor",
    bottom: "Köprü",
    ascent: "İniyor",
    idle: "Hazır",
  },

  calibration: null,

  // Form kuralları — bildirimsel şema (lib/faultRules.js işler).
  faultRules: [
    {
      id: "depth",
      label: "Köprü yüksekliği",
      metric: "minKneeAngle", // repEngine attemptClose minAngle (bridgeAngle min = en yüksek köprü)
      space: "world3d",
      joints: [
        LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE,
        LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE,
      ],
      phases: ["attemptClose"],
      predicate: { op: "gt", threshold: T.faults.depth.threshold, tolerance: T.faults.depth.tolerance }, // tepe ≤eşik tam köprü
      severity: "major",
      minVisibility: 0.5,
      cameraHint: "side",
      message: "Kalçanı daha yukarı kaldır",
      speech: "Kalçanı daha yukarı kaldır",
    },
    {
      id: "hyperextension",
      label: "Aşırı bel kalkması",
      metric: "bridgeAngle", // anlık; köprü fazında bridgeAngle çok düşük = kalça açısı çok büyük
      space: "world3d",
      joints: [
        LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE,
        LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE,
      ],
      phases: ["bottom"],
      predicate: { op: "lt", threshold: T.faults.hyperextension.threshold, tolerance: T.faults.hyperextension.tolerance }, // bridgeAngle <eşik = aşırı hiperekstansiyon
      minFrames: 5,
      cooldownMs: 4000,
      severity: "major",
      minVisibility: 0.5,
      cameraHint: "side",
      message: "Beli aşırı kaldırma, kalçayı sık",
      speech: "Beli aşırı kaldırma, kalçayı sık",
    },
  ],

  /**
   * Landmark'lardan glute bridge metriklerini üretir.
   * bridgeAngle = 180 - ortalama kalça açısı (iki taraftan güvenilir olanlar).
   * Yön çevirme: yat (kalça açısı küçük) → bridgeAngle yüksek → FSM "standing".
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {bridgeAngle, hipAngle, hipAngleLeft, hipAngleRight}
   */
  computeMetrics(lm, wlm) {
    if (!lm) return null;

    const left = sideHipAngle(lm, wlm, "left");
    const right = sideHipAngle(lm, wlm, "right");

    let hipAngle = null;
    if (left != null && right != null) hipAngle = (left + right) / 2;
    else if (left != null) hipAngle = left;
    else if (right != null) hipAngle = right;

    if (hipAngle == null) return null;

    // Yön çevirme: köprü (kalça açısı büyük) → bridgeAngle küçük → FSM "bottom" (efor).
    const bridgeAngle = 180 - hipAngle;

    return {
      bridgeAngle,
      hipAngle,
      hipAngleLeft: left,
      hipAngleRight: right,
    };
  },
};
