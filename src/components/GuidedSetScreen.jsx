// Rehberli set ekranı — kameradan takip edilemeyen hareketler.
// Hoca notu görsel hiyerarşide ikinci sırada (ürünün ruhu bu satır);
// büyük dokunmatik "Set bitti" + elle tekrar girişi (hedef varsayılan dolu).
// Süre dozlarında (45 sn ısınma, 30–40 sn stretch) geri sayımlı tutuş sayacı.

import { useEffect, useRef, useState } from "react";
import {
  doseLabel,
  doseTargetReps,
  doseTargetSeconds,
  slotPositionLabel,
} from "../lib/programPlayer";
import ExercisePreview from "./ExercisePreview";

export default function GuidedSetScreen({ slot, onComplete }) {
  const { exercise, block } = slot;
  const targetReps = doseTargetReps(exercise.dose);
  const targetSeconds = doseTargetSeconds(exercise.dose);
  const timeBased = targetSeconds != null;

  const [reps, setReps] = useState(targetReps ?? "");
  const [timerLeft, setTimerLeft] = useState(targetSeconds);
  const [timerOn, setTimerOn] = useState(false);
  const doneRef = useRef(false);

  function complete(payload) {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete(payload);
  }

  function handleFinish() {
    if (timeBased) {
      complete({ seconds: targetSeconds - (timerOn ? timerLeft : targetSeconds) || null });
    } else {
      const value = Number.parseInt(reps, 10);
      complete({ reps: Number.isFinite(value) && value >= 0 ? value : null });
    }
  }

  // Süre dozu: geri sayım — 0'da set otomatik biter.
  useEffect(() => {
    if (!timerOn) return undefined;
    const interval = setInterval(() => {
      setTimerLeft((left) => left - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerOn]);

  useEffect(() => {
    if (timerOn && timerLeft <= 0) {
      complete({ seconds: targetSeconds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerLeft, timerOn]);

  return (
    <section className="player">
      <p className="player-position">
        {block.label} · {slotPositionLabel(slot)}
      </p>
      <h2 className="player-exercise">{exercise.name}</h2>
      {exercise.coachNote && (
        <p className="coach-note">“{exercise.coachNote}”</p>
      )}
      <p className="player-dose">{doseLabel(exercise.dose)}</p>

      <div className="player-preview-row">
        <ExercisePreview exercise={exercise} size="md" asLink />
      </div>

      {timeBased ? (
        <div className="hold-timer">
          {timerOn ? (
            <span className="hold-timer-count">{Math.max(0, timerLeft)}</span>
          ) : (
            <button
              type="button"
              className="btn btn-ghost hold-timer-start"
              onClick={() => setTimerOn(true)}
            >
              Süreyi başlat — {targetSeconds} sn
            </button>
          )}
        </div>
      ) : (
        <label className="rep-input-row">
          <span className="block-label">Tekrar</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            className="rep-input"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
          />
        </label>
      )}

      <button type="button" className="btn btn-start set-done" onClick={handleFinish}>
        Set bitti
      </button>

      {exercise.untrackableReason && (
        <p className="untrackable-note">
          Kameradan takip yok — {exercise.untrackableReason}
        </p>
      )}
    </section>
  );
}
