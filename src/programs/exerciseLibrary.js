// Hareket Kütüphanesi — uygulamanın TANIDIĞI hareketler.
//
// Bu, kullanıcının ÖZEL program kurarken seçebileceği hareket havuzudur.
// Her kayıt, owner hoca programındaki (src/programs/default-program.js) hareketlerden
// + temel bodyweight hareketlerden türetilmiştir.
//
// SINIR: trackable === true olanlar pose form analizine GİRER (kameradan otomatik
// tekrar sayımı). Şu an SADECE squat ailesi (ruleSetRef "squat") ve push-up
// (ruleSetRef "pushup") gerçek motora bağlıdır — bu yüzden P0'da onlar takiplidir.
// Diğer her şey "rehberli": kullanıcı kendi sayar, uyarı + önizleme verilir.
// (Faz mantığı programPlayer.isPoseTracked ile aynı: trackable && ruleSetRef &&
//  trackingPhase <= ACTIVE_TRACKING_PHASE.)
//
// Yeni hareket eklemek: buraya bir kayıt ekle. trackable yapacaksan önce
// src/exercises/ altında bir kural seti yazıp index.js'e kaydet, sonra ruleSetRef ver.

/**
 * @typedef {object} LibraryExercise
 * @property {string} id             Kütüphane kimliği (özel programda hareket id'sinin kökü)
 * @property {string} name           Görünen ad (tr)
 * @property {"bodyweight"|"machine"|"dumbbell"|"cable"|"band"|"barbell"} type  Ekipman tipi
 * @property {boolean} trackable      Pose form analizi gerçekçi mi
 * @property {string|null} trackingPhase  "P0"|"P1"|"P2"|null — hangi fazda pose moduna geçer
 * @property {string|null} ruleSetRef     src/exercises/ kayıt anahtarı (takipsizse null)
 * @property {{type:string,[k:string]:number}} defaultDose  Varsayılan doz (Dose şeması)
 * @property {string|null} coachNote      Opsiyonel hoca notu — null ise yok
 * @property {string|null} untrackableReason  Rehberli ZORUNLU: neden takip edilemez
 */

