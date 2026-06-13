// thresholds — merkezi config, override katmanı, applyTuning davranışı.

import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_TUNINGS,
  getTuning,
  getDefaultTuning,
  setOverride,
  clearOverride,
  hasOverride,
  mergeTuning,
  applyTuning,
  resolveTunedExercise,
} from "../thresholds";
import { squat } from "../../exercises/squat";
import { plank } from "../../exercises/plank";

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

describe("DEFAULT_TUNINGS — egzersiz tanımıyla birebir (davranış-değişmedi kanıtı)", () => {
  it("squat faz/attempt/confirm eşikleri config = egzersiz", () => {
    const T = DEFAULT_TUNINGS.squat;
    expect(squat.tracking.phases).toEqual(T.phases);
    expect(squat.phases).toEqual(T.phases);
    expect(squat.tracking.attemptBelow).toBe(T.attemptBelow);
    expect(squat.attemptBelow).toBe(T.attemptBelow);
    expect(squat.phaseConfirmFrames).toBe(T.phaseConfirmFrames);
  });

  it("squat fault predicate eşikleri config'ten okunur", () => {
    const find = (id) => squat.faultRules.find((r) => r.id === id);
    expect(find("valgus").predicate.threshold).toBe(
      DEFAULT_TUNINGS.squat.faults.valgus.threshold
    );
    expect(find("torso").predicate.threshold).toBe(55); // eski gömülü değer korunur
    expect(find("depth").predicate.threshold).toBe(100);
  });

  it("plank hold + fault eşikleri config = egzersiz", () => {
    expect(plank.hold).toEqual(DEFAULT_TUNINGS.plank.hold);
    const sag = plank.faultRules.find((r) => r.id === "hipSag");
    expect(sag.predicate.threshold).toBe(
      DEFAULT_TUNINGS.plank.faults.hipSag.threshold
    );
  });
});

describe("getTuning / override katmanı", () => {
  it("override yokken varsayılanı birebir döner", () => {
    expect(getTuning("squat")).toEqual(getDefaultTuning("squat"));
  });

  it("override eşiği varsayılanın üstüne biner; diğerleri korunur", () => {
    setOverride("squat", { phases: { bottomMax: 95 } });
    const t = getTuning("squat");
    expect(t.phases.bottomMax).toBe(95); // override
    expect(t.phases.standingMin).toBe(DEFAULT_TUNINGS.squat.phases.standingMin); // korundu
    expect(t.faults.valgus.threshold).toBe(165); // dokunulmadı
  });

  it("fault override kural-kural birleşir", () => {
    setOverride("squat", { faults: { valgus: { threshold: 170 } } });
    const t = getTuning("squat");
    expect(t.faults.valgus.threshold).toBe(170);
    expect(t.faults.valgus.tolerance).toBe(3); // varsayılandan
    expect(t.faults.torso.threshold).toBe(55); // diğer kural korundu
  });

  it("hasOverride / clearOverride", () => {
    expect(hasOverride("squat")).toBe(false);
    setOverride("squat", { attemptBelow: 130 });
    expect(hasOverride("squat")).toBe(true);
    clearOverride("squat");
    expect(hasOverride("squat")).toBe(false);
    expect(getTuning("squat")).toEqual(getDefaultTuning("squat"));
  });

  it("boş override silinir (varsayılana döner)", () => {
    setOverride("squat", { attemptBelow: 130 });
    setOverride("squat", {});
    expect(hasOverride("squat")).toBe(false);
  });
});

describe("mergeTuning — saf, derin birleşme", () => {
  it("girdileri mutasyona uğratmaz", () => {
    const base = { phases: { standingMin: 160 }, attemptBelow: 140 };
    const frozen = JSON.parse(JSON.stringify(base));
    mergeTuning(base, { phases: { standingMin: 150 } });
    expect(base).toEqual(frozen);
  });
});

describe("applyTuning — egzersiz nesnesine eşik yaması (saf)", () => {
  it("phases/attemptBelow/confirm yamalanır, computeMetrics korunur", () => {
    const tuned = applyTuning(squat, {
      phases: { standingMin: 155, bottomMax: 95 },
      attemptBelow: 130,
      phaseConfirmFrames: 6,
    });
    expect(tuned.tracking.phases).toEqual({ standingMin: 155, bottomMax: 95 });
    expect(tuned.phases).toEqual({ standingMin: 155, bottomMax: 95 });
    expect(tuned.attemptBelow).toBe(130);
    expect(tuned.phaseConfirmFrames).toBe(6);
    expect(tuned.computeMetrics).toBe(squat.computeMetrics); // mantık değişmedi
    // Orijinal dokunulmadı.
    expect(squat.attemptBelow).toBe(140);
  });

  it("fault predicate threshold/tolerance yamalanır, joints/mesaj korunur", () => {
    const tuned = applyTuning(squat, {
      faults: { valgus: { threshold: 170, tolerance: 5 } },
    });
    const v = tuned.faultRules.find((r) => r.id === "valgus");
    expect(v.predicate.threshold).toBe(170);
    expect(v.predicate.tolerance).toBe(5);
    expect(v.predicate.op).toBe("lt"); // op korundu
    expect(v.message).toBe("Dizlerini dışarı it");
    // Orijinal kural dokunulmadı.
    expect(squat.faultRules.find((r) => r.id === "valgus").predicate.threshold).toBe(165);
  });

  it("plank hold yamalanır", () => {
    const tuned = applyTuning(plank, { hold: { straightEnter: 165 } });
    expect(tuned.hold.straightEnter).toBe(165);
    expect(tuned.hold.straightExit).toBe(plank.hold.straightExit); // korundu
  });

  it("tuning null → egzersiz olduğu gibi", () => {
    expect(applyTuning(squat, null)).toBe(squat);
  });
});

describe("resolveTunedExercise — id'den etkin tuning uygular", () => {
  it("override yokken davranış birebir (eşikler aynı)", () => {
    const r = resolveTunedExercise(squat);
    expect(r.phases).toEqual(squat.phases);
    expect(r.attemptBelow).toBe(squat.attemptBelow);
  });

  it("override varsa çözülmüş egzersize yansır", () => {
    setOverride("squat", { phases: { bottomMax: 90 } });
    const r = resolveTunedExercise(squat);
    expect(r.phases.bottomMax).toBe(90);
    expect(r.tracking.phases.bottomMax).toBe(90);
  });
});
