import { describe, it, expect } from "vitest";
import {
  buildSessionReport,
  gradeRepForm,
  TRACK_KIND,
} from "../sessionReport";

// getDaySummary() çıktısının şeklini taklit eden yardımcı.
function daySummary(exercises, extra = {}) {
  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  return {
    dayId: "dayX",
    dayLabel: "Test Günü",
    totalSets,
    plannedSets: totalSets,
    exercises,
    cardio: null,
    plank: null,
    ...extra,
  };
}

// Takipli rep seti (repEngine summary'li).
function repSet({ reps, repCount, faultyCount = 0, rules = [] }) {
  return { reps, seconds: null, summary: { repCount, faultyCount, rules } };
}

// Takipli izometrik set (holdEngine summary'li).
function holdSet({ heldSeconds, rules = [] }) {
  return { reps: null, seconds: heldSeconds, summary: { heldSeconds, rules } };
}

// Rehberli (takip edilmeyen) rep seti — süre logu var, summary YOK.
function guidedSet({ seconds }) {
  return { reps: null, seconds, summary: null };
}

// Atlanmış set — sonuç yok.
function skippedSet() {
  return { reps: null, seconds: null, summary: null };
}

describe("buildSessionReport — dürüst takip sınıflandırması", () => {
  it("takipli rep hareketi REP olarak işaretlenir ve gerçek rakamları taşır", () => {
    const report = buildSessionReport(
      daySummary([
        {
          exerciseId: "squat",
          name: "Squat",
          blockLabel: "A",
          dose: { type: "reps", value: 12 },
          sets: [
            repSet({ reps: 12, repCount: 12, faultyCount: 2 }),
            repSet({ reps: 10, repCount: 10, faultyCount: 0 }),
          ],
        },
      ])
    );
    const ex = report.exercises[0];
    expect(ex.kind).toBe(TRACK_KIND.REP);
    expect(ex.tracked).toBe(true);
    expect(ex.form.reps).toBe(22);
    expect(ex.form.faulty).toBe(2);
    expect(ex.form.clean).toBe(20);
    expect(report.trackedCount).toBe(1);
    expect(report.totals.trackedReps).toBe(22);
    expect(report.totals.trackedClean).toBe(20);
  });

  it("takipli izometrik hareketi HOLD olarak işaretlenir, toplam süreyi taşır", () => {
    const report = buildSessionReport(
      daySummary([
        {
          exerciseId: "plank",
          name: "Plank",
          blockLabel: "B",
          dose: { type: "hold" },
          sets: [holdSet({ heldSeconds: 30 }), holdSet({ heldSeconds: 25 })],
        },
      ])
    );
    const ex = report.exercises[0];
    expect(ex.kind).toBe(TRACK_KIND.HOLD);
    expect(ex.tracked).toBe(true);
    expect(ex.form.heldSeconds).toBe(55);
    expect(report.totals.trackedHeldSeconds).toBe(55);
  });

  it("summary olmayan hareket UNTRACKED — uydurma form verisi yok", () => {
    const report = buildSessionReport(
      daySummary([
        {
          exerciseId: "cable",
          name: "Kablo Çekiş",
          blockLabel: "C",
          dose: { type: "reps", value: 15 },
          sets: [guidedSet({ seconds: 45 }), guidedSet({ seconds: 45 })],
        },
      ])
    );
    const ex = report.exercises[0];
    expect(ex.kind).toBe(TRACK_KIND.UNTRACKED);
    expect(ex.tracked).toBe(false);
    expect(ex.form).toBeNull();
    expect(report.untrackedCount).toBe(1);
    expect(report.trackedCount).toBe(0);
    // Manuel hareket seans rep toplamına SIZMAZ (dürüstlük).
    expect(report.totals.trackedReps).toBe(0);
  });

  it("hiç sonucu olmayan hareket SKIPPED — set satırı 'atlandı'", () => {
    const report = buildSessionReport(
      daySummary([
        {
          exerciseId: "lunge",
          name: "Lunge",
          blockLabel: "A",
          dose: { type: "reps", value: 10 },
          sets: [skippedSet()],
        },
      ])
    );
    const ex = report.exercises[0];
    expect(ex.kind).toBe(TRACK_KIND.SKIPPED);
    expect(ex.tracked).toBe(false);
    expect(ex.setLines).toEqual(["atlandı"]);
    expect(report.skippedCount).toBe(1);
  });

  it("kural ihlalleri set'ler arası birleştirilir ve ağırlığa göre sıralanır", () => {
    const report = buildSessionReport(
      daySummary([
        {
          exerciseId: "squat",
          name: "Squat",
          blockLabel: "A",
          dose: { type: "reps", value: 12 },
          sets: [
            repSet({
              reps: 12,
              repCount: 12,
              faultyCount: 3,
              rules: [
                { id: "valgus", label: "Diz valgus", severity: "minor", fires: 2 },
                { id: "depth", label: "Derinlik", severity: "major", fires: 1 },
              ],
            }),
            repSet({
              reps: 10,
              repCount: 10,
              faultyCount: 1,
              rules: [
                { id: "back", label: "Bel hattı", severity: "critical", fires: 1 },
                { id: "valgus", label: "Diz valgus", severity: "minor", fires: 1 },
              ],
            }),
          ],
        },
      ])
    );
    const rules = report.exercises[0].form.rules;
    // critical → major → minor sırası
    expect(rules.map((r) => r.id)).toEqual(["back", "depth", "valgus"]);
    // valgus iki sette toplandı: 2 + 1 = 3
    expect(rules.find((r) => r.id === "valgus").fires).toBe(3);
  });

  it("değerlendirilemeyen kural seans raporunda işaretlenir (sessiz PASS yok)", () => {
    const report = buildSessionReport(
      daySummary([
        {
          exerciseId: "squat",
          name: "Squat",
          blockLabel: "A",
          dose: { type: "reps", value: 12 },
          sets: [
            repSet({
              reps: 12,
              repCount: 12,
              faultyCount: 0,
              rules: [
                { id: "valgus", label: "Diz valgus", severity: "minor", fires: 0, unevaluated: true },
              ],
            }),
          ],
        },
      ])
    );
    expect(report.exercises[0].form.anyUnevaluated).toBe(true);
  });

  it("karışık seans — sayaçlar ve toplamlar doğru", () => {
    const report = buildSessionReport(
      daySummary([
        {
          exerciseId: "squat",
          name: "Squat",
          blockLabel: "A",
          dose: { type: "reps", value: 12 },
          sets: [repSet({ reps: 12, repCount: 12, faultyCount: 1 })],
        },
        {
          exerciseId: "plank",
          name: "Plank",
          blockLabel: "B",
          dose: { type: "hold" },
          sets: [holdSet({ heldSeconds: 40 })],
        },
        {
          exerciseId: "cable",
          name: "Kablo",
          blockLabel: "C",
          dose: { type: "reps", value: 15 },
          sets: [guidedSet({ seconds: 45 })],
        },
        {
          exerciseId: "lunge",
          name: "Lunge",
          blockLabel: "A",
          dose: { type: "reps", value: 10 },
          sets: [skippedSet()],
        },
      ])
    );
    expect(report.exerciseCount).toBe(4);
    expect(report.trackedCount).toBe(2); // squat + plank
    expect(report.untrackedCount).toBe(1); // cable
    expect(report.skippedCount).toBe(1); // lunge
    expect(report.totals.trackedReps).toBe(12);
    expect(report.totals.trackedHeldSeconds).toBe(40);
  });

  it("genel kural hatırlatmaları (cardio/plank) aynen taşınır", () => {
    const report = buildSessionReport(
      daySummary([], {
        cardio: { trainingDayMin: 30, hrBpm: [110, 130] },
        plank: { perWeek: 3, sets: 3 },
      })
    );
    expect(report.cardio.trainingDayMin).toBe(30);
    expect(report.plank.perWeek).toBe(3);
  });
});

describe("gradeRepForm — değerlendirme gerçek orandan", () => {
  it("yüksek temiz oranı → Temiz", () => {
    expect(gradeRepForm({ isometric: false, clean: 19, faulty: 1 }).label).toBe(
      "Temiz"
    );
  });

  it("orta oran → İyi / Gelişmeli", () => {
    expect(gradeRepForm({ isometric: false, clean: 8, faulty: 2 }).label).toBe(
      "İyi"
    );
    expect(gradeRepForm({ isometric: false, clean: 5, faulty: 5 }).label).toBe(
      "Gelişmeli"
    );
  });

  it("düşük oran → Forma dikkat", () => {
    expect(gradeRepForm({ isometric: false, clean: 2, faulty: 8 }).label).toBe(
      "Forma dikkat"
    );
  });

  it("izometrik veya tekrarı olmayan formda değerlendirme yok", () => {
    expect(gradeRepForm({ isometric: true, clean: 0, faulty: 0 })).toBeNull();
    expect(gradeRepForm({ isometric: false, clean: 0, faulty: 0 })).toBeNull();
    expect(gradeRepForm(null)).toBeNull();
  });
});
