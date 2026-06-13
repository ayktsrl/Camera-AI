// Kalibrasyon hook'u — kalibrasyon modunun beyni. Seçili hareket için CANLI olarak:
//   • ham metrikleri üretir (rep FSM açısı, faz, her fault kuralının ham ölçümü)
//   • taslak tuning'i ANINDA çalışan motora uygular (deploy beklemeden)
//   • güncel rep/süre sayısını yansıtır
//
// Normal antrenman akışına DOKUNMAZ: kendi izole rep/hold motorunu kurar
// (useRepCounter/useHoldCounter'dan bağımsız). Yalnız kalibrasyon ekranı kullanır.
//
// Taslak tuning değiştiğinde (slider) motor yeniden kurulur → eşik ANINDA etkin.
// Ham metrik gösterimi motordan bağımsızdır (computeMetrics doğrudan okunur) →
// owner sayıların nasıl değiştiğini eşik ayarlamadan da görür.
//
// Motor + zemin-kalibrasyon kabı frame-boyu MUTASYONA uğrayan harici sistemlerdir →
// useRef'te tutulur. Ref senkronu yalnız callback içinde yapılır (render'da değil):
// processFrame, taslak tuning'in "token"ını mevcut refle kıyaslar, değişmişse taze
// motor kurar. Böylece eşik değişimi anında etkin olur, lint immutability'yi bozmaz.

import { useCallback, useRef, useState } from "react";
import { createRepEngine } from "../lib/repEngine";
import { createHoldEngine } from "../lib/holdEngine";
import { applyTuning } from "../lib/thresholds";

function buildEngine(exercise, isometric) {
  return isometric ? createHoldEngine(exercise) : createRepEngine(exercise);
}

export function useCalibration({ exercise, tuning, running }) {
  const isometric = Boolean(exercise.isometric);

  const engineRef = useRef(null);
  const calibRef = useRef({ samples: [], data: null }); // squat zemin kalibrasyonu
  const tokenRef = useRef(null); // motorun kurulu olduğu {exercise,tuning} kimliği
  const resetTickRef = useRef(0); // "sayacı sıfırla" elle tetikleri

  const [metrics, setMetrics] = useState(null); // ham computeMetrics çıktısı
  const [phase, setPhase] = useState("idle");
  const [primaryAngle, setPrimaryAngle] = useState(null);
  const [repCount, setRepCount] = useState(0);
  const [heldSeconds, setHeldSeconds] = useState(0);

  // Mevcut tuned egzersizi her render'da türet (saf, ucuz; applyTuning sığ klon).
  const tunedExercise = applyTuning(exercise, tuning);
  const primaryMetric = tunedExercise.tracking?.primaryMetric ?? "kneeAngle";

  // Motor senkronu — callback içinde (render değil): token değiştiyse taze motor.
  const ensureEngine = useCallback(
    (token, ex, iso) => {
      if (tokenRef.current !== token) {
        tokenRef.current = token;
        engineRef.current = buildEngine(ex, iso);
        calibRef.current = { samples: [], data: null };
        setPhase("idle");
        setRepCount(0);
        setHeldSeconds(0);
      }
      return engineRef.current;
    },
    []
  );

  const processFrame = useCallback(
    ({ activeTrack, timestamp }) => {
      // Token = egzersiz kimliği + tuning + reset sayacı. Değişince motor tazelenir.
      const token = `${exercise.id}|${JSON.stringify(tuning)}|${resetTickRef.current}`;
      const engine = ensureEngine(token, tunedExercise, isometric);
      if (!engine) return;

      const frame = activeTrack
        ? {
            landmarks: activeTrack.landmarks,
            worldLandmarks: activeTrack.worldLandmarks ?? null,
          }
        : null;

      // Ham metrikleri her zaman (motordan bağımsız) üret — owner ham değeri görür.
      const calib = calibRef.current;
      let rawMetrics = null;
      if (frame) {
        const calibSpec = tunedExercise.calibration;
        rawMetrics = isometric
          ? tunedExercise.computeMetrics(frame.landmarks, frame.worldLandmarks)
          : tunedExercise.computeMetrics(
              frame.landmarks,
              frame.worldLandmarks,
              calib.data
            );

        if (calibSpec && !calib.data && rawMetrics && calibSpec.isStable(rawMetrics)) {
          const sample = calibSpec.capture(frame.landmarks);
          if (sample) {
            calib.samples.push(sample);
            if (calib.samples.length >= calibSpec.minStableFrames) {
              calib.data = calibSpec.finalize(calib.samples);
            }
          }
        }
      }

      setMetrics(rawMetrics);
      setPrimaryAngle(rawMetrics ? (rawMetrics[primaryMetric] ?? null) : null);

      // Motoru besle (rep/süre + faz) — yalnız "çalışıyor"ken.
      if (!running) return;
      const events = engine.step(frame, timestamp);
      for (const event of events) {
        if (event.type === "phase") setPhase(event.phase);
        else if (event.type === "rep") setRepCount(event.count);
        else if (event.type === "hold")
          setHeldSeconds(Math.floor(event.heldMs / 1000));
      }
    },
    [exercise, tuning, tunedExercise, isometric, primaryMetric, running, ensureEngine]
  );

  // Sayacı sıfırla — reset token'ını ilerlet; sonraki frame taze motor kurar.
  const resetCounts = useCallback(() => {
    resetTickRef.current += 1;
    setPhase("idle");
    setRepCount(0);
    setHeldSeconds(0);
  }, []);

  return {
    processFrame,
    resetCounts,
    isometric,
    metrics,
    phase,
    primaryMetric,
    primaryAngle,
    repCount,
    heldSeconds,
    phaseLabels: tunedExercise.phaseLabels ?? tunedExercise.faultLabels ?? {},
    faultRules: tunedExercise.faultRules ?? [],
  };
}
