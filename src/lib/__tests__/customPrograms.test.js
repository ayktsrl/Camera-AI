// Özel program üretimi — şema geçerliliği, localStorage round-trip,
// ve "push up 10x3" akışının createWorkoutSession ile uçtan uca çalışması.

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildCustomProgram,
  loadCustomPrograms,
  saveCustomProgram,
  deleteCustomProgram,
  CUSTOM_PROGRAMS_KEY,
  DEFAULT_REST_SEC,
} from "../customPrograms";
import {
  createWorkoutSession,
  isPoseTracked,
  buildSlots,
} from "../programPlayer";

// node ortamında localStorage yok → minimal bellek-içi stub (storage.js bunu kullanır).
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  installLocalStorage();
});

describe("buildCustomProgram — şema geçerliliği", () => {
  it("createWorkoutSession'ın beklediği Program şeklini üretir", () => {
    const program = buildCustomProgram({
      name: "Test",
      restSec: 60,
      items: [{ libraryId: "push-up", sets: 3, reps: 10 }],
    });
    expect(program.id).toBeTruthy();
    expect(program.source).toBe("custom");
    expect(program.custom).toBe(true);
    expect(program.days).toHaveLength(1);
    expect(program.days[0].id).toBe("day1");
    const block = program.days[0].blocks[0];
    expect(block.type).toBe("straight");
    const ex = block.exercises[0];
    expect(ex.id).toBe("push-up");
    expect(ex.sets).toBe(3);
    expect(ex.dose).toEqual({ type: "reps", value: 10 });
    expect(ex.restSec).toEqual([60, 60]);
    // pose alanları kütüphaneden taşınmış → isPoseTracked aynen geçerli
    expect(ex.trackable).toBe(true);
    expect(ex.ruleSetRef).toBe("pushup");
    expect(isPoseTracked(ex)).toBe(true);
  });

  it("rehberli hareket untrackableReason taşır, ruleSetRef null", () => {
    // mountain-climber rehberli (plank artık Batch 4'te takipli oldu).
    const program = buildCustomProgram({
      items: [{ libraryId: "mountain-climber", sets: 3 }],
    });
    const ex = program.days[0].blocks[0].exercises[0];
    expect(ex.trackable).toBe(false);
    expect(ex.ruleSetRef).toBeNull();
    expect(typeof ex.untrackableReason).toBe("string");
    expect(isPoseTracked(ex)).toBe(false);
  });

  it("ad boşsa 'Programım', set/dinlenme sınırlanır", () => {
    const p = buildCustomProgram({
      name: "   ",
      restSec: -10,
      items: [{ libraryId: "push-up", sets: 999 }],
    });
    expect(p.name).toBe("Programım");
    expect(p.restSec).toBe(0); // negatif → 0
    expect(p.days[0].blocks[0].exercises[0].sets).toBe(20); // 999 → 20 tavan
  });

  it("varsayılan dinlenme 60 sn", () => {
    const p = buildCustomProgram({ items: [{ libraryId: "push-up", sets: 1 }] });
    expect(p.restSec).toBe(DEFAULT_REST_SEC);
  });

  it("aynı hareket iki kez → id benzersizliği (sonek)", () => {
    const p = buildCustomProgram({
      items: [
        { libraryId: "push-up", sets: 3, reps: 10 },
        { libraryId: "push-up", sets: 2, reps: 8 },
      ],
    });
    const ids = p.days[0].blocks[0].exercises.map((e) => e.id);
    expect(ids).toEqual(["push-up", "push-up-2"]);
    expect(new Set(ids).size).toBe(2);
  });

  it("bilinmeyen libraryId atlanır", () => {
    const p = buildCustomProgram({
      items: [{ libraryId: "yok", sets: 3 }, { libraryId: "push-up", sets: 3 }],
    });
    expect(p.days[0].blocks[0].exercises).toHaveLength(1);
  });

  it("süre bazlı hareket reps verilmese de doz korur", () => {
    // mountain-climber süre dozlu rehberli (plank artık izometrik hold dozlu).
    const p = buildCustomProgram({ items: [{ libraryId: "mountain-climber", sets: 3 }] });
    const ex = p.days[0].blocks[0].exercises[0];
    expect(ex.dose.type).toBe("time");
    expect(ex.dose.seconds).toBeGreaterThan(0);
  });

  it("izometrik (plank) hold dozu reps verilmeden korunur → takipli P0", () => {
    const p = buildCustomProgram({ items: [{ libraryId: "plank", sets: 3 }] });
    const ex = p.days[0].blocks[0].exercises[0];
    expect(ex.dose.type).toBe("hold");
    expect(ex.trackable).toBe(true);
    expect(ex.ruleSetRef).toBe("plank");
    expect(isPoseTracked(ex)).toBe(true);
  });

  it("düzenleme: id verilirse korunur (üzerine yazma)", () => {
    const p = buildCustomProgram({
      id: "custom-fixed",
      items: [{ libraryId: "push-up", sets: 1 }],
    });
    expect(p.id).toBe("custom-fixed");
    // draft geri yükleme için saklanır
    expect(p.draft.items[0].libraryId).toBe("push-up");
  });
});

