// Squat egzersiz tanımı — kod değil veri + saf metrik fonksiyonu.
// Yeni egzersiz eklemek için bu şablonu kopyalayıp exercises/index.js'e kaydedin.
//
// v0.2 Precision Engine: açılar 3D world landmark'lardan (kamera açısı bağımsız);
// topuk kalkması screen-2D'de kalır (world-z gürültüsü ~3 cm ölçeği yer).
// Form kuralları bildirimsel faultRules[] şemasıyla tanımlanır — motor kural-bilinçsizdir.

import { LM, isPointReliable, getBBoxFromLandmarks } from "../lib/pose";
import { angleAtPoint, verticalTiltDeg, midpoint } from "../lib/angles";
import {
  angleAtPoint3D,
  verticalTiltDeg3D,
  midpoint3D,
  fppaDeg,
} from "../lib/angles3d";
import { DEFAULT_TUNINGS } from "../lib/thresholds";

// Eşikler MERKEZİ config'ten (lib/thresholds.js) okunur — tanım yeri orası.
// Bu blok yalnız varsayılanı yansıtır; çalışma-anı override'ı motor uygular.
const T = DEFAULT_TUNINGS.squat;

const SIDE_JOINTS = {
  left: { hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE, ankle: LM.LEFT_ANKLE },
  right: { hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE, ankle: LM.RIGHT_ANKLE },
};

/** Tarafın eklemleri 2D visibility/presence ile güvenilir mi? */
function sideReliable(lm, side) {
  const j = SIDE_JOINTS[side];
  return (
    isPointReliable(lm[j.hip]) &&
    isPointReliable(lm[j.knee]) &&
    isPointReliable(lm[j.ankle])
  );
}

/**
 * Taraf diz açısı — world 3D varsa 3D (kamera açısı bağımsız), yoksa 2D fallback.
 * Güvenilirlik kapısı her iki durumda 2D visibility'den okunur.
 */
function sideKneeAngle(lm, wlm, side) {
  if (!sideReliable(lm, side)) return null;

  const j = SIDE_JOINTS[side];
  if (wlm) {
    const angle3d = angleAtPoint3D(wlm[j.hip], wlm[j.knee], wlm[j.ankle]);
    if (angle3d != null) return angle3d;
  }
  return angleAtPoint(lm[j.hip], lm[j.knee], lm[j.ankle]);
}

/** Taraf FPPA (valgus) — 3D world, gövde-frontal düzleme projeksiyon. */
function sideFppa(lm, wlm, side) {
  if (!wlm || !sideReliable(lm, side)) return null;
  const j = SIDE_JOINTS[side];
  return fppaDeg(
    wlm[j.hip],
    wlm[j.knee],
    wlm[j.ankle],
    wlm[LM.LEFT_HIP],
    wlm[LM.RIGHT_HIP]
  );
}

/** Güvenilir topukların screen-y değerleri. */
function reliableHeelYs(lm) {
  const ys = [];
  for (const idx of [LM.LEFT_HEEL, LM.RIGHT_HEEL]) {
    const p = lm[idx];
    if (isPointReliable(p, 0.5, 0.5)) ys.push(p.y);
  }
  return ys;
}

