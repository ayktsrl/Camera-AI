// Hands-free ANNOUNCE durumu — sesli "Sıradaki: X, N tekrar" + hoca notu,
// tam ekran hedef-poz önizlemesi. Anons + kısa pencere bitince otomatik → COUNTDOWN.
// Dokunma gerekmez; tek "Duraklat" kontrolü üst seviyededir (ProgramMode).

import { useEffect, useRef } from "react";
import {
  doseLabel,
  doseTargetReps,
  slotPositionLabel,
} from "../lib/programPlayer";
import PosePreview from "./PosePreview";

// Anons okunduktan sonra kullanıcı pozisyona geçsin diye kısa bekleme.
const ANNOUNCE_HOLD_MS = 3200;

export default function AnnounceScreen({ slot, coach, paused, onDone }) {
  const { exercise, block } = slot;
  const target = doseTargetReps(exercise.dose);
  const doneRef = useRef(false);

  // Sesli anons — bir kez. "Sıradaki: Push Up, 12 tekrar. <hoca notu>"
  useEffect(() => {
    const repPart = target != null ? `, ${target} tekrar` : "";
    const note = exercise.coachNote ? `. ${exercise.coachNote}` : "";
    coach.announce(`Sıradaki: ${exercise.name}${repPart}${note}`, {
      interrupt: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Anons penceresi dolunca otomatik COUNTDOWN'a geç (pause'da donar).
  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    }, ANNOUNCE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [paused, onDone]);

  return (
    <section className="player player--announce">
      <p className="player-position">
        {block.label} · {slotPositionLabel(slot)}
      </p>
      <p className="announce-kicker">Sıradaki</p>
      <h2 className="announce-title">{exercise.name}</h2>
      <p className="player-dose">{doseLabel(exercise.dose)}</p>

      <div className="announce-preview">
        <PosePreview exercise={exercise} size="md" />
      </div>

      {exercise.coachNote && (
        <p className="coach-note">“{exercise.coachNote}”</p>
      )}
      <p className="announce-hint">Pozisyonunu al — başlıyoruz</p>
    </section>
  );
}
