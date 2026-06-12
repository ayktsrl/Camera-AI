// Fault-rule motoru — histerezis, confirm-frames, cooldown, visibility susturma.

import { describe, it, expect } from "vitest";
import { createFaultRuleEngine } from "../faultRules";

const FRAME_MS = 33;

const valgusRule = {
  id: "valgus",
  label: "Diz içe çökmesi",
  metric: "kneeValgusFPPA",
  joints: [23, 25, 27, 24, 26, 28],
  phases: ["descent", "bottom", "ascent"],
  predicate: { op: "lt", threshold: 165, tolerance: 3 },
  minFrames: 5,
  cooldownMs: 4000,
  severity: "critical",
  minVisibility: 0.6,
  cameraHint: "front45",
  message: "Dizlerini dışarı it",
  speech: "Dizlerini dışarı it",
};

function makeLandmarks(visibility = 1) {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility }));
}

/** Frame dizisini motora sürer; tüm event'leri toplar. */
function run(engine, frames) {
  const events = [];
  frames.forEach((frame, i) => {
    events.push(
      ...engine.step({
        metrics: frame.metrics,
        landmarks: frame.landmarks ?? makeLandmarks(frame.visibility ?? 1),
        phase: frame.phase ?? "descent",
        timestamp: frame.timestamp ?? i * FRAME_MS,
      })
    );
  });
  return events;
}

describe("createFaultRuleEngine", () => {
  it("minFrames ardışık ihlalden sonra tek uyarı üretir", () => {
    const engine = createFaultRuleEngine([valgusRule]);
    const frames = Array.from({ length: 8 }, () => ({
      metrics: { kneeValgusFPPA: 150 },
    }));

    const events = run(engine, frames);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "fault",
      rule: "valgus",
      severity: "critical",
      speech: "Dizlerini dışarı it",
    });
  });

  it("4 frame ihlal + temizlenme uyarı üretmez (minFrames 5)", () => {
    const engine = createFaultRuleEngine([valgusRule]);
    const frames = [
      ...Array.from({ length: 4 }, () => ({ metrics: { kneeValgusFPPA: 150 } })),
      ...Array.from({ length: 10 }, () => ({ metrics: { kneeValgusFPPA: 178 } })),
    ];
    expect(run(engine, frames)).toHaveLength(0);
  });

  it("histerezis: eşik bandında titreyen değer ihlal başlatmaz", () => {
    const engine = createFaultRuleEngine([valgusRule]);
    // 163–167 arası salınım: ihlal başlangıcı <162 ister — hiç girilmez.
    const frames = Array.from({ length: 40 }, (_, i) => ({
      metrics: { kneeValgusFPPA: i % 2 === 0 ? 163 : 167 },
    }));
    expect(run(engine, frames)).toHaveLength(0);
  });

  it("histerezis: ihlale girince bant içi değerler temizlemez", () => {
    const engine = createFaultRuleEngine([valgusRule]);
    // 150 ile gir (3 frame), sonra 166 (temizlenme >168 ister) — sayaç devam eder.
    const frames = [
      ...Array.from({ length: 3 }, () => ({ metrics: { kneeValgusFPPA: 150 } })),
      ...Array.from({ length: 3 }, () => ({ metrics: { kneeValgusFPPA: 166 } })),
    ];
    const events = run(engine, frames);
    expect(events).toHaveLength(1); // 6. frame'de minFrames 5 dolar
  });

  it("cooldown: süre dolmadan aynı uyarı tekrarlanmaz, dolunca tekrarlanır", () => {
    const engine = createFaultRuleEngine([valgusRule]);
    // 200 frame x 33 ms = 6.6 s sürekli ihlal → 0 ms ve ~4 s'te iki uyarı.
    const frames = Array.from({ length: 200 }, () => ({
      metrics: { kneeValgusFPPA: 150 },
    }));
    const events = run(engine, frames);

    expect(events).toHaveLength(2);
  });

  it("faz dışı frame'lerde kural çalışmaz ve ihlal durumu temizlenir", () => {
    const engine = createFaultRuleEngine([valgusRule]);
    const frames = [
      ...Array.from({ length: 3 }, () => ({
        metrics: { kneeValgusFPPA: 150 },
        phase: "descent",
      })),
      { metrics: { kneeValgusFPPA: 150 }, phase: "standing" }, // sayaç sıfırlanır
      ...Array.from({ length: 4 }, () => ({
        metrics: { kneeValgusFPPA: 150 },
        phase: "descent",
      })),
    ];
    expect(run(engine, frames)).toHaveLength(0);
  });

  it("düşük visibility kuralı susturur — uyarı yok, sayaç DONDURULUR", () => {
    const engine = createFaultRuleEngine([valgusRule]);
    const frames = [
      // 3 frame ihlal (görünür)
      ...Array.from({ length: 3 }, () => ({ metrics: { kneeValgusFPPA: 150 } })),
      // 10 frame düşük visibility — susturulur, sayaç 3'te donar (sıfırlanmaz)
      ...Array.from({ length: 10 }, () => ({
        metrics: { kneeValgusFPPA: 150 },
        visibility: 0.3,
      })),
      // 2 frame görünür ihlal → toplam 5 → uyarı
      ...Array.from({ length: 2 }, () => ({ metrics: { kneeValgusFPPA: 150 } })),
    ];
    const events = run(engine, frames);
    expect(events).toHaveLength(1);
  });

  it("null metrik de susturma sayılır (hesaplanamayan değer sessiz PASS değil)", () => {
    const engine = createFaultRuleEngine([valgusRule]);
    const frames = Array.from({ length: 30 }, () => ({
      metrics: { kneeValgusFPPA: null },
    }));
    run(engine, frames);

    const summary = engine.getSummary();
    expect(summary[0]).toMatchObject({ id: "valgus", unevaluated: true });
  });

  it("set özetinde >%50 susturulan kural 'değerlendirilemedi' işaretlenir", () => {
    const engine = createFaultRuleEngine([valgusRule]);
    const frames = [
      ...Array.from({ length: 10 }, () => ({
        metrics: { kneeValgusFPPA: 178 },
      })),
      ...Array.from({ length: 30 }, () => ({
        metrics: { kneeValgusFPPA: 178 },
        visibility: 0.2,
      })),
    ];
    run(engine, frames);

    const summary = engine.getSummary();
    expect(summary[0].unevaluated).toBe(true);
    expect(summary[0].fires).toBe(0);
    expect(summary[0].cameraHint).toBe("front45");
  });

  it("yeterince değerlendirilen kural 'değerlendirilemedi' sayılmaz, ihlaller sayılır", () => {
    const engine = createFaultRuleEngine([valgusRule]);
    const frames = Array.from({ length: 30 }, () => ({
      metrics: { kneeValgusFPPA: 150 },
    }));
    run(engine, frames);

    const summary = engine.getSummary();
    expect(summary[0].unevaluated).toBe(false);
    expect(summary[0].fires).toBe(1);
  });

  it("attemptClose fazlı kurallar frame döngüsünde işlenmez", () => {
    const depthRule = {
      id: "depth",
      metric: "minKneeAngle",
      joints: [25, 26],
      phases: ["attemptClose"],
      predicate: { op: "gt", threshold: 100, tolerance: 0 },
      severity: "major",
      message: "Biraz daha derine in",
    };
    const engine = createFaultRuleEngine([depthRule]);
    const frames = Array.from({ length: 30 }, () => ({
      metrics: { minKneeAngle: 130 },
    }));
    expect(run(engine, frames)).toHaveLength(0);
    expect(engine.getSummary()).toHaveLength(0); // repEngine ekler
  });
});
