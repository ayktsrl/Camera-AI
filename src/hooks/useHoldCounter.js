// İzometrik tutuş sayacı hook'u — saf holdEngine'i React'e bağlar.
// useRepCounter'ın plank (süre-tutma) karşılığı; rep sayacına DOKUNMAZ.
// usePoseTracking'in onFrame'inden processFrame ile beslenir.

import { useCallback, useEffect, useRef, useState } from "react";
import { createHoldEngine } from "../lib/holdEngine";
import { resolveTunedExercise } from "../lib/thresholds";

const WARNING_VISIBLE_MS = 3000;

export function useHoldCounter({ exercise, running, onEvent }) {
  const exerciseRef = useRef(exercise);
  const engineRef = useRef(null);
  if (engineRef.current === null) {
    // Etkin tuning (varsayılan ⊕ localStorage override) egzersize uygulanır.
    engineRef.current = createHoldEngine(resolveTunedExercise(exercise));
  }

  const [phase, setPhase] = useState("idle"); // idle | holding | broken
  const [heldSeconds, setHeldSeconds] = useState(0);
  const [warning, setWarning] = useState(null); // { message, severity, at }
  const [setSummary, setSetSummary] = useState(null); // engine.getSummary() — set bitişinde
  const [ended, setEnded] = useState(false); // holdEngine "end" sinyali (hands-free auto bitiş)

  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
    exerciseRef.current = exercise;
  });

  // Uyarı görünürlük süresi — her yeni uyarı süreyi tazeler.
  useEffect(() => {
    if (!warning) return undefined;
    const timer = setTimeout(() => setWarning(null), WARNING_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [warning]);

  /** Yeni set başlangıcı: motoru ve sayaçları sıfırlar. */
  const reset = useCallback(() => {
    // Set başında etkin tuning yeniden okunur → kalibrasyon ayarı sonraki sete yansır.
    engineRef.current = createHoldEngine(resolveTunedExercise(exerciseRef.current));
    setPhase("idle");
    setHeldSeconds(0);
    setWarning(null);
    setSetSummary(null);
    setEnded(false);
  }, []);

  /** Set bitişi: süre + kural ihlal dağılımı dondurulur. */
  const finishSet = useCallback(() => {
    setSetSummary(engineRef.current.getSummary());
  }, []);

  const processFrame = useCallback(
    ({ activeTrack, timestamp }) => {
      const engine = engineRef.current;
      if (!engine || !running) return;

      const frame = activeTrack
        ? {
            landmarks: activeTrack.landmarks,
            worldLandmarks: activeTrack.worldLandmarks ?? null,
          }
        : null;

      const events = engine.step(frame, timestamp);

      for (const event of events) {
        if (event.type === "phase") {
          setPhase(event.phase);
        } else if (event.type === "hold") {
          setHeldSeconds(Math.floor(event.heldMs / 1000));
        } else if (event.type === "warning") {
          setWarning({
            message: event.message,
            severity: event.severity ?? "major",
            at: Date.now(),
          });
        } else if (event.type === "end") {
          setEnded(true);
        }
        onEventRef.current?.(event);
      }
    },
    [running]
  );

  return {
    processFrame,
    reset,
    finishSet,
    phase,
    heldSeconds,
    warning: warning?.message ?? null,
    warningSeverity: warning?.severity ?? null,
    setSummary,
    ended,
  };
}
