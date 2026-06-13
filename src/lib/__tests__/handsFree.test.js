// Hands-free orkestrasyon — saf state machine geçişleri:
// ANNOUNCE → COUNTDOWN → EXERCISE → REST → [otomatik] → sonraki ANNOUNCE → DONE.
// + klasik (handsFree=false) geriye uyum: slot başı doğrudan EXERCISE.

import { describe, it, expect } from "vitest";
import { createWorkoutSession } from "../programPlayer";

// İki dinlenmeli slotu olan minimal program: tek straight hareket, 2 set.
const program = {
  id: "hf",
  name: "Hands-free fixture",
  generalRules: { cardio: {}, plank: {} },
  days: [
    {
      id: "d1",
      label: "Gün 1",
      suggestedDay: "Pzt",
      blocks: [
        {
          type: "straight",
          label: "Ana",
          exercises: [
            {
              id: "x1",
              name: "Push Up",
              sets: 2,
              dose: { type: "reps", value: 10 },
              restSec: [60, 90],
            },
          ],
        },
      ],
    },
  ],
};

describe("hands-free state machine", () => {
  it("slot ANNOUNCE ile başlar, advancePhase ile COUNTDOWN sonra EXERCISE", () => {
    const s = createWorkoutSession(program, "d1", { handsFree: true });
    expect(s.getState().status).toBe("announce");
    expect(s.getState().handsFree).toBe(true);
    // announce hâlâ aktif slotu gösterir.
    expect(s.getState().slot.exercise.id).toBe("x1");

    expect(s.advancePhase().status).toBe("countdown");
    expect(s.advancePhase().status).toBe("exercise");
    // exercise'te advancePhase no-op.
    expect(s.advancePhase().status).toBe("exercise");
  });

  it("EXERCISE → completeSet → REST → finishRest → sonraki slot ANNOUNCE", () => {
    const s = createWorkoutSession(program, "d1", { handsFree: true });
    s.advancePhase(); // countdown
    s.advancePhase(); // exercise
    const afterSet = s.completeSet({ reps: 10 });
    expect(afterSet.status).toBe("rest");
    expect(afterSet.rest.seconds).toBe(60);

    const afterRest = s.finishRest();
    // Set 2 — yeni slot yine anonsla başlar (dokunmasız akış).
    expect(afterRest.status).toBe("announce");
    expect(afterRest.slot.setNumber).toBe(2);
  });

  it("son set sonrası DONE (dinlenme yok)", () => {
    const s = createWorkoutSession(program, "d1", { handsFree: true });
    // Set 1
    s.advancePhase();
    s.advancePhase();
    s.completeSet({ reps: 10 });
    s.finishRest();
    // Set 2
    s.advancePhase();
    s.advancePhase();
    const end = s.completeSet({ reps: 10 });
    expect(end.status).toBe("done");
    expect(end.completedSets).toBe(2);
  });

  it("completeSet yalnız EXERCISE'te iş yapar — announce/countdown'da no-op", () => {
    const s = createWorkoutSession(program, "d1", { handsFree: true });
    // announce iken completeSet → durum değişmez.
    expect(s.completeSet({ reps: 10 }).status).toBe("announce");
    s.advancePhase(); // countdown
    expect(s.completeSet({ reps: 10 }).status).toBe("countdown");
  });

  it("klasik mod (handsFree=false): slot doğrudan EXERCISE, ön durum yok", () => {
    const s = createWorkoutSession(program, "d1", { handsFree: false });
    expect(s.getState().status).toBe("exercise");
    // advancePhase klasik modda no-op (exercise'i bozmaz).
    expect(s.advancePhase().status).toBe("exercise");
    const afterSet = s.completeSet({ reps: 10 });
    expect(afterSet.status).toBe("rest");
    // finishRest sonrası klasikte yine doğrudan exercise.
    expect(s.finishRest().status).toBe("exercise");
  });

  it("varsayılan (opsiyon yok) klasik moddur — mevcut çağrılarla uyumlu", () => {
    const s = createWorkoutSession(program, "d1");
    expect(s.getState().status).toBe("exercise");
    expect(s.getState().handsFree).toBe(false);
  });

  it("tam tur: announce→countdown→exercise→rest→announce→…→done (otomatik akış izi)", () => {
    const s = createWorkoutSession(program, "d1", { handsFree: true });
    const trace = [s.getState().status];
    let guard = 0;
    while (s.getState().status !== "done" && guard < 50) {
      const st = s.getState().status;
      if (st === "announce" || st === "countdown") s.advancePhase();
      else if (st === "rest") s.finishRest();
      else s.completeSet({ reps: 10 });
      trace.push(s.getState().status);
      guard += 1;
    }
    expect(trace).toEqual([
      "announce",
      "countdown",
      "exercise",
      "rest",
      "announce",
      "countdown",
      "exercise",
      "done",
    ]);
  });
});
