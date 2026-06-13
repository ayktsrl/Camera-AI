// Egzersiz fotoğraf eşlemesi — SALT GÖRSEL (önizleme).
// Bir hareketi (ruleSetRef veya library id) gerçek demonstrasyon fotoğraf çiftine
// (start.jpg / end.jpg) bağlar. Fotoğraflar public/exercises/<key>/ altında bundle'lı
// (offline, telif-temiz — Unlicense, free-exercise-db). Dış link / runtime fetch YOK.
//
// Pose / repEngine / programPlayer / exercise mantığından TAMAMEN bağımsız.
//
// Eşleşme yoksa null döner → PosePreview nötr "egzersiz" placeholder'ı gösterir.
// (ÇÖP ADAM DEĞİL — owner çöp adamı reddetti.)

// Vite base'i (örn. "/formcoach/") asset yollarına önek olur. import.meta.env.BASE_URL
// build/dev'de doğru kökü verir; test (vitest) ortamında "/" döner — ikisi de güvenli.
function assetBase() {
  const base =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.BASE_URL) ||
    "/";
  return base.endsWith("/") ? base : `${base}/`;
}

// Önizleme klasör anahtarları — public/exercises/<KEY>/{start,end}.jpg ile birebir.
const PHOTO_KEYS = new Set([
  "squat",
  "pushup",
  "shoulderPress",
  "lateralRaise",
  "hammerCurl",
  "plank",
  "jumpingJack",
  "lunge",
  "kneeRaise",
  // Kalistenik rehberli hareketler (free-exercise-db, Unlicense — bundle'lı):
  "glute-bridge",
  "mountain-climber",
  "leg-raise",
  "dips",
  "inverted-row",
  "calf-raise",
  "arm-circles",
  // Foto-boşluk doldurma (2026-06-13): eksik/zayıf hareketlere bundle'lı görsel.
  // NOT: pike-pushup geri alındı — handstand push-up yanlış demonstrasyondu,
  // placeholder'a düşmesi için bilinçli olarak eklenmedi (bkz. photoKeyFor → null).
  "hollow-hold",
  "leg-swings",
  "high-knees",
]);

// ruleSetRef (camelCase egzersiz kural-seti anahtarı) → foto klasörü.
// ruleSetRef'ler zaten foto anahtarlarıyla aynı isimde, ama açıkça yazıyoruz ki
// ruleSetRef şeması değişirse önizleme sessizce kırılmasın.
const REF_TO_KEY = {
  squat: "squat",
  pushup: "pushup",
  lunge: "lunge",
  plank: "plank",
  jumpingJack: "jumpingJack",
  kneeRaise: "kneeRaise",
  lateralRaise: "lateralRaise",
  hammerCurl: "hammerCurl",
  shoulderPress: "shoulderPress",
  // Batch 2 takipli: mountain climber foto bundle'ı mevcut (free-exercise-db).
  mountainClimber: "mountain-climber",
  // Foto-boşluk doldurma (2026-06-13): hollow hold artık kendi bundle'ına sahip
  // (free-exercise-db "Scissor_Kick" — sırtüstü, bacaklar yerden, core hold pozu).
  hollowHold: "hollow-hold",
};

// Library id (özel programda hareket id kökü) → foto klasörü.
// Aynı fotoğrafı paylaşan varyantlar (barbell-squat → squat gibi) burada toplanır.
const ID_TO_KEY = {
  "push-up": "pushup",
  "bodyweight-squat": "squat",
  "barbell-squat": "squat",
  lunge: "lunge",
  plank: "plank",
  "jumping-jack": "jumpingJack",
  "standing-knee-raise": "kneeRaise",
  "db-shoulder-press": "shoulderPress",
  "db-lateral-raise": "lateralRaise",
  "db-hammer-curl": "hammerCurl",
  // Kalistenik rehberli — library id'leri foto klasörüyle birebir:
  "glute-bridge": "glute-bridge",
  "mountain-climber": "mountain-climber",
  "leg-raise": "leg-raise",
  dips: "dips",
  "inverted-row": "inverted-row",
  "calf-raise": "calf-raise",
  "arm-circles": "arm-circles",
  // Foto-boşluk doldurma (2026-06-13):
  // pike-pushup BİLİNÇLİ OLARAK eşlenmedi — yanlış görsel (handstand push-up)
  // geri alındı, doğru zemin-pike görseli bulunana dek placeholder gösterilir.
  "leg-swings": "leg-swings",
  "hollow-hold": "hollow-hold",
  // high-knees aşağıda ID_OVERRIDE ile ele alınır (ruleSetRef "kneeRaise"
  // paylaştığı için normal ID yolu ruleSetRef'e yenik düşer — bkz. photoKeyFor).
};

