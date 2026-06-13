// Kalistenik (Bodyweight) Programı — PM araştırma tasarımından BİREBİR.
// Kaynak: agents/03-stratejist/outputs/2026-06-13_pm_formcoach-calisthenics-program.md
//
// Bu program owner'ın hoca programının (src/programs/default-program.js) YANINA
// AYRI bir program nesnesi olarak eklenir. ProgramMode gün seçiminde hoca programı
// + bu kalistenik program + özel programlar BİRLİKTE listelenir.
//
// Şema: src/programs/SCHEMA.md (Program > days[] > blocks[] > exercises[]).
//
// coachNote KURALI farkı: hoca programında not = hocanın PDF cümlesinin birebir
// kopyası (kısaltılamaz). BURADA notlar PM tasarımından/form ipucundan gelir →
// serbest yazılabilir (PM devir notu §5). Sesli okunur (set başında bir kez).
//
// TAKİPLİ (✅ P0): squat / pushup / lunge / plank / jumpingJack / kneeRaise +
//   Batch 1: gluteBridge / legRaise / highKnees(kneeRaise motorunu paylaşır).
//   trackable:true, trackingPhase:"P0", ruleSetRef:"<key>", untrackableReason:null
//   → Batch 2 dersi: P0 olmazsa canlıda saymaz. Hepsi P0.
// REHBERLİ (🔶): trackable:false, trackingPhase:null, ruleSetRef:null,
//   untrackableReason:"<spec gerekçesi>" + coachNote (form ipucu).

// ── Bitiriş plank — 3 antrenman gününde de aynı (haftada 3 gün, 3 set, hold). ──
// Pose-takipli (P0): holdEngine geçerli plank pozisyonunda geçen süreyi sayar.
function plankFinisher(suffix) {
  return {
    type: "finisher",
    label: "Bitiriş — Plank",
    exercises: [
      {
        id: `cx-plank-${suffix}`,
        name: "Plank",
        coachNote: "Kalça düşmesin, karın sık, omuz-kalça-ayak tek hat",
        videoUrl: null,
        embeddable: false,
        sets: 3,
        dose: { type: "hold" },
        restSec: [30, 45],
        trackable: true,
        trackingPhase: "P0",
        ruleSetRef: "plank",
        untrackableReason: null,
      },
    ],
  };
}

// Rehberli hareketlerin "neden takip edilemez" gerekçeleri — spec §3 tablosundan birebir.
// NOT (Batch 1): glute-bridge / leg-raise / high-knees artık TAKİPLİ (✅ P0) —
// yeni gluteBridge/legRaise motorları + highKnees kneeRaise motorunu paylaşır.
// Eski "untrackable" gerekçeleri kaldırıldı (artık takip ediliyorlar).
const REASON = {
  armCircles:
    "Serbest savurma — form kuralı anlamlı değil, sayım değeri düşük.",
  pikePushup:
    "Push-up motoru yatay dirsek yörüngesi bekler; pike'ta gövde V şeklinde, kalça yüksekte — mevcut pushup ruleset'i yanlış sayar.",
  mountainClimber:
    "Plank pozisyonunda hızlı asimetrik diz çekme; mevcut motorlar simetrik/yavaş tempo için kalibre, hız sayım gürültüsü yaratır.",
  invertedRow:
    "Gövde yatay askıda; masa/bar kol+gövde örtüşmesi dirsek yörüngesini gizler (default-program'daki tüm row'lar da aynı gerekçeyle rehberli).",
  dips:
    "Eller arkada, gövde önde; sandalye/masa kenarı kameradan ele/omuza öklüzyon yaratır, dirsek yörüngesi gizlenir.",
  hollowHold:
    "Sırtüstü izometrik; plank holdEngine yere-paralel/yüzükoyun için, hollow farklı supine geometri — ayrı motor gerekir.",
  calfRaise:
    "Genlik çok küçük (ayak bileği), pose gürültü bandının altında.",
  legSwings:
    "Serbest savurma — form kuralı anlamlı değil, sayım değeri düşük.",
};

// Kısayol kurucular — gürültüyü azaltır, şema alanları tam kalır.
// sets son argüman (varsayılan 1 = ısınma). restSec verilirse straight/core dinlenmesi.
function tracked(id, name, dose, ref, coachNote, { sets = 1, restSec } = {}) {
  return {
    id,
    name,
    coachNote: coachNote ?? null,
    videoUrl: null,
    embeddable: false,
    sets,
    dose,
    ...(restSec ? { restSec } : {}),
    trackable: true,
    trackingPhase: "P0",
    ruleSetRef: ref,
    untrackableReason: null,
  };
}
function guided(id, name, dose, reason, coachNote, { sets = 1, restSec } = {}) {
  return {
    id,
    name,
    coachNote,
    videoUrl: null,
    embeddable: false,
    sets,
    dose,
    ...(restSec ? { restSec } : {}),
    trackable: false,
    trackingPhase: null,
    ruleSetRef: null,
    untrackableReason: reason,
  };
}

