// Seans-sonrası form raporu — SAF modül (React/tarayıcı bağımsız).
//
// Görev: programPlayer.getDaySummary() çıktısını alır, ekranda gösterilecek
// yapılandırılmış bir rapora ÇEVİRİR. Yeni takip mantığı YOK — yalnızca
// repEngine/holdEngine'in seans boyunca ürettiği veriyi (set log + summary)
// dürüstçe yüzeye çıkarır.
//
// DÜRÜSTLÜK SÖZLEŞMESİ (kuzey yıldızı: takip kusursuzluğu):
//   - Bir set'in form verisi YALNIZCA log entry'sinde summary varsa gösterilir.
//     summary = repEngine.getSummary() / holdEngine özeti → gerçekten takip edilmiş.
//   - summary YOKSA hareket "takip edilmedi" damgası alır. Uydurma skor/sayı YOK.
//   - reps/seconds null + summary null → set ATLANDI olarak işaretlenir.
//   - "değerlendirilemedi" (unevaluated) kurallar şeffaf gösterilir; sessiz PASS yok.

/** Bir hareket grubunun takip tipi. */
export const TRACK_KIND = {
  REP: "rep", // pose ile sayılan tekrar (repEngine summary)
  HOLD: "hold", // izometrik tutuş (holdEngine summary)
  UNTRACKED: "untracked", // rehberli/makine — kameradan takip yok
  SKIPPED: "skipped", // hiç yapılmadı (atlandı)
};

/** Bir set log entry'si gerçekten takip edildi mi? (summary = tek doğruluk kaynağı) */
function isTrackedSet(entry) {
  return entry.summary != null;
}

/** Set "atlandı" mı? Hiç sonuç yok: rep yok, süre yok, takip yok. */
function isSkippedSet(entry) {
  return entry.summary == null && entry.reps == null && entry.seconds == null;
}

/**
 * Bir hareket grubunun (aynı id'li setler) form toplamı.
 * DaySummary'deki aggregateForm ile aynı veri okuması; burada saf + test edilebilir.
 * @returns {object|null} takipli set yoksa null
 */
function aggregateForm(sets) {
  const poseSets = sets.filter(isTrackedSet);
  if (poseSets.length === 0) return null;

  // Tüm takipli setler heldSeconds taşıyorsa izometrik (plank); aksi hâlde rep.
  const isometric = poseSets.every((s) => s.summary.heldSeconds != null);

  let reps = 0;
  let faulty = 0;
  let heldSeconds = 0;
  let anyUnevaluated = false;
  const ruleFires = new Map();

  for (const set of poseSets) {
    reps += set.summary.repCount ?? 0;
    faulty += set.summary.faultyCount ?? 0;
    heldSeconds += set.summary.heldSeconds ?? 0;
    for (const rule of set.summary.rules ?? []) {
      if (rule.unevaluated) anyUnevaluated = true;
      if (!rule.fires) continue;
      const prev = ruleFires.get(rule.id);
      ruleFires.set(rule.id, {
        id: rule.id,
        label: rule.label,
        severity: rule.severity,
        fires: (prev?.fires ?? 0) + rule.fires,
      });
    }
  }

  // Hatalı sayısı tekrar sayısını aşamaz (savunmacı).
  const cleanReps = Math.max(0, reps - Math.min(faulty, reps));

  return {
    isometric,
    reps,
    heldSeconds,
    clean: cleanReps,
    faulty,
    anyUnevaluated,
    // En ağırdan hafife sıralı kural listesi (kritik üstte).
    rules: [...ruleFires.values()].sort(
      (a, b) => severityWeight(b.severity) - severityWeight(a.severity)
    ),
  };
}

function severityWeight(severity) {
  if (severity === "critical") return 3;
  if (severity === "major") return 2;
  if (severity === "minor") return 1;
  return 0;
}

/**
 * Basit form değerlendirmesi — SADECE takipli rep setleri için.
 * Gerçek temiz/hatalı oranından türetilir; uydurma puan değil.
 * @returns {{label:string, ratio:number}|null}
 */
export function gradeRepForm(form) {
  if (!form || form.isometric) return null;
  const total = form.clean + form.faulty;
  if (total === 0) return null;
  const ratio = form.clean / total;
  let label;
  if (ratio >= 0.9) label = "Temiz";
  else if (ratio >= 0.7) label = "İyi";
  else if (ratio >= 0.4) label = "Gelişmeli";
  else label = "Forma dikkat";
  return { label, ratio };
}

/**
 * Bir set'in tek satırlık dökümü ("12" / "30 sn" / "atlandı").
 */
function setLine(entry) {
  if (isSkippedSet(entry)) return "atlandı";
  if (entry.reps != null) return String(entry.reps);
  if (entry.seconds != null) return `${entry.seconds} sn`;
  return "—";
}

/**
 * Bir hareket grubunu rapor kalemine çevirir.
 */
function buildExerciseItem(group) {
  const sets = group.sets;
  const form = aggregateForm(sets);
  const allSkipped = sets.every(isSkippedSet);
  const anyTracked = sets.some(isTrackedSet);

  let kind;
  if (allSkipped) kind = TRACK_KIND.SKIPPED;
  else if (form?.isometric) kind = TRACK_KIND.HOLD;
  else if (anyTracked) kind = TRACK_KIND.REP;
  else kind = TRACK_KIND.UNTRACKED;

  return {
    exerciseId: group.exerciseId,
    name: group.name,
    blockLabel: group.blockLabel,
    setCount: sets.length,
    setLines: sets.map(setLine),
    // Rep dozlu setler "X · Y tekrar" der; süre dozluda birim setLine'da.
    repUnit: sets[0]?.reps != null,
    kind,
    tracked: kind === TRACK_KIND.REP || kind === TRACK_KIND.HOLD,
    form, // null veya { isometric, clean, faulty, heldSeconds, rules, ... }
    grade: gradeRepForm(form),
  };
}

/**
 * Seans raporu — getDaySummary() çıktısından yapılandırılmış, dürüst özet.
 * @param {object} daySummary programPlayer.getDaySummary() sonucu
 * @returns {object} rapor
 */
export function buildSessionReport(daySummary) {
  const exercises = (daySummary.exercises ?? []).map(buildExerciseItem);

  const trackedCount = exercises.filter((e) => e.tracked).length;
  const untrackedCount = exercises.filter(
    (e) => e.kind === TRACK_KIND.UNTRACKED
  ).length;
  const skippedCount = exercises.filter(
    (e) => e.kind === TRACK_KIND.SKIPPED
  ).length;

  // Seans toplamları — takipli setlerden gerçek rakamlar.
  let totalReps = 0;
  let totalFaulty = 0;
  let totalHeldSeconds = 0;
  for (const ex of exercises) {
    if (!ex.form) continue;
    totalReps += ex.form.reps;
    totalFaulty += ex.form.faulty;
    totalHeldSeconds += ex.form.heldSeconds;
  }

  return {
    dayId: daySummary.dayId,
    dayLabel: daySummary.dayLabel,
    totalSets: daySummary.totalSets,
    plannedSets: daySummary.plannedSets,
    exerciseCount: exercises.length,
    trackedCount,
    untrackedCount,
    skippedCount,
    totals: {
      trackedReps: totalReps,
      trackedClean: Math.max(0, totalReps - Math.min(totalFaulty, totalReps)),
      trackedFaulty: totalFaulty,
      trackedHeldSeconds: totalHeldSeconds,
    },
    exercises,
    // Genel kural hatırlatmaları aynen taşınır (DaySummary ile birebir).
    cardio: daySummary.cardio,
    plank: daySummary.plank,
  };
}
