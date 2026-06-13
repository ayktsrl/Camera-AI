// Plank egzersiz tanımı — İZOMETRİK tip (tekrar DEĞİL, süre tutma).
//
// Hoca notu (owner programı / PDF): "Plank — 3 set durabildiğin kadar."
// Diğer hareketler rep FSM'le sayılır; plank ise pozisyonu TUTMA hareketidir:
//   doğru plank pozisyonunda geçen SÜREYİ say + form bozulunca uyar.
// Bu yüzden plank repEngine'e GİRMEZ — izole holdEngine (izometrik) yolundan geçer.
// (exercise.isometric === true → holdEngine; aksi → repEngine. Diğer hareketler bozulmaz.)
//
// Geçerli plank tespiti (hold timer YALNIZ bu pozisyondayken ilerler):
//   • Vücut yatay: omuz→ayakBileği hattı dünya dikeyiyle ~90° (yere paralel).
//   • Düz hat: omuz-kalça-ayakBileği ≈ 180° (sarkma/pike yok → "geçerli").
// Pozisyon bozulunca (kalkma/çökme) hold timer DURUR (sayma duraklar — sessiz).
//
// Form kuralları (push-up bodyLine deneyiminden türetildi):
//   hipSag  — kalça düşmesi (omuz-kalça-ayak hattı sarkma) → "Kalçanı düşürme, karın sık", critical
//   hipPike — kalça yukarı kalkma / ters V                 → "Kalçanı indir",            major
// İkisi de aynı bodyLineAngle metriğinden ama YÖN ayrımıyla okunur:
//   sag  → omuz-kalça-ayak açısı < eşik AND kalça omuz-ayak hattının ALTINDA (sarkık)
//   pike → açı < eşik AND kalça hattın ÜSTÜNDE (yukarı). Yön bayrağı computeMetrics'te.
//
// Açılar 3D world landmark'tan (kamera açısı bağımsız), One Euro filtreli (mevcut altyapı).
// Plank yatay düzlemde — kamera önerisi YAN (side), tüm gövde tek karede.

import { LM, isPointReliable } from "../lib/pose";
import { angleAtPoint3D, midpoint3D, verticalTiltDeg3D } from "../lib/angles3d";

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