export const calisthenicsProgram = {
  id: "calisthenics-2026-06",
  name: "Kalistenik — Bu Hafta",
  source: "pm-research",
  version: 1,
  generalRules: {
    // Ekipmansız, gün aşırı 3 gün (Pzt/Çar/Cum). RR progresyon ilkesi metni.
    daysFlexible: true,
    note: "Bir hareketi son 2 tekrarı zorlanarak ama iyi formla bitirebiliyorsan üst doza/varyasyona geç. Form bozuluyorsa aynı seviyede kal.",
    plank: { perWeek: 3, sets: 3, mode: "max" },
    defaultRestSec: [60, 90],
  },
  days: [
    // ─────────────── ANTRENMAN A — Pazartesi (Push + Squat) ───────────────
    {
      id: "cxA",
      label: "Antrenman A",
      suggestedDay: "Pazartesi",
      blocks: [
        {
          type: "warmup",
          label: "Isınma",
          exercises: [
            tracked("cxA-jumping-jack", "Jumping Jack", { type: "time", seconds: 45 }, "jumpingJack", "Kolları tam yukarı aç, tempoyu koru"),
            tracked("cxA-squat-warmup", "Bodyweight Squat", { type: "reps", value: 15 }, "squat", "Dizler parmak ucu yönünde, taban yere basılı"),
            guided("cxA-arm-circles", "Arm Circles", { type: "reps", value: 20 }, REASON.armCircles, "Omuzdan büyük daireler çiz, öne 10 arkaya 10"),
            tracked("cxA-knee-raise", "Standing Knee Raise", { type: "perSide", value: 12 }, "kneeRaise", "Dizini kalça hizasına kaldır, gövde dik kalsın"),
          ],
        },
        {
          type: "superset",
          label: "Ana Blok",
          rounds: 3,
          restBetweenExercisesSec: 0,
          restAfterRoundSec: 75,
          exercises: [
            tracked("cxA-push-up", "Push-Up", { type: "repRange", min: 8, max: 12 }, "pushup", "Eller göğüs hizasında, boyun kırılmasın, karın sık", { sets: 3 }),
            tracked("cxA-squat", "Bodyweight Squat", { type: "repRange", min: 12, max: 15 }, "squat", "Kalçayı geriye it, dizler içeri çökmesin", { sets: 3 }),
            guided("cxA-pike-pushup", "Pike Push-Up", { type: "repRange", min: 6, max: 10 }, REASON.pikePushup, "Kalçayı yukarı al, başını eller arasına indir, omuza yükle", { sets: 3 }),
            tracked("cxA-glute-bridge", "Glute Bridge", { type: "reps", value: 15 }, "gluteBridge", "Kalçanı yukarıda sık, beli aşırı çukurlaştırma", { sets: 3 }),
          ],
        },
        {
          type: "straight",
          label: "Core",
          exercises: [
            guided("cxA-mountain-climber", "Mountain Climber", { type: "time", seconds: 30 }, REASON.mountainClimber, "Kalça yukarı zıplamasın, plank hattını koru, tempo sabit", { sets: 3, restSec: [45, 60] }),
          ],
        },
        plankFinisher("a"),
      ],
    },
    // ─────────────── ANTRENMAN B — Çarşamba (Pull + Lunge) ───────────────
    {
      id: "cxB",
      label: "Antrenman B",
      suggestedDay: "Çarşamba",
      blocks: [
        {
          type: "warmup",
          label: "Isınma",
          exercises: [
            tracked("cxB-high-knees", "High Knees", { type: "time", seconds: 40 }, "kneeRaise", "Dizleri kalça hizasına çek, kollar tempoya eşlik etsin"),
            tracked("cxB-lunge-warmup", "Lunge", { type: "perSide", value: 8 }, "lunge", "Diz öne fırlamasın, gövde hafif öne eğilsin"),
            guided("cxB-leg-swings", "Leg Swings", { type: "perSide", value: 10 }, REASON.legSwings, "Bacağı öne-arkaya kontrollü salla, gövde sabit"),
            tracked("cxB-knee-raise", "Standing Knee Raise", { type: "perSide", value: 12 }, "kneeRaise", "Dizini kalça hizasına kaldır, gövde dik kalsın"),
          ],
        },
        {
          type: "superset",
          label: "Ana Blok",
          rounds: 3,
          restBetweenExercisesSec: 0,
          restAfterRoundSec: 75,
          exercises: [
            tracked("cxB-lunge", "Lunge", { type: "perSide", value: 10 }, "lunge", "Diz öne fırlamasın, gövde hafif öne eğilsin", { sets: 3 }),
            guided("cxB-inverted-row", "Masa/Bar Row", { type: "repRange", min: 8, max: 12 }, REASON.invertedRow, "Masa kenarına asıl, göğsü kenara çek, gövde tek hat", { sets: 3 }),
            tracked("cxB-split-squat", "Split Squat", { type: "perSide", value: 8 }, "lunge", "Arka diz yere yakın, ön diz parmak ucunu geçmesin", { sets: 3 }),
            tracked("cxB-glute-bridge", "Glute Bridge", { type: "perSide", value: 12 }, "gluteBridge", "Kalçanı yukarıda sık, beli aşırı çukurlaştırma", { sets: 3 }),
          ],
        },
        {
          type: "straight",
          label: "Core",
          exercises: [
            tracked("cxB-leg-raise", "Leg Raise", { type: "repRange", min: 10, max: 12 }, "legRaise", "Bel yerden kalkmasın, bacakları kontrollü indir", { sets: 3, restSec: [45, 60] }),
            guided("cxB-hollow-hold", "Hollow Hold", { type: "time", seconds: 25 }, REASON.hollowHold, "Bel yere yapışık, omuzlar ve bacaklar hafif yerden", { sets: 2, restSec: [45, 60] }),
          ],
        },
        plankFinisher("b"),
      ],
    },
    // ─────────────── ANTRENMAN C — Cuma (Tam vücut karışık) ───────────────
    {
      id: "cxC",
      label: "Antrenman C",
      suggestedDay: "Cuma",
      blocks: [
        {
          type: "warmup",
          label: "Isınma",
          exercises: [
            tracked("cxC-jumping-jack", "Jumping Jack", { type: "time", seconds: 45 }, "jumpingJack", "Kolları tam yukarı aç, tempoyu koru"),
            tracked("cxC-squat-warmup", "Bodyweight Squat", { type: "reps", value: 15 }, "squat", "Dizler parmak ucu yönünde, taban yere basılı"),
            guided("cxC-arm-circles", "Arm Circles", { type: "reps", value: 20 }, REASON.armCircles, "Omuzdan büyük daireler çiz, öne 10 arkaya 10"),
            tracked("cxC-knee-raise", "Standing Knee Raise", { type: "perSide", value: 12 }, "kneeRaise", "Dizini kalça hizasına kaldır, gövde dik kalsın"),
          ],
        },
        {
          type: "superset",
          label: "Ana Blok",
          rounds: 3,
          restBetweenExercisesSec: 0,
          restAfterRoundSec: 75,
          exercises: [
            tracked("cxC-push-up", "Push-Up", { type: "repRange", min: 8, max: 12 }, "pushup", "Eller göğüs hizasında, boyun kırılmasın, karın sık", { sets: 3 }),
            tracked("cxC-squat", "Bodyweight Squat", { type: "repRange", min: 12, max: 15 }, "squat", "Tempo: 3 saniyede in, kontrollü kalk", { sets: 3 }),
            tracked("cxC-lunge", "Lunge", { type: "perSide", value: 10 }, "lunge", "Diz öne fırlamasın, gövde hafif öne eğilsin", { sets: 3 }),
            guided("cxC-dips", "Dips", { type: "repRange", min: 8, max: 12 }, REASON.dips, "Sandalye/masa kenarına otur, dirsekleri arkaya bük, omuz çökmesin", { sets: 3 }),
            guided("cxC-calf-raise", "Calf Raise", { type: "repRange", min: 15, max: 20 }, REASON.calfRaise, "Parmak ucuna kalk, tepede bir saniye sık, kontrollü in", { sets: 3 }),
          ],
        },
        {
          type: "straight",
          label: "Core",
          exercises: [
            guided("cxC-mountain-climber", "Mountain Climber", { type: "time", seconds: 30 }, REASON.mountainClimber, "Kalça yukarı zıplamasın, plank hattını koru, tempo sabit", { sets: 3, restSec: [45, 60] }),
          ],
        },
        plankFinisher("c"),
      ],
    },
  ],
};
