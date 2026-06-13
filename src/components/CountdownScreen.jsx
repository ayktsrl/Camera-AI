// Hands-free COUNTDOWN durumu — sesli "3… 2… 1… Başla", büyük rakam.
// Bitince otomatik → EXERCISE (kamera takip motoru başlar). Pause'da donar.

import { useEffect, useRef, useState } from "react";
import { slotPositionLabel } from "../lib/programPlayer";
import PosePreview from "./PosePreview";

const COUNT_FROM = 3;
const TICK_MS = 1000;

export default function CountdownScreen({ slot, coach, paused, onDone }) {
  const { exercise } = slot;
  const [n, setN] = useState(COUNT_FROM);
  const doneRef = useRef(false);
  const spokenRef = useRef(new Set());

  // Her rakamı bir kez sesli söyle (kuyruğu keserek).
  useEffect(() => {
    if (paused) return;
    if (n > 0 && !spokenRef.current.has(n)) {
      spokenRef.current.add(n);
      coach.sayCount(n);
    }
  }, [n, paused, coach]);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setInterval(() => setN((v) => v - 1), TICK_MS);
    return () => clearInterval(timer);
  }, [paused]);

  // 0'a inince "Başla" + EXERCISE'e geç.
  useEffect(() => {
    if (paused || n > 0 || doneRef.current) return;
    doneRef.current = true;
    coach.announce("Başla", { interrupt: true });
    onDone();
  }, [n, paused, coach, onDone]);

  return (
    <section className="player player--countdown">
      <p className="player-position">
        {exercise.name} · {slotPositionLabel(slot)}
      </p>
      <div className="countdown-stage">
        <PosePreview exercise={exercise} size="md" />
        <div className="countdown-number" key={n} aria-hidden="true">
          {n > 0 ? n : "Başla"}
        </div>
      </div>
    </section>
  );
}
