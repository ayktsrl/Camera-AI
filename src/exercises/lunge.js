// Lunge egzersiz tanımı — veri + saf metrik fonksiyonu (squat.js / pushup.js şablonu).
//
// Hoca notu (owner programı, AYNEN): "Lunge'da diz asla öne fırlamasın, gövde hafif öne eğilsin."
// Kurallara çeviri:
//   "diz asla öne fırlamasın" → kneeOverToe (ANA uyarı): ÖN diz, ön ayak ucunu
//      belirgin geçmesin. Yan görüşte ölçülür — ön ayağın diz→ayakucu yönelimine
//      göre dizin ileri taşması (screen2d, world-z gürültüsünden bağımsız tutuldu).
//   "gövde hafif öne eğilsin" → torso: HAFİF öne eğilme NORMAL; sadece AŞIRI öne
//      eğilme VEYA geriye yaslanma uyarılır (makul tolerans → yanlış pozitif yok).
//   derinlik → ön diz açısı dip eşiği (rep FSM attemptClose), squat depth mantığı.
//
// Rep FSM: faz kararı AKTİF (öndeki, daha bükük) bacağın diz açısından sürülür —
// böylece sol/sağ ayrımı yapmadan bir iniş-kalkış = bir tekrar (P0'da bacak ayrımı şart değil).
// Açılar 3D world landmark'tan (kamera bağımsız), One Euro filtreli; kneeOverToe screen2d.
// Kamera önerisi: YAN — kneeOverToe yan profilden anlamlı.
//
// NOT (kalibrasyon adayı): aşağıdaki eşikler MAKUL başlangıç değerleridir; gerçek
// kullanıcı testiyle (owner canlı) ince ayar yapılacak — özellikle kneeOverToe eşiği
// ve torso üst sınırı. squat/push-up'taki gibi video kalibrasyonu beklenir.

import { LM, isPointReliable, getBBoxFromLandmarks } from "../lib/pose";
import { angleAtPoint, verticalTiltDeg, midpoint } from "../lib/angles";
import {
  angleAtPoint3D,
  verticalTiltDeg3D,
  midpoint3D,
} from "../lib/angles3d";
import { DEFAULT_TUNINGS } from "../lib/thresholds";

// Eşikler MERKEZİ config'ten (lib/thresholds.js) — tanım yeri orası.
const T = DEFAULT_TUNINGS.lunge;

const SIDE_JOINTS = {
  left: {
    hip: LM.LEFT_HIP,
    knee: LM.LEFT_KNEE,
    ankle: LM.LEFT_ANKLE,
    foot: LM.LEFT_FOOT_INDEX,
  },
  right: {
    hip: LM.RIGHT_HIP,
    knee: LM.RIGHT_KNEE,
    ankle: LM.RIGHT_ANKLE,
    foot: LM.RIGHT_FOOT_INDEX,
  },
};

/** Tarafın bacak eklemleri 2D visibility/presence ile güvenilir mi? */
function sideReliable(lm, side) {
  const j = SIDE_JOINTS[side];
  return (
    isPointReliable(lm[j.hip]) &&
    isPointReliable(lm[j.knee]) &&
    isPointReliable(lm[j.ankle])
  );
}

/** Taraf diz açısı — world 3D varsa 3D (kamera bağımsız), yoksa 2D fallback. */
function sideKneeAngle(lm, wlm, side) {
  if (!sideReliable(lm, side)) return null;
  const j = SIDE_JOINTS[side];
  if (wlm) {
    const a3 = angleAtPoint3D(wlm[j.hip], wlm[j.knee], wlm[j.ankle]);
    if (a3 != null) return a3;
  }
  return angleAtPoint(lm[j.hip], lm[j.knee], lm[j.ankle]);
}

/**
 * Bir tarafın "diz ayak ucunu geçme" miktarı — screen2d, bbox-yükseklik %'si normalize.
 * Ön ayağın yönelimi (ayakBileği→ayakUcu) ileri yön kabul edilir; dizin bu yöndeki
 * taşması pozitif. Kamera/yüz yönünden bağımsız: ayağın kendi vektörünü referans alır.
 * Topuk/ayakucu kısmen kapanabildiğinden gevşek visibility (0.5) ile okunur.
 * @returns {number|null} bbox yüksekliğinin yüzdesi olarak ileri taşma (+ = öne geçti)
 */
function sideKneeOverToe(lm, side, bboxHeight) {
  if (!bboxHeight || bboxHeight <= 0) return null;
  const j = SIDE_JOINTS[side];
  const knee = lm[j.knee];
  const ankle = lm[j.ankle];
  const foot = lm[j.foot];
  if (
    !isPointReliable(knee, 0.5, 0.5) ||
    !isPointReliable(ankle, 0.5, 0.5) ||
    !isPointReliable(foot, 0.5, 0.5)
  ) {
    return null;
  }
  // İleri yön = ayakBileği→ayakUcu (yatay düzlemde, screen-x/y).
  const fx = foot.x - ankle.x;
  const fy = foot.y - ankle.y;
  const flen = Math.hypot(fx, fy);
  if (flen < 1e-4) return null; // ayak yönü belirsiz
  const ux = fx / flen;
  const uy = fy / flen;
  // Dizin ayakUcuna göre ileri yöndeki izdüşümü.
  const dx = knee.x - foot.x;
  const dy = knee.y - foot.y;
  const forward = dx * ux + dy * uy; // + = diz, ayakUcunun ÖNÜNDE
  return (forward / bboxHeight) * 100;
}

