// Mountain Climber egzersiz tanımı — veri + saf metrik fonksiyonu (kneeRaise.js şablonu).
//
// Poz: PLANK (yüzükoyun, kollar/eller yerde) + alternat diz GÖĞSE çekme, hızlı tempo.
// Görünüm: YAN / çapraz (tüm gövde + diz yörüngesi tek karede).
//
// Rep FSM: faz, AKTİF (göğse çekilen = daha bükük) bacağın KALÇA fleksiyon açısından
// sürülür — kneeRaise'deki "aktif = daha bükük" deseninin birebir uygulaması. Bacak
// geride uzanmış (kalça açık, uyluk gövdeyle hizalı) ≈ 160–175° → "standing"; diz göğse
// çekilmiş (kalça fleksiyonu) ≈ 80–100° → "bottom". Bir tekrar = bir diz çekme
// (down→up→down). Sol/sağ ayrımı `activeSide` raporlanır ama P0'da TOPLAM sayım yeterli
// (alternat ayrım şart değil — kneeRaise dersi). Hızlı tempo → phaseConfirmFrames düşük (3).
//
// Form kuralı (plank hattını koru): mountain climber'da kalça yukarı zıplayıp PIKE (ters V)
// yapmak yaygın hata. Plank/gluteBridge geometrisinden türetildi: omuz-kalça-ayakBileği
// hattı + kalça hattın ÜSTÜNDE iken (yukarı) açı düşerse pike. Yön-ayrımı plank'ın
// bodyLinePike tekniğiyle (kalça altta → kural susar; ileri çekilen bacak kalçayı
// fizyolojik olarak alta indirir, yanlış pike tetiklemez). → "Kalçanı sabit tut, pike yapma".
//
// Açılar 3D world landmark'tan (kamera açısı bağımsız), One Euro filtreli; world yoksa 2D
// fallback. Düşük visibility → metrik null → motor bekler (sayım donar, yanlış saymaz).
//
// NOT (kalibrasyon adayı): eşikler MAKUL başlangıç; plank-diz çekme genliği + tempo +
// kamera açısına göre değişir → owner canlı testiyle ince ayar yapılacak.

import { LM, isPointReliable } from "../lib/pose";
import { angleAtPoint } from "../lib/angles";
import { angleAtPoint3D, midpoint3D } from "../lib/angles3d";
import { DEFAULT_TUNINGS } from "../lib/thresholds";

// Eşikler MERKEZİ config'ten (lib/thresholds.js) — tanım yeri orası.
const T = DEFAULT_TUNINGS.mountainClimber;

const SIDE_JOINTS = {
  left: { shoulder: LM.LEFT_SHOULDER, hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE },
  right: { shoulder: LM.RIGHT_SHOULDER, hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE },
};

/** Tarafın kalça-fleksiyon eklemleri (omuz, kalça, diz) güvenilir mi? */
function sideReliable(lm, side) {
  const j = SIDE_JOINTS[side];
  return (
    isPointReliable(lm[j.shoulder]) &&
    isPointReliable(lm[j.hip]) &&
    isPointReliable(lm[j.knee])
  );
}

/**
 * Taraf kalça fleksiyon açısı (omuz→kalça→diz). Bacak geride ≈ 160–175°;
 * diz göğse çekilince ≈ 80–100°. world 3D varsa 3D (kamera açısı bağımsız), yoksa 2D.
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

/** Gövde-hattı eklemleri (pike kuralı için) güvenilir mi? */
function bodyReliable(lm) {
  return (
    isPointReliable(lm[LM.LEFT_SHOULDER]) &&
    isPointReliable(lm[LM.RIGHT_SHOULDER]) &&
    isPointReliable(lm[LM.LEFT_HIP]) &&
    isPointReliable(lm[LM.RIGHT_HIP]) &&
    isPointReliable(lm[LM.LEFT_ANKLE]) &&
    isPointReliable(lm[LM.RIGHT_ANKLE])
  );
}

