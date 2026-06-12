// Tekrar sayacı hook'u — saf repEngine'i React'e bağlar.
// usePoseTracking'in onFrame'inden processFrame ile beslenir.
// Yeni set: reset() çağrılır (Başlat düğmesi); set bitişi: finishSet() özeti dondurur.

import { useCallback, useEffect, useRef, useState } from "react";
import { createRepEngine } from "../lib/repEngine";

const WARNING_VISIBLE_MS = 3000;

export function useRepCounter({ exercise, running, onEvent }) {
  const exerciseRef = useRef(exercise);
  const engineRef = useRef(null);
  if (engineRef.current === null) {
    engineRef.current = createRepEngine(exercise);
  }

  const [phase, setPhase] = useState("idle");
  const [repCount, setRepCount] = useState(0);
  const [faultyCount, setFaultyCount] = useState(0);
  const [warning, setWarning] = useState(null); // { message, severity, at }
  const [repFlash, setRepFlash] = useState(0);
  const [setSummary, setSetSummary] = useState(null); // engine.getSummary() — set bitişinde

  const lastRepAtRef = useRef(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
    exerciseRef.current = exercise;
  });

  // Uyarı görünürlük süresi — her yeni uyarı nesnesi süreyi tazeler.
  useEffect(() => {
    if (!warning) return undefined;
    const timer = setTimeout(() => setWarning(null), WARNING_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [warning]);

  /** Yeni set başlangıcı: motoru ve sayaçları sıfırlar. */
  const reset = useCallback(() => {
    engineRef.current = createRepEngine(exerciseRef.current);
    lastRepAtRef.current = performance.now();
    setPhase("idle");
    setRepCount(0);
    setFaultyCount(0);
    setWarning(null);
    setSetSummary(null);
  }, []);

  /** Set bitişi: kural ihlal dağılımı + değerlendirilemeyen kurallar dondurulur. */
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
        } else if (event.type === "rep") {
          setRepCount(event.count);
          setFaultyCount(engine.getState().faultyCount);
          lastRepAtRef.current = timestamp;
          setRepFlash((f) => f + 1);
        } else if (event.type === "warning") {
          setFaultyCount(engine.getState().faultyCount);
          setWarning({
            message: event.message,
            severity: event.severity ?? "major",
            at: Date.now(),
          });
        }
        onEventRef.current?.(event);
      }
    },
    [running]
  );

  /** Son tekrardan bu yana geçen ms (set aktifken). Motivasyon tetiklemek için. */
  const msSinceLastRep = useCallback(() => {
    if (!running || lastRepAtRef.current == null) return 0;
    return performance.now() - lastRepAtRef.current;
  }, [running]);

  return {
    processFrame,
    reset,
    finishSet,
    phase,
    repCount,
    faultyCount,
    warning: warning?.message ?? null,
    warningSeverity: warning?.severity ?? null,
    setSummary,
    repFlash,
    msSinceLastRep,
  };
}