// ruleSetRef ÖNCELİĞİNİ EZEN id eşlemesi. Bazı hareketler bir motoru paylaşır
// (örn. high-knees, kneeRaise ruleset'ini kullanır) ama KENDİ demonstrasyon
// fotosu olmalı. Bu tablo photoKeyFor'da ruleSetRef kontrolünden ÖNCE bakılır.
// id tam ya da "<gün öneki>-<base>" / "<base>-<sonek>" köküyle eşleşir.
const ID_OVERRIDE = {
  "high-knees": "high-knees",
};

/**
 * Hareketten foto klasör anahtarı seç. Önce ruleSetRef, sonra library id (tam ya da
 * "id-2" gibi köke göre). Eşleşme yoksa null.
 * @param {{ruleSetRef?:string, id?:string}} exercise
 * @returns {string|null}
 */
export function photoKeyFor(exercise) {
  const id = exercise?.id || "";

  // 0) ID ÖNCELİKLİ EZME — ruleSetRef'ten ÖNCE. high-knees gibi bir motoru
  // paylaşan ama kendi fotosu olması gereken hareketler için (kök eşleşmesi de
  // dahil: "cxB-high-knees" → "high-knees").
  for (const baseId of Object.keys(ID_OVERRIDE)) {
    if (id === baseId || id.startsWith(`${baseId}-`) || id.endsWith(`-${baseId}`)) {
      const k = ID_OVERRIDE[baseId];
      if (PHOTO_KEYS.has(k)) return k;
    }
  }

  const ref = exercise?.ruleSetRef;
  if (ref && REF_TO_KEY[ref] && PHOTO_KEYS.has(REF_TO_KEY[ref])) {
    return REF_TO_KEY[ref];
  }

  // Tam id eşleşmesi
  if (ID_TO_KEY[id]) return ID_TO_KEY[id];
  // Kök eşleşmesi: özel programda hareket id'si "lunge-2" gibi köklenebilir;
  // kalistenik programda ise "cxA-glute-bridge" gibi bir gün önekiyle gelir.
  // Bu yüzden hem sonek ("base-…") hem önek ("…-base") hem de tek-segment
  // ortası eşleşmesini deniyoruz (en uzun base önce → "leg-raise" "raise"den önce).
  const bases = Object.keys(ID_TO_KEY).sort((a, b) => b.length - a.length);
  for (const baseId of bases) {
    if (
      id === baseId ||
      id.startsWith(`${baseId}-`) ||
      id.endsWith(`-${baseId}`)
    ) {
      return ID_TO_KEY[baseId];
    }
  }
  return null;
}

/**
 * Hareketin start/end foto URL'lerini getir. Eşleşme yoksa null.
 * @param {{ruleSetRef?:string, id?:string}} exercise
 * @returns {{start:string, end:string}|null}
 */
export function photosFor(exercise) {
  const key = photoKeyFor(exercise);
  if (!key) return null;
  const base = assetBase();
  return {
    start: `${base}exercises/${key}/start.jpg`,
    end: `${base}exercises/${key}/end.jpg`,
  };
}

/** Bu hareketin gerçek fotoğrafı var mı? */
export function hasPhotos(exercise) {
  return photoKeyFor(exercise) !== null;
}
