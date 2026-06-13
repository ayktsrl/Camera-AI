// Dumbbell Hammer Curl egzersiz tanımı — veri + saf metrik fonksiyonu (squat.js şablonu).
//
// Hoca notu (owner programı, AYNEN): "Dirsek sabit, üstte 1sn". Kurallara çeviri:
//   "dirsek sabit" → elbowDrift (frame): üst kol (omuz→dirsek) dünya-dikeyden BELİRGİN
//      saparsa (dirsek öne/yana savruluyor) uyarı. severity major (critical DEĞİL —
//      izolasyon hatası, tehlikeli değil).
//   "üstte 1sn sık" → tutuş/zaman katmanı; genel motorda hold-timer YOK → BATCH 3'TE
//      ATLANDI (changeset notu). İleride attemptClose'a "tepe-süre" alanı gelirse desteklenir.
//   derinlik → dirsek fleksiyon tepe eşiği (attemptClose): tam bükülmezse yarım tekrar.
//
// Rep FSM: faz DİREKT dirsek fleksiyon açısından sürülür (squat knee deseni, çevirme yok).
//   Kol açık (~160°) → "standing"; kol bükük (~50°) → "bottom".
// Bir tekrar = açık → bükük → açık (squat'la birebir tek-metrik döngü).
// İki koldan güvenilir olanlar ortalanır; hiçbiri güvenilir değilse null.
//
// Açılar 3D world landmark'tan (kamera bağımsız), One Euro filtreli; world yoksa 2D
// fallback. Düşük visibility → metrik null → motor bekler (sayım donar, yanlış saymaz).
//
// NOT (kalibrasyon adayı): eşikler MAKUL başlangıç; owner canlı testiyle (kol uzunluğu,
// kamera mesafesi) ince ayar yapılacak — özellikle bottomMax ve elbowDrift eşiği.

import { LM, isPointReliable } from "../lib/pose";
import { angleAtPoint, verticalTiltDeg } from "../lib/angles";
import { angleAtPoint3D, verticalTiltDeg3D } from "../lib/angles3d";
import { DEFAULT_TUNINGS } from "../lib/thresholds";

// Eşikler MERKEZİ config'ten (lib/thresholds.js) — tanım yeri orası.
const T = DEFAULT_TUNINGS.hammerCurl;

const SIDE_JOINTS = {
  left: { shoulder: LM.LEFT_SHOULDER, elbow: LM.LEFT_ELBOW, wrist: LM.LEFT_WRIST },
  right: { shoulder: LM.RIGHT_SHOULDER, elbow: LM.RIGHT_ELBOW, wrist: LM.RIGHT_WRIST },
};

/** Tarafın kol-fleksiyon eklemleri 2D visibility/presence ile güvenilir mi? */
function sideReliable(lm, side) {
  const j = SIDE_JOINTS[side];
  return (
    isPointReliable(lm[j.shoulder]) &&
    isPointReliable(lm[j.elbow]) &&
    isPointReliable(lm[j.wrist])
  );
}

/**
 * Taraf dirsek fleksiyon açısı (omuz→dirsek→bilek). Kol açık ≈ 160–175°;
 * tam bükük ≈ 40–55°. world 3D varsa 3D (kamera bağımsız), yoksa 2D fallback.
 */
function sideElbowAngle(lm, wlm, side) {
  if (!sideReliable(lm, side)) return null;
  const j = SIDE_JOINTS[side];
  if (wlm) {
    const a3 = angleAtPoint3D(wlm[j.shoulder], wlm[j.elbow], wlm[j.wrist]);
    if (a3 != null) return a3;
  }
  return angleAtPoint(lm[j.shoulder], lm[j.elbow], lm[j.wrist]);
}

/**
 * Taraf üst kol eğimi — (omuz→dirsek) vektörünün dünya-dikeyinden sapması, derece.
 * Dirsek sabit + gövdeye yakınsa üst kol ≈ dikey (0°'e yakın). Dirsek öne/yana
 * savrulursa açı büyür. world 3D varsa 3D (gerçek dikey), yoksa 2D fallback.
 * @returns {number|null}
 */
