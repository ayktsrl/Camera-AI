// Program Modu akış motoru — saf modül, React'siz.
// Gün verisini (src/programs/) düz bir "set slotu" dizisine açar ve
// hareket → dinlenme → hareket → … → gün özeti state machine'ini yönetir.
//
// Dinlenme kuralları (spec §3, PDF'e birebir):
//   superset içi geçiş: 0 sn (A1→A2→A3 dinlenmesiz)
//   superset tur sonu : block.restAfterRoundSec (SS-A/C 50, SS-B 60)
//   straight set arası: exercise.restSec[0] başlangıç, [min,max] bandı (60–90)
//   warmup/stretch    : restSec yok → dinlenme yok
//   günün son seti    : dinlenme yok → done

export const TRACKING_PHASES = ["P0", "P1", "P2"];

/** Şu an aktif pose-takip fazı. P1 çıktığında bu sabit tek satır değişir. */
export const ACTIVE_TRACKING_PHASE = "P0";

/**
 * Hareket bu fazda pose-takipli mi?
 * (UI ayrıca ruleSetRef'in exercise kayıt defterinde olduğunu doğrular.)
 */
export function isPoseTracked(exercise, activePhase = ACTIVE_TRACKING_PHASE) {
  if (!exercise?.trackable || !exercise.ruleSetRef || !exercise.trackingPhase) {
    return false;
  }
  const phase = TRACKING_PHASES.indexOf(exercise.trackingPhase);
  const active = TRACKING_PHASES.indexOf(activePhase);
  return phase !== -1 && active !== -1 && phase <= active;
}

/** Doz etiketi — UI metni. */
export function doseLabel(dose) {
  if (!dose) return "";
  switch (dose.type) {
    case "reps":
      return `${dose.value} tekrar`;
    case "repRange":
      return `${dose.min}–${dose.max} tekrar`;
    case "time":
      return `${dose.seconds} sn`;
    case "timeRange":
      return `${dose.minSec}–${dose.maxSec} sn`;
    case "perSide":
      return `${dose.value} + ${dose.value} (sağ/sol)`;
    default:
      return "";
  }
}

/** Tekrar hedefi — pose otomatik bitirme ve rehberli giriş varsayılanı. */
export function doseTargetReps(dose) {
  if (!dose) return null;
  switch (dose.type) {
    case "reps":
      return dose.value;
    case "repRange":
      return dose.max; // bandın üstü; kullanıcı erken bitirebilir
    case "perSide":
      return dose.value * 2; // sağ + sol toplam
    default:
      return null; // süre bazlı
  }
}

/** Süre hedefi (sn) — time/timeRange dozları için. */
export function doseTargetSeconds(dose) {
  if (!dose) return null;
  if (dose.type === "time") return dose.seconds;
  if (dose.type === "timeRange") return dose.maxSec;
  return null;
}

/**
 * Günü düz set-slotu dizisine açar.
 * Slot = ekranda bir kez görünen tek set; restAfterSec o set bittikten
 * sonraki dinlenmedir (0 → dinlenme ekranı yok).
 */
export function buildSlots(day) {
  const slots = [];

  for (const block of day.blocks) {
    if (block.type === "superset") {
      const size = block.exercises.length;
      for (let round = 1; round <= block.rounds; round++) {
        block.exercises.forEach((exercise, i) => {
          const lastInRound = i === size - 1;
          slots.push({
            exercise,
            block,
            round,
            totalRounds: block.rounds,
            posInRound: i + 1,
            roundSize: size,
            setNumber: round,
            totalSets: block.rounds,
            restAfterSec: lastInRound
              ? block.restAfterRoundSec
              : (block.restBetweenExercisesSec ?? 0),
            restRangeSec: lastInRound
              ? [block.restAfterRoundSec, block.restAfterRoundSec]
              : null,
          });
        });
      }
    } else {
      for (const exercise of block.exercises) {
        const range = exercise.restSec ?? null;
        for (let s = 1; s <= exercise.sets; s++) {
          slots.push({
            exercise,
            block,
            round: null,
            totalRounds: null,
            posInRound: null,
            roundSize: null,
            setNumber: s,
            totalSets: exercise.sets,
            restAfterSec: range ? range[0] : 0,
            restRangeSec: range,
          });
        }
      }
    }
  }

  // Günün son setinden sonra dinlenme yok — doğrudan gün özeti.
  if (slots.length > 0) {
    slots[slots.length - 1] = {
      ...slots[slots.length - 1],
      restAfterSec: 0,
      restRangeSec: null,
    };
  }

  return slots;
}