export const plank = {
  id: "plank",
  name: "Plank",
  isometric: true, // ← holdEngine yolu (rep FSM DEĞİL)
  cameraHint: "Kamera: yandan, tüm gövde karede (~2 m)",

  // İzometrik tutuş eşikleri (rep "phases" YERİNE) — holdEngine bunları okur.
  hold: {
    // Vücut yatay mı? omuz→ayakBileği hattının dikeyle açısı (verticalTiltDeg3D).
    // 90° = tam yatay. Plank ≈ 70°+ kabul (alt ucu pike/yüksek kalça, üstü kalkma).
    horizontalMinTilt: 62,
    // Düz hat: omuz-kalça-ayak açısı bu değerin üstündeyse "geçerli" hold.
    // Histerezis: geçerli ≥ enter, ihlal < exit (titreyen sınırda flicker yok).
    straightEnter: 160,
    straightExit: 152,
    // Geçerli pozisyona girişte onay kareleri (titreşim debounce).
    enterFrames: 4,
    // Pozisyon ne kadar süre bozuk kalırsa "set bitti" sayılır (hands-free).
    // Owner: "kullanıcı bırakınca / çok bozunca biter." Sürekli bozuk ~6 sn.
    breakEndMs: 6000,
  },

  faultLabels: {
    holding: "Tutuyor",
    broken: "Pozisyon bozuk",
    idle: "Hazır",
  },

  // Plank'ta kalibrasyon yok.
  calibration: null,

  faultRules: [
    {
      id: "hipSag",
      label: "Kalça düşmesi",
      metric: "bodyLineSag", // omuz-kalça-ayak açısı; kalça hattın ALTINDA iken set
      space: "world3d",
      joints: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
      phases: ["holding"], // yalnız geçerli tutuş fazında değerlendirilir
      // <156° ≈ >24° sarkma. Histerezis ±4°. Yön (sarkık) metriğe gömülü:
      // bodyLineSag yalnız kalça ALTTAysa açıyı, değilse 180 (ihlal yok) döner.
      predicate: { op: "lt", threshold: 156, tolerance: 4 },
      minFrames: 8,
      cooldownMs: 5000,
      severity: "critical",
      minVisibility: 0.6,
      cameraHint: "side",
      message: "Kalçanı düşürme, karın sık — vücudun düz bir hat olsun",
      speech: "Kalçanı düşürme, karın sık",
    },
    {
      id: "hipPike",
      label: "Kalça yukarı (ters V)",
      metric: "bodyLinePike", // omuz-kalça-ayak açısı; kalça hattın ÜSTÜNDE iken set
      space: "world3d",
      joints: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
      phases: ["holding"],
      // <160° ≈ >20° kalkma. Histerezis ±4°. Yön (yukarı) metriğe gömülü.
      predicate: { op: "lt", threshold: 160, tolerance: 4 },
      minFrames: 8,
      cooldownMs: 5000,
      severity: "major",
      minVisibility: 0.6,
      cameraHint: "side",
      message: "Kalçanı indir, omuz-kalça-ayak tek hat olsun",
      speech: "Kalçanı indir",
    },
  ],

  /**
   * Plank metrikleri — geçerli-tutuş tespiti + yön-ayrımlı hat açıları.
   * @param {Array} lm 2D normalize landmark'lar (visibility kaynağı)
   * @param {Array|null} wlm 3D world landmark'lar (metre)
   * @returns {object|null} {
   *   bodyLineAngle,   // omuz-kalça-ayak açısı (ham)
   *   horizontalTilt,  // omuz→ayak hattının dikeyle açısı (90 = yatay)
   *   isHorizontal,    // yatay eşiğin üstünde mi
   *   bodyLineSag,     // hipSag kuralı için: kalça ALTTAysa açı, değilse 180
   *   bodyLinePike,    // hipPike kuralı için: kalça ÜSTTEyse açı, değilse 180
   * }
   */
  computeMetrics(lm, wlm) {
    if (!lm || !wlm) return null;
    if (!bodyReliable(lm)) return null;

    const shoulderMid = midpoint3D(wlm[LM.LEFT_SHOULDER], wlm[LM.RIGHT_SHOULDER]);
    const hipMid = midpoint3D(wlm[LM.LEFT_HIP], wlm[LM.RIGHT_HIP]);
    const ankleMid = midpoint3D(wlm[LM.LEFT_ANKLE], wlm[LM.RIGHT_ANKLE]);
    if (!shoulderMid || !hipMid || !ankleMid) return null;

    const bodyLineAngle = angleAtPoint3D(shoulderMid, hipMid, ankleMid);
    const horizontalTilt = verticalTiltDeg3D(shoulderMid, ankleMid);
    if (bodyLineAngle == null || horizontalTilt == null) return null;

    const isHorizontal = horizontalTilt >= this.hold.horizontalMinTilt;

    // Kalça hattın altında mı / üstünde mi? Omuz→ayak hattının y'siyle kalça y'sini
    // kıyasla. World'de +y yukarı. Kalça hattın ALTINDAysa (y daha düşük) → sarkma;
    // ÜSTÜNDEyse (y daha yüksek) → pike.
    const t =
      Math.abs(ankleMid.x - shoulderMid.x) > 1e-6
        ? (hipMid.x - shoulderMid.x) / (ankleMid.x - shoulderMid.x)
        : 0.5;
    const lineYatHip = shoulderMid.y + (ankleMid.y - shoulderMid.y) * t;
    const hipBelowLine = hipMid.y < lineYatHip; // sarkık (kalça düşük)
    const hipAboveLine = hipMid.y > lineYatHip; // pike (kalça yüksek)

    // Yön-ayrımlı açılar: yalnız ilgili yöndeyken gerçek açı, aksi 180 (kural susar).
    const bodyLineSag = hipBelowLine ? bodyLineAngle : 180;
    const bodyLinePike = hipAboveLine ? bodyLineAngle : 180;

    return {
      bodyLineAngle,
      horizontalTilt,
      isHorizontal,
      bodyLineSag,
      bodyLinePike,
    };
  },
};
