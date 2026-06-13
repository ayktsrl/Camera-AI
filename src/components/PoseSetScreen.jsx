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
import ExercisePreview from "./ExercisePreview";

// >45 sn yokluk → TEK nazik sesli hatırlatma (owner kararı). Sonra sessiz.
const ABSENCE_REMINDER_MS = 45000;

export default function PoseSetScreen({
  slot,
  coach,
  onComplete,
  repVoice = true,
  paused = false,
  handsFree = false,
}) {
  const { exercise, block } = slot;
  const exerciseDef = getExercise(exercise.ruleSetRef);
  const target = doseTargetReps(exercise.dose);
  const cameraHint = exerciseDef.cameraHint ?? "Kamera: 45° çapraz, ~2 m";

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [running, setRunning] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);

  // Akıllı duraklama: kullanıcı kareden çıkınca sayım sessizce durur (motor
  // zaten frame=null'da ilerlemez); >45 sn yoklukta TEK nazik ses.
  const absenceSinceRef = useRef(null);
  const reminderFiredRef = useRef(false);

  // Tekrar sayımı sesi ayardan kapatılabilir (varsayılan açık) — owner kararı 1.
  const repVoiceRef = useRef(repVoice);
  useEffect(() => {
    repVoiceRef.current = repVoice;
  }, [repVoice]);

  const handleCoachEvent = useCallback(
    (event) => {
      if (event.type === "rep") {
        if (repVoiceRef.current) coach.sayCount(event.count);
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
  } = useRepCounter({
    exercise: exerciseDef,
    // Pause veya akıllı-duraklama → motor beslenmez (sayım sessizce donar).
    running: running && !paused,
    onEvent: handleCoachEvent,
  });

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

  // Akıllı duraklama: kullanıcı kareden çıkınca süreyi izle; 45 sn'de TEK ses.
  useEffect(() => {
    if (paused || status !== "ready") return;
    if (hasActiveUser) {
      absenceSinceRef.current = null;
      reminderFiredRef.current = false;
      return undefined;
    }
    // Kullanıcı yok — sayaç başlat, 45 sn'de tek hatırlatma.
    if (absenceSinceRef.current == null) absenceSinceRef.current = Date.now();
    const timer = setInterval(() => {
      if (reminderFiredRef.current || absenceSinceRef.current == null) return;
      if (Date.now() - absenceSinceRef.current >= ABSENCE_REMINDER_MS) {
        reminderFiredRef.current = true;
        coach.announce("Hazır olduğunda devam edelim", { interrupt: true });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [hasActiveUser, paused, status, coach]);

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
  } else if (paused) {
    stageNotice = "Duraklatıldı";
  } else if (running && !hasActiveUser) {
    // Akıllı duraklama — sessiz nötr im (owner: "demeden bekle").
    stageNotice = "Bekleniyor…";
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
        <div className="player-exercise-head">
          {/* Kamera ana sahne — önizleme küçük (sm) kalır, kamerayı ezmez. */}
          <ExercisePreview exercise={exercise} size="sm" />
          <h2 className="player-exercise">{exercise.name}</h2>
        </div>
        {exercise.coachNote && (
          <p className="coach-note">“{exercise.coachNote}”</p>
        )}
        <p className="player-dose">
          {doseLabel(exercise.dose)}
          {target != null && ` · hedefte set otomatik biter`}
        </p>

        <div className="player-links">
          <span className="meta-hint">{cameraHint}</span>
        </div>

        {/* Hands-free'de akışı tek Duraklat butonu (ProgramMode) yönetir;
            manuel "Seti bitir" yalnız klasik (handsFree=false) modda. */}
        {!handsFree && (
          <button
            type="button"
            className="btn btn-stop set-done"
            onClick={finish}
            disabled={status === "loading"}
          >
            Seti bitir{repCount > 0 && faultyCount > 0 ? ` (${faultyCount} hatalı)` : ""}
          </button>
        )}
      </div>
    </section>
  );
}
