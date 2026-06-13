// İzometrik tutuş set ekranı — PLANK gibi süre-tutma hareketleri.
// PoseSetScreen'in (rep) izole kardeşi: rep yerine YUKARI SAYAN hold timer gösterir.
// Kamera açılır, holdEngine geçerli plank pozisyonunu tespit eder, süre akar,
// form bozulunca uyarır. Kullanıcı bırakınca / çok bozunca (holdEngine "end") set biter.
// Bileşen unmount olunca kamera kapanır. Rep akışına SIFIR dokunuş.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePoseTracking } from "../hooks/usePoseTracking";
import { useHoldCounter } from "../hooks/useHoldCounter";
import { getExercise } from "../exercises";
import { doseLabel, slotPositionLabel } from "../lib/programPlayer";
import { setDoneHold, warningSayOptions } from "../lib/coachLines";
import ExercisePreview from "./ExercisePreview";

const ABSENCE_REMINDER_MS = 45000;

/** Saniyeyi "X sn" (60 altı) veya "m:ss" (60+) biçimine getirir. */
function formatHold(sec) {
  if (sec < 60) return `${sec}`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PoseHoldScreen({
  slot,
  coach,
  onComplete,
  paused = false,
  handsFree = false,
  facingMode = "user",
}) {
  const { exercise, block } = slot;
  const exerciseDef = getExercise(exercise.ruleSetRef);
  const cameraHint = exerciseDef.cameraHint ?? "Kamera: yandan, ~2 m";

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [running, setRunning] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);

  const absenceSinceRef = useRef(null);
  const reminderFiredRef = useRef(false);

  const handleCoachEvent = useCallback(
    (event) => {
      if (event.type === "warning") {
        // Kritik form hatası (bel hattı vb.) öne çıkar; major/minor mevcut desende.
        coach.say(event.speech, warningSayOptions(event));
      }
    },
    [coach]
  );

  const {
    processFrame,
    reset,
    finishSet,
    phase,
    heldSeconds,
    warning,
    warningSeverity,
    setSummary,
    ended,
  } = useHoldCounter({
    exercise: exerciseDef,
    running: running && !paused,
    onEvent: handleCoachEvent,
  });

  const { status, errorMessage, hasActiveUser } = usePoseTracking({
    videoRef,
    canvasRef,
    onFrame: processFrame,
    facingMode,
  });

  // Kamera hazır olunca set otomatik başlar.
  useEffect(() => {
    if (status !== "ready" || startedRef.current) return;
    startedRef.current = true;
    reset();
    setRunning(true);
  }, [status, reset]);

  // Akıllı duraklama (yokluk) — 45 sn'de TEK nazik ses.
  useEffect(() => {
    if (paused || status !== "ready") return;
    if (hasActiveUser) {
      absenceSinceRef.current = null;
      reminderFiredRef.current = false;
      return undefined;
    }
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
    // Set bitti — eyes-free KRİTİK geçiş, asla sessiz kalmaz. Tutulan süreyi de söyle.
    coach.announce(setDoneHold(heldSeconds), { interrupt: true });
    finishSet();
    setFinishing(true);
  }, [finishSet, coach, heldSeconds]);

  // Hands-free: holdEngine "end" sinyali (pozisyon çok uzun bozuk) → set otomatik biter.
  useEffect(() => {
    if (!running || !ended || !handsFree) return;
    finish();
  }, [ended, running, handsFree, finish]);

  // finishSet sonrası özet state'e düşünce sonucu teslim et (seconds + summary).
  useEffect(() => {
    if (!finishing || setSummary == null) return;
    onComplete({
      seconds: setSummary.heldSeconds,
      summary: {
        heldSeconds: setSummary.heldSeconds,
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
    stageNotice = "Bekleniyor…";
  } else if (running && phase === "idle") {
    stageNotice = "Plank pozisyonuna geç";
  } else if (running && phase === "broken") {
    // Süre duraklar — "saymıyor" demeden nazik im (owner: demeden bekle).
    stageNotice = "Pozisyonu düzelt";
  }

  return (
    <section className="player player--pose">
      <div
        className={
          facingMode === "user"
            ? "stage player-stage stage--mirrored"
            : "stage player-stage"
        }
      >
        <video ref={videoRef} className="stage-video" />
        <canvas ref={canvasRef} className="stage-canvas" />

        {/* UZAKTAN OKUNUR: aktif hareket adı sahne üst şeridinde. */}
        {running && (
          <p className="stage-exercise-name" aria-hidden="true">
            {exercise.name}
          </p>
        )}

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
          <div
            className={
              phase === "holding"
                ? "stage-count stage-count--hold stage-count--holding"
                : "stage-count stage-count--hold"
            }
            aria-label="Tutulan süre"
          >
            {formatHold(heldSeconds)}
            <span className="stage-count-unit">sn</span>
          </div>
        )}
      </div>

      <div className="player-pose-panel">
        <p className="player-position">
          {block.label} · {slotPositionLabel(slot)}
        </p>
        <div className="player-exercise-head">
          <ExercisePreview exercise={exercise} size="sm" />
          <h2 className="player-exercise">{exercise.name}</h2>
        </div>
        {exercise.coachNote && (
          <p className="coach-note">“{exercise.coachNote}”</p>
        )}
        <p className="player-dose">
          {doseLabel(exercise.dose)} · şu ana kadar {heldSeconds} sn
        </p>

        <div className="player-links">
          <span className="meta-hint">{cameraHint}</span>
        </div>

        {/* Hands-free'de akışı Duraklat/Bitir (ProgramMode) yönetir;
            manuel "Seti bitir" yalnız klasik modda — "X saniye tuttun". */}
        {!handsFree && (
          <button
            type="button"
            className="btn btn-stop set-done"
            onClick={finish}
            disabled={status === "loading"}
          >
            Seti bitir{heldSeconds > 0 ? ` · ${heldSeconds} sn tuttun` : ""}
          </button>
        )}
      </div>
    </section>
  );
}
