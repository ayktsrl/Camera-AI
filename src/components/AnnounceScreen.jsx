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
import { POSTURE_HINT } from "../lib/framingCheck";
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
  const posture = POSTURE_HINT[framing] ?? POSTURE_HINT.full;
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

  // Kilit ilk kazanıldığında SESLİ "Seni tanıdım" (bir kez).
  const handleLockAcquired = useCallback(() => {
    coach.announce("Seni tanıdım, kilitlendim", { interrupt: true });
  }, [coach]);

  const { lockPhase } = usePoseTracking({
    videoRef,
    canvasRef,
    onFrame: handleFrame,
    onLockAcquired: handleLockAcquired,
    facingMode,
  });

  // Sesli anons — bir kez. "Sıradaki: Push Up, 12 tekrar. <hoca notu>. <duruş ipucu>"
  // Eyes-free: duruş ipucu (telefonu dik tut / yakın durabilirsin) anonsa eklenir →
  // owner ekrana bakmadan telefonu doğru kurar.
  useEffect(() => {
    const repPart = target != null ? `, ${target} tekrar` : "";
    const note = exercise.coachNote ? `. ${exercise.coachNote}` : "";
    const posturePart = posture?.speech ? `. ${posture.speech}` : "";
    coach.announce(`Sıradaki: ${exercise.name}${repPart}${note}${posturePart}`, {
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

  // Kilit henüz yok (idle) iken nazik sesli "ekrana gel" (cooldown'lı — spam yok).
  // registering/locked'da susar; emniyet süresinde (forceAdvance) susar.
  useEffect(() => {
    if (paused || forceAdvance) return;
    if (lockPhase === "idle") {
      coach.say("Ekrana gel, seni tanıyayım", {
        key: "lock-idle",
        cooldownMs: 4000,
      });
    }
  }, [lockPhase, paused, forceAdvance, coach]);

  // İlerleme şartı: anons bitti VE kilitlendi VE (kadraj ok VEYA emniyet süresi doldu).
  // Emniyet (PLACEMENT_MAX_WAIT_MS) kilitlenemese de akışı kurtarır (kuzey yıldızı).
  // Tek kişi durumunda kilit hızlı → fark hissedilmez.
  useEffect(() => {
    if (paused || doneRef.current) return;
    if (!announceReady) return;
    const locked = lockPhase === "locked";
    const placementOk = (locked && placement?.ok) || forceAdvance;
    if (!placementOk) return;
    doneRef.current = true;
    onDone();
  }, [announceReady, placement, forceAdvance, paused, lockPhase, onDone]);

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

      {/* Duruş ipucu — telefonu nasıl kuracağı (portre/alçak açı vs. yakın dur). */}
      {posture?.hint && <p className="posture-hint">{posture.hint}</p>}

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
        {/* Kilit durumu rozeti — owner kilidin oluştuğunu GÖRSÜN. */}
        <div
          className={`lock-badge lock-badge--${lockPhase}`}
          role="status"
          aria-live="polite"
        >
          {lockPhase === "locked"
            ? "● KİLİTLİ"
            : lockPhase === "registering"
              ? "TANIYORUM…"
              : "EKRANA GEL"}
        </div>

        {placement && lockPhase === "locked" && (
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
        {lockPhase !== "locked"
          ? "Ekranın ortasına gel, seni tanıyayım"
          : placement?.ok
            ? "Hazır — başlıyoruz"
            : "Pozisyonunu al"}
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
