// Pose-takipli set ekranı — squat slotları: kamera açılır, mevcut motor
// (Precision kuralları + rep FSM) otomatik sayar, hedefe ulaşınca set biter.
// Elle bitirme her zaman mümkün. Bileşen unmount olunca kamera kapanır.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePoseTracking } from "../hooks/usePoseTracking";
import { useRepCounter } from "../hooks/useRepCounter";
import { getExercise } from "../exercises";
import {
  doseLabel,
  doseTargetReps,
  slotPositionLabel,
} from "../lib/programPlayer";

export default function PoseSetScreen({ slot, coach, onComplete }) {
  const { exercise, block } = slot;
  const exerciseDef = getExercise(exercise.ruleSetRef);
  const target = doseTargetReps(exercise.dose);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [running, setRunning] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);

  const handleCoachEvent = useCallback(
    (event) => {
      if (event.type === "rep") {
        coach.sayCount(event.count);
      } else if (event.type === "warning") {
        coach.say(event.speech, { key: event.rule });
      }
    },
    [coach]
  );

  const {
    processFrame,
    reset,
    finishSet,
    repCount,
    faultyCount,
    warning,
    warningSeverity,
    setSummary,
    repFlash,
  } = useRepCounter({ exercise: exerciseDef, running, onEvent: handleCoachEvent });

  const { status, errorMessage, hasActiveUser } = usePoseTracking({
    videoRef,
    canvasRef,
    onFrame: processFrame,
  });

  // Kamera hazır olunca set otomatik başlar.
  useEffect(() => {
    if (status !== "ready" || startedRef.current) return;
    startedRef.current = true;
    reset();
    setRunning(true);
  }, [status, reset]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setRunning(false);
    finishSet();
    setFinishing(true);
  }, [finishSet]);

  // Hedefe ulaşınca set otomatik biter.
  useEffect(() => {
    if (!running || target == null) return;
    if (repCount >= target) finish();
  }, [repCount, running, target, finish]);

  // finishSet sonrası özet state'e düşünce sonucu teslim et.
  useEffect(() => {
    if (!finishing || setSummary == null) return;
    onComplete({
      reps: setSummary.repCount,
      summary: {
        repCount: setSummary.repCount,
        faultyCount: setSummary.faultyCount,
        rules: setSummary.rules,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishing, setSummary]);

  let stageNotice = null;
  if (status === "loading") {
    stageNotice = "Model yükleniyor…";
  } else if (status === "error") {
    stageNotice = errorMessage;
  } else if (running && !hasActiveUser) {
    stageNotice = "Kullanıcı bekleniyor — kameranın karşısına geç";
  }

  return (
    <section className="player player--pose">
      <div className="stage player-stage">
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
      </div>

      <div className="player-pose-panel">
        <p className="player-position">
          {block.label} · {slotPositionLabel(slot)}
        </p>
        <h2 className="player-exercise">{exercise.name}</h2>
        {exercise.coachNote && (
          <p className="coach-note">“{exercise.coachNote}”</p>
        )}
        <p className="player-dose">
          {doseLabel(exercise.dose)}
          {target != null && ` · hedefte set otomatik biter`}
        </p>

        <div className="player-links">
          <a
            className="video-link"
            href={exercise.videoUrl}
            target="_blank"
            rel="noreferrer"
          >
            Video — YouTube
          </a>
          <span className="meta-hint">Kamera: 45° çapraz, ~2 m</span>
        </div>

        <button
          type="button"
          className="btn btn-stop set-done"
          onClick={finish}
          disabled={status === "loading"}
        >
          Seti bitir{repCount > 0 && faultyCount > 0 ? ` (${faultyCount} hatalı)` : ""}
        </button>
      </div>
    </section>
  );
}
