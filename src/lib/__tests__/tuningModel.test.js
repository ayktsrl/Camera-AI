// tuningModel — tuning → slider satırları + saf nokta-yolu okuma/yazma.

import { describe, it, expect } from "vitest";
import { buildTuningRows, getByPath, setByPath } from "../tuningModel";
import { DEFAULT_TUNINGS } from "../thresholds";

describe("getByPath / setByPath — saf nokta-yolu", () => {
  it("iç içe değeri okur", () => {
    const t = DEFAULT_TUNINGS.squat;
    expect(getByPath(t, "phases.standingMin")).toBe(160);
    expect(getByPath(t, "faults.valgus.threshold")).toBe(165);
    expect(getByPath(t, "attemptBelow")).toBe(140);
  });

  it("yeni nesne döndürür, girdiyi bozmaz", () => {
    const t = DEFAULT_TUNINGS.squat;
    const before = JSON.parse(JSON.stringify(t));
    const next = setByPath(t, "faults.valgus.threshold", 170);
    expect(getByPath(next, "faults.valgus.threshold")).toBe(170);
    expect(t).toEqual(before); // orijinal dokunulmadı
    // Kardeş alanlar korundu.
    expect(getByPath(next, "faults.torso.threshold")).toBe(55);
    expect(getByPath(next, "phases.standingMin")).toBe(160);
  });
});

describe("buildTuningRows — rep hareketi (squat)", () => {
  const rows = buildTuningRows(DEFAULT_TUNINGS.squat);
  const byPath = (p) => rows.find((r) => r.path === p);

  it("faz + attempt + confirm satırları üretir", () => {
    expect(byPath("phases.standingMin").value).toBe(160);
    expect(byPath("phases.bottomMax").value).toBe(100);
    expect(byPath("attemptBelow").value).toBe(140);
    expect(byPath("phaseConfirmFrames").value).toBe(4);
  });

  it("her fault için threshold satırı + (varsa) tolerance satırı", () => {
    expect(byPath("faults.valgus.threshold").value).toBe(165);
    expect(byPath("faults.valgus.tolerance").value).toBe(3);
    // depth toleransı 0 ama tanımlı → satır var.
    expect(byPath("faults.depth.tolerance").value).toBe(0);
  });

  it("% bazlı fault (heel) doğru birim/bant alır", () => {
    const heel = byPath("faults.heel.threshold");
    expect(heel.unit).toBe("%");
    expect(heel.max).toBeLessThanOrEqual(30); // pct bandı
  });

  it("derece bazlı fault (valgus) ° birimi + 0-180 bandı", () => {
    const valgus = byPath("faults.valgus.threshold");
    expect(valgus.unit).toBe("°");
    expect(valgus.max).toBe(180);
  });

  it("tüm satırlarda min/max/step tanımlı (slider clamp)", () => {
    for (const r of rows) {
      expect(typeof r.min).toBe("number");
      expect(typeof r.max).toBe("number");
      expect(typeof r.step).toBe("number");
      expect(r.min).toBeLessThan(r.max);
    }
  });
});

describe("buildTuningRows — izometrik (plank) + ekstra (jumpingJack)", () => {
  it("plank hold satırları üretir, faz satırı üretmez", () => {
    const rows = buildTuningRows(DEFAULT_TUNINGS.plank);
    const paths = rows.map((r) => r.path);
    expect(paths).toContain("hold.straightEnter");
    expect(paths).toContain("hold.breakEndMs");
    expect(paths).not.toContain("phases.standingMin"); // rep faz yok
  });

  it("jumpingJack legOpenRatio satırı oran bandıyla", () => {
    const rows = buildTuningRows(DEFAULT_TUNINGS.jumpingJack);
    const ratio = rows.find((r) => r.path === "extra.legOpenRatio");
    expect(ratio.value).toBe(1.5);
    expect(ratio.unit).toBe("×");
    expect(ratio.max).toBeLessThanOrEqual(3);
  });
});
