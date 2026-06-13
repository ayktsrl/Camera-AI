// Hollow Hold egzersiz tanımı — İZOMETRİK tip (tekrar DEĞİL, süre tutma).
//
// Poz: SIRTÜSTÜ "kaşık (hollow)" pozisyonu, YAN görünüm:
//   • bacaklar yerden YUKARI (kalçadan fleksiyon),
//   • omuz/üst sırt yerden YUKARI,
//   • bel yere bastırılmış.
// Gövde bir "kaşık/muz" şekli alır (uçlar yukarı, bel aşağı). Hold timer YALNIZ geçerli
// hollow pozisyonunda akar; bozulunca (bacaklar/omuzlar düşünce) DURUR.
//
// Motor: plank ile AYNI holdEngine (exercise.isometric === true → holdEngine yolu). Yeni
// izometrik motor YOK — holdEngine'i KULLANIRIZ; yalnız hollow'a özgü GEÇERLİLİK
// fonksiyonunu computeMetrics ile sağlarız. holdEngine sözleşmesi:
//   metrics.isHorizontal   → "geçerli giriş kapısı" (hollow pozuna girildi mi)
//   metrics.bodyLineAngle  → histerezis değeri (straightEnter/straightExit bandı)
//   hold.{straightEnter, straightExit, enterFrames, breakEndMs} → eşikler
//
// YÖN ÇEVİRME (gluteBridge tekniği — holdEngine'e DOKUNMADAN uyum):
//   holdEngine "geçerli = YÜKSEK açı" (angle >= straightEnter) bekler. Ama hollow'da
//   geçerli poz, omuz→kalça→ayakBileği açısının DÜŞMESİdir (gövde kaşık gibi katlanır:
//   uçlar yukarı → kalça açısı küçülür ~120–150°; gevşek düz yatış ~175–180°).
//   Bu yüzden holdEngine'in okuduğu değer = bodyLineAngle = (180 - hamHipAngle):
//     derin kaşık (ham açı küçük) → bodyLineAngle YÜKSEK → straightEnter aşılır → holding
//     gevşeme (ham açı büyük)     → bodyLineAngle DÜŞÜK  → straightExit altı → broken (durur)
//
// Geçerli giriş kapısı (isHorizontal): kaşık BELİRGİN olmalı (sadece hafif kıvrım değil).
// hamHipAngle, horizontalMinTilt'in çevirilmiş eşiğinin altındaysa (= belirgin scoop) true.
//
// Açılar 3D world landmark'tan (kamera açısı bağımsız), One Euro filtreli; world yoksa
// 2D fallback (sayım sürer). Düşük visibility → metrik null → motor bekler (yanlış saymaz).
//
// NOT (kalibrasyon adayı): eşikler MAKUL başlangıç; supine kaşık derinliği + esneklik +
// kamera açısına göre değişir → owner canlı testiyle ince ayar yapılacak.

import { LM, isPointReliable } from "../lib/pose";
import { angleAtPoint } from "../lib/angles";
import { angleAtPoint3D } from "../lib/angles3d";
import { DEFAULT_TUNINGS } from "../lib/thresholds";

// Eşikler MERKEZİ config'ten (lib/thresholds.js) — tanım yeri orası.
const T = DEFAULT_TUNINGS.hollowHold;

const SIDE_JOINTS = {
  left: { shoulder: LM.LEFT_SHOULDER, hip: LM.LEFT_HIP, ankle: LM.LEFT_ANKLE },
  right: { shoulder: LM.RIGHT_SHOULDER, hip: LM.RIGHT_HIP, ankle: LM.RIGHT_ANKLE },
};

/** Tarafın kalça-açısı eklemleri (omuz, kalça, ayakBileği) güvenilir mi? */
function sideReliable(lm, side) {
  const j = SIDE_JOINTS[side];
  return (
    isPointReliable(lm[j.shoulder]) &&
    isPointReliable(lm[j.hip]) &&
    isPointReliable(lm[j.ankle])
  );
}

