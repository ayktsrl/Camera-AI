// Rehberli set ekranı — kameradan takip edilemeyen hareketler.
// Hoca notu görsel hiyerarşide ikinci sırada (ürünün ruhu bu satır).
//
// Klasik mod (handsFree=false): büyük "Set bitti" + elle tekrar girişi;
//   süre dozunda geri sayımlı tutuş sayacı.
// Hands-free (handsFree=true): akış asla kopmaz, dokunmasız —
//   • süre dozu → geri sayım otomatik (zaten vardı)
//   • rep dozu  → TAHMİNİ SÜRE otomatik geçiş (tekrar × ~3 sn). Uygulama "rep
//     saydım" DEMEZ — süre logu yazar (spec §3 dürüstlük kuralı, owner kararı 3).

import { useEffect, useRef, useState } from "react";
import {
  doseLabel,
  doseTargetReps,
  doseTargetSeconds,
  slotPositionLabel,
} from "../lib/programPlayer";
import ExercisePreview from "./ExercisePreview";

const SEC_PER_REP = 3; // tahmini tempo — negatif 2–3 sn + dönüş

export default function GuidedSetScreen({
  slot,
  onComplete,
  handsFree = false,
  paused = false,
}) {
  const { exercise, block } = slot;
  const targetReps = doseTargetReps(exercise.dose);
  const targetSeconds = doseTargetSeconds(exercise.dose);
  const timeBased = targetSeconds != null;

  // Hands-free rep dozunda tahmini süre; klasikte elle giriş.
  const estimatedSeconds =
    !timeBased && targetReps != null ? targetReps * SEC_PER_REP : null;

  const [reps, setReps] = useState(targetReps ?? "");
  const [timerLeft, setTimerLeft] = useState(
    timeBased ? targetSeconds : estimatedSeconds
  );
  // Hands-free: süre/tahmini-süre sayacı otomatik başlar; klasik süre: elle.
  const [timerOn, setTimerOn] = useState(
    handsFree && (timeBased || estimatedSeconds != null)
  );
  const doneRef = useRef(false);

  function complete(payload) {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete(payload);
  }

  function handleFinish() {
    if (timeBased) {
      complete({
        seconds: targetSeconds - (timerOn ? timerLeft : targetSeconds) || null,
      });
    } else {
      const value = Number.parseInt(reps, 10);
      complete({ reps: Number.isFinite(value) && value >= 0 ? value : null });
    }
  }

  // Geri sayım — pause'da donar; 0'da set otomatik biter.
  useEffect(() => {
    if (!timerOn || paused) return undefined;
    const interval = setInterval(() => {
      setTimerLeft((left) => left - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerOn, paused]);

  useEffect(() => {
    if (!timerOn || timerLeft > 0) return;
    if (timeBased) {
      complete({ seconds: targetSeconds });
    } else {
      // Dürüstlük: rep saymıyoruz — tahmini süreyi logla.
      complete({ seconds: estimatedSeconds, reps: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerLeft, timerOn]);

  const counterLabel = timeBased ? "Süre" : "Tahmini süre";

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
        <ExercisePreview exercise={exercise} size="md" />
      </div>

      {timerOn ? (
        <div className="hold-timer">
          <span className="hold-timer-label">{counterLabel}</span>
          <span className="hold-timer-count">{Math.max(0, timerLeft)}</span>
        </div>
      ) : timeBased ? (
        <div className="hold-timer">
          <button
            type="button"
            className="btn btn-ghost hold-timer-start"
            onClick={() => setTimerOn(true)}
          >
            Süreyi başlat — {targetSeconds} sn
          </button>
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

      {/* Hands-free'de akış otomatik geçer; manuel "Set bitti" yalnız klasikte. */}
      {!handsFree && (
        <button type="button" className="btn btn-start set-done" onClick={handleFinish}>
          Set bitti
        </button>
      )}

      {exercise.untrackableReason && (
        <p className="untrackable-note">
          Kameradan takip yok — {exercise.untrackableReason}
        </p>
      )}
    </section>
  );
}
