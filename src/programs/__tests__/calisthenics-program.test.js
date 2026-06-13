// Kalistenik program — şema geçerliliği + player tüketimi + takipli/rehberli routing.
// PM tasarımı (2026-06-13). Owner bu hafta deneyecek; canlı sayım P0'a bağlı.

import { describe, it, expect } from "vitest";
import { calisthenicsProgram } from "../calisthenics-program";
import {
  buildSlots,
  createWorkoutSession,
  isPoseTracked,
  isIsometricDose,
} from "../../lib/programPlayer";
import { EXERCISES } from "../../exercises";

const DOSE_TYPES = new Set([
  "reps",
  "repRange",
  "time",
  "timeRange",
  "perSide",
  "hold",
]);

// Tüm günlerdeki tüm hareketleri düz dök.
function allExercises() {
  return calisthenicsProgram.days.flatMap((d) =>
    d.blocks.flatMap((b) => b.exercises)
  );
}

describe("kalistenik program — şema bütünlüğü", () => {
  it("program kimliği ve günleri var", () => {
    expect(calisthenicsProgram.id).toBe("calisthenics-2026-06");
    expect(calisthenicsProgram.name).toBe("Kalistenik — Bu Hafta");
    expect(calisthenicsProgram.days).toHaveLength(3);
    expect(calisthenicsProgram.days.map((d) => d.id)).toEqual([
      "cxA",
      "cxB",
      "cxC",
    ]);
  });

  it("hareket id'leri program genelinde benzersiz", () => {
    const ids = allExercises().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("her hareket zorunlu şema alanlarını taşır + geçerli doz", () => {
    for (const ex of allExercises()) {
      expect(ex.id).toBeTruthy();
      expect(ex.name).toBeTruthy();
      expect(typeof ex.sets).toBe("number");
      expect(ex.sets).toBeGreaterThan(0);
      expect(DOSE_TYPES.has(ex.dose?.type)).toBe(true);
      expect(typeof ex.trackable).toBe("boolean");
    }
  });

  it("takipli↔rehberli alan tutarlılığı (Batch 2 dersi: takipli = P0)", () => {
    for (const ex of allExercises()) {
      if (ex.trackable) {
        expect(ex.trackingPhase).toBe("P0");
        expect(ex.ruleSetRef).toBeTruthy();
        expect(ex.untrackableReason).toBeNull();
        // ruleSetRef gerçekten kayıtlı motor olmalı
        expect(EXERCISES.some((e) => e.id === ex.ruleSetRef)).toBe(true);
      } else {
        expect(ex.ruleSetRef).toBeNull();
        expect(ex.trackingPhase).toBeNull();
        expect(typeof ex.untrackableReason).toBe("string");
        expect(ex.untrackableReason.length).toBeGreaterThan(0);
        // rehberlide form ipucu coachNote (sesli okunur) zorunlu
        expect(typeof ex.coachNote).toBe("string");
        expect(ex.coachNote.length).toBeGreaterThan(0);
      }
    }
  });

  it("dış link YOK — tüm videoUrl null", () => {
    for (const ex of allExercises()) {
      expect(ex.videoUrl).toBeNull();
    }
  });
});

describe("kalistenik program — takipli vs rehberli dağılım", () => {
  // Batch 1: glute bridge + leg raise yeni motorlarla, high knees kneeRaise'i paylaşır →
  // takipli ruleSetRef kümesi 6'dan 8'e çıktı (gluteBridge, legRaise eklendi).
  it("takipli motorlar mevcut pose-rulesetleri (Batch 1 dahil)", () => {
    const tracked = allExercises().filter((e) => isPoseTracked(e));
    const refs = new Set(tracked.map((e) => e.ruleSetRef));
    expect([...refs].sort()).toEqual(
      [
        "gluteBridge",
        "jumpingJack",
        "kneeRaise",
        "legRaise",
        "lunge",
        "plank",
        "pushup",
        "squat",
      ].sort()
    );
  });

  it("rehberli hareketlerde benzersiz hareket adları (Batch 1 sonrası kalanlar)", () => {
    const guided = allExercises().filter((e) => !e.trackable);
    const names = new Set(guided.map((e) => e.name));
    // Batch 1'de glute bridge / leg raise / high knees TAKİPLİ oldu → guided'dan çıktı.
    // Kalan rehberliler: mountain climber, dips, masa-row, pike push-up, hollow hold,
    // calf raise, arm circles (+ leg swings ısınma).
    expect(names.size).toBeGreaterThanOrEqual(7);
    for (const want of [
      "Mountain Climber",
      "Dips",
      "Masa/Bar Row",
      "Pike Push-Up",
      "Hollow Hold",
      "Calf Raise",
      "Arm Circles",
    ]) {
      expect(names.has(want)).toBe(true);
    }
    // Batch 1 takipli oldu → artık rehberli DEĞİL:
    for (const tracked of ["Glute Bridge", "Leg Raise", "High Knees"]) {
      expect(names.has(tracked)).toBe(false);
    }
  });

  it("her gün en az 3 takipli ana hareket → canlı form feedback", () => {
    for (const day of calisthenicsProgram.days) {
      const trackedCount = day.blocks
        .flatMap((b) => b.exercises)
        .filter((e) => isPoseTracked(e)).length;
      expect(trackedCount).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("kalistenik program — player tüketimi", () => {
  it("her gün createWorkoutSession ile çalışır ve slot üretir", () => {
    for (const day of calisthenicsProgram.days) {
      const session = createWorkoutSession(calisthenicsProgram, day.id, {
        handsFree: true,
      });
      const slots = buildSlots(day);
      expect(slots.length).toBeGreaterThan(0);
      // hands-free ilk durum: announce
      expect(session.getState().status).toBe("announce");
    }
  });

  it("takipli 6 hareket pose moduna, rehberli hepsi guided'a girer", () => {
    for (const ex of allExercises()) {
      const poseReady =
        isPoseTracked(ex) && EXERCISES.some((e) => e.id === ex.ruleSetRef);
      if (ex.trackable) {
        expect(poseReady).toBe(true);
      } else {
        expect(poseReady).toBe(false);
      }
    }
  });

  it("plank bitiriş izometrik (hold) — her gün var", () => {
    for (const day of calisthenicsProgram.days) {
      const finisher = day.blocks.find((b) => b.type === "finisher");
      expect(finisher).toBeTruthy();
      const plank = finisher.exercises[0];
      expect(plank.ruleSetRef).toBe("plank");
      expect(isIsometricDose(plank.dose)).toBe(true);
      expect(isPoseTracked(plank)).toBe(true);
    }
  });

  it("tam gün akışı sonuna kadar yürür (done)", () => {
    const session = createWorkoutSession(calisthenicsProgram, "cxA", {
      handsFree: true,
    });
    let guard = 0;
    let state = session.getState();
    while (state.status !== "done" && guard < 5000) {
      guard += 1;
      if (state.status === "announce" || state.status === "countdown") {
        state = session.advancePhase();
      } else if (state.status === "exercise") {
        state = session.completeSet({ reps: 10 });
      } else if (state.status === "rest") {
        state = session.finishRest();
      } else {
        break;
      }
    }
    expect(state.status).toBe("done");
    expect(session.getDaySummary().totalSets).toBeGreaterThan(0);
  });
});

describe("kalistenik program — foto eşleme", () => {
  it("bundle edilen hareketlerin fotosu çözülür", async () => {
    const { hasPhotos } = await import("../../lib/exercisePhotos");
    const byName = (n) => allExercises().find((e) => e.name === n);
    // free-exercise-db'de bulunan + bundle edilenler (artık Glute Bridge/Leg Raise takipli
    // ama fotoları hâlâ bundle'lı — foto çözümü trackable durumundan bağımsız):
    expect(hasPhotos(byName("Glute Bridge"))).toBe(true);
    expect(hasPhotos(byName("Mountain Climber"))).toBe(true);
    expect(hasPhotos(byName("Leg Raise"))).toBe(true);
    expect(hasPhotos(byName("Dips"))).toBe(true);
    expect(hasPhotos(byName("Masa/Bar Row"))).toBe(true);
    expect(hasPhotos(byName("Calf Raise"))).toBe(true);
    expect(hasPhotos(byName("Arm Circles"))).toBe(true);
    // Batch 1: High Knees artık kneeRaise motorunu paylaşıyor → ruleSetRef üzerinden
    // standing-knee-raise fotosunu devralır (placeholder yerine gerçek foto).
    expect(hasPhotos(byName("High Knees"))).toBe(true);
    // Hâlâ fotosuz → placeholder'a düşer:
    expect(hasPhotos(byName("Pike Push-Up"))).toBe(false);
    expect(hasPhotos(byName("Hollow Hold"))).toBe(false);
  });
});