/**
 * Taraf kalça açısı (omuz→kalça→ayakBileği). Düz yatış ≈ 175–180°; derin kaşık ≈ 120–150°.
 * world 3D varsa 3D (kamera açısı bağımsız), yoksa 2D fallback.
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

export const hollowHold = {
  id: "hollowHold",
  name: "Hollow Hold",
  isometric: true, // ← holdEngine yolu (rep FSM DEĞİL) — plank deseni
  cameraHint: "Kamera: yandan, ~2 m (sırtüstü tüm vücut yan profil)",
  framing: "full", // kaşık gövde hattı → tüm vücut yan profil

  // İzometrik tutuş eşikleri — holdEngine bunları okur (plank ile aynı şema).
  // bodyLineAngle = 180 - hamHipAngle uzayında: straightEnter aşılınca holding,
  // straightExit altına düşünce broken. horizontalMinTilt = giriş kapısı eşiği
  // (çevrilmiş ham açı; computeMetrics'te bodyLineAngle ile kıyaslanır).
  hold: { ...T.hold },

  faultLabels: {
    holding: "Tutuyor",
    broken: "Pozisyon bozuk",
    idle: "Hazır",
  },

  calibration: null,

  // Form kuralı: bel/omuz düşmesi — holding fazında kaşık zayıflarsa (bodyLineAngle
  // straightExit'e yakın ama hâlâ geçerli) uyar. Sahte sayım yok; yalnız yönlendirme.
  faultRules: [
    {
      id: "backDrop",
      label: "Omuz/bacak düşmesi",
      metric: "bodyLineAngle", // holding fazında; kaşık zayıfladıkça bu değer düşer
      space: "world3d",
      joints: [
        LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP,
        LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
      ],
      phases: ["holding"],
      predicate: { op: "lt", threshold: T.faults.backDrop.threshold, tolerance: T.faults.backDrop.tolerance },
      minFrames: 8,
      cooldownMs: 5000,
      severity: "major",
      minVisibility: 0.5,
      cameraHint: "side",
      message: "Bacaklarını ve omuzlarını yerden kaldır, hollow'u koru",
      speech: "Bacaklarını ve omuzlarını yerden kaldır, hollow'u koru",
    },
  ],

  /**
   * Hollow hold metrikleri — geçerli kaşık tespiti (holdEngine sözleşmesi).
   * Yön çevirme: bodyLineAngle = 180 - hamHipAngle → derin kaşık YÜKSEK değer.
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {
   *   bodyLineAngle,  // 180 - hamHipAngle (holdEngine histerezis değeri)
   *   isHorizontal,   // geçerli hollow giriş kapısı (belirgin kaşık)
   *   hipAngleRaw,    // ham omuz-kalça-ayak açısı (debug/kalibrasyon)
   * }
   */
  computeMetrics(lm, wlm) {
    if (!lm || !wlm) return null;

    const left = sideHipAngle(lm, wlm, "left");
    const right = sideHipAngle(lm, wlm, "right");

    // İki taraftan güvenilir olanları ortala (yan görüşte uzak taraf kısmen kapanır).
    let hipAngleRaw = null;
    if (left != null && right != null) hipAngleRaw = (left + right) / 2;
    else if (left != null) hipAngleRaw = left;
    else if (right != null) hipAngleRaw = right;

    if (hipAngleRaw == null) return null;

    // Yön çevirme: derin kaşık (ham açı küçük) → bodyLineAngle yüksek → holdEngine "geçerli".
    const bodyLineAngle = 180 - hipAngleRaw;

    // Giriş kapısı: kaşık BELİRGİN mi? horizontalMinTilt çevrilmiş ham eşik —
    // bodyLineAngle bu eşiği aşıyorsa (= ham açı yeterince küçük) geçerli hollow.
    const isHorizontal = bodyLineAngle >= this.hold.horizontalMinTilt;

    return {
      bodyLineAngle,
      isHorizontal,
      hipAngleRaw,
    };
  },
};
