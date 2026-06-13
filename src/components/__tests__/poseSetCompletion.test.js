// PoseSetScreen tamamlama KONTRATI — owner canlı test kök neden regresyon kalkanı.
//
// KÖK NEDEN (SORUN 2): day1 ilk hareketi Jumping Jack, dozu {type:"time",seconds:45},
// ama trackable → ProgramMode onu PoseSetScreen'e (rep ekranı) yönlendiriyor.
// PoseSetScreen ESKİDEN yalnız rep-hedefiyle biterdi (doseTargetReps). Time-doz için
// doseTargetReps=null → otomatik-bitirme HİÇ tetiklenmez → set sonsuza kadar açık →
// hands-free akış (rest / sonraki hareket / "dur dinlen") HİÇ görünmez.
//
// Düzeltme: time-dozlu pose seti için geri sayım yolu (doseTargetSeconds). Bu test,
// pose ekranının HANGİ tamamlama yolunu seçeceğini belirleyen DOZ KONTRATINI sabitler
// (DOM/kamera olmadan, saf). + akışın bu slottan sonra devam ettiğini state machine
// üzerinden doğrular.

import { describe, it, expect } from "vitest";
import {
  doseTargetReps,
  doseTargetSeconds,
  isPoseTracked,
  isIsometricDose,
  createWorkoutSession,
} from "../../lib/programPlayer";
import { ownerProgram } from "../../programs/default-program";
import { EXERCISES } from "../../exercises";

// PoseSetScreen'deki tamamlama-yolu seçimini birebir yansıtır.
function completionPath(dose) {
  const target = doseTargetReps(dose);
  if (target != null) return { mode: "reps", target };
  const seconds = doseTargetSeconds(dose);
  if (seconds != null) return { mode: "time", target: seconds };
  return { mode: "none" }; // ← eski hata: time-doz burada düşüp asla bitmezdi
}

describe("PoseSetScreen tamamlama kontratı (time-doz kök neden)", () => {
  it("rep-doz → 'reps' yolu (hedef rep'te biter)", () => {
    expect(completionPath({ type: "reps", value: 12 })).toEqual({
      mode: "reps",
      target: 12,
    });
  });

  it("perSide-doz → 'reps' yolu (toplam = 2× taraf)", () => {
    expect(completionPath({ type: "perSide", value: 12 })).toEqual({
      mode: "reps",
      target: 24,
    });
  });

  it("time-doz → 'time' yolu (süre dolunca biter) — ESKİDEN 'none' = sonsuz takılma", () => {
    const path = completionPath({ type: "time", seconds: 45 });
    expect(path).toEqual({ mode: "time", target: 45 });
    // Regresyon kalkanı: time-dozlu pose seti ASLA "none" olmamalı.
    expect(path.mode).not.toBe("none");
  });

  it("day1 ilk pose hareketi (Jumping Jack) time-dozlu VE artık bitebilir", () => {
    const day1 = ownerProgram.days.find((d) => d.id === "day1");
    const jj = day1.blocks[0].exercises.find((e) => e.ruleSetRef === "jumpingJack");
    expect(jj).toBeTruthy();
    // Gerçekten PoseSetScreen'e yönleniyor (pose-takipli, izometrik DEĞİL).
    expect(isPoseTracked(jj)).toBe(true);
    expect(EXERCISES.some((e) => e.id === jj.ruleSetRef)).toBe(true);
    expect(isIsometricDose(jj.dose)).toBe(false);
    // Ve tamamlama yolu artık 'time' → set biter → akış devam eder.
    expect(completionPath(jj.dose).mode).toBe("time");
  });
});

describe("hands-free akış izi: time-dozlu jumping jack'ten SONRA akış devam eder", () => {
  it("day1 başından ilk dinlenmeye kadar zincir kopmadan akar", () => {
    const s = createWorkoutSession(ownerProgram, "day1", { handsFree: true });
    const trace = [];
    let guard = 0;
    // İlk REST'e ulaşana kadar akışı dokunmasız sür (setleri tamamla).
    while (s.getState().status !== "rest" && s.getState().status !== "done" && guard < 30) {
      const st = s.getState().status;
      trace.push(st);
      if (st === "announce" || st === "countdown") s.advancePhase();
      else if (st === "exercise") s.completeSet({ reps: 1 });
      guard += 1;
    }
    // İlk slot Jumping Jack: announce → countdown → exercise sırası görülmeli.
    expect(trace.slice(0, 3)).toEqual(["announce", "countdown", "exercise"]);
    // Akış kilitlenmeden ilerledi (rest'e ulaştı, sonsuz döngü değil).
    expect(s.getState().status).toBe("rest");
    expect(guard).toBeLessThan(30);
  });
});
