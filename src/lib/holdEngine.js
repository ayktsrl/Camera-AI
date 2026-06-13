// İzometrik tutuş motoru — plank gibi SÜRE bazlı hareketler için. Saf, React'siz.
//
// repEngine REP sayar; holdEngine pozisyonu TUTMA SÜRESİNİ sayar. İkisi izole:
// repEngine'in faz/tekrar mantığına dokunulmaz. exercise.isometric === true olan
// hareketler bu motordan geçer (useHoldCounter / PoseHoldScreen üzerinden).
//
// Mantık:
//   • Her frame computeMetrics → {isHorizontal, bodyLineAngle, ...} üretir.
//   • Geçerli plank (yatay + düz hat ≥ straightEnter) enterFrames boyunca onaylanırsa
//     "holding" fazına geçilir; bu fazda hold timer gerçek geçen ms ile İLERLER.
//   • Pozisyon bozulunca (düz hat < straightExit veya yatay değil) faz "broken"a düşer;
//     timer DURUR (toplam süre korunur, geri gitmez — "saymıyor" demeden duraklar).
//   • Form kuralları (hipSag/hipPike) yalnız "holding" fazında değerlendirilir
//     (faultRules motoru, histerezis + cooldown + visibility susturma — repEngine ile aynı).
//   • Pozisyon breakEndMs'den uzun bozuk kalırsa set "done" sinyali verir (hands-free
//     otomatik bitirme); kullanıcı Duraklat/Bitir ile de bitirebilir.
//   • Süre, gerçek geçen zamandan (timestamp farkı) toplanır → frame hızından bağımsız.

import { createFaultRuleEngine } from "./faultRules";

const METRICS_LOST_RESET_FRAMES = 30;

export function createHoldEngine(exercise) {
  const hold = exercise.hold ?? {
    horizontalMinTilt: 60,
    straightEnter: 160,
    straightExit: 150,
    enterFrames: 4,
    breakEndMs: 6000,
  };

  const ruleEngine = createFaultRuleEngine(exercise.faultRules ?? []);
  let state = freshState();

  function freshState() {
    return {
      phase: "idle", // idle | holding | broken
      candidateValid: false,
      enterFrames: 0,
      heldMs: 0, // toplam geçerli tutuş süresi (ms)
      lastTickAt: null, // holding iken son sayım anı (ms hesabı)
      brokenSinceAt: null, // broken'a düşülen an (breakEndMs ölçer)
      everHeld: false, // hiç geçerli tutuş oldu mu (boş set ayrımı)
      metricsLostFrames: 0,
    };
  }

  /** Geçerli plank pozisyonu mu? (yatay + düz hat, histerezisli). */
  function isValidHold(metrics) {
    if (!metrics?.isHorizontal) return false;
    const angle = metrics.bodyLineAngle;
    if (angle == null) return false;
    if (state.phase === "holding") {
      // Tutuştayken: exit eşiğinin altına düşene kadar geçerli kalır (histerezis).
      return angle >= hold.straightExit;
    }
    // Tutuş dışındayken: enter eşiğini aşmadan geçerli sayılmaz.
    return angle >= hold.straightEnter;
  }

  function enterHolding(events) {
    state.phase = "holding";
    state.brokenSinceAt = null;
    state.everHeld = true;
    events.push({ type: "phase", phase: "holding" });
  }

  function leaveHolding(events, timestamp) {
    state.phase = "broken";
    state.brokenSinceAt = timestamp;
    state.lastTickAt = null;
    ruleEngine.clearTransient();
    events.push({ type: "phase", phase: "broken" });
  }

  /**
   * Her frame'de çağrılır.
   * @param {{landmarks:Array, worldLandmarks:Array|null}|null} frame
   * @param {number} timestamp performance.now()
   * @returns {Array} events: {type:"phase"|"hold"|"warning"|"end", ...}
   */
  function step(frame, timestamp) {
    const events = [];

    const metrics = frame
      ? exercise.computeMetrics(frame.landmarks, frame.worldLandmarks ?? null)
      : null;

    if (!metrics) {
      state.metricsLostFrames += 1;
      // Uzun süre metrik yok → tutuş koptu say (timer durur, süre korunur).
      if (state.metricsLostFrames >= METRICS_LOST_RESET_FRAMES) {
        if (state.phase === "holding") leaveHolding(events, timestamp);
      }
      return events;
    }
    state.metricsLostFrames = 0;

    const valid = isValidHold(metrics);

    if (state.phase === "holding") {
      if (valid) {
        // Geçen gerçek süreyi ekle (frame hızından bağımsız).
        if (state.lastTickAt != null) {
          const dt = timestamp - state.lastTickAt;
          // Negatif/aşırı sıçramayı (sekme, sekme arası) emniyete al.
          if (dt > 0 && dt < 2000) state.heldMs += dt;
        }
        state.lastTickAt = timestamp;

        // Form kuralları — yalnız holding fazında.
        const faultEvents = ruleEngine.step({
          metrics,
          landmarks: frame.landmarks,
          phase: "holding",
          timestamp,
        });
        for (const fault of faultEvents) {
          events.push({
            type: "warning",
            rule: fault.rule,
            severity: fault.severity,
            message: fault.message,
            speech: fault.speech,
          });
        }

        events.push({ type: "hold", heldMs: state.heldMs });
      } else {
        leaveHolding(events, timestamp);
      }
      return events;
    }

    // idle veya broken — geçerli pozisyon onay kareleriyle holding'e dönülür.
    if (valid) {
      if (!state.candidateValid) {
        state.candidateValid = true;
        state.enterFrames = 1;
      } else {
        state.enterFrames += 1;
      }
      if (state.enterFrames >= hold.enterFrames) {
        state.candidateValid = false;
        state.enterFrames = 0;
        state.lastTickAt = timestamp; // sayımı bu andan başlat
        enterHolding(events);
      }
    } else {
      state.candidateValid = false;
      state.enterFrames = 0;
      // broken çok uzun sürdüyse set bitti (hands-free otomatik).
      if (
        state.phase === "broken" &&
        state.everHeld &&
        state.brokenSinceAt != null &&
        timestamp - state.brokenSinceAt >= hold.breakEndMs
      ) {
        events.push({ type: "end", heldMs: state.heldMs });
      }
    }

    return events;
  }

  function reset() {
    state = freshState();
    ruleEngine.reset();
  }

  function getState() {
    return {
      phase: state.phase,
      heldMs: state.heldMs,
      heldSeconds: Math.floor(state.heldMs / 1000),
      everHeld: state.everHeld,
    };
  }

  /** Set özeti — tutulan süre + kural ihlal dağılımı (rep yerine seconds). */
  function getSummary() {
    return {
      heldMs: state.heldMs,
      heldSeconds: Math.floor(state.heldMs / 1000),
      rules: ruleEngine.getSummary(),
    };
  }

  return { step, reset, getState, getSummary };
}
