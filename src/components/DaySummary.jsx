// Gün özeti — hareket başına set×tekrar dökümü, squat slotlarında form özeti
// (temiz/hatalı + kural ihlal dağılımı, serbest moddaki özet diliyle aynı)
// ve genel kural hatırlatmaları (kardiyo 30/40 dk 110–130 bpm, plank).

function setLine(entry) {
  if (entry.reps != null) return String(entry.reps);
  if (entry.seconds != null) return `${entry.seconds} sn`;
  return "—";
}

/**
 * Pose setlerinin form toplamı: kural bazında ihlal sayısı + (rep setlerinde
 * temiz/hatalı, izometrik setlerde toplam tutulan süre). İki tip ayrılır:
 *  - rep summary  → { repCount, faultyCount, rules }
 *  - hold summary → { heldSeconds, rules }   (plank)
 */
function aggregateForm(sets) {
  const poseSets = sets.filter((s) => s.summary != null);
  if (poseSets.length === 0) return null;

  const isometric = poseSets.every((s) => s.summary.heldSeconds != null);

  let reps = 0;
  let faulty = 0;
  let heldSeconds = 0;
  const ruleFires = new Map();
  for (const set of poseSets) {
    reps += set.summary.repCount ?? 0;
    faulty += set.summary.faultyCount ?? 0;
    heldSeconds += set.summary.heldSeconds ?? 0;
    for (const rule of set.summary.rules ?? []) {
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
  return {
    isometric,
    heldSeconds,
    clean: reps - Math.min(faulty, reps),
    faulty,
    rules: [...ruleFires.values()],
  };
}

export default function DaySummary({ summary, onFinish }) {
  return (
    <section className="day-summary">
      <p className="program-kicker">{summary.dayLabel}</p>
      <h2 className="program-title">Gün tamamlandı</h2>
      <p className="program-note">
        {summary.totalSets} set yapıldı
        {summary.totalSets < summary.plannedSets &&
          ` (planlanan ${summary.plannedSets})`}
      </p>

      <ul className="summary-exercises">
        {summary.exercises.map((group) => {
          const form = aggregateForm(group.sets);
          return (
            <li key={group.exerciseId} className="summary-exercise">
              <div className="summary-ex-head">
                <span className="summary-ex-name">{group.name}</span>
                <span className="summary-ex-sets">{group.sets.length} set</span>
              </div>
              <p className="summary-ex-reps">
                {group.sets.map(setLine).join(" · ")}
                {group.sets[0]?.reps != null ? " tekrar" : ""}
              </p>
              {form && (
                <div className="summary-ex-form">
                  <span>
                    {form.isometric
                      ? `Toplam ${form.heldSeconds} sn tutuldu`
                      : `Form: ${form.clean} temiz · ${form.faulty} hatalı`}
                  </span>
                  {form.rules.length > 0 && (
                    <ul className="summary-faults">
                      {form.rules.map((rule) => (
                        <li key={rule.id} data-severity={rule.severity}>
                          <span>{rule.label}</span>
                          <span className="summary-fault-count">
                            {rule.fires}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="summary-reminders">
        {summary.cardio && (
          <p>
            Kardiyo: {summary.cardio.trainingDayMin} dk (antrenman günü),{" "}
            nabız {summary.cardio.hrBpm[0]}–{summary.cardio.hrBpm[1]} bpm
          </p>
        )}
        {summary.plank && (
          <p>
            Plank: haftada {summary.plank.perWeek} gün, kardiyo sonrası{" "}
            {summary.plank.sets} set max
          </p>
        )}
      </div>

      <button type="button" className="btn btn-start set-done" onClick={onFinish}>
        Bitti
      </button>
    </section>
  );
}
