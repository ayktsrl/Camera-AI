// Dumbbell Lateral Raise egzersiz tanımı — veri + saf metrik fonksiyonu
// (squat.js / jumpingJack.js şablonu).
//
// Hoca notu (owner programı, AYNEN): "hafif çapraz yukarı" / "Omuz hizasında dur,
// trapezi kasma". Kurallara çeviri:
//   "çok yükseğe kaldırma / trapez silkme" → tooHigh (frame): kol omuz hizasını
//      BELİRGİN geçerse (abduction >100°) uyarı. Hoca: omuz hizasında bırak.
//   derinlik (yarım tekrar) → omuz abduction tepe eşiği (attemptClose). Kol omuz
//      hizasına gelmezse (abduction <80°) yarım tekrar, sayılmaz.
//   "hafif çapraz yukarı gönder" + "dirsekler hafif yukarı dönük" → önkol/el yönelimi
//      landmark çözünürlüğünün altında → ÖLÇÜLMEDİ (coachNote ekranda kalır).
//
// Rep FSM yön uyumu: genel repEngine standing(YÜKSEK açı) → bottom(DÜŞÜK açı) → standing.
// Lateral raise'i bu yöne uydurmak için metrik = loweredAngle = (180 - kol abduction):
//   kol YANDA (aşağı)        → abduction küçük → loweredAngle YÜKSEK → "standing"
//   kol OMUZ HİZASINDA (yukarı) → abduction ~90° → loweredAngle ~90  → "bottom"
// Bir tekrar = aşağı → omuz hizası → aşağı (squat/jumping jack ile aynı tek-metrik döngü).
//
// Açılar 3D world landmark'tan (kamera açısı bağımsız), One Euro filtreli; world yoksa
// 2D fallback. Düşük visibility → metrik null → motor bekler (sayım donar, yanlış saymaz).
//
// NOT (kalibrasyon adayı): eşikler MAKUL başlangıç; owner canlı testiyle (kol uzunluğu,
// kamera mesafesi, tempo) ince ayar yapılacak — özellikle bottomMax ve tooHigh eşiği.

import { LM, isPointReliable } from "../lib/pose";
import { angleAtPoint } from "../lib/angles";
import { angleAtPoint3D } from "../lib/angles3d";
import { DEFAULT_TUNINGS } from "../lib/thresholds";

// Eşikler MERKEZİ config'ten (lib/thresholds.js) — tanım yeri orası.
const T = DEFAULT_TUNINGS.lateralRaise;

const SIDE_JOINTS = {
  left: { hip: LM.LEFT_HIP, shoulder: LM.LEFT_SHOULDER, wrist: LM.LEFT_WRIST },
  right: { hip: LM.RIGHT_HIP, shoulder: LM.RIGHT_SHOULDER, wrist: LM.RIGHT_WRIST },
};

/** Tarafın kol-abduction eklemleri 2D visibility/presence ile güvenilir mi? */
function sideReliable(lm, side) {
  const j = SIDE_JOINTS[side];
  return (
    isPointReliable(lm[j.hip]) &&
    isPointReliable(lm[j.shoulder]) &&
    isPointReliable(lm[j.wrist])
  );
}

/**
 * Taraf kol abduction açısı (kalça→omuz→bilek) — kolun gövdeye göre yana açılması.
 * Kol yanda ≈ küçük açı (~10–20°); kol omuz hizasında ≈ ~90°; baş üstü ≈ ~160°+.
 * world 3D varsa 3D (kamera bağımsız), yoksa 2D fallback.
 */
function sideAbduction(lm, wlm, side) {
  if (!sideReliable(lm, side)) return null;
  const j = SIDE_JOINTS[side];
  if (wlm) {
    const a3 = angleAtPoint3D(wlm[j.hip], wlm[j.shoulder], wlm[j.wrist]);
    if (a3 != null) return a3;
  }
  return angleAtPoint(lm[j.hip], lm[j.shoulder], lm[j.wrist]);
}