/** @type {LibraryExercise[]} */
export const EXERCISE_LIBRARY = [
  // ─────────── TAKİPLİ (pose motoru bağlı — P0) ───────────
  {
    id: "push-up",
    name: "Push Up (Şınav)",
    type: "bodyweight",
    trackable: true,
    trackingPhase: "P0",
    ruleSetRef: "pushup",
    defaultDose: { type: "reps", value: 10 },
    coachNote: "Eller göğüs hizasında, boyun kırılmasın, karın sık",
    untrackableReason: null,
  },
  {
    id: "bodyweight-squat",
    name: "Bodyweight Squat",
    type: "bodyweight",
    trackable: true,
    trackingPhase: "P0",
    ruleSetRef: "squat",
    defaultDose: { type: "reps", value: 15 },
    coachNote: null,
    untrackableReason: null,
  },

  // ─────────── REHBERLİ (kullanıcı kendi sayar) ───────────
  // Temel bodyweight
  {
    id: "lunge",
    name: "Lunge",
    type: "bodyweight",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "perSide", value: 10 },
    coachNote: "Diz asla öne fırlamasın, gövde dik",
    untrackableReason: "Tek bacak desteği + derinlik varyasyonu pose motorunda henüz güvenilir değil.",
  },
  {
    id: "plank",
    name: "Plank",
    type: "bodyweight",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "time", seconds: 45 },
    coachNote: "Kalça düşmesin, karın sık",
    untrackableReason: "Statik izometrik tutuş — tekrar fazı yok, süre bazlı.",
  },
  {
    id: "jumping-jack",
    name: "Jumping Jack",
    type: "bodyweight",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "time", seconds: 45 },
    coachNote: null,
    untrackableReason: "Hızlı tüm-vücut hareketi — pose çift sayma riski; süre bazlı uygundur.",
  },
  {
    id: "mountain-climber",
    name: "Mountain Climber",
    type: "bodyweight",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "time", seconds: 30 },
    coachNote: "Kalça yukarı zıplamasın, tempo sabit",
    untrackableReason: "Yere yakın hızlı diz çekme — landmark öklüzyonu ve hız pose güvenini düşürür.",
  },
  {
    id: "glute-bridge",
    name: "Glute Bridge",
    type: "bodyweight",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 15 },
    coachNote: "Tepede kalçayı sık, bel zorlanmasın",
    untrackableReason: "Sırtüstü poz — pose modeli yatay gövdede güvenilmez.",
  },
  {
    id: "crunch",
    name: "Crunch (Mekik)",
    type: "bodyweight",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 20 },
    coachNote: "Boynu çekme, hareketi karından başlat",
    untrackableReason: "Sırtüstü kısa genlik — pose çözünürlüğünün altında.",
  },
  {
    id: "burpee",
    name: "Burpee",
    type: "bodyweight",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 10 },
    coachNote: "Kalkışta tam dikel, inişte göğüs yere yakın",
    untrackableReason: "Çok fazlı kompleks hareket — tek metrikli FSM kapsamı dışında.",
  },

  // Dumbbell / serbest ağırlık
  {
    id: "db-bench-press",
    name: "Dumbbell Bench Press",
    type: "dumbbell",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 12 },
    coachNote: "Dirsek 45°, üstte sıkıştır",
    untrackableReason: "Sırtüstü bench pozu — pose modeli güvenilmez.",
  },
  {
    id: "db-row",
    name: "Dumbbell Row",
    type: "dumbbell",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 12 },
    coachNote: "Gövdeyi sallama, dirseği arkaya sür",
    untrackableReason: "Öne eğik gövde + kol örtüşmesi landmark'ları kapatır.",
  },
  {
    id: "db-shoulder-press",
    name: "Dumbbell Shoulder Press",
    type: "dumbbell",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 12 },
    coachNote: "Bel kavislenmesin, çekirdek sık",
    untrackableReason: "Baş üstü kol hareketi — kol/baş örtüşmesi pose güvenini düşürür.",
  },
  {
    id: "db-lateral-raise",
    name: "Dumbbell Lateral Raise",
    type: "dumbbell",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 15 },
    coachNote: "Omuz hizasında dur, trapezi kasma",
    untrackableReason: "Düşük genlikli yan kol kaldırma — pose gürültü bandının içinde.",
  },
  {
    id: "db-hammer-curl",
    name: "Dumbbell Hammer Curl",
    type: "dumbbell",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 12 },
    coachNote: "Dirsek sabit, gövde sallanmasın",
    untrackableReason: "Bilek/önkol detayı landmark çözünürlüğünün altında.",
  },

  // Barbell
  {
    id: "barbell-squat",
    name: "Barbell Squat",
    type: "barbell",
    trackable: true,
    trackingPhase: "P0",
    ruleSetRef: "squat",
    defaultDose: { type: "reps", value: 10 },
    coachNote: "Ayak 15-20° dışa, taban yere basılı, dizler içeri çökmesin",
    untrackableReason: null,
  },
  {
    id: "barbell-deadlift",
    name: "Barbell Deadlift",
    type: "barbell",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 8 },
    coachNote: "Sırt nötr, barı vücuda yakın çek",
    untrackableReason: "Yüksek-risk kalça menteşesi — yanlış geri bildirim güvensiz; rehberli tutuldu.",
  },

  // Machine / cable
  {
    id: "lat-pulldown",
    name: "Lat Pulldown",
    type: "machine",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 12 },
    coachNote: "Barı göğsün üstüne çek, gövdeyi sallama",
    untrackableReason: "Oturuşlu makine + ekipman öklüzyonu pose'u güvenilmez kılar.",
  },
  {
    id: "leg-press",
    name: "Leg Press",
    type: "machine",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 12 },
    coachNote: "Dizleri kilitleme, kontrollü in",
    untrackableReason: "Makine sled'inde oturuş — gövde/bacak landmark'ları örtülü.",
  },
  {
    id: "leg-extension",
    name: "Leg Extension",
    type: "machine",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 15 },
    coachNote: "Tepede 1 sn sık, hızlı bırakma",
    untrackableReason: "Oturuşlu makine — alt bacak ekipmana örtülü.",
  },
  {
    id: "rope-pushdown",
    name: "Rope Pushdown",
    type: "cable",
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    defaultDose: { type: "reps", value: 15 },
    coachNote: "Dirsekler gövdeye kilitli",
    untrackableReason: "Kablo istasyonu + bilek detayı landmark çözünürlüğünün altında.",
  },
];

/** Tip etiketleri (UI rozet metni). */
export const TYPE_LABELS = {
  bodyweight: "Vücut ağırlığı",
  dumbbell: "Dumbbell",
  barbell: "Barbell",
  machine: "Makine",
  cable: "Kablo",
  band: "Bant",
};

/** id ile kütüphane kaydı getir. */
export function getLibraryExercise(id) {
  return EXERCISE_LIBRARY.find((e) => e.id === id) || null;
}

/**
 * Ada/tipe göre filtre (builder arama kutusu). Boş sorgu → tüm liste.
 * Aksan-duyarsız, küçük harf eşleşmesi.
 */
export function searchLibrary(query) {
  const q = (query || "").trim().toLocaleLowerCase("tr");
  if (!q) return EXERCISE_LIBRARY;
  return EXERCISE_LIBRARY.filter(
    (e) =>
      e.name.toLocaleLowerCase("tr").includes(q) ||
      (TYPE_LABELS[e.type] || e.type).toLocaleLowerCase("tr").includes(q)
  );
}
