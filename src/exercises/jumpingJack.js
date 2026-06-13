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
// BİRLEŞİK KOŞUL (owner canlı test düzeltmesi): gerçek jumping jack HEM kollar baş üstü
// HEM bacaklar açık demektir. Sadece kol açmak (oturup elleri kaldırmak) SAYMAMALI.
// Tek-metrik FSM korunur; bunun için `closedAngle` artık bir KAPI içerir: bacaklar
// açık değilse açı yapay olarak yüksek (standing) tutulur → FSM "açık" faza giremez →
// tekrar sayılmaz. Bacaklar açıkken kol sinyali normal yönetir. Böylece genel repEngine
// ve diğer egzersizler HİÇ değişmeden tek metrikle birleşik kuralı uygular.
//
// Bacak açıklığı = ayak bileği yatay mesafesi / kalça genişliği oranı (ölçek-bağımsız,
// kamera mesafesinden bağımsız). Ayaklar bitişik ≈ 1.0; zıplamada açık ≈ 1.8+.
//
// Açılar 3D world landmark'tan (kamera açısı bağımsız), One Euro filtreli; world yoksa
// 2D fallback (sayım sürer). Düşük visibility → metrik null → faz açısı yok → motor bekler.
// Bacak landmark'ları (ayak bileği/kalça) güvenilmezse bacak koşulu UYGULANMAZ — yalnız
// kol sinyali (güvenli geriye-uyum; mevcut 2.5m önden poz ayakları her zaman görür).
//
// NOT (kalibrasyon adayı): eşikler MAKUL başlangıç değeridir; owner canlı testiyle
// (kol uzunluğu, bacak açıklığı, kamera mesafesi, tempo) ince ayar yapılacak.

import { LM, isPointReliable } from "../lib/pose";
import { angleAtPoint } from "../lib/angles";
import { angleAtPoint3D } from "../lib/angles3d";

const SIDE_JOINTS = {
  left: { hip: LM.LEFT_HIP, shoulder: LM.LEFT_SHOULDER, wrist: LM.LEFT_WRIST },
  right: { hip: LM.RIGHT_HIP, shoulder: LM.RIGHT_SHOULDER, wrist: LM.RIGHT_WRIST },
};

// Bacak "açık" eşiği: ayak bileği yatay mesafesi kalça genişliğinin bu katından
// büyükse bacaklar açık sayılır. Ayaklar bitişik ≈ 1.0; jumping jack açık ≈ 1.8–2.2.
// KALİBRASYON ADAYI — duruş/bacak genişliğine göre owner ince ayarı.
const LEG_OPEN_RATIO = 1.5;

// Faz eşikleri (tracking ile aynı kaynak) — bacak kapısının "standing"de kilitleyeceği
// taban açı buradan türetilir (this'e bağımlılık olmadan, destructure'a dayanıklı).
const STANDING_MIN = 150;

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

/**
 * Bacak açıklık oranı = ayak bileği yatay mesafesi / kalça genişliği.
 * Ölçek-bağımsız (kalça genişliğine bölünür) → kamera mesafesinden bağımsız.
 * Ayaklar bitişik ≈ 1.0; jumping jack açık ≈ 1.8+. 3D world x varsa onu, yoksa 2D x.
 * Bacak landmark'ları (iki ayak bileği + iki kalça) güvenilmezse → null
 * (bacak koşulu uygulanmaz, kol sinyaline düşülür).
 * @returns {number|null}
 */
function legSpreadRatio(lm, wlm) {
  const legPts = [LM.LEFT_ANKLE, LM.RIGHT_ANKLE, LM.LEFT_HIP, LM.RIGHT_HIP];
  if (!legPts.every((i) => isPointReliable(lm[i]))) return null;

  const src = wlm ?? lm;
  const ankleDist = Math.abs(src[LM.LEFT_ANKLE].x - src[LM.RIGHT_ANKLE].x);
  const hipWidth = Math.abs(src[LM.LEFT_HIP].x - src[LM.RIGHT_HIP].x);
  if (!(hipWidth > 0)) return null; // dejenere poz — oran tanımsız

  return ankleDist / hipWidth;
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
   * armClosedAngle = 180 - ortalama kol abduction (iki koldan güvenilir olanlar).
   *
   * closedAngle (FSM'i süren metrik) BİRLEŞİK koşulu kodlar:
   *   - bacaklar AÇIK  → closedAngle = armClosedAngle (kol sinyali yönetir)
   *   - bacaklar KAPALI → closedAngle "standing" bandında kilitlenir (standingMin+) →
   *     FSM "açık" faza giremez → tekrar SAYILMAZ (sadece kol açmak saymaz)
   * Bacak görünmüyorsa (legSpread null) koşul uygulanmaz → kol sinyali (geriye-uyum).
   *
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {closedAngle, armClosedAngle, abduction, abductionLeft,
   *   abductionRight, legSpread, legsOpen}
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

    // Yön çevirme: kapalı (abduction küçük) → armClosedAngle yüksek → FSM "standing".
    const armClosedAngle = 180 - abduction;

    // Bacak kapısı: bacak açıklığı ölçülebiliyor VE açık değilse açıyı standing'de tut.
    const legSpread = legSpreadRatio(lm, wlm);
    const legsOpen = legSpread != null ? legSpread >= LEG_OPEN_RATIO : null;

    // legsOpen === false → bacaklar kapalı (ölçüldü, açık değil) → açık faza KİLİTLE.
    // standingMin (150) + güvenlik payı → FSM "açık" (bottom) bandına asla inemez.
    const standingFloor = STANDING_MIN + 5;
    const closedAngle =
      legsOpen === false ? Math.max(armClosedAngle, standingFloor) : armClosedAngle;

    return {
      closedAngle,
      armClosedAngle,
      abduction,
      abductionLeft: left,
      abductionRight: right,
      legSpread,
      legsOpen,
    };
  },
};
