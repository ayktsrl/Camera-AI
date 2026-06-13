// Yerleştirme (kadraj) kontrolü — SAF modül, React/tarayıcı bağımsız.
//
// Amaç: owner ekrana BAKMADAN doğru yerleşsin. Set başında gerekli landmark'lar
// kadrajda + görünür mü kontrol eder; değilse sesli + görsel yönlendirme metni üretir.
//
// SINIR: takip motorunu BESLEMEZ, yalnız GÖZLEMLER. Mevcut isPointReliable
// (lib/pose.js) güvenilirlik sinyalini OKUR; pose/motor mantığına SIFIR dokunuş.
// Eşik sabitleri buraya özgüdür (motor fault/phase eşiklerinden BAĞIMSIZ).

import { LM, isPointReliable } from "./pose";

// Kadraj kenar bandı — gerekli bir landmark'ın x/y'si bu bandın dışına (kenara)
// yapışıksa "taşıyor" sayılır. Normalize koordinat (0..1).
const EDGE_MARGIN = 0.06;

// "upper" harekette kişi çok uzaktaysa (bbox küçük) yaklaşması istenir. full'da
// uzaklık beklenir (geri durmak gerekir) → bu eşik yalnız upper için anlamlı.
const UPPER_MIN_BBOX_HEIGHT = 0.45; // gövde yüksekliği kare yüksekliğinin <%45'i → uzak

// "full" harekette kişi çok yakınsa alt landmark'lar (ayak) kadrajdan taşar →
// bunu "no lower body reliable + üst görünür" deseninden anlarız (aşağıda).

// Hangi landmark grubu hangi framing'de gerekli.
const UPPER_REQUIRED = [
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
  LM.LEFT_ELBOW,
  LM.RIGHT_ELBOW,
];

const FULL_REQUIRED = [
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
  LM.LEFT_HIP,
  LM.RIGHT_HIP,
  LM.LEFT_KNEE,
  LM.RIGHT_KNEE,
  LM.LEFT_ANKLE,
  LM.RIGHT_ANKLE,
];

const LOWER_GROUP = [
  LM.LEFT_KNEE,
  LM.RIGHT_KNEE,
  LM.LEFT_ANKLE,
  LM.RIGHT_ANKLE,
];

const UPPER_GROUP = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER];

const STATUS_TEXT = {
  "no-person": {
    hint: "Kameraya gir, görünmüyorsun",
    speech: "Kameraya gir, seni göremiyorum",
  },
  "too-close": {
    hint: "Geri git — tüm vücudun görünsün",
    speech: "Geri git, tüm vücudun görünsün",
  },
  "too-far": {
    hint: "Biraz yaklaş",
    speech: "Biraz yaklaş",
  },
  "out-left": {
    // Ayna (ön kamera) düzeltmesi UI'da; util ham koordinatla konuşur ama
    // yönlendirme kullanıcının HAREKET edeceği yöne göre verilir (sağa kay).
    hint: "Sağa kay",
    speech: "Sağa doğru kay",
  },
  "out-right": {
    hint: "Sola kay",
    speech: "Sola doğru kay",
  },
  "partial-top": {
    hint: "Biraz geri/aşağı — başın kadrajdan taşıyor",
    speech: "Biraz geri git, başın taşıyor",
  },
  "partial-bottom": {
    hint: "Geri git — alt tarafın taşıyor",
    speech: "Geri git, alt tarafın taşıyor",
  },
  ok: {
    hint: "Hazır",
    speech: "Tamam, görüyorum, başlıyoruz",
  },
};

// Yerleştirme penceresinde bir kez söylenen DURUŞ ipucu (framing'e göre).
// Eyes-free: owner ekrana bakmadan telefonu doğru kursun.
//  - full  → portre + alçak açı, ayakta tüm vücut daha yakından sığar.
//  - upper → bacak gerekmez, yakın durabilir.
export const POSTURE_HINT = {
  full: {
    hint: "Telefonu dik tut, alçak açıyla yere yakın koy",
    speech: "Telefonu dik tut ve alçak açıyla yere yakın koy",
  },
  upper: {
    hint: "Üst vücut hareketi — yakın durabilirsin",
    speech: "Üst vücut hareketi, yakın durabilirsin",
  },
};

/** Güvenilir landmark grubu sayısı (görünürlük + presence). */
function reliableCount(landmarks, indices) {
  let n = 0;
  for (const i of indices) {
    if (isPointReliable(landmarks[i])) n += 1;
  }
  return n;
}