/** Set göstergesi etiketi: "Set 2/4" veya superset'te "Tur 2/4 · 1/3". */
export function slotPositionLabel(slot) {
  if (slot.round != null) {
    return `Tur ${slot.round}/${slot.totalRounds} · ${slot.posInRound}/${slot.roundSize}`;
  }
  return `Set ${slot.setNumber}/${slot.totalSets}`;
}

/** Gündeki hareket kalemi sayısı (set değil, hareket). */
export function countDayExercises(day) {
  return day.blocks.reduce((sum, b) => sum + b.exercises.length, 0);
}

/** Kaba gün süresi tahmini (dakika, 5'e yuvarlı) — gün seçim ekranı için. */
export function estimateDayMinutes(day) {
  const slots = buildSlots(day);
  let seconds = 0;
  for (const slot of slots) {
    const t = doseTargetSeconds(slot.exercise.dose);
    const reps = doseTargetReps(slot.exercise.dose);
    seconds += t != null ? t : (reps ?? 10) * 3; // ~3 sn/tekrar
    seconds += slot.restAfterSec;
    seconds += 15; // geçiş/hazırlık payı
  }
  return Math.max(5, Math.round(seconds / 300) * 5);
}

/**
 * Antrenman oturumu — tek günlük akış state machine'i.
 *
 * Durumlar: "exercise" (set yapılıyor) → completeSet() →
 *           "rest" (restAfterSec > 0 ise) → finishRest() →
 *           sonraki slot … son slot → "done".
 */
export function createWorkoutSession(program, dayId) {
  const day = program.days.find((d) => d.id === dayId);
  if (!day) throw new Error(`Bilinmeyen gün: ${dayId}`);

  const slots = buildSlots(day);
  const log = [];

  let index = 0;
  let status = slots.length > 0 ? "exercise" : "done";
  let rest = null; // { seconds, rangeSec } — status === "rest" iken

  function getState() {
    const slot = index < slots.length ? slots[index] : null;
    return {
      status,
      day,
      slot: status === "done" ? null : slot,
      // Dinlenme sırasında index hâlâ biten sette — sıradaki hareket bir sonraki.
      nextSlot: status === "rest" ? (slots[index + 1] ?? null) : null,
      slotIndex: index,
      slotCount: slots.length,
      completedSets: log.length,
      rest,
    };
  }

  /**
   * Aktif seti tamamlar; log'a yazar ve dinlenmeye ya da sonraki slota geçer.
   * @param {{reps?: number|null, seconds?: number|null, summary?: object|null}} result
   *   summary: pose setlerinde repEngine özeti ({repCount, faultyCount, rules}).
   */
  function completeSet(result = {}) {
    if (status !== "exercise") return getState();

    const slot = slots[index];
    log.push({
      exerciseId: slot.exercise.id,
      name: slot.exercise.name,
      blockLabel: slot.block.label,
      blockType: slot.block.type,
      setNumber: slot.setNumber,
      totalSets: slot.totalSets,
      round: slot.round,
      dose: slot.exercise.dose,
      reps: result.reps ?? null,
      seconds: result.seconds ?? null,
      summary: result.summary ?? null,
    });

    const hasNext = index < slots.length - 1;
    if (!hasNext) {
      status = "done";
      rest = null;
      return getState();
    }

    if (slot.restAfterSec > 0) {
      status = "rest";
      rest = {
        seconds: slot.restAfterSec,
        rangeSec: slot.restRangeSec ?? [slot.restAfterSec, slot.restAfterSec],
      };
      return getState();
    }

    index += 1;
    return getState();
  }

  /** Dinlenmeyi bitirir (geri sayım doldu veya "Geç") — sonraki slota geçer. */
  function finishRest() {
    if (status !== "rest") return getState();
    rest = null;
    index += 1;
    status = "exercise";
    return getState();
  }

  /** Gün özeti — hareket bazında gruplu set dökümü + genel kural hatırlatmaları. */
  function getDaySummary() {
    const groups = [];
    const byId = new Map();
    for (const entry of log) {
      let group = byId.get(entry.exerciseId);
      if (!group) {
        group = {
          exerciseId: entry.exerciseId,
          name: entry.name,
          blockLabel: entry.blockLabel,
          dose: entry.dose,
          sets: [],
        };
        byId.set(entry.exerciseId, group);
        groups.push(group);
      }
      group.sets.push(entry);
    }
    return {
      dayId: day.id,
      dayLabel: day.label,
      totalSets: log.length,
      plannedSets: slots.length,
      exercises: groups,
      cardio: program.generalRules?.cardio ?? null,
      plank: program.generalRules?.plank ?? null,
    };
  }

  return { getState, completeSet, finishRest, getDaySummary, slots, day };
}
