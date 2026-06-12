// 3D eklem açısı yardımcıları — MediaPipe worldLandmarks (metre, orijin = kalça ortası).
// 3D açılar kamera açısından bağımsızdır: kişi 30° dönük dursa da diz açısı aynı kalır.
// NOT: world-z monoküler tahmindir (en gürültülü eksen) — z'ye tek başına dayanan
// kurallara yüksek tolerans + uzun confirm verilmeli (bkz. spec §2.7).

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v) {
  return Math.hypot(v.x, v.y, v.z);
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v) {
  const len = length(v);
  if (len === 0) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

const toDeg = (rad) => (rad * 180) / Math.PI;

/**
 * Üç 3D noktadan orta noktadaki (b) eklem açısı, derece.
 * Örn: kalça-diz-ayakBileği → diz açısı; tam düz bacak ≈ 180°.
 * @returns {number|null} 0–180; nokta eksikse null
 */
export function angleAtPoint3D(a, b, c) {
  if (!a || !b || !c) return null;

  const ab = sub(a, b);
  const cb = sub(c, b);
  const abLen = length(ab);
  const cbLen = length(cb);
  if (abLen === 0 || cbLen === 0) return null;

  const cos = Math.min(1, Math.max(-1, dot(ab, cb) / (abLen * cbLen)));
  return toDeg(Math.acos(cos));
}

/**
 * İki 3D noktayı birleştiren doğrunun DÜNYA DİKEYİ (y ekseni) ile açısı, derece.
 * World uzayında y ≈ yerçekimi ekseni → 2D'deki "kameraya dönme = eğilme" hatası kalkar.
 * 0° = dimdik, 90° = yere paralel. Y yönü işaretinden bağımsızdır (|vy| kullanılır).
 * @returns {number|null}
 */
export function verticalTiltDeg3D(from, to) {
  if (!from || !to) return null;

  const v = sub(to, from);
  const len = length(v);
  if (len === 0) return null;

  const cos = Math.min(1, Math.abs(v.y) / len);
  return toDeg(Math.acos(cos));
}

/** İki 3D landmark'ın orta noktası. */
export function midpoint3D(a, b) {
  if (!a || !b) return null;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

/**
 * FPPA — Frontal Plane Projection Angle, derece (diz valgus metriği).
 * Kalça-diz-ayakBileği açısının, GÖVDE YÖNELİMİNE göre tanımlanan frontal
 * düzleme projeksiyonu. Saf 2D ekran-x farkı kişi dönükse çöker; burada frontal
 * düzlem kalça hattından türetilir → kamera açısından bağımsız.
 *
 * Frontal düzlem: lateral eksen (solKalça→sağKalça) + dünya dikeyi (y) gerer;
 * normali = ön-arka (sagittal) eksen. Noktalar bu normale dik düzleme izdüşürülür.
 *
 * Düz bacak ≈ 180°; medial çökme (valgus) açıyı düşürür. <165° ≈ >15° çökme.
 * @returns {number|null}
 */
export function fppaDeg(hip, knee, ankle, hipLeft, hipRight) {
  if (!hip || !knee || !ankle || !hipLeft || !hipRight) return null;

  const lateral = normalize(sub(hipRight, hipLeft));
  if (!lateral) return null;

  const worldUp = { x: 0, y: 1, z: 0 };
  // Sagittal (ön-arka) eksen = frontal düzlemin normali.
  const sagittal = normalize(cross(lateral, worldUp));
  if (!sagittal) return null; // kalça hattı dikeyle paralel — anlamsız poz

  const project = (p) => {
    const d = dot(p, sagittal);
    return {
      x: p.x - d * sagittal.x,
      y: p.y - d * sagittal.y,
      z: p.z - d * sagittal.z,
    };
  };

  return angleAtPoint3D(project(hip), project(knee), project(ankle));
}
