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

  it("takipli hareketler yalnız squat + pushup motoruna bağlı (P0 kapsamı)", () => {
    const tracked = EXERCISE_LIBRARY.filter((e) => e.trackable);
    expect(tracked.length).toBeGreaterThanOrEqual(2);
    expect(tracked.every((e) => ["squat", "pushup"].includes(e.ruleSetRef))).toBe(
      true
    );
    // push-up ve en az bir squat ailesi takipli olmalı
    expect(tracked.some((e) => e.ruleSetRef === "pushup")).toBe(true);
    expect(tracked.some((e) => e.ruleSetRef === "squat")).toBe(true);
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
