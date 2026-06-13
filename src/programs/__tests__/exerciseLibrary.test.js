// Hareket kütüphanesi — kapsam, takipli↔rehberli tutarlılığı, arama.

import { describe, it, expect } from "vitest";
import {
  EXERCISE_LIBRARY,
  TYPE_LABELS,
  getLibraryExercise,
  searchLibrary,
} from "../exerciseLibrary";
import { EXERCISES } from "../../exercises";

describe("exerciseLibrary — şema bütünlüğü", () => {
  it("her kayıt zorunlu alanları taşır", () => {
    for (const ex of EXERCISE_LIBRARY) {
      expect(ex.id).toBeTruthy();
      expect(ex.name).toBeTruthy();
      expect(TYPE_LABELS[ex.type]).toBeTruthy();
      expect(typeof ex.trackable).toBe("boolean");
      expect(ex.defaultDose?.type).toBeTruthy();
    }
  });

  it("id'ler benzersiz", () => {
    const ids = EXERCISE_LIBRARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("takipli↔rehberli alan tutarlılığı", () => {
    for (const ex of EXERCISE_LIBRARY) {
      if (ex.trackable) {
        expect(ex.ruleSetRef).toBeTruthy();
        expect(ex.trackingPhase).toMatch(/^P[012]$/);
        // takipli ruleSetRef gerçekten kayıt defterinde olmalı
        expect(EXERCISES.some((e) => e.id === ex.ruleSetRef)).toBe(true);
      } else {
        expect(ex.ruleSetRef).toBeNull();
        expect(ex.trackingPhase).toBeNull();
        // sınır dürüstlüğü: rehberlide gerekçe zorunlu
        expect(typeof ex.untrackableReason).toBe("string");
        expect(ex.untrackableReason.length).toBeGreaterThan(0);
      }
    }
  });

  it("takipli hareketler yalnız kayıtlı motorlara bağlı (squat/pushup/lunge + jumpingJack/kneeRaise + Batch 3 dumbbell + Batch 1+2 kalistenik hepsi P0)", () => {
    const tracked = EXERCISE_LIBRARY.filter((e) => e.trackable);
    expect(tracked.length).toBeGreaterThanOrEqual(5);
    const allowed = [
      "squat",
      "pushup",
      "lunge",
      "jumpingJack",
      "kneeRaise",
      "lateralRaise",
      "hammerCurl",
      "shoulderPress",
      "plank",
      // Batch 1 kalistenik gerçek-takip: glute bridge + leg raise yeni motorlar,
      // high knees kneeRaise motorunu paylaşır (yukarıda zaten allowed).
      "gluteBridge",
      "legRaise",
      // Batch 2 kalistenik: mountain climber (REP) + hollow hold (İZOMETRİK, plank holdEngine).
      "mountainClimber",
      "hollowHold",
    ];
    expect(tracked.every((e) => allowed.includes(e.ruleSetRef))).toBe(true);
    // Batch 2 aktivasyon dersi: takipli her hareket P0 (canlıda sayar).
    expect(tracked.every((e) => e.trackingPhase === "P0")).toBe(true);
    // P0 çekirdek: push-up, squat ailesi, lunge takipli olmalı
    expect(tracked.some((e) => e.ruleSetRef === "pushup")).toBe(true);
    expect(tracked.some((e) => e.ruleSetRef === "squat")).toBe(true);
    expect(tracked.some((e) => e.ruleSetRef === "lunge")).toBe(true);
    // P0 ısınma (Batch 2 aktivasyon): jumping jack + standing knee raise canlı takipli
    expect(tracked.some((e) => e.ruleSetRef === "jumpingJack")).toBe(true);
    expect(tracked.some((e) => e.ruleSetRef === "kneeRaise")).toBe(true);
    // Batch 3 dumbbell: lateral raise + hammer curl + shoulder press canlı P0
    expect(tracked.some((e) => e.ruleSetRef === "lateralRaise")).toBe(true);
    expect(tracked.some((e) => e.ruleSetRef === "hammerCurl")).toBe(true);
    expect(tracked.some((e) => e.ruleSetRef === "shoulderPress")).toBe(true);
    // Batch 4 izometrik: plank canlı P0 (holdEngine süre tutar)
    expect(tracked.some((e) => e.ruleSetRef === "plank")).toBe(true);
  });
});

describe("getLibraryExercise / searchLibrary", () => {
  it("id ile getirir, bilinmeyende null", () => {
    expect(getLibraryExercise("push-up")?.name).toContain("Push Up");
    expect(getLibraryExercise("yok")).toBeNull();
  });

  it("boş sorgu tüm listeyi döner", () => {
    expect(searchLibrary("").length).toBe(EXERCISE_LIBRARY.length);
    expect(searchLibrary("   ").length).toBe(EXERCISE_LIBRARY.length);
  });

  it("ada göre filtreler (aksan-duyarsız küçük harf)", () => {
    const r = searchLibrary("push");
    expect(r.some((e) => e.id === "push-up")).toBe(true);
    const sq = searchLibrary("squat");
    expect(sq.some((e) => e.ruleSetRef === "squat")).toBe(true);
  });

  it("tip etiketine göre filtreler", () => {
    const r = searchLibrary("makine");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.type === "machine")).toBe(true);
  });
});
