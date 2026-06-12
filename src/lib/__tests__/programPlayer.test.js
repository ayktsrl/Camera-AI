// Program Modu akış motoru — superset turu, dinlenme kuralları, gün tamamlanma
// + owner program verisi bütünlük denetimi (hoca notları, rehberli gerekçeler).

import { describe, it, expect } from "vitest";
import {
  buildSlots,
  createWorkoutSession,
  isPoseTracked,
  doseLabel,
  doseTargetReps,
  doseTargetSeconds,
  slotPositionLabel,
  countDayExercises,
  estimateDayMinutes,
} from "../programPlayer";
import { ownerProgram } from "../../programs/default-program";

// ---- küçük fixture — kuralları izole test etmek için ----

const fixtureProgram = {
  id: "fixture",
  name: "Fixture",
  generalRules: {
    cardio: { trainingDayMin: 30, restDayMin: 40, hrBpm: [110, 130] },
    plank: { perWeek: 3, sets: 3, mode: "max", after: "cardio" },
    defaultRestSec: [60, 90],
  },
  days: [
    {
      id: "dayX",
      label: "Test Günü",
      suggestedDay: "Pazartesi",
      blocks: [
        {
          type: "warmup",
          label: "Isınma",
          exercises: [
            { id: "w1", name: "Isınma 1", sets: 1, dose: { type: "reps", value: 15 } },
            { id: "w2", name: "Isınma 2", sets: 1, dose: { type: "perSide", value: 12 } },
          ],
        },
        {
          type: "superset",
          label: "Superset A",
          rounds: 3,
          restBetweenExercisesSec: 0,
          restAfterRoundSec: 50,
          exercises: [
            { id: "a1", name: "A1", sets: 3, dose: { type: "reps", value: 12 } },
            { id: "a2", name: "A2", sets: 3, dose: { type: "reps", value: 12 } },
            { id: "a3", name: "A3", sets: 3, dose: { type: "reps", value: 12 } },
          ],
        },
        {
          type: "straight",
          label: "Ana",
          exercises: [
            {
              id: "s1",
              name: "Düz 1",
              sets: 2,
              dose: { type: "repRange", min: 8, max: 10 },
              restSec: [60, 90],
            },
          ],
        },
        {
          type: "stretch",
          label: "Esneme",
          exercises: [
            { id: "st1", name: "Stretch", sets: 2, dose: { type: "timeRange", minSec: 30, maxSec: 40 } },
          ],
        },
      ],
    },
  ],
};

const fixtureDay = fixtureProgram.days[0];