export const lateralRaise = {
  id: "lateralRaise",
  name: "Dumbbell Lateral Raise",
  cameraHint: "Kamera: önden veya 45°, ~2.5 m (kol yana kalkışı görünür)",

  // Rep FSM: faz, loweredAngle (= 180 - abduction) ile sürülür.
  // Kol aşağı (yanda) → loweredAngle yüksek → "standing".
  // Kol omuz hizasında → loweredAngle düşük → "bottom".
  tracking: {
    primaryMetric: "loweredAngle",
    phases: { ...T.phases },
    attemptBelow: T.attemptBelow, // belirgin kalkış ama omuz hizasına gelmedi → "derinlik"
  },
  phases: { ...T.phases },
  phaseConfirmFrames: T.phaseConfirmFrames,
  attemptBelow: T.attemptBelow,

  phaseLabels: {
    standing: "Kol aşağıda",
    descent: "Kalkıyor",
    bottom: "Omuz hizası",
    ascent: "İniyor",
    idle: "Hazır",
  },

  calibration: null,

  faultRules: [
    {
      id: "tooHigh",
      label: "Çok yükseğe kaldırma",
      metric: "abduction", // kol abduction; omuz hizası ~90°
      space: "world3d",
      joints: [
        LM.LEFT_HIP, LM.LEFT_SHOULDER, LM.LEFT_WRIST,
        LM.RIGHT_HIP, LM.RIGHT_SHOULDER, LM.RIGHT_WRIST,
      ],
      phases: ["descent", "bottom", "ascent"],
      // >eşik = kolu omuz hizasının belirgin üstüne kaldırıyor (trapez silkme).
      predicate: { op: "gt", threshold: T.faults.tooHigh.threshold, tolerance: T.faults.tooHigh.tolerance },
      minFrames: 5,
      cooldownMs: 4000,
      severity: "major",
      minVisibility: 0.5,
      cameraHint: "front45",
      message: "Omuz hizasında bırak, trapezini kasma",
      speech: "Omuz hizasında bırak",
    },
    {
      id: "depth",
      label: "Derinlik",
      metric: "minKneeAngle", // repEngine attemptClose minAngle (loweredAngle min)
      space: "world3d",
      joints: [
        LM.LEFT_HIP, LM.LEFT_SHOULDER, LM.LEFT_WRIST,
        LM.RIGHT_HIP, LM.RIGHT_SHOULDER, LM.RIGHT_WRIST,
      ],
      phases: ["attemptClose"],
      // tepe loweredAngle ≤eşik (abduction ≥80°, omuz hizası) tam tekrar.
      predicate: { op: "gt", threshold: T.faults.depth.threshold, tolerance: T.faults.depth.tolerance },
      severity: "major",
      minVisibility: 0.5,
      cameraHint: "front45",
      message: "Kolu omuz hizasına kaldır",
      speech: "Kolu omuz hizasına kaldır",
    },
  ],

  /**
   * Landmark'lardan lateral raise metriklerini üretir.
   * loweredAngle = 180 - ortalama kol abduction (iki koldan güvenilir olanlar).
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {loweredAngle, abduction, abductionLeft, abductionRight}
   */
  computeMetrics(lm, wlm) {
    if (!lm) return null;

    const left = sideAbduction(lm, wlm, "left");
    const right = sideAbduction(lm, wlm, "right");

    let abduction = null;
    if (left != null && right != null) abduction = (left + right) / 2;
    else if (left != null) abduction = left;
    else if (right != null) abduction = right;

    if (abduction == null) return null;

    // Yön çevirme: kol aşağı (abduction küçük) → loweredAngle yüksek → FSM "standing".
    const loweredAngle = 180 - abduction;

    return {
      loweredAngle,
      abduction,
      abductionLeft: left,
      abductionRight: right,
    };
  },
};
