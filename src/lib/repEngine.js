// Tekrar sayma durum makinesi — saf, React'siz, egzersiz config'iyle sürülür.
//
// Faz döngüsü: standing → descent → bottom → ascent → standing  ⇒  +1 tekrar
// Faz geçişleri confirm-frames debounce ile onaylanır (titreşimde çift sayma yok).
// Yarım tekrar sayılmaz: dibe (bottomMax) ulaşmayan deneme tekrar DEĞİLDİR;
// attemptBelow altına inilmişse derinlik hatası olarak işaretlenir.
//
// v0.2: form kuralları bildirimsel exercise.faultRules[] şemasından okunur ve
// kural-bilinçsiz faultRules motoruyla işlenir (histerezis + cooldown + visibility
// susturma). Motor 3D world landmark metrikleriyle beslenir; basit zemin
// kalibrasyonu (heel kuralı) set başındaki ilk stabil ayakta karelerden alınır.

import { createFaultRuleEngine } from "./faultRules";

const METRICS_LOST_RESET_FRAMES = 30;

export function createRepEngine(exercise) {
  // Faz kararının sürüldüğü açı + eşikler. exercise.tracking varsa oradan;
  // yoksa geriye uyum için eski squat yolu (kneeAngle + exercise.phases).
  const tracking = exercise.tracking ?? {
    primaryMetric: "kneeAngle",
    phases: exercise.phases,
    attemptBelow: exercise.attemptBelow,
  };
  const primaryMetric = tracking.primaryMetric ?? "kneeAngle";
  const phases = tracking.phases ?? exercise.phases;
  const attemptBelow = tracking.attemptBelow ?? exercise.attemptBelow;

  const attemptCloseRules = (exercise.faultRules ?? []).filter((r) =>
    (r.phases ?? []).includes("attemptClose")
  );
  const depthRule = attemptCloseRules.find((r) => r.id === "depth") ?? null;

  let ruleEngine = createFaultRuleEngine(exercise.faultRules ?? []);
  let state = freshState();

  function freshState() {
    return {
      confirmedPhase: "idle",
      candidatePhase: null,
      candidateFrames: 0,
      repCount: 0,
      faultyCount: 0,
      attempt: null, // { minKneeAngle, violations: Set<ruleId> }
      metricsLostFrames: 0,
      lastRepAt: null,
      depthFires: 0,
      calib: { samples: [], data: null },
    };
  }

  function rawPhaseFor(angle) {
    const { standingMin, bottomMax } = phases;

    if (angle >= standingMin) return "standing";
    if (angle <= bottomMax) return "bottom";

    // Ara bant: yön mevcut onaylı faza göre belirlenir.
    if (state.confirmedPhase === "bottom" || state.confirmedPhase === "ascent") {
      return "ascent";
    }
    return "descent";
  }

  function closeAttempt(events, timestamp) {
    const attempt = state.attempt;
    if (!attempt) return;
    state.attempt = null;

    const { bottomMax } = phases;

    if (attempt.minAngle <= bottomMax) {
      // Tam tekrar — dibe inildi ve başlangıç pozuna dönüldü.
      state.repCount += 1;
      state.lastRepAt = timestamp;
      const faults = [...attempt.violations];
      const faulty = faults.length > 0;
      if (faulty) state.faultyCount += 1;
      events.push({ type: "rep", count: state.repCount, faulty, faults });
      return;
    }

    if (attempt.minAngle <= attemptBelow) {
      // Belirgin iniş var ama dibe ulaşılmadı → derinlik hatası, sayılmaz.
      state.faultyCount += 1;
      state.depthFires += 1;
      events.push({
        type: "warning",
        rule: depthRule?.id ?? "depth",
        severity: depthRule?.severity ?? "major",
        message: depthRule?.message,
        speech: depthRule?.speech ?? depthRule?.message,
      });
    }
    // attemptBelow'un üstünde kalan ufak diz bükmeleri sessizce yok sayılır.
  }

  function transitionTo(phase, events, timestamp, angle) {
    const prev = state.confirmedPhase;
    state.confirmedPhase = phase;
    state.candidatePhase = null;
    state.candidateFrames = 0;

    if (prev === "standing" && phase === "descent") {
      state.attempt = { minAngle: angle, violations: new Set() };
    }

    if (phase === "standing") {
      closeAttempt(events, timestamp);
    }

    events.push({ type: "phase", phase });
  }

  function updateCalibration(metrics, landmarks) {
    const calibSpec = exercise.calibration;
    if (!calibSpec || state.calib.data) return;
    if (!calibSpec.isStable(metrics)) return;

    const sample = calibSpec.capture(landmarks);
    if (!sample) return;

    state.calib.samples.push(sample);
    if (state.calib.samples.length >= calibSpec.minStableFrames) {
      state.calib.data = calibSpec.finalize(state.calib.samples);
      state.calib.samples = [];
    }
  }

  /**
   * Her frame'de çağrılır.
   * @param {{landmarks:Array, worldLandmarks:Array|null}|null} frame
   *   Filtrelenmiş landmark'lar (2D normalize + 3D world). Aktif kullanıcı yoksa null.
   * @param {number} timestamp performance.now()
   * @returns {Array} events: {type:"rep"|"warning"|"phase", ...}
   */
  function step(frame, timestamp) {
    const events = [];

    const metrics = frame
      ? exercise.computeMetrics(
          frame.landmarks,
          frame.worldLandmarks ?? null,
          state.calib.data
        )
      : null;

    if (!metrics) {
      state.metricsLostFrames += 1;
      if (
        state.metricsLostFrames >= METRICS_LOST_RESET_FRAMES &&
        state.confirmedPhase !== "idle"
      ) {
        state.confirmedPhase = "idle";
        state.candidatePhase = null;
        state.candidateFrames = 0;
        state.attempt = null;
        ruleEngine.clearTransient();
        events.push({ type: "phase", phase: "idle" });
      }
      return events;
    }

    state.metricsLostFrames = 0;
    const angle = metrics[primaryMetric];
    if (angle == null) return events; // faz açısı bu frame'de yok — bekle

    updateCalibration(metrics, frame.landmarks);

    // Deneme boyunca en derin nokta takip edilir.
    if (state.attempt) {
      state.attempt.minAngle = Math.min(state.attempt.minAngle, angle);
    }

    // Form kuralları — kural-bilinçsiz genel döngü.
    const faultEvents = ruleEngine.step({
      metrics,
      landmarks: frame.landmarks,
      phase: state.confirmedPhase,
      timestamp,
    });

    for (const fault of faultEvents) {
      if (state.attempt) state.attempt.violations.add(fault.rule);
      events.push({
        type: "warning",
        rule: fault.rule,
        severity: fault.severity,
        message: fault.message,
        speech: fault.speech,
      });
    }

    // Faz adayı + confirm-frames debounce.
    const candidate = rawPhaseFor(angle);

    if (candidate === state.confirmedPhase) {
      state.candidatePhase = null;
      state.candidateFrames = 0;
      return events;
    }

    if (candidate !== state.candidatePhase) {
      state.candidatePhase = candidate;
      state.candidateFrames = 1;
    } else {
      state.candidateFrames += 1;
    }

    if (state.candidateFrames >= exercise.phaseConfirmFrames) {
      transitionTo(candidate, events, timestamp, angle);
    }

    return events;
  }

  function reset() {
    state = freshState();
    ruleEngine.reset();
  }

  function getState() {
    return {
      phase: state.confirmedPhase,
      repCount: state.repCount,
      faultyCount: state.faultyCount,
      lastRepAt: state.lastRepAt,
      calibrated: Boolean(state.calib.data),
    };
  }

  /**
   * Set özeti — kural başına ihlal sayısı; >%50 susturulan kurallar
   * "değerlendirilemedi" (unevaluated) olarak işaretlenir. Sessiz PASS yok.
   */
  function getSummary() {
    const rules = ruleEngine.getSummary();
    if (depthRule) {
      rules.unshift({
        id: depthRule.id,
        label: depthRule.label ?? depthRule.id,
        severity: depthRule.severity ?? "major",
        cameraHint: depthRule.cameraHint ?? "any",
        fires: state.depthFires,
        unevaluated: false, // attempt bazlı; frame susturması uygulanmaz
      });
    }
    return {
      repCount: state.repCount,
      faultyCount: state.faultyCount,
      rules,
    };
  }

  return { step, reset, getState, getSummary };
}