describe("buildSlots", () => {
  it("superset turu doğru döner: A1→A2→A3 sıralı, tur sayısı kadar", () => {
    const slots = buildSlots(fixtureDay).filter((s) => s.block.label === "Superset A");
    expect(slots).toHaveLength(9); // 3 hareket × 3 tur
    expect(slots.map((s) => s.exercise.id)).toEqual([
      "a1", "a2", "a3",
      "a1", "a2", "a3",
      "a1", "a2", "a3",
    ]);
    expect(slots.map((s) => s.round)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
  });

  it("superset içi geçişte dinlenme 0, tur sonunda restAfterRoundSec", () => {
    const slots = buildSlots(fixtureDay).filter((s) => s.block.label === "Superset A");
    for (const slot of slots) {
      if (slot.posInRound < slot.roundSize) {
        expect(slot.restAfterSec).toBe(0);
      } else {
        expect(slot.restAfterSec).toBe(50);
      }
    }
  });

  it("straight blokta set arası dinlenme restSec bandının altından başlar", () => {
    const slots = buildSlots(fixtureDay).filter((s) => s.exercise.id === "s1");
    expect(slots).toHaveLength(2);
    expect(slots[0].restAfterSec).toBe(60);
    expect(slots[0].restRangeSec).toEqual([60, 90]);
  });

  it("warmup ve stretch hareketlerinde dinlenme geri sayımı yok", () => {
    const slots = buildSlots(fixtureDay);
    const warmup = slots.filter((s) => s.block.type === "warmup");
    expect(warmup.every((s) => s.restAfterSec === 0)).toBe(true);
  });

  it("günün son setinden sonra dinlenme yok", () => {
    const slots = buildSlots(fixtureDay);
    expect(slots[slots.length - 1].restAfterSec).toBe(0);
  });
});

describe("createWorkoutSession — akış", () => {
  it("warmup'ta set bitince dinlenmesiz sonraki harekete geçer", () => {
    const session = createWorkoutSession(fixtureProgram, "dayX");
    expect(session.getState().slot.exercise.id).toBe("w1");
    const state = session.completeSet({ reps: 15 });
    expect(state.status).toBe("exercise");
    expect(state.slot.exercise.id).toBe("w2");
  });

  it("superset turu: A3 bitince 50 sn dinlenme, sonra A1'e döner ve tur artar", () => {
    const session = createWorkoutSession(fixtureProgram, "dayX");
    // warmup'ı geç
    session.completeSet({ reps: 15 });
    session.completeSet({ reps: 24 });

    // Tur 1: A1 → A2 dinlenmesiz
    let state = session.getState();
    expect(state.slot.exercise.id).toBe("a1");
    expect(state.slot.round).toBe(1);
    state = session.completeSet({ reps: 12 });
    expect(state.status).toBe("exercise"); // dinlenme yok
    expect(state.slot.exercise.id).toBe("a2");
    state = session.completeSet({ reps: 12 });
    expect(state.slot.exercise.id).toBe("a3");

    // A3 bitti → tur sonu dinlenmesi 50 sn
    state = session.completeSet({ reps: 12 });
    expect(state.status).toBe("rest");
    expect(state.rest.seconds).toBe(50);

    // Dinlenme bitti → A1, tur 2
    state = session.finishRest();
    expect(state.status).toBe("exercise");
    expect(state.slot.exercise.id).toBe("a1");
    expect(state.slot.round).toBe(2);
  });

  it("straight set arası dinlenme 60 sn ve bandı [60,90]", () => {
    const session = createWorkoutSession(fixtureProgram, "dayX");
    // warmup (2) + superset (9 set, 3 dinlenme) geç
    for (let i = 0; i < 2; i++) session.completeSet({});
    for (let round = 0; round < 3; round++) {
      session.completeSet({});
      session.completeSet({});
      session.completeSet({});
      if (session.getState().status === "rest") session.finishRest();
    }
    let state = session.getState();
    expect(state.slot.exercise.id).toBe("s1");
    expect(state.slot.setNumber).toBe(1);

    state = session.completeSet({ reps: 10 });
    expect(state.status).toBe("rest");
    expect(state.rest.seconds).toBe(60);
    expect(state.rest.rangeSec).toEqual([60, 90]);

    state = session.finishRest();
    expect(state.slot.exercise.id).toBe("s1");
    expect(state.slot.setNumber).toBe(2);
  });

  it("son set tamamlanınca done — dinlenme ekranı yok", () => {
    const session = createWorkoutSession(fixtureProgram, "dayX");
    let guard = 0;
    while (session.getState().status !== "done" && guard < 100) {
      const state = session.getState();
      if (state.status === "rest") session.finishRest();
      else session.completeSet({ reps: 10 });
      guard += 1;
    }
    const state = session.getState();
    expect(state.status).toBe("done");
    expect(state.completedSets).toBe(state.slotCount);
  });

  it("gün özeti hareket bazında gruplar, set dökümü ve kardiyo kuralı taşır", () => {
    const session = createWorkoutSession(fixtureProgram, "dayX");
    let guard = 0;
    while (session.getState().status !== "done" && guard < 100) {
      const state = session.getState();
      if (state.status === "rest") session.finishRest();
      else session.completeSet({ reps: 12 });
      guard += 1;
    }
    const summary = session.getDaySummary();
    expect(summary.dayLabel).toBe("Test Günü");
    expect(summary.totalSets).toBe(summary.plannedSets);
    const a1 = summary.exercises.find((e) => e.exerciseId === "a1");
    expect(a1.sets).toHaveLength(3);
    expect(a1.sets.every((s) => s.reps === 12)).toBe(true);
    expect(summary.cardio.trainingDayMin).toBe(30);
    expect(summary.cardio.hrBpm).toEqual([110, 130]);
    expect(summary.plank.sets).toBe(3);
  });

  it("pose set özeti log'da korunur", () => {
    const session = createWorkoutSession(fixtureProgram, "dayX");
    const poseSummary = { repCount: 15, faultyCount: 2, rules: [] };
    session.completeSet({ reps: 15, summary: poseSummary });
    const summary = session.getDaySummary();
    expect(summary.exercises[0].sets[0].summary).toEqual(poseSummary);
  });

  it("bilinmeyen gün için hata fırlatır", () => {
    expect(() => createWorkoutSession(fixtureProgram, "yok")).toThrow();
  });
});

describe("faz kapısı — isPoseTracked", () => {
  it("P0 fazında sadece P0 hareketleri pose-takipli", () => {
    expect(isPoseTracked({ trackable: true, trackingPhase: "P0", ruleSetRef: "squat" })).toBe(true);
    expect(isPoseTracked({ trackable: true, trackingPhase: "P1", ruleSetRef: "lunge" })).toBe(false);
    expect(isPoseTracked({ trackable: true, trackingPhase: "P2", ruleSetRef: "jumpingJack" })).toBe(false);
    expect(isPoseTracked({ trackable: false, trackingPhase: null, ruleSetRef: null })).toBe(false);
  });

  it("aktif faz ilerleyince hareketler kod değişmeden yükselir", () => {
    const lunge = { trackable: true, trackingPhase: "P1", ruleSetRef: "lunge" };
    expect(isPoseTracked(lunge, "P0")).toBe(false);
    expect(isPoseTracked(lunge, "P1")).toBe(true);
    expect(isPoseTracked(lunge, "P2")).toBe(true);
  });
});

describe("doz yardımcıları", () => {
  it("etiketler", () => {
    expect(doseLabel({ type: "reps", value: 12 })).toBe("12 tekrar");
    expect(doseLabel({ type: "repRange", min: 8, max: 10 })).toBe("8–10 tekrar");
    expect(doseLabel({ type: "time", seconds: 45 })).toBe("45 sn");
    expect(doseLabel({ type: "timeRange", minSec: 30, maxSec: 40 })).toBe("30–40 sn");
    expect(doseLabel({ type: "perSide", value: 12 })).toBe("12 + 12 (sağ/sol)");
  });

  it("tekrar hedefi: reps→value, repRange→max, perSide→2×, süre→null", () => {
    expect(doseTargetReps({ type: "reps", value: 12 })).toBe(12);
    expect(doseTargetReps({ type: "repRange", min: 15, max: 20 })).toBe(20);
    expect(doseTargetReps({ type: "perSide", value: 12 })).toBe(24);
    expect(doseTargetReps({ type: "time", seconds: 45 })).toBeNull();
  });

  it("süre hedefi: time→seconds, timeRange→maxSec, tekrar→null", () => {
    expect(doseTargetSeconds({ type: "time", seconds: 45 })).toBe(45);
    expect(doseTargetSeconds({ type: "timeRange", minSec: 30, maxSec: 40 })).toBe(40);
    expect(doseTargetSeconds({ type: "reps", value: 12 })).toBeNull();
  });

  it("pozisyon etiketi: straight 'Set 2/4', superset 'Tur 2/4 · 1/3'", () => {
    expect(
      slotPositionLabel({ round: null, setNumber: 2, totalSets: 4 })
    ).toBe("Set 2/4");
    expect(
      slotPositionLabel({ round: 2, totalRounds: 4, posInRound: 1, roundSize: 3 })
    ).toBe("Tur 2/4 · 1/3");
  });
});

// ---- owner program verisi — spec Ek-A bütünlük denetimi ----

describe("ownerProgram veri bütünlüğü (spec Ek-A)", () => {
  it("4 gün, kalem sayıları spec özet tablosuyla uyumlu (12+13+13+13)", () => {
    expect(ownerProgram.days).toHaveLength(4);
    expect(ownerProgram.days.map(countDayExercises)).toEqual([12, 13, 13, 13]);
  });

  it("her hareket zorunlu alanları taşır; rehberli↔takipli alan tutarlılığı", () => {
    for (const day of ownerProgram.days) {
      for (const block of day.blocks) {
        for (const ex of block.exercises) {
          expect(ex.id).toBeTruthy();
          expect(ex.name).toBeTruthy();
          expect(ex.videoUrl).toMatch(/^https:\/\/www\.youtube\.com\//);
          expect(typeof ex.embeddable).toBe("boolean");
          expect(ex.sets).toBeGreaterThan(0);
          expect(ex.dose?.type).toBeTruthy();
          if (ex.trackable) {
            expect(ex.ruleSetRef).toBeTruthy();
            expect(ex.trackingPhase).toMatch(/^P[012]$/);
            expect(ex.untrackableReason).toBeNull();
          } else {
            expect(ex.ruleSetRef).toBeNull();
            // sınır dürüstlüğü: rehberlide gerekçe zorunlu
            expect(typeof ex.untrackableReason).toBe("string");
            expect(ex.untrackableReason.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("hareket id'leri gün içinde benzersiz", () => {
    for (const day of ownerProgram.days) {
      const ids = day.blocks.flatMap((b) => b.exercises.map((e) => e.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("superset dinlenmeleri PDF'e birebir: SS-A 50, SS-B 60, SS-C 50", () => {
    const day1 = ownerProgram.days[0];
    const supersets = day1.blocks.filter((b) => b.type === "superset");
    expect(supersets.map((b) => [b.label, b.restAfterRoundSec])).toEqual([
      ["Superset A", 50],
      ["Superset B", 60],
      ["Superset C", 50],
    ]);
    expect(supersets.every((b) => b.restBetweenExercisesSec === 0)).toBe(true);
    expect(supersets.every((b) => b.rounds === 4)).toBe(true);
  });

  it("hoca notları kelimesi kelimesine duruyor (örneklem)", () => {
    const day1 = ownerProgram.days[0];
    const lunge = day1.blocks[1].exercises[0];
    expect(lunge.coachNote).toBe(
      "Lunge'da diz asla öne fırlamasın, gövde hafif öne eğilsin"
    );
    const pushUp = day1.blocks[1].exercises[2];
    expect(pushUp.coachNote).toBe(
      "Eller göğüs hizasında, boyun kırılmasın, karın sık"
    );
    const day4 = ownerProgram.days[3];
    const barbellSquat = day4.blocks[1].exercises[0];
    expect(barbellSquat.coachNote).toBe(
      "ayak 15-20° dışa, taban yere basılı, dizler içeri çökmesin"
    );
  });

  it("embed'e kapalı iki video bayraklı (Tc-9yvl5Zt8, 0RAzZhXnsww)", () => {
    const all = ownerProgram.days.flatMap((d) =>
      d.blocks.flatMap((b) => b.exercises)
    );
    const closed = all.filter((e) => e.embeddable === false);
    expect(closed.map((e) => e.id).sort()).toEqual(["lunge-lateral", "squat-press"]);
  });

  it("P0 squat slotları: BW squat ısınmaları, squat+press, barbell squat", () => {
    const all = ownerProgram.days.flatMap((d) =>
      d.blocks.flatMap((b) => b.exercises)
    );
    const p0 = all.filter((e) => isPoseTracked(e, "P0"));
    expect(p0.map((e) => e.id).sort()).toEqual([
      "barbell-squat",
      "bw-squat-warmup",
      "bw-squat-warmup-4",
      "squat-press",
    ]);
    expect(p0.every((e) => e.ruleSetRef === "squat")).toBe(true);
  });

  it("genel kurallar: kardiyo 30/40 dk 110–130 bpm, plank 3×max, dinlenme bandı 60–90", () => {
    const g = ownerProgram.generalRules;
    expect(g.cardio).toEqual({ trainingDayMin: 30, restDayMin: 40, hrBpm: [110, 130] });
    expect(g.plank).toEqual({ perWeek: 3, sets: 3, mode: "max", after: "cardio" });
    expect(g.defaultRestSec).toEqual([60, 90]);
    expect(g.negativeTempoSec).toEqual([2, 3]);
    expect(g.daysFlexible).toBe(true);
  });

  it("A1 baştan sona player ile oynatılabilir (P0 kabul kriteri)", () => {
    const session = createWorkoutSession(ownerProgram, "day1");
    let guard = 0;
    while (session.getState().status !== "done" && guard < 300) {
      const state = session.getState();
      if (state.status === "rest") session.finishRest();
      else session.completeSet({ reps: 12 });
      guard += 1;
    }
    expect(session.getState().status).toBe("done");
    // 12 hareket: ısınma 4 set + SS-A 12 + SS-B 8 + SS-C 12 = 36 set
    expect(session.getDaySummary().totalSets).toBe(36);
    expect(session.getDaySummary().exercises).toHaveLength(12);
  });

  it("gün süre tahmini makul aralıkta", () => {
    for (const day of ownerProgram.days) {
      const min = estimateDayMinutes(day);
      expect(min).toBeGreaterThanOrEqual(20);
      expect(min).toBeLessThanOrEqual(120);
    }
  });
});
