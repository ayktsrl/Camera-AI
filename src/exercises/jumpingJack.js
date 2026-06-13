// Jumping Jack egzersiz tanımı — veri + saf metrik fonksiyonu (squat.js / lunge.js şablonu).
//
// Isınma hareketi → öncelik DOĞRU SAYIM; form kuralı minimal (tek "tam aç" derinlik
// kontrolü, frame-bazlı uyarı yok).
//
// Rep FSM yön uyumu: genel repEngine döngüsü standing(YÜKSEK açı) → bottom(DÜŞÜK açı)
// → standing = +1. squat'ta diz açısı dinlenmede yüksek, dipte düşük. Jumping jack'i
// bu yöne uydurmak için metrik = closedAngle = (180 - kol abduction):
//   eller YANDA (kapalı)  → abduction küçük → closedAngle YÜKSEK  → "standing"
//   eller BAŞ ÜSTÜ (açık) → abduction büyük → closedAngle DÜŞÜK   → "bottom"
// Bir tekrar = kapalı → açık → kapalı (squat'la birebir aynı tek-metrik döngüsü).
//
// Açılar 3D world landmark'tan (kamera açısı bağımsız), One Euro filtreli; world yoksa
// 2D fallback (sayım sürer). Düşük visibility → metrik null → faz açısı yok → motor bekler.
//
// NOT (kalibrasyon adayı): eşikler MAKUL başlangıç değeridir; owner canlı testiyle
// (kol uzunluğu, kamera mesafesi, tempo) ince ayar yapılacak.

import { LM, isPointReliable } from "../lib/pose";
import { angleAtPoint } from "../lib/angles";
import { angleAtPoint3D } from "../lib/angles3d";

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
 * Eller yanda ≈ küçük açı (~10–20°); eller baş üstü ≈ büyük açı (~160–170°).
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

export const jumpingJack = {
  id: "jumpingJack",
  name: "Jumping Jack",
  cameraHint: "Kamera: önden, ~2.5 m (tüm vücut görünür)",

  // Rep FSM: faz, closedAngle (= 180 - abduction) ile sürülür.
  // Kapalı (eller yanda) → closedAngle yüksek → "standing".
  // Açık (eller baş üstü) → closedAngle düşük → "bottom".
  tracking: {
    primaryMetric: "closedAngle",
    phases: { standingMin: 150, bottomMax: 60 },
    attemptBelow: 110, // belirgin açılma var ama tam açılmadı → "tam aç" uyarısı
  },
  phases: { standingMin: 150, bottomMax: 60 },
  // Hızlı hareket → daha kısa debounce; çift sayma frenini korur (3 ardışık frame).
  phaseConfirmFrames: 3,
  attemptBelow: 110,

  phaseLabels: {
    standing: "Kapalı",
    descent: "Açılıyor",
    bottom: "Açık",
    ascent: "Kapanıyor",
    idle: "Hazır",
  },

  calibration: null,

  // Isınma → form kuralı MİNİMAL. Tek attemptClose "tam aç" kontrolü; frame kuralı yok.
  faultRules: [
    {
      id: "depth",
      label: "Tam açılma",
      metric: "minKneeAngle", // repEngine attemptClose minAngle alanı (closedAngle min)
      space: "world3d",
      joints: [
        LM.LEFT_HIP, LM.LEFT_SHOULDER, LM.LEFT_WRIST,
        LM.RIGHT_HIP, LM.RIGHT_SHOULDER, LM.RIGHT_WRIST,
      ],
      phases: ["attemptClose"],
      predicate: { op: "gt", threshold: 60, tolerance: 0 }, // tepe ≤60° tam açılma
      severity: "minor",
      minVisibility: 0.5,
      cameraHint: "front45",
      message: "Kollarını tam yukarı aç",
      speech: "Kollarını tam yukarı aç",
    },
  ],

  /**
   * Landmark'lardan jumping jack metriklerini üretir.
   * closedAngle = 180 - ortalama kol abduction (iki koldan güvenilir olanlar).
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {closedAngle, abduction, abductionLeft, abductionRight}
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

    // Yön çevirme: kapalı (abduction küçük) → closedAngle yüksek → FSM "standing".
    const closedAngle = 180 - abduction;

    return {
      closedAngle,
      abduction,
      abductionLeft: left,
      abductionRight: right,
    };
  },
};