/** Bir grubun TÜM noktaları güvenilir mi? */
function groupReliable(landmarks, indices) {
  return reliableCount(landmarks, indices) === indices.length;
}

/** Güvenilir noktaların x/y kenara yapışması (kadraj taşması) yönünü bulur. */
function edgeOverflow(landmarks, indices) {
  let left = false;
  let right = false;
  let top = false;
  let bottom = false;
  for (const i of indices) {
    const p = landmarks[i];
    if (!isPointReliable(p)) continue;
    if (p.x <= EDGE_MARGIN) left = true;
    if (p.x >= 1 - EDGE_MARGIN) right = true;
    if (p.y <= EDGE_MARGIN) top = true;
    if (p.y >= 1 - EDGE_MARGIN) bottom = true;
  }
  return { left, right, top, bottom };
}

/** Güvenilir noktalardan gövde yüksekliği (normalize) — uzaklık ölçüsü. */
function bodyHeight(landmarks, indices) {
  const ys = [];
  for (const i of indices) {
    const p = landmarks[i];
    if (isPointReliable(p)) ys.push(p.y);
  }
  if (ys.length < 2) return null;
  return Math.max(...ys) - Math.min(...ys);
}

/**
 * Kadrajı değerlendirir.
 * @param {object} params
 * @param {Array|null} params.landmarks 2D normalize landmark'lar (visibility/presence)
 * @param {"full"|"upper"} [params.framing="full"] hareketin kadraj gereksinimi
 * @returns {{ok:boolean,status:string,hint:string,speech:string,missing:string[]}}
 */
export function evaluateFraming({ landmarks, framing = "full" }) {
  const required = framing === "upper" ? UPPER_REQUIRED : FULL_REQUIRED;

  // Hiç güvenilir gövde yok → kişi yok.
  if (!landmarks || reliableCount(landmarks, UPPER_GROUP) === 0) {
    return result("no-person", []);
  }

  // Üst vücut bile yoksa (omuzlar görünmüyor) yine "kameraya gir".
  if (!groupReliable(landmarks, UPPER_GROUP)) {
    return result("no-person", ["upper"]);
  }

  if (framing === "full") {
    // Tüm vücut gerekir. Alt grup (diz/ayak) eksikse en olası neden: çok yakın
    // (alt taraf kadrajdan taşıyor) → geri git.
    const lowerOk = groupReliable(landmarks, LOWER_GROUP);
    if (!lowerOk) {
      return result("too-close", missingNames(landmarks, FULL_REQUIRED));
    }
    // Tüm gerekli grup var → kenar taşması kontrolü.
    const edge = edgeOverflow(landmarks, required);
    if (edge.bottom) return result("partial-bottom", []);
    if (edge.top) return result("partial-top", []);
    if (edge.left) return result("out-left", []);
    if (edge.right) return result("out-right", []);
    return result("ok", []);
  }

  // framing === "upper": bacak İSTENMEZ → kullanıcı daha yakın durabilir.
  if (!groupReliable(landmarks, required)) {
    // Üst vücut eksik landmark (dirsek görünmüyor) → genelde kadraj dışı/yan taşma.
    const edge = edgeOverflow(landmarks, UPPER_REQUIRED);
    if (edge.left) return result("out-left", []);
    if (edge.right) return result("out-right", []);
    if (edge.top) return result("partial-top", []);
    return result("too-far", missingNames(landmarks, required));
  }
  // Üst vücut tam. Çok uzaktaysa (küçük) yaklaşması daha okunur kullanım sağlar.
  const h = bodyHeight(landmarks, [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP]);
  if (h != null && h < UPPER_MIN_BBOX_HEIGHT && groupReliable(landmarks, [LM.LEFT_HIP, LM.RIGHT_HIP])) {
    return result("too-far", []);
  }
  const edge = edgeOverflow(landmarks, UPPER_REQUIRED);
  if (edge.left) return result("out-left", []);
  if (edge.right) return result("out-right", []);
  if (edge.top) return result("partial-top", []);
  return result("ok", []);
}

function missingNames(landmarks, indices) {
  const names = [];
  for (const i of indices) {
    if (!isPointReliable(landmarks[i])) names.push(String(i));
  }
  return names;
}

function result(status, missing) {
  const t = STATUS_TEXT[status] ?? STATUS_TEXT["no-person"];
  return {
    ok: status === "ok",
    status,
    hint: t.hint,
    speech: t.speech,
    missing,
  };
}

export const FRAMING_CONSTANTS = {
  EDGE_MARGIN,
  UPPER_MIN_BBOX_HEIGHT,
};