export const mountainClimber = {
  id: "mountainClimber",
  name: "Mountain Climber",
  cameraHint: "Kamera: yandan, tüm gövde karede (~2 m)",
  framing: "full", // plank + diz yörüngesi → tüm gövde yan profil

  // Rep FSM: faz AKTİF (daha bükük) bacağın kalça açısından sürülür (kneeRaise yönü).
  // Bacak geride ≈ 175° → "standing"; diz göğse çekilince ≈ 90° → "bottom".
  tracking: {
    primaryMetric: "hipAngle", // = aktif (min) kalça açısı
    phases: { ...T.phases },
    attemptBelow: T.attemptBelow,
  },
  phases: { ...T.phases },
  phaseConfirmFrames: T.phaseConfirmFrames, // 3 — hızlı tempo
  attemptBelow: T.attemptBelow,

  phaseLabels: {
    standing: "Bacak geride",
    descent: "Çekiyor",
    bottom: "Göğüste",
    ascent: "Uzatıyor",
    idle: "Hazır",
  },

  calibration: null,

  // Form kuralı: plank hattını koru — kalça yukarı zıplayıp pike (ters V) yapma.
  // Plank bodyLinePike tekniği: omuz-kalça-ayak açısı + kalça hattın ÜSTÜNDE (yukarı) iken set.
  faultRules: [
    {
      id: "hipPike",
      label: "Kalça yukarı (pike)",
      metric: "bodyLinePike", // anlık; kalça yukarı + açı <eşik = pike
      space: "world3d",
      joints: [
        LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP,
        LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
      ],
      phases: ["descent", "bottom", "ascent"],
      predicate: { op: "lt", threshold: T.faults.hipPike.threshold, tolerance: T.faults.hipPike.tolerance },
      minFrames: 6,
      cooldownMs: 4000,
      severity: "major",
      minVisibility: 0.5,
      cameraHint: "side",
      message: "Kalçanı sabit tut, pike yapma — plank hattını koru",
      speech: "Kalçanı sabit tut, pike yapma",
    },
  ],

  /**
   * Landmark'lardan mountain climber metriklerini üretir.
   * Aktif (göğse çekilen) bacak = daha bükük (min) kalça açısı; FSM bunu okur.
   * bodyLinePike = plank tekniği (kalça hattın ÜSTÜNDEyse açı, değilse 180 = kural susar).
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {hipAngle, hipAngleLeft, hipAngleRight, activeSide, bodyLinePike}
   */
  computeMetrics(lm, wlm) {
    if (!lm) return null;

    const left = sideHipAngle(lm, wlm, "left");
    const right = sideHipAngle(lm, wlm, "right");

    // Aktif (göğse çekilen) bacak = daha bükük (küçük açı) olan.
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

    // Plank-hattı (pike) — gövde eklemleri güvenilirse hesapla, yoksa kural susar (180).
    let bodyLinePike = 180;
    if (wlm && bodyReliable(lm)) {
      const shoulderMid = midpoint3D(wlm[LM.LEFT_SHOULDER], wlm[LM.RIGHT_SHOULDER]);
      const hipMid = midpoint3D(wlm[LM.LEFT_HIP], wlm[LM.RIGHT_HIP]);
      const ankleMid = midpoint3D(wlm[LM.LEFT_ANKLE], wlm[LM.RIGHT_ANKLE]);
      if (shoulderMid && hipMid && ankleMid) {
        const bodyLineAngle = angleAtPoint3D(shoulderMid, hipMid, ankleMid);
        if (bodyLineAngle != null) {
          // Kalça omuz→ayak hattının ÜSTÜNDE mi? (plank.js tekniği — world +y yukarı)
          const t =
            Math.abs(ankleMid.x - shoulderMid.x) > 1e-6
              ? (hipMid.x - shoulderMid.x) / (ankleMid.x - shoulderMid.x)
              : 0.5;
          const lineYatHip = shoulderMid.y + (ankleMid.y - shoulderMid.y) * t;
          const hipAboveLine = hipMid.y > lineYatHip; // pike (kalça yüksek)
          bodyLinePike = hipAboveLine ? bodyLineAngle : 180;
        }
      }
    }

    return {
      hipAngle,
      hipAngleLeft: left,
      hipAngleRight: right,
      activeSide,
      bodyLinePike,
    };
  },
};
