// Seans-sonrası form raporu ekranı — seans bitince yapılandırılmış, DÜRÜST özet.
//
// Veri kaynağı: programPlayer.getDaySummary() → lib/sessionReport.buildSessionReport().
// Yeni takip mantığı YOK; repEngine/holdEngine'in seans boyunca ürettiği
// rep/fault/süre verisi yüzeye çıkarılır. Takip edilmeyen hareketler "takip
// edilmedi, manuel" diye dürüstçe işaretlenir — uydurma sayı/skor yok.
//
// Tasarım dili: mevcut minimal day-summary deseni (tipografi öncelikli, hairline
// ayraçlar, tabular sayılar). Eyes-free: mount'ta seans-sonu anonsu (DaySummary
// ile aynı davranış — owner ekrana bakmadan bittiğini duyar).

import { useEffect, useRef } from "react";
import { sessionDone } from "../lib/coachLines";
import { buildSessionReport, TRACK_KIND } from "../lib/sessionReport";

const KIND_BADGE = {
  [TRACK_KIND.REP]: { text: "takip edildi", tone: "tracked" },
  [TRACK_KIND.HOLD]: { text: "takip edildi", tone: "tracked" },
  [TRACK_KIND.UNTRACKED]: { text: "takip edilmedi · manuel", tone: "manual" },
  [TRACK_KIND.SKIPPED]: { text: "atlandı", tone: "skipped" },
};

function ExerciseRow({ item }) {
  const badge = KIND_BADGE[item.kind];
  const { form, grade } = item;

  return (
    <li className="report-exercise">
      <div className="report-ex-head">
        <span className="report-ex-name">{item.name}</span>
        <span className="report-ex-badge" data-tone={badge.tone}>
          {badge.text}
        </span>
      </div>

      <div className="report-ex-meta">
        <span className="report-ex-sets">{item.setCount} set</span>
        {item.kind !== TRACK_KIND.SKIPPED && (
          <span className="report-ex-reps">
            {item.setLines.join(" · ")}
            {item.repUnit ? " tekrar" : ""}
          </span>
        )}
      </div>

      {/* Takipli rep seti: temiz/hatalı + değerlendirme */}
      {item.kind === TRACK_KIND.REP && form && (
        <div className="report-ex-form">
          <span className="report-form-line">
            {form.clean} temiz · {form.faulty} hatalı
            {grade && (
              <span
                className="report-grade"
                data-grade={grade.label}
              >
                {grade.label}
              </span>
            )}
          </span>
          {form.rules.length > 0 && (
            <ul className="report-faults">
              {form.rules.map((rule) => (
                <li key={rule.id} data-severity={rule.severity}>
                  <span>{rule.label}</span>
                  <span className="report-fault-count">{rule.fires}</span>
                </li>
              ))}
            </ul>
          )}
          {form.anyUnevaluated && (
            <p className="report-note">
              Bazı kurallar bu sette değerlendirilemedi (kamera açısı/görüş).
            </p>
          )}
        </div>
      )}

      {/* Takipli izometrik (plank): tutulan süre + uyarılar */}
      {item.kind === TRACK_KIND.HOLD && form && (
        <div className="report-ex-form">
          <span className="report-form-line">
            Toplam {form.heldSeconds} sn tutuldu
          </span>
          {form.rules.length > 0 && (
            <ul className="report-faults">
              {form.rules.map((rule) => (
                <li key={rule.id} data-severity={rule.severity}>
                  <span>{rule.label}</span>
                  <span className="report-fault-count">{rule.fires}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Takip edilmeyen (rehberli/makine): dürüst not — form verisi YOK */}
      {item.kind === TRACK_KIND.UNTRACKED && (
        <p className="report-note">
          Kameradan takip yok — form verisi kaydedilmedi.
        </p>
      )}
    </li>
  );
}

export default function SessionReport({ summary, onFinish, coach }) {
  const report = buildSessionReport(summary);

  // Eyes-free: seans bitti anonsu bir kez (mount). coach yoksa sessiz.
  const spokenRef = useRef(false);
  useEffect(() => {
    if (spokenRef.current || !coach?.announce) return;
    spokenRef.current = true;
    coach.announce(sessionDone(report.totalSets), { interrupt: true });
  }, [coach, report.totalSets]);

  return (
    <section className="day-summary session-report">
      <p className="program-kicker">{report.dayLabel}</p>
      <h2 className="program-title">Seans raporu</h2>
      <p className="program-note">
        {report.totalSets} set · {report.exerciseCount} hareket
        {report.totalSets < report.plannedSets &&
          ` (planlanan ${report.plannedSets} set)`}
      </p>

      {/* Seans özeti şeridi — takipli rakamların özeti (gerçek veri). */}
      <div className="report-totals">
        <div className="report-total">
          <span className="report-total-val">{report.trackedCount}</span>
          <span className="report-total-label">takip edilen hareket</span>
        </div>
        {report.totals.trackedReps > 0 && (
          <div className="report-total">
            <span className="report-total-val">
              {report.totals.trackedClean}/{report.totals.trackedReps}
            </span>
            <span className="report-total-label">temiz tekrar</span>
          </div>
        )}
        {report.totals.trackedHeldSeconds > 0 && (
          <div className="report-total">
            <span className="report-total-val">
              {report.totals.trackedHeldSeconds}
            </span>
            <span className="report-total-label">sn tutuş</span>
          </div>
        )}
        {report.untrackedCount > 0 && (
          <div className="report-total">
            <span className="report-total-val">{report.untrackedCount}</span>
            <span className="report-total-label">manuel hareket</span>
          </div>
        )}
      </div>

      <ul className="report-exercises">
        {report.exercises.map((item) => (
          <ExerciseRow key={item.exerciseId} item={item} />
        ))}
      </ul>

      <div className="summary-reminders">
        {report.cardio && (
          <p>
            Kardiyo: {report.cardio.trainingDayMin} dk (antrenman günü), nabız{" "}
            {report.cardio.hrBpm[0]}–{report.cardio.hrBpm[1]} bpm
          </p>
        )}
        {report.plank && (
          <p>
            Plank: haftada {report.plank.perWeek} gün, kardiyo sonrası{" "}
            {report.plank.sets} set max
          </p>
        )}
      </div>

      <button type="button" className="btn btn-start set-done" onClick={onFinish}>
        Bitti
      </button>
    </section>
  );
}
