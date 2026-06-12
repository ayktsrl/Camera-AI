// Squat egzersiz tanımı — kod değil veri + saf metrik fonksiyonu.
// Yeni egzersiz eklemek için bu şablonu kopyalayıp exercises/index.js'e kaydedin.

import { LM } from "../lib/pose";
import { angleAtPoint, verticalTiltDeg, midpoint } from "../lib/angles";
import { isPointReliable } from "../lib/pose";

function sideKneeAngle(lm, side) {
  const hip = lm[side === "left" ? LM.LEFT_HIP : LM.RIGHT_HIP];
  const knee = lm[side === "left" ? LM.LEFT_KNEE : LM.RIGHT_KNEE];
  const ankle = lm[side === "left" ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE];

  if (
    !isPointReliable(hip) ||
    !isPointReliable(knee) ||
    !isPointReliable(ankle)
  ) {
    return null;
  }

  return angleAtPoint(hip, knee, ankle);
}

export const squat = {
  id: "squat",
  name: "Squat",

  // Faz eşikleri (diz açısı, derece)
  phases: {
    standingMin: 160, // ayakta: diz açısı > 160°
    bottomMax: 100, // dipte: diz açısı < 100°
  },

  // Faz geçişi debounce — titreşimden çift sayma olmaması için
  // bir faz adayının onaylanması gereken ardışık frame sayısı.
  phaseConfirmFrames: 4,

  // Bir inişin "tekrar denemesi" sayılması için inilmesi gereken üst sınır.
  // Bunun altına inilip dibe (bottomMax) ulaşılamazsa derinlik hatasıdır.
  attemptBelow: 140,

  // Faz etiketleri (UI)
  phaseLabels: {
    standing: "Ayakta",
    descent: "İniş",
    bottom: "Dipte",
    ascent: "Çıkış",
    idle: "Hazır",
  },

  // Form kuralları
  rules: {
    depth: {
      message: "Biraz daha derine in",
      speech: "Biraz daha derine in",
    },
    torso: {
      maxTiltDeg: 45, // omuz-kalça hattının dikeyle açısı bu eşiği aşarsa
      minFrames: 6, // anlık titreşimi elemek için ardışık frame şartı
      message: "Sırtını dik tut",
      speech: "Sırtını dik tut",
    },
  },

  /**
   * Landmark'lardan squat metriklerini üretir.
   * İki bacaktan güvenilir olanları ortalar; hiçbiri güvenilir değilse null.
   * @returns {{kneeAngle:number, torsoTilt:number|null}|null}
   */
  computeMetrics(lm) {
    if (!lm) return null;

    const left = sideKneeAngle(lm, "left");
    const right = sideKneeAngle(lm, "right");

    let kneeAngle = null;
    if (left != null && right != null) kneeAngle = (left + right) / 2;
    else if (left != null) kneeAngle = left;
    else if (right != null) kneeAngle = right;

    if (kneeAngle == null) return null;

    const hipMid = midpoint(lm[LM.LEFT_HIP], lm[LM.RIGHT_HIP]);
    const shoulderMid = midpoint(lm[LM.LEFT_SHOULDER], lm[LM.RIGHT_SHOULDER]);
    const torsoTilt = verticalTiltDeg(hipMid, shoulderMid);

    return { kneeAngle, torsoTilt };
  },
};
