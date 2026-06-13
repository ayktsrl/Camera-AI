// Serbest mod — tek egzersiz, kamera + canlı form analizi (v0.2 davranışı).
// Program Modu'na geçiş panel başlığındaki mod sekmesinden yapılır.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePoseTracking } from "../hooks/usePoseTracking";
import { useRepCounter } from "../hooks/useRepCounter";
import { createCoach } from "../lib/speech";
import { CAMERA_HINT_LABELS } from "../lib/faultRules";
import { readStored, writeStored } from "../lib/storage";
import { EXERCISES, getExercise } from "../exercises";

const STORAGE_KEYS = {
  voice: "formcoach_voice_v1",
  exercise: "formcoach_exercise_v1",
};

const MOTIVATION_AFTER_MS = 9000;
const MOTIVATION_COOLDOWN_MS = 14000;

const PHASE_ORDER = ["standing", "descent", "bottom", "ascent"];

export default function FreeMode({ onOpenProgram, onOpenCalibration }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const coachRef = useRef(null);
  if (coachRef.current === null) {
    coachRef.current = createCoach({ lang: "tr-TR" });
  }

  const [running, setRunning] = useState(false);
  const [voiceOn, setVoiceOn] = useState(() =>
    readStored(STORAGE_KEYS.voice, true)
  );
  const [exerciseId, setExerciseId] = useState(() =>
    readStored(STORAGE_KEYS.exercise, "squat")
  );

  const exercise = getExercise(exerciseId);

  useEffect(() => {
    coachRef.current.setEnabled(voiceOn);
    writeStored(STORAGE_KEYS.voice, voiceOn);
  }, [voiceOn]);

  useEffect(() => {
    writeStored(STORAGE_KEYS.exercise, exerciseId);
  }, [exerciseId]);

  const handleCoachEvent = useCallback((event) => {
    const coach = coachRef.current;
    if (event.type === "rep") {
      coach.sayCount(event.count);
    } else if (event.type === "warning") {
      coach.say(event.speech, { key: event.rule });
    }
  }, []);

  const {
    processFrame,
    reset,
    finishSet,
    phase,
    repCount,
    faultyCount,
    warning,
    warningSeverity,
    setSummary,
    repFlash,
    msSinceLastRep,
  } = useRepCounter({ exercise, running, onEvent: handleCoachEvent });

  const { status, errorMessage, personCount, hasActiveUser } = usePoseTracking({
    videoRef,
    canvasRef,
    onFrame: processFrame,
  });

  // Tekrarlar arası süre belirgin uzarsa motivasyon.
  useEffect(() => {
    if (!running || repCount < 1) return undefined;

    const interval = setInterval(() => {
      if (msSinceLastRep() > MOTIVATION_AFTER_MS) {
        coachRef.current.say("Hadi, devam!", {
          key: "motivation",
          cooldownMs: MOTIVATION_COOLDOWN_MS,
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [running, repCount, msSinceLastRep]);

  function handleToggleRun() {
    if (running) {
      finishSet();
      setRunning(false);
      return;
    }
    reset();
    setRunning(true);
  }

  const summaryRules = setSummary?.rules ?? [];
  const violatedRules = summaryRules.filter((r) => r.fires > 0);
  const unevaluatedRules = summaryRules.filter((r) => r.unevaluated);
  const showSummary =
    !running && setSummary != null && (repCount > 0 || violatedRules.length > 0);
  const cleanReps = repCount - Math.min(faultyCount, repCount);

  let stageNotice = null;
  if (status === "loading") {
    stageNotice = "Model yükleniyor…";
  } else if (status === "error") {
    stageNotice = errorMessage;
  } else if (running && !hasActiveUser) {
    stageNotice = "Kullanıcı bekleniyor — kameranın karşısına geç";
  }

  return (
    <div className="app">
      <main className="stage">
        <video ref={videoRef} className="stage-video" />
        <canvas ref={canvasRef} className="stage-canvas" />

        {stageNotice && (
          <div className="stage-notice">
            <span>{stageNotice}</span>
          </div>
        )}

        {warning && running && (
          <div
            className={
              warningSeverity === "critical"
                ? "stage-warning stage-warning--critical"
                : "stage-warning"
            }
            role="alert"
          >
            {warning}
          </div>
        )}

        {running && (
          <div className="stage-count" key={repFlash} aria-label="Tekrar sayısı">
            {repCount}
          </div>
        )}
      </main>

      <aside className="panel">
        <header className="brand">
          <h1>
            FormCoach<span className="brand-dot">.</span>
          </h1>
          <p className="brand-sub">Kameradan canlı form analizi</p>
          <nav className="modes" aria-label="Mod seçimi">
            <span className="mode mode-active">Serbest</span>
            <button type="button" className="mode" onClick={onOpenProgram}>
              Program
            </button>
          </nav>
        </header>

        <section className="block">
          <label className="block-label" htmlFor="exercise-select">
            Egzersiz
          </label>
          <select
            id="exercise-select"
            className="exercise-select"
            value={exerciseId}
            disabled={running}
            onChange={(e) => setExerciseId(e.target.value)}
          >
            {EXERCISES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
        </section>

        <section className="block">
          <span className="block-label">Faz</span>
          <ol className="phases">
            {PHASE_ORDER.map((p) => (
              <li
                key={p}
                className={
                  running && phase === p ? "phase phase-active" : "phase"
                }
              >
                {exercise.phaseLabels[p]}
              </li>
            ))}
          </ol>
        </section>

        <section className="block warning-block" aria-live="polite">
          {running && warning ? (
            <p
              className={
                warningSeverity === "critical"
                  ? "warning-text warning-text--critical"
                  : "warning-text"
              }
            >
              {warning}
            </p>
          ) : (
            <p className="warning-placeholder">
              {running ? "Form izleniyor" : "—"}
            </p>
          )}
        </section>

        {showSummary && (
          <section className="block summary">
            <span className="block-label">Set özeti</span>
            <dl>
              <div>
                <dt>Toplam tekrar</dt>
                <dd>{repCount}</dd>
              </div>
              <div>
                <dt>Temiz</dt>
                <dd>{cleanReps}</dd>
              </div>
              <div>
                <dt>Hatalı</dt>
                <dd>{faultyCount}</dd>
              </div>
            </dl>

            {violatedRules.length > 0 && (
              <ul className="summary-faults">
                {violatedRules.map((rule) => (
                  <li key={rule.id} data-severity={rule.severity}>
                    <span>{rule.label}</span>
                    <span className="summary-fault-count">{rule.fires}</span>
                  </li>
                ))}
              </ul>
            )}

            {unevaluatedRules.length > 0 && (
              <p className="summary-note">
                Değerlendirilemedi:{" "}
                {unevaluatedRules
                  .map(
                    (rule) =>
                      `${rule.label} (${CAMERA_HINT_LABELS[rule.cameraHint] ?? CAMERA_HINT_LABELS.any})`
                  )
                  .join(", ")}
              </p>
            )}
          </section>
        )}

        <section className="block controls">
          <button
            type="button"
            className={running ? "btn btn-stop" : "btn btn-start"}
            onClick={handleToggleRun}
            disabled={status !== "ready"}
          >
            {running ? "Seti bitir" : "Başlat"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setVoiceOn((v) => !v)}
            aria-pressed={voiceOn}
          >
            {voiceOn ? "Ses açık" : "Ses kapalı"}
          </button>
          {onOpenCalibration && (
            <button
              type="button"
              className="btn btn-ghost btn-calibrate"
              onClick={onOpenCalibration}
              disabled={running}
              title="Eşikleri canlı ayarla (geliştirici)"
            >
              Kalibrasyon
            </button>
          )}
        </section>

        <footer className="meta">
          <span>
            {personCount > 1
              ? `${personCount} kişi görünüyor — en yakındaki kilitli`
              : personCount === 1
                ? "1 kişi görünüyor"
                : "Kimse görünmüyor"}
          </span>
          <span className="meta-hint">
            Önerilen kamera: 45° çapraz, ~2 m, kalça-diz yüksekliği
          </span>
        </footer>
      </aside>
    </div>
  );
}
