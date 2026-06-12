// Tekrar sayma durum makinesi — saf, React'siz, egzersiz config'iyle sürülür.
//
// Faz döngüsü: standing → descent → bottom → ascent → standing  ⇒  +1 tekrar
// Faz geçişleri confirm-frames debounce ile onaylanır (titreşimde çift sayma yok).
// Yarım tekrar sayılmaz: dibe (bottomMax) ulaşmayan deneme tekrar DEĞİLDİR;
// attemptBelow altına inilmişse derinlik hatası olarak işaretlenir.

const METRICS_LOST_RESET_FRAMES = 30;

export function createRepEngine(exercise) {
  let state = freshState();

  function freshState() {
    return {
      confirmedPhase: "idle",
      candidatePhase: null,
      candidateFrames: 0,
      repCount: 0,
      faultyCount: 0,
      attempt: null, // { minKneeAngle, torsoViolated }
      torsoBadFrames: 0,
      metricsLostFrames: 0,
      lastRepAt: null,
    };
  }

  function rawPhaseFor(kneeAngle) {
    const { standingMin, bottomMax } = exercise.phases;

    if (kneeAngle >= standingMin) return "standing";
    if (kneeAngle <= bottomMax) return "bottom";

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

    const { bottomMax } = exercise.phases;

    if (attempt.minKneeAngle <= bottomMax) {
      // Tam tekrar — dibe inildi ve ayağa dönüldü.
      state.repCount += 1;
      state.lastRepAt = timestamp;
      const faulty = attempt.torsoViolated;
      if (faulty) state.faultyCount += 1;
      events.push({ type: "rep", count: state.repCount, faulty });
      return;
    }

    if (attempt.minKneeAngle <= exercise.attemptBelow) {
      // Belirgin iniş var ama dibe ulaşılmadı → derinlik hatası, sayılmaz.
      state.faultyCount += 1;
      events.push({
        type: "warning",
        rule: "depth",
        message: exercise.rules.depth.message,
        speech: exercise.rules.depth.speech,
      });
    }
    // attemptBelow'un üstünde kalan ufak diz bükmeleri sessizce yok sayılır.
  }

  function transitionTo(phase, events, timestamp, kneeAngle) {
    const prev = state.confirmedPhase;
    state.confirmedPhase = phase;
    state.candidatePhase = null;
    state.candidateFrames = 0;

    if (prev === "standing" && phase === "descent") {
      state.attempt = { minKneeAngle: kneeAngle, torsoViolated: false };
    }

    if (phase === "standing") {
      closeAttempt(events, timestamp);
    }

    events.push({ type: "phase", phase });
  }

  /**
   * Her frame'de çağrılır.
   * @param {{kneeAngle:number, torsoTilt:number|null}|null} metrics
   * @param {number} timestamp performance.now()
   * @returns {Array} events: {type:"rep"|"warning"|"phase", ...}
   */
  function step(metrics, timestamp) {
    const events = [];

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
        state.torsoBadFrames = 0;
        events.push({ type: "phase", phase: "idle" });
      }
      return events;
    }

    state.metricsLostFrames = 0;
    const { kneeAngle, torsoTilt } = metrics;

    // Deneme boyunca en derin nokta takip edilir.
    if (state.attempt) {
      state.attempt.minKneeAngle = Math.min(
        state.attempt.minKneeAngle,
        kneeAngle
      );
    }

    // Gövde eğimi kuralı — yalnız aktif hareket fazlarında.
    const torsoRule = exercise.rules.torso;
    const inMotion =
      state.confirmedPhase === "descent" ||
      state.confirmedPhase === "bottom" ||
      state.confirmedPhase === "ascent";

    if (inMotion && torsoTilt != null && torsoTilt > torsoRule.maxTiltDeg) {
      state.torsoBadFrames += 1;
      if (state.torsoBadFrames === torsoRule.minFrames) {
        if (state.attempt) state.attempt.torsoViolated = true;
        events.push({
          type: "warning",
          rule: "torso",
          message: torsoRule.message,
          speech: torsoRule.speech,
        });
      }
    } else {
      state.torsoBadFrames = 0;
    }

    // Faz adayı + confirm-frames debounce.
    const candidate = rawPhaseFor(kneeAngle);

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
      transitionTo(candidate, events, timestamp, kneeAngle);
    }

    return events;
  }

  function reset() {
    state = freshState();
  }

  function getState() {
    return {
      phase: state.confirmedPhase,
      repCount: state.repCount,
      faultyCount: state.faultyCount,
      lastRepAt: state.lastRepAt,
    };
  }

  return { step, reset, getState };
}
