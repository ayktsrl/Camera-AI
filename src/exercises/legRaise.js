// Leg Raise egzersiz tanımı — veri + saf metrik fonksiyonu (squat.js / kneeRaise.js şablonu).
//
// Poz: SIRTÜSTÜ, bacak kaldırma, YAN görünüm. Metrik = kalça fleksiyonu (omuz→kalça→ayakbileği).
//   Bacak yerde (düz, gövdeyle hizalı) → açı BÜYÜK (~160–180°).
//   Bacak yukarı (dikey, ~90° gövdeye) → açı KÜÇÜK.
//
// Rep FSM yön uyumu: efor = bacak yukarı = DÜŞÜK açı → genel repEngine ile DOĞRUDAN
// uyumlu (squat gibi: standing=yüksek → bottom=düşük). Yön çevirme GEREKMEZ.
//   bacak yerde → kalça açısı yüksek → "standing"
//   bacak yukarı → kalça açısı düşük → "bottom" (efor)
// Bir tekrar = kaldır → indir.
//
// Açılar 3D world landmark'tan (kamera açısı bağımsız), One Euro filtreli; world yoksa
// 2D fallback. Düşük visibility → metrik null → motor bekler (yanlış saymaz).
// İki bacaktan güvenilir olanları ortalar (yan görüşte uzak bacak kısmen kapanabilir).
//
// NOT (kalibrasyon adayı): eşikler MAKUL başlangıç; supine poz + esneklik + kamera
// açısına göre değişir → owner canlı testiyle ince ayar yapılacak.

import { LM, isPointReliable } from "../lib/pose";
import { angleAtPoint } from "../lib/angles";
import { angleAtPoint3D } from "../lib/angles3d";
import { DEFAULT_TUNINGS } from "../lib/thresholds";

// Eşikler MERKEZİ config'ten (lib/thresholds.js) — tanım yeri orası.
const T = DEFAULT_TUNINGS.legRaise;

const SIDE_JOINTS = {
  left: { shoulder: LM.LEFT_SHOULDER, hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE, ankle: LM.LEFT_ANKLE },
  right: { shoulder: LM.RIGHT_SHOULDER, hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE, ankle: LM.RIGHT_ANKLE },
};

/** Tarafın kalça-fleksiyon eklemleri (omuz, kalça, ayak bileği) güvenilir mi? */
function sideReliable(lm, side) {
  const j = SIDE_JOINTS[side];
  return (
    isPointReliable(lm[j.shoulder]) &&
    isPointReliable(lm[j.hip]) &&
    isPointReliable(lm[j.ankle])
  );
}

/**
 * Taraf kalça fleksiyon açısı (omuz→kalça→ayakbileği). Bacak yerde ≈ 170–180°;
 * bacak dikey ≈ 90°. world 3D varsa 3D (kamera açısı bağımsız), yoksa 2D fallback.
 */
function sideHipAngle(lm, wlm, side) {
  if (!sideReliable(lm, side)) return null;
  const j = SIDE_JOINTS[side];
  if (wlm) {
    const a3 = angleAtPoint3D(wlm[j.shoulder], wlm[j.hip], wlm[j.ankle]);
    if (a3 != null) return a3;
  }
  return angleAtPoint(lm[j.shoulder], lm[j.hip], lm[j.ankle]);
}

/** Taraf diz açısı (kalça→diz→ayakbileği) — bacak düzlüğü kontrolü için. */
function sideKneeAngle(lm, wlm, side) {
  const j = SIDE_JOINTS[side];
  if (
    !isPointReliable(lm[j.hip]) ||
    !isPointReliable(lm[j.knee]) ||
    !isPointReliable(lm[j.ankle])
  )
    return null;
  if (wlm) {
    const a3 = angleAtPoint3D(wlm[j.hip], wlm[j.knee], wlm[j.ankle]);
    if (a3 != null) return a3;
  }
  return angleAtPoint(lm[j.hip], lm[j.knee], lm[j.ankle]);
}

export const legRaise = {
  id: "legRaise",
  name: "Leg Raise",
  cameraHint: "Kamera: yandan, ~2 m (sırtüstü tüm vücut yan profil)",
  framing: "full", // bacak yörüngesi → tüm vücut yan profil

  // Rep FSM: faz kalça fleksiyon açısından sürülür (squat yönü — çevirme yok).
  // Bacak yerde ≈ 175° → "standing"; bacak dikey ≈ 90° → "bottom".
  tracking: {
    primaryMetric: "hipAngle",
    phases: { ...T.phases },
    attemptBelow: T.attemptBelow, // belirgin kalkış var ama tam yukarı değil → "daha yukarı"
  },
  phases: { ...T.phases },
  phaseConfirmFrames: T.phaseConfirmFrames,
  attemptBelow: T.attemptBelow,

  phaseLabels: {
    standing: "Yat",
    descent: "Kalkıyor",
    bottom: "Yukarı",
    ascent: "İniyor",
    idle: "Hazır",
  },

  calibration: null,

  // Form kuralları — bildirimsel şema (lib/faultRules.js işler).
  faultRules: [
    {
      id: "depth",
      label: "Bacak yüksekliği",
      metric: "minKneeAngle", // repEngine attemptClose minAngle (hipAngle min = en yüksek bacak)
      space: "world3d",
      joints: [
        LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_ANKLE,
        LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_ANKLE,
      ],
      phases: ["attemptClose"],
      predicate: { op: "gt", threshold: T.faults.depth.threshold, tolerance: T.faults.depth.tolerance }, // tepe ≤eşik tam yukarı
      severity: "major",
      minVisibility: 0.5,
      cameraHint: "side",
      message: "Bacaklarını daha yukarı kaldır",
      speech: "Bacaklarını daha yukarı kaldır",
    },
    {
      id: "kneeBend",
      label: "Diz bükülmesi",
      metric: "kneeAngle", // anlık; diz açısı eşik altıysa bacak bükük
      space: "world3d",
      joints: [
        LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE,
        LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE,
      ],
      phases: ["descent", "bottom", "ascent"],
      predicate: { op: "lt", threshold: T.faults.kneeBend.threshold, tolerance: T.faults.kneeBend.tolerance }, // diz <eşik = aşırı bükük
      minFrames: 6,
      cooldownMs: 4000,
      severity: "minor",
      minVisibility: 0.5,
      cameraHint: "side",
      message: "Bacaklarını düz tut",
      speech: "Bacaklarını düz tut",
    },
  ],

  /**
   * Landmark'lardan leg raise metriklerini üretir.
   * hipAngle = ortalama kalça fleksiyonu (iki bacaktan güvenilir olanlar) — FSM bunu okur.
   * kneeAngle = en bükük (min) diz açısı — bacak düzlüğü kuralı için.
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {hipAngle, hipAngleLeft, hipAngleRight, kneeAngle}
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

    // Diz düzlüğü — en bükük (küçük) diz raporlanır (iki bacaktan en kötü).
    const kneeL = sideKneeAngle(lm, wlm, "left");
    const kneeR = sideKneeAngle(lm, wlm, "right");
    const kneeAngle =
      kneeL != null && kneeR != null
        ? Math.min(kneeL, kneeR)
        : (kneeL ?? kneeR);

    return {
      hipAngle,
      hipAngleLeft: left,
      hipAngleRight: right,
      kneeAngle,
    };
  },
};