function sideUpperArmTilt(lm, wlm, side) {
  if (!sideReliable(lm, side)) return null;
  const j = SIDE_JOINTS[side];
  if (wlm) {
    const t3 = verticalTiltDeg3D(wlm[j.shoulder], wlm[j.elbow]);
    if (t3 != null) return t3;
  }
  return verticalTiltDeg(lm[j.shoulder], lm[j.elbow]);
}

export const hammerCurl = {
  id: "hammerCurl",
  name: "Dumbbell Hammer Curl",
  cameraHint: "Kamera: yandan, ~2 m (dirsek sabitliği yan profilden ölçülür)",
  framing: "upper", // omuz/dirsek/bilek + üst kol dikeyi; bacak gereksiz → yakın durabilir

  // Rep FSM: faz DİREKT dirsek açısından sürülür (squat deseni).
  // Açık ≈ 160° → "standing"; bükük ≈ 50° → "bottom".
  tracking: {
    primaryMetric: "elbowAngle",
    phases: { ...T.phases },
    attemptBelow: T.attemptBelow, // belirgin bükme ama tam değil → "derinlik"
  },
  phases: { ...T.phases },
  phaseConfirmFrames: T.phaseConfirmFrames,
  attemptBelow: T.attemptBelow,

  phaseLabels: {
    standing: "Kol açık",
    descent: "Bükülüyor",
    bottom: "Bükük",
    ascent: "Açılıyor",
    idle: "Hazır",
  },

  calibration: null,

  faultRules: [
    {
      id: "elbowDrift",
      label: "Dirsek kayması",
      metric: "upperArmTiltDeg", // omuz→dirsek dikeyden sapma
      space: "world3d",
      joints: [
        LM.LEFT_SHOULDER, LM.LEFT_ELBOW,
        LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW,
      ],
      phases: ["descent", "bottom", "ascent"],
      // >eşik = üst kol dikeyden belirgin sapma (dirsek öne/yana savruluyor).
      predicate: { op: "gt", threshold: T.faults.elbowDrift.threshold, tolerance: T.faults.elbowDrift.tolerance },
      minFrames: 6,
      cooldownMs: 4000,
      severity: "major", // izolasyon hatası, tehlikeli değil → critical değil
      minVisibility: 0.5,
      cameraHint: "side",
      message: "Dirseğini sabit tut, gövdeye yakın",
      speech: "Dirseğini sabit tut",
    },
    {
      id: "depth",
      label: "Derinlik",
      metric: "minKneeAngle", // repEngine attemptClose minAngle (elbowAngle min)
      space: "world3d",
      joints: [
        LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST,
        LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST,
      ],
      phases: ["attemptClose"],
      predicate: { op: "gt", threshold: T.faults.depth.threshold, tolerance: T.faults.depth.tolerance }, // tepe ≤eşik tam bükme
      severity: "major",
      minVisibility: 0.5,
      cameraHint: "side",
      message: "Tam bük, önkolu yukarı getir",
      speech: "Tam bük",
    },
  ],

  /**
   * Landmark'lardan hammer curl metriklerini üretir.
   * elbowAngle = iki koldan güvenilir olanların ortalama dirsek fleksiyonu (DAHA bükük
   * değil — kullanıcı tek/çift kol fark etmez, ortalama tek-metrik FSM yeterli P0).
   * upperArmTiltDeg = üst kolların en kötü (en büyük) sapması (drift uyarısı).
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {elbowAngle, elbowAngleLeft, elbowAngleRight, upperArmTiltDeg}
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

    // Üst kol eğimi — ölçülebilen tarafların EN KÖTÜSÜ (en büyük sapma) raporlanır.
    const tiltLeft = sideUpperArmTilt(lm, wlm, "left");
    const tiltRight = sideUpperArmTilt(lm, wlm, "right");
    const upperArmTiltDeg =
      tiltLeft != null && tiltRight != null
        ? Math.max(tiltLeft, tiltRight)
        : (tiltLeft ?? tiltRight);

    return {
      elbowAngle,
      elbowAngleLeft: left,
      elbowAngleRight: right,
      upperArmTiltDeg,
    };
  },
};