export const squat = {
  id: "squat",
  name: "Squat",
  cameraHint: "Kamera: 45° çapraz, ~2 m",

  // Rep FSM yapılandırması (genel motor bunu okur): faz kararı diz açısından sürülür.
  tracking: {
    primaryMetric: "kneeAngle",
    phases: { ...T.phases }, // ayakta diz > standingMin; dipte diz < bottomMax
    attemptBelow: T.attemptBelow,
  },

  // Faz eşikleri (diz açısı, derece) — geriye uyum için tutulur (tracking ile aynı).
  phases: { ...T.phases },

  // Faz geçişi debounce — titreşimden çift sayma olmaması için
  // bir faz adayının onaylanması gereken ardışık frame sayısı.
  phaseConfirmFrames: T.phaseConfirmFrames,

  // Bir inişin "tekrar denemesi" sayılması için inilmesi gereken üst sınır.
  // Bunun altına inilip dibe (bottomMax) ulaşılamazsa derinlik hatasıdır.
  attemptBelow: T.attemptBelow,

  // Faz etiketleri (UI)
  phaseLabels: {
    standing: "Ayakta",
    descent: "İniş",
    bottom: "Dipte",
    ascent: "Çıkış",
    idle: "Hazır",
  },

  // Basit zemin kalibrasyonu — set başındaki ilk stabil ayakta karelerden
  // topuk zemin çizgisi + vücut bbox yüksekliği alınır (heel kuralı normalizasyonu).
  calibration: {
    minStableFrames: 15,
    isStable(metrics) {
      return (
        metrics.kneeAngle >= T.calibration.stableKneeMin &&
        (metrics.torsoTilt3d == null ||
          metrics.torsoTilt3d < T.calibration.stableTorsoMax)
      );
    },
    capture(lm) {
      const heelYs = reliableHeelYs(lm);
      if (!heelYs.length) return null;
      const bbox = getBBoxFromLandmarks(lm);
      if (!bbox || bbox.height <= 0) return null;
      // Zemin = en alttaki topuk (screen-y aşağı doğru artar → max).
      return { floorY: Math.max(...heelYs), bboxHeight: bbox.height };
    },
    finalize(samples) {
      const mean = (key) =>
        samples.reduce((sum, s) => sum + s[key], 0) / samples.length;
      return { floorY: mean("floorY"), bboxHeight: mean("bboxHeight") };
    },
  },

  // Form kuralları — bildirimsel şema (lib/faultRules.js işler).
  // Histerezis: ihlal eşik∓tolerans dışında başlar, karşı bantta temizlenir.
  faultRules: [
    {
      id: "depth",
      label: "Derinlik",
      metric: "minKneeAngle", // attempt bazlı — repEngine attempt kapanışında uygular
      space: "world3d",
      joints: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
      phases: ["attemptClose"], // özel: frame döngüsü dışı, deneme kapanışında
      predicate: { op: "gt", threshold: T.faults.depth.threshold, tolerance: T.faults.depth.tolerance }, // dip ≤eşik sayılır; eşik–attemptBelow = yarım tekrar
      severity: "major",
      minVisibility: 0.6,
      cameraHint: "side",
      message: "Biraz daha derine in",
      speech: "Biraz daha derine in",
    },
    {
      id: "valgus",
      label: "Diz içe çökmesi",
      metric: "kneeValgusFPPA",
      space: "world3d",
      joints: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
      phases: ["descent", "bottom", "ascent"],
      predicate: { op: "lt", threshold: T.faults.valgus.threshold, tolerance: T.faults.valgus.tolerance }, // <165° ≈ >15° medial çökme
      minFrames: 5,
      cooldownMs: 4000,
      severity: "critical",
      minVisibility: 0.6,
      cameraHint: "front45",
      message: "Dizlerini dışarı it",
      speech: "Dizlerini dışarı it",
    },
    {
      id: "torso",
      label: "Gövde eğimi",
      metric: "torsoTilt3d",
      space: "world3d",
      joints: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP],
      phases: ["descent", "bottom", "ascent"],
      // 45° low-bar'da normaldir; 3D ölçüm güvenilir olduğu için eşik 55°'e gevşetildi.
      predicate: { op: "gt", threshold: T.faults.torso.threshold, tolerance: T.faults.torso.tolerance },
      minFrames: 6,
      cooldownMs: 4000,
      severity: "major",
      minVisibility: 0.6,
      cameraHint: "side",
      message: "Sırtını dik tut, göğsünü kaldır",
      speech: "Sırtını dik tut, göğsünü kaldır",
    },
    {
      id: "heel",
      label: "Topuk kalkması",
      metric: "heelLiftPct", // kalibre zeminden yükselme, bbox yüksekliği %'si
      space: "screen2d", // world-z gürültüsü ~3 cm ölçeği yer — screen-y güvenilir
      joints: [LM.LEFT_HEEL, LM.RIGHT_HEEL],
      phases: ["descent", "bottom", "ascent"],
      predicate: { op: "gt", threshold: T.faults.heel.threshold, tolerance: T.faults.heel.tolerance }, // > bbox'ın %eşiği (~3–4 cm)
      minFrames: 5,
      cooldownMs: 4000,
      severity: "major",
      minVisibility: 0.5, // yan görüşte uzak topuk kısmen kapanabilir
      cameraHint: "side",
      message: "Topuklarını yerde tut",
      speech: "Topuklarını yerde tut",
    },
    {
      id: "asymmetry",
      label: "Asimetri",
      metric: "kneeAsymmetry",
      space: "world3d",
      joints: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
      phases: ["descent", "ascent"],
      predicate: { op: "gt", threshold: T.faults.asymmetry.threshold, tolerance: T.faults.asymmetry.tolerance },
      minFrames: 8,
      cooldownMs: 4000,
      severity: "minor",
      minVisibility: 0.6,
      cameraHint: "front45",
      message: "Ağırlığı eşit dağıt",
      speech: "Ağırlığı eşit dağıt",
    },
  ],

  /**
   * Landmark'lardan squat metriklerini üretir — kural motorunun tek veri kaynağı.
   * Açılar world 3D'den (varsa), topuk screen-2D'den hesaplanır.
   * İki bacaktan güvenilir olanları ortalar; hiçbiri güvenilir değilse null.
   *
   * @param {Array} lm filtrelenmiş 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm filtrelenmiş 3D world landmark'lar (metre)
   * @param {{floorY:number, bboxHeight:number}|null} calib zemin kalibrasyonu
   * @returns {object|null} {kneeAngle, kneeAngleLeft, kneeAngleRight,
   *   kneeAsymmetry, torsoTilt3d, kneeValgusFPPA, heelLiftPct}
   */
  computeMetrics(lm, wlm, calib) {
    if (!lm) return null;

    const left = sideKneeAngle(lm, wlm, "left");
    const right = sideKneeAngle(lm, wlm, "right");

    let kneeAngle = null;
    if (left != null && right != null) kneeAngle = (left + right) / 2;
    else if (left != null) kneeAngle = left;
    else if (right != null) kneeAngle = right;

    if (kneeAngle == null) return null;

    // Asimetri — iki taraf da ölçülebiliyorsa (tam yan görüşte null → kural susar).
    const kneeAsymmetry =
      left != null && right != null ? Math.abs(left - right) : null;

    // Gövde eğimi — world 3D dünya-dikeyi; world yoksa 2D fallback.
    let torsoTilt3d = null;
    if (wlm) {
      torsoTilt3d = verticalTiltDeg3D(
        midpoint3D(wlm[LM.LEFT_HIP], wlm[LM.RIGHT_HIP]),
        midpoint3D(wlm[LM.LEFT_SHOULDER], wlm[LM.RIGHT_SHOULDER])
      );
    }
    if (torsoTilt3d == null) {
      torsoTilt3d = verticalTiltDeg(
        midpoint(lm[LM.LEFT_HIP], lm[LM.RIGHT_HIP]),
        midpoint(lm[LM.LEFT_SHOULDER], lm[LM.RIGHT_SHOULDER])
      );
    }

    // Valgus FPPA — taraf başına, en kötü (en düşük) taraf raporlanır.
    const fppaLeft = sideFppa(lm, wlm, "left");
    const fppaRight = sideFppa(lm, wlm, "right");
    const kneeValgusFPPA =
      fppaLeft != null && fppaRight != null
        ? Math.min(fppaLeft, fppaRight)
        : (fppaLeft ?? fppaRight);

    // Topuk kalkması — kalibre zeminden screen-y yükselme, bbox-% normalize.
    let heelLiftPct = null;
    if (calib && calib.bboxHeight > 0) {
      const heelYs = reliableHeelYs(lm);
      if (heelYs.length) {
        const maxLift = Math.max(...heelYs.map((y) => calib.floorY - y));
        heelLiftPct = (Math.max(0, maxLift) / calib.bboxHeight) * 100;
      }
    }

    return {
      kneeAngle,
      kneeAngleLeft: left,
      kneeAngleRight: right,
      kneeAsymmetry,
      torsoTilt3d,
      kneeValgusFPPA,
      heelLiftPct,
    };
  },
};