export const lunge = {
  id: "lunge",
  name: "Lunge",
  cameraHint: "Kamera: yandan, ~2 m (diz-ayak ucu yan profilden ölçülür)",
  framing: "full", // diz-ayak ucu + derinlik → tüm vücut

  // Rep FSM: faz AKTİF (daha bükük) bacağın diz açısından sürülür.
  // Ayakta (her iki bacak düz) ≈ 160°+ → "standing"; dipte ön diz ≤ 95° → "bottom".
  tracking: {
    primaryMetric: "kneeAngle", // = aktif (min) diz açısı
    phases: { ...T.phases },
    attemptBelow: T.attemptBelow, // belirgin iniş var ama dibe ulaşılmadı → derinlik hatası
  },
  phases: { ...T.phases },
  phaseConfirmFrames: T.phaseConfirmFrames,
  attemptBelow: T.attemptBelow,

  phaseLabels: {
    standing: "Ayakta",
    descent: "İniş",
    bottom: "Dipte",
    ascent: "Çıkış",
    idle: "Hazır",
  },

  // bbox yüksekliği kneeOverToe normalizasyonu için her frame computeMetrics'te
  // alınır (squat'taki zemin kalibrasyonu lunge'a gerekmez — oransal ölçüm).
  calibration: null,

  faultRules: [
    {
      id: "depth",
      label: "Derinlik",
      metric: "minKneeAngle", // attempt bazlı — repEngine deneme kapanışında uygular
      space: "world3d",
      joints: [
        LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE,
        LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE,
      ],
      phases: ["attemptClose"],
      predicate: { op: "gt", threshold: T.faults.depth.threshold, tolerance: T.faults.depth.tolerance }, // dip ≤eşik tam tekrar
      severity: "major",
      minVisibility: 0.6,
      cameraHint: "side",
      message: "Biraz daha derine in, ön dizini 90°'ye indir",
      speech: "Biraz daha derine in",
    },
    {
      id: "kneeOverToe",
      label: "Diz ayak ucunu geçiyor",
      metric: "kneeOverToePct", // ön diz, ön ayak ucunu ileri geçme (bbox %'si)
      space: "screen2d", // yan görüş; world-z gürültüsünden bağımsız tutuldu
      joints: [LM.LEFT_KNEE, LM.LEFT_FOOT_INDEX, LM.RIGHT_KNEE, LM.RIGHT_FOOT_INDEX],
      phases: ["descent", "bottom", "ascent"],
      // > bbox'ın %eşiği ileri taşma belirgin (~7–8 cm). Histerezis tolerance.
      predicate: { op: "gt", threshold: T.faults.kneeOverToe.threshold, tolerance: T.faults.kneeOverToe.tolerance },
      minFrames: 5,
      cooldownMs: 4000,
      severity: "critical",
      minVisibility: 0.5, // yan görüşte uzak ayak/diz kısmen kapanabilir
      cameraHint: "side",
      message: "Dizin ayak ucunu geçmesin — ağırlığı topuğa al",
      speech: "Dizin ayak ucunu geçmesin",
    },
    {
      id: "torso",
      label: "Gövde eğimi",
      metric: "torsoTilt3d", // dünya-dikeyden sapma; HAFİF öne eğilme normaldir
      space: "world3d",
      joints: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP],
      phases: ["descent", "bottom", "ascent"],
      // Hoca "hafif öne eğilsin" → 0–35° bandı NORMAL (flag edilmez).
      // Sadece AŞIRI öne eğilme (>40°) uyarılır; geniş tolerans → yanlış pozitif yok.
      // (Geriye yaslanma da ölçülmek istense ayrı işaretli metrik gerekir; P0'da
      //  tek yönlü aşırı-öne uyarısı — owner notunun ruhu: hafif öne İYİ.)
      predicate: { op: "gt", threshold: T.faults.torso.threshold, tolerance: T.faults.torso.tolerance },
      minFrames: 6,
      cooldownMs: 4500,
      severity: "major",
      minVisibility: 0.6,
      cameraHint: "side",
      message: "Fazla öne eğilme, göğsünü kaldır (hafif öne eğik normaldir)",
      speech: "Fazla öne eğilme, göğsünü kaldır",
    },
  ],

  /**
   * Landmark'lardan lunge metriklerini üretir — kural motorunun tek veri kaynağı.
   * Diz açıları world 3D'den (varsa); kneeOverToe screen-2D'den.
   * Aktif (öndeki) bacak = daha bükük diz; kneeOverToe o bacaktan okunur.
   *
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı + screen ölçüm)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {kneeAngle, kneeAngleLeft, kneeAngleRight,
   *   kneeOverToePct, torsoTilt3d, activeSide}
   */
  computeMetrics(lm, wlm) {
    if (!lm) return null;

    const left = sideKneeAngle(lm, wlm, "left");
    const right = sideKneeAngle(lm, wlm, "right");

    // Aktif (öndeki) bacak = daha bükük (küçük açı) olan; FSM bunu primaryMetric alır.
    let kneeAngle = null;
    let activeSide = null;
    if (left != null && right != null) {
      if (left <= right) {
        kneeAngle = left;
        activeSide = "left";
      } else {
        kneeAngle = right;
        activeSide = "right";
      }
    } else if (left != null) {
      kneeAngle = left;
      activeSide = "left";
    } else if (right != null) {
      kneeAngle = right;
      activeSide = "right";
    }

    if (kneeAngle == null) return null;

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

    // kneeOverToe — aktif bacaktan (öndeki = daha bükük), screen2d, bbox-% normalize.
    let kneeOverToePct = null;
    const bbox = getBBoxFromLandmarks(lm);
    const bboxHeight = bbox?.height ?? 0;
    if (activeSide) {
      kneeOverToePct = sideKneeOverToe(lm, activeSide, bboxHeight);
    }

    return {
      kneeAngle,
      kneeAngleLeft: left,
      kneeAngleRight: right,
      kneeOverToePct,
      torsoTilt3d,
      activeSide,
    };
  },
};
