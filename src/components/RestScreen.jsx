// Dinlenme geri sayımı — büyük rakam; son 3 sn bip, 0'da sesli "Başla".
// "Geç" her zaman var; straight bloklarda banda kadar (+30 sn) uzatılabilir.

import { useEffect, useRef, useState } from "react";

function beep(audioCtxRef) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {
    /* bip opsiyonel */
  }
}

export default function RestScreen({ rest, nextSlot, coach, onDone, paused = false }) {
  const [left, setLeft] = useState(rest.seconds);
  const audioCtxRef = useRef(null);
  const doneRef = useRef(false);

  const canExtend =
    Array.isArray(rest.rangeSec) && rest.rangeSec[1] > rest.rangeSec[0];

  // Dinlenme başında süreyi bir kez sesli söyle.
  useEffect(() => {
    coach.announce(`${rest.seconds} saniye dinlen`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    coach.announce("Hazır ol, başlıyoruz", { interrupt: true });
    onDone();
  }

  // Geri sayım — pause'da donar.
  useEffect(() => {
    if (paused) return undefined;
    const interval = setInterval(() => {
      setLeft((l) => l - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [paused]);

  useEffect(() => {
    if (left > 0 && left <= 3) {
      beep(audioCtxRef);
      coach.sayCount(left);
    }
    if (left <= 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  return (
    <section className="player rest">
      {/* UZAKTAN OKUNUR: büyük "DİNLEN" durumu + devasa sayı + son 3 sn accent. */}
      <p className="rest-label">Dinlen</p>
      <div
        className={
          left > 0 && left <= 3 ? "rest-count rest-count--ending" : "rest-count"
        }
        aria-live="off"
      >
        {Math.max(0, left)}
      </div>
      {nextSlot && (
        <p className="rest-next">
          Sıradaki: <strong>{nextSlot.exercise.name}</strong>
          {nextSlot.round != null &&
            ` — Tur ${nextSlot.round}/${nextSlot.totalRounds}`}
        </p>
      )}
      <div className="rest-actions">
        {canExtend && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              setLeft((l) => Math.min(l + 30, rest.rangeSec[1]))
            }
          >
            +30 sn
          </button>
        )}
        <button type="button" className="btn btn-stop" onClick={finish}>
          Geç
        </button>
      </div>
    </section>
  );
}