describe("localStorage round-trip", () => {
  it("kaydet → yükle → aynı program", () => {
    const program = buildCustomProgram({
      name: "Sabah",
      items: [{ libraryId: "push-up", sets: 3, reps: 10 }],
    });
    saveCustomProgram(program);
    const loaded = loadCustomPrograms();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(program);
    // serileştirme JSON üzerinden gitti
    const raw = JSON.parse(localStorage.getItem(CUSTOM_PROGRAMS_KEY));
    expect(raw[0].id).toBe(program.id);
  });

  it("aynı id ile kaydet → günceller (eklemez)", () => {
    const a = buildCustomProgram({
      id: "p1",
      name: "v1",
      items: [{ libraryId: "push-up", sets: 1 }],
    });
    saveCustomProgram(a);
    const b = buildCustomProgram({
      id: "p1",
      name: "v2",
      items: [{ libraryId: "push-up", sets: 5 }],
    });
    saveCustomProgram(b);
    const loaded = loadCustomPrograms();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("v2");
  });

  it("sil → listeden çıkar", () => {
    saveCustomProgram(buildCustomProgram({ id: "p1", items: [{ libraryId: "push-up", sets: 1 }] }));
    saveCustomProgram(buildCustomProgram({ id: "p2", items: [{ libraryId: "push-up", sets: 1 }] }));
    expect(loadCustomPrograms()).toHaveLength(2);
    deleteCustomProgram("p1");
    const left = loadCustomPrograms();
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe("p2");
  });

  it("hiç kayıt yokken boş dizi", () => {
    expect(loadCustomPrograms()).toEqual([]);
  });
});

describe('"push up 10x3" uçtan uca', () => {
  it("doğru session üretir: 3 set, pose-takipli, hepsi oynatılır", () => {
    // push-up seç → 3 set × 10 tekrar
    const program = buildCustomProgram({
      name: "Şınav",
      items: [{ libraryId: "push-up", sets: 3, reps: 10 }],
    });

    // buildSlots → 3 slot (3 set), her biri pose-takipli
    const slots = buildSlots(program.days[0]);
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => isPoseTracked(s.exercise))).toBe(true);
    expect(slots.map((s) => s.setNumber)).toEqual([1, 2, 3]);

    // hands-free akış: announce → countdown → exercise → rest → … → done
    const session = createWorkoutSession(program, "day1", { handsFree: true });
    let guard = 0;
    while (session.getState().status !== "done" && guard < 100) {
      const s = session.getState();
      if (s.status === "announce" || s.status === "countdown") {
        session.advancePhase();
      } else if (s.status === "rest") {
        session.finishRest();
      } else if (s.status === "exercise") {
        session.completeSet({ reps: 10, summary: { repCount: 10, faultyCount: 0, rules: [] } });
      }
      guard += 1;
    }
    expect(session.getState().status).toBe("done");

    const summary = session.getDaySummary();
    expect(summary.totalSets).toBe(3);
    expect(summary.exercises).toHaveLength(1);
    expect(summary.exercises[0].name).toContain("Push Up");
    expect(summary.exercises[0].sets).toHaveLength(3);
    // özel programda kardiyo/plank hatırlatması yok
    expect(summary.cardio).toBeNull();
    expect(summary.plank).toBeNull();
  });

  it("set arası 60 sn dinlenme (son set hariç)", () => {
    const program = buildCustomProgram({
      items: [{ libraryId: "push-up", sets: 3, reps: 10 }],
    });
    const session = createWorkoutSession(program, "day1");
    // 1. set bitir → rest 60
    let st = session.completeSet({ reps: 10 });
    expect(st.status).toBe("rest");
    expect(st.rest.seconds).toBe(60);
    session.finishRest();
    // 2. set bitir → rest 60
    st = session.completeSet({ reps: 10 });
    expect(st.status).toBe("rest");
    session.finishRest();
    // 3. (son) set bitir → done, dinlenme yok
    st = session.completeSet({ reps: 10 });
    expect(st.status).toBe("done");
  });
});
