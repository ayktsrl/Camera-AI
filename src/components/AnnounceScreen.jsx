// Hands-free ANNOUNCE durumu — sesli "Sıradaki: X, N tekrar" + hoca notu,
// hedef-poz önizlemesi + SET BAŞI YERLEŞTİRME ASİSTANI (kamera PiP).
//
// Owner ekrana BAKMADAN doğru yerleşsin: kamera açılır, gerekli landmark'lar
// (hareketin framing'ine göre full/upper) kadrajda + görünür mü kontrol edilir,
// değilse SESLİ yönlendirme + büyük ekran ipucu. Kadraj "ok" olunca (kısa stabil
// hold) anons da bitmişse → COUNTDOWN. Çok uzun yerleşememede (maxWait) nazik
// "başlıyoruz" der ve yine de geçer (akış kopmaz — kuzey yıldızı).
//
// SINIR: takip motorunu beslemez; usePoseTracking yalnız landmark gözlemi için
// açılır, usePlacementCheck saf util ile değerlendirir. Pose/motor mantığına dokunmaz.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  doseLabel,
  doseTargetReps,
  slotPositionLabel,
} from "../lib/programPlayer";
import { usePoseTracking } from "../hooks/usePoseTracking";
import { usePlacementCheck } from "../hooks/usePlacementCheck";
import { getExercise } from "../exercises";
import PosePreview from "./PosePreview";

// Anons okunduktan sonra kullanıcı pozisyona geçsin diye minimum bekleme.
const ANNOUNCE_HOLD_MS = 3200;
// Yerleşemese de akışı kilitleme — bu süre sonra nazik "başlıyoruz" (K2).
const PLACEMENT_MAX_WAIT_MS = 15000;

export default function AnnounceScreen({
  slot,
  coach,
  paused,
  onDone,
  facingMode = "user",
}) {
  const { exercise, block } = slot;
  const target = doseTargetReps(exercise.dose);
  const exerciseDef = getExercise(exercise.ruleSetRef);
  const framing = exerciseDef.framing ?? "full";
  const doneRef = useRef(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Anons penceresi doldu mu (minimum süre).
  const [announceReady, setAnnounceReady] = useState(false);

  const { placement, pushFrame } = usePlacementCheck({
    framing,
    coach,
    active: !paused,
  });

  const handleFrame = useCallback(
    (frame) => {
      pushFrame(frame.activeTrack?.landmarks ?? null);
    },
    [pushFrame]
  );

  usePoseTracking({
    videoRef,
    canvasRef,
    onFrame: handleFrame,
    facingMode,
  });

  // Sesli anons — bir kez. "Sıradaki: Push Up, 12 tekrar. <hoca notu>"
  useEffect(() => {
    const repPart = target != null ? `, ${target} tekrar` : "";
    const note = exercise.coachNote ? `. ${exercise.coachNote}` : "";
    coach.announce(`Sıradaki: ${exercise.name}${repPart}${note}`, {
      interrupt: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Anons minimum penceresi (pause'da donar).
  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => setAnnounceReady(true), ANNOUNCE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [paused]);

  // Emniyet: yerleşemese de uzun süre sonra geç (akış kopmaz).
  const maxWaitFiredRef = useRef(false);
  const [forceAdvance, setForceAdvance] = useState(false);
  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => {
      if (maxWaitFiredRef.current) return;
      maxWaitFiredRef.current = true;
      coach.announce("Başlıyoruz", { interrupt: true });
      setForceAdvance(true);
    }, PLACEMENT_MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [paused, coach]);

  // İlerleme şartı: anons bitti VE (kadraj ok VEYA emniyet süresi doldu).
  useEffect(() => {
    if (paused || doneRef.current) return;
    if (!announceReady) return;
    const placementOk = placement?.ok || forceAdvance;
    if (!placementOk) return;
    doneRef.current = true;
    onDone();
  }, [announceReady, placement, forceAdvance, paused, onDone]);

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

      {/* Set başı kamera + yerleştirme asistanı — ekrana bakmadan yerleş. */}
      <div
        className={
          facingMode === "user"
            ? "placement-stage stage--mirrored"
            : "placement-stage"
        }
      >
        <video ref={videoRef} className="stage-video" />
        <canvas ref={canvasRef} className="stage-canvas" />
        {placement && (
          <div
            className={placement.ok ? "placement placement--ok" : "placement"}
            role="status"
            aria-live="polite"
          >
            {!placement.ok && <span className="placement-arrow">{arrowFor(placement.status)}</span>}
            <span className="placement-hint">{placement.hint}</span>
          </div>
        )}
      </div>

      <p className="announce-hint">
        {placement?.ok ? "Hazır — başlıyoruz" : "Pozisyonunu al"}
      </p>
    </section>
  );
}

/** Yerleştirme durumuna göre yön oku (büyük, uzaktan okunur). */
function arrowFor(status) {
  switch (status) {
    case "out-left":
      return "→";
    case "out-right":
      return "←";
    case "too-close":
    case "partial-bottom":
    case "partial-top":
      return "↥";
    case "too-far":
      return "↧";
    default:
      return "•";
  }
}
