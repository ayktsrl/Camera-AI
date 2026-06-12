import { useCallback, useEffect, useRef, useState } from "react";
import "@fontsource-variable/space-grotesk";
import "./index.css";
import { usePoseTracking } from "./hooks/usePoseTracking";
import { useRepCounter } from "./hooks/useRepCounter";
import { createCoach } from "./lib/speech";
import { EXERCISES, getExercise } from "./exercises";

const STORAGE_KEYS = {
  voice: "formcoach_voice_v1",
  exercise: "formcoach_exercise_v1",
};

const MOTIVATION_AFTER_MS = 9000;
const MOTIVATION_COOLDOWN_MS = 14000;

const PHASE_ORDER = ["standing", "descent", "bottom", "ascent"];

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sessiz — kalıcılık opsiyonel */
  }
}

export default function App() {
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
    phase,
    repCount,
    faultyCount,
    warning,
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
      setRunning(false);
      return;
    }
    reset();
    setRunning(true);
  }

  const showSummary = !running && repCount > 0;
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
          <div className="stage-warning" role="alert">
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
            <p className="warning-text">{warning}</p>
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
        </section>

        <footer className="meta">
          <span>
            {personCount > 1
              ? `${personCount} kişi görünüyor — en yakındaki kilitli`
              : personCount === 1
                ? "1 kişi görünüyor"
                : "Kimse görünmüyor"}
          </span>
        </footer>
      </aside>
    </div>
  );
}
