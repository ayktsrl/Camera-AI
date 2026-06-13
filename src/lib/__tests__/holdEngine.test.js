// holdEngine — izometrik tutuş FSM'i (plank / hollow hold gibi SÜRE bazlı hareketler).
// repEngine.test.js deseni: sahte computeMetrics, sentetik frame dizileri.
//
// Kapsanan davranış:
//   • idle → holding geçişi (enterFrames onayı, açı-eşik straightEnter + isHorizontal)
//   • holding fazında heldMs gerçek geçen ms ile birikir (frame hızından bağımsız)
//   • histerezis: holding'de straightExit altına düşene kadar geçerli kalır
//   • pozisyon bozulunca "broken" — timer durur, süre korunur (geri gitmez)
//   • breakEndMs'den uzun bozuk kalınca "end" sinyali (hands-free otomatik bitirme)
//   • metrik kaybı (METRICS_LOST_RESET_FRAMES) → holding kopar
//   • zaman sıçraması koruması (dt <= 0 veya dt >= 2000 ms sayılmaz)
//   • reset / getState / getSummary

import { describe, it, expect } from "vitest";
import { createHoldEngine } from "../holdEngine";

const FRAME_MS = 33;

const HOLD = {
  horizontalMinTilt: 60,
  straightEnter: 160,
  straightExit: 150,
  enterFrames: 4,
  breakEndMs: 6000,
};

const hipSagRule = {
  id: "hipSag",
  label: "Kalça düşmesi",
  metric: "bodyLineAngle",
  joints: [11, 23, 27],
  phases: ["holding"],
  predicate: { op: "gt", threshold: 200, tolerance: 0 }, // 200° imkânsız → varsayılan susuk
  severity: "major",
  cameraHint: "side",
  message: "Kalçanı kaldır",
  speech: "Kalçanı kaldır",
};

function makeExercise(overrides = {}) {
  return {
    hold: HOLD,
    faultRules: [],
    // Sahte: metrikler landmark dizisine iliştirilir (repEngine.test.js ile aynı desen).
    computeMetrics: (lm) => lm?.metrics ?? null,
    ...overrides,
  };
}

/** Sentetik frame: {isHorizontal, bodyLineAngle, ...} metrikleri ile. */
function frame(metrics, visibility = 1) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility }));
  lm.metrics = metrics;
  return { landmarks: lm, worldLandmarks: null };
}

/** Geçerli plank frame'i: yatay + düz hat (bodyLineAngle). */
function holdFrame(bodyLineAngle = 170, extra = {}) {
  return frame({ isHorizontal: true, bodyLineAngle, ...extra });
}

/** Frame dizisini motora sürer; event'leri toplar (sabit FRAME_MS aralık). */
function run(engine, frames, startAt = 0) {
  const events = [];
  frames.forEach((f, i) => {
    events.push(...engine.step(f, startAt + i * FRAME_MS));
  });
  return events;
}

const rep = (n, v) => Array.from({ length: n }, () => v);

describe("createHoldEngine — tutuşa giriş (enter eşiği + onay kareleri)", () => {
  it("yatay + düz hat enterFrames boyunca onaylanınca holding fazına geçer", () => {
    const engine = createHoldEngine(makeExercise());
    // enterFrames = 4 → 4. geçerli frame'de holding.
    const events = run(engine, rep(4, holdFrame(170)));

    const phases = events.filter((e) => e.type === "phase");
    expect(phases).toHaveLength(1);
    expect(phases[0].phase).toBe("holding");
    expect(engine.getState().phase).toBe("holding");
    expect(engine.getState().everHeld).toBe(true);
  });

  it("enterFrames dolmadan (3 frame) holding'e GEÇMEZ", () => {
    const engine = createHoldEngine(makeExercise());
    const events = run(engine, rep(3, holdFrame(170)));

    expect(events.filter((e) => e.type === "phase")).toHaveLength(0);
    expect(engine.getState().phase).toBe("idle");
  });

  it("yatay değilse (isHorizontal=false) geçerli sayılmaz, holding yok", () => {
    const engine = createHoldEngine(makeExercise());
    const events = run(
      engine,
      rep(10, frame({ isHorizontal: false, bodyLineAngle: 175 }))
    );
    expect(events.filter((e) => e.type === "phase")).toHaveLength(0);
    expect(engine.getState().phase).toBe("idle");
  });

  it("enter eşiği altındaki açı (155 < straightEnter 160) tutuşu başlatmaz", () => {
    const engine = createHoldEngine(makeExercise());
    const events = run(engine, rep(10, holdFrame(155)));
    expect(events.filter((e) => e.type === "phase")).toHaveLength(0);
    expect(engine.getState().phase).toBe("idle");
  });

  it("araya giren geçersiz frame onay sayacını sıfırlar (kesintisiz olmalı)", () => {
    const engine = createHoldEngine(makeExercise());
    const frames = [
      ...rep(2, holdFrame(170)), // 2 onay
      holdFrame(140), // kesinti → sayaç sıfır
      ...rep(3, holdFrame(170)), // tekrar 3 → henüz 4'e ulaşmaz
    ];
    const events = run(engine, frames);
    expect(events.filter((e) => e.type === "phase")).toHaveLength(0);
    expect(engine.getState().phase).toBe("idle");
  });
});

describe("createHoldEngine — süre sayımı (heldMs gerçek zaman)", () => {
  it("holding fazında heldMs gerçek geçen ms ile birikir", () => {
    const engine = createHoldEngine(makeExercise());
    // 4 frame onay (holding) + sonraki frame'lerde sayım.
    // İlk holding frame'inde lastTickAt set edilir; sayım sonraki tick'ten başlar.
    const events = run(engine, rep(20, holdFrame(170)));

    const holdEvents = events.filter((e) => e.type === "hold");
    expect(holdEvents.length).toBeGreaterThan(0);
    // 20 frame, holding'e 4. frame'de girildi; sayan tick'ler 16 dolayında × 33ms.
    const finalHeld = engine.getState().heldMs;
    expect(finalHeld).toBeGreaterThan(0);
    // Üst sınır: tüm 20 frame sayılsa 19×33=627; gerçekte holding sonrası → < 627.
    expect(finalHeld).toBeLessThanOrEqual(20 * FRAME_MS);
    expect(engine.getState().heldSeconds).toBe(Math.floor(finalHeld / 1000));
  });

  it("frame hızından bağımsız: aynı süre, az frame → benzer heldMs", () => {
    // 1 saniyelik tutuş, büyük dt adımlarıyla (örn. 500 ms) — ama dt < 2000 sınırında.
    const engine = createHoldEngine(makeExercise());
    // Önce 4 onay frame'i (küçük adımlarla holding'e gir).
    run(engine, rep(4, holdFrame(170)));
    const base = engine.getState().heldMs;
    // holding'e girişte lastTickAt son onay frame'inde (t = 3*FRAME_MS) set edildi.
    // İlk büyük adım o andan ölçülür → 4 büyük adım + 1 frame boşluğu eklenir.
    let t = 4 * FRAME_MS;
    for (let i = 0; i < 4; i++) {
      t += 500;
      engine.step(holdFrame(170), t);
    }
    // 4 × 500 ms tutuş süresi; ölçüm penceresi tam frame sınırına oturmadığı için
    // ±1 frame (33 ms) tolerans. Önemli olan: süre frame sayısından değil gerçek
    // zamandan birikiyor (4 frame ≈ 2 sn, frame başına 33 ms değil).
    expect(engine.getState().heldMs - base).toBeGreaterThanOrEqual(2000);
    expect(engine.getState().heldMs - base).toBeLessThan(2000 + FRAME_MS + 1);
  });

  it("anormal zaman sıçraması (dt >= 2000 ms) süreye eklenmez", () => {
    const engine = createHoldEngine(makeExercise());
    run(engine, rep(4, holdFrame(170)));
    const before = engine.getState().heldMs;
    // 5 saniyelik sıçrama (sekme arka planda kalmış gibi) → sayılmamalı.
    engine.step(holdFrame(170), 4 * FRAME_MS + 5000);
    expect(engine.getState().heldMs).toBe(before);
  });
});

describe("createHoldEngine — histerezis ve bozulma (broken)", () => {
  it("holding'de straightExit (150) ile straightEnter (160) arasında kalır", () => {
    const engine = createHoldEngine(makeExercise());
    run(engine, rep(4, holdFrame(170))); // holding
    // 155° — enter eşiği altı ama exit (150) üstü → holding korunur (histerezis).
    const events = run(engine, rep(3, holdFrame(155)), 4 * FRAME_MS);
    expect(engine.getState().phase).toBe("holding");
    expect(events.some((e) => e.type === "phase" && e.phase === "broken")).toBe(
      false
    );
  });

  it("straightExit altına (145 < 150) düşünce broken'a geçer, timer durur", () => {
    const engine = createHoldEngine(makeExercise());
    run(engine, rep(4, holdFrame(170)));
    run(engine, rep(6, holdFrame(170)), 4 * FRAME_MS); // biraz süre biriksin
    const heldAtBreak = engine.getState().heldMs;
    expect(heldAtBreak).toBeGreaterThan(0);

    const events = run(engine, rep(5, holdFrame(145)), 10 * FRAME_MS);
    expect(events.some((e) => e.type === "phase" && e.phase === "broken")).toBe(
      true
    );
    expect(engine.getState().phase).toBe("broken");
    // Süre korunur, geri gitmez (broken'da sayım yok).
    expect(engine.getState().heldMs).toBe(heldAtBreak);
  });

  it("broken'dan toparlanıp tekrar enter eşiğini geçince holding'e döner ve süre devam eder", () => {
    const engine = createHoldEngine(makeExercise());
    run(engine, rep(4, holdFrame(170)));
    run(engine, rep(4, holdFrame(170)), 4 * FRAME_MS);
    const heldBeforeBreak = engine.getState().heldMs;
    // Boz → broken
    run(engine, rep(3, holdFrame(140)), 8 * FRAME_MS);
    expect(engine.getState().phase).toBe("broken");
    // Tekrar 4 geçerli frame → yeniden holding
    run(engine, rep(4, holdFrame(170)), 11 * FRAME_MS);
    expect(engine.getState().phase).toBe("holding");
    // Devam edince süre artmaya devam eder (korunan + yeni).
    run(engine, rep(4, holdFrame(170)), 15 * FRAME_MS);
    expect(engine.getState().heldMs).toBeGreaterThan(heldBeforeBreak);
  });
});

describe("createHoldEngine — hands-free otomatik bitirme (breakEndMs)", () => {
  it("breakEndMs'den uzun bozuk kalınca 'end' sinyali verir", () => {
    const engine = createHoldEngine(makeExercise());
    run(engine, rep(4, holdFrame(170)));
    run(engine, rep(4, holdFrame(170)), 4 * FRAME_MS);
    // Boz → broken (t = 8*FRAME_MS civarı)
    const brokeAt = 8 * FRAME_MS;
    engine.step(holdFrame(140), brokeAt); // broken'a düşer
    // breakEndMs = 6000 ms sonra geçersiz frame → end.
    const events = engine.step(holdFrame(140), brokeAt + 6000 + 1);
    const endEvents = events.filter((e) => e.type === "end");
    expect(endEvents).toHaveLength(1);
    expect(endEvents[0].heldMs).toBe(engine.getState().heldMs);
  });

  it("hiç tutuş olmadan (everHeld=false) geçersiz frame'ler 'end' üretmez", () => {
    const engine = createHoldEngine(makeExercise());
    // Uzun süre geçersiz pozisyon, hiç holding'e girilmedi.
    const events = run(engine, rep(300, holdFrame(120)));
    expect(events.filter((e) => e.type === "end")).toHaveLength(0);
    expect(engine.getState().everHeld).toBe(false);
  });
});

describe("createHoldEngine — metrik kaybı", () => {
  it("holding'de 30 frame metrik kaybı tutuşu koparır (broken)", () => {
    const engine = createHoldEngine(makeExercise());
    run(engine, rep(4, holdFrame(170)));
    expect(engine.getState().phase).toBe("holding");

    const events = run(engine, rep(30, null), 4 * FRAME_MS);
    expect(events.some((e) => e.type === "phase" && e.phase === "broken")).toBe(
      true
    );
    expect(engine.getState().phase).toBe("broken");
  });

  it("kısa metrik kaybı (29 frame) tutuşu koparmaz", () => {
    const engine = createHoldEngine(makeExercise());
    run(engine, rep(4, holdFrame(170)));
    const events = run(engine, rep(29, null), 4 * FRAME_MS);
    expect(events.some((e) => e.type === "phase" && e.phase === "broken")).toBe(
      false
    );
    expect(engine.getState().phase).toBe("holding");
  });
});

describe("createHoldEngine — reset / özet", () => {
  it("getSummary tutulan süre ve kural dağılımını verir", () => {
    const engine = createHoldEngine(makeExercise({ faultRules: [hipSagRule] }));
    run(engine, rep(4, holdFrame(170)));
    run(engine, rep(10, holdFrame(170)), 4 * FRAME_MS);

    const summary = engine.getSummary();
    expect(summary.heldMs).toBeGreaterThan(0);
    expect(summary.heldSeconds).toBe(Math.floor(summary.heldMs / 1000));
    expect(Array.isArray(summary.rules)).toBe(true);
    const sag = summary.rules.find((r) => r.id === "hipSag");
    expect(sag.fires).toBe(0); // hiç ihlal tetiklenmedi
  });

  it("reset sonrası temiz başlar (idle, heldMs 0)", () => {
    const engine = createHoldEngine(makeExercise());
    run(engine, rep(10, holdFrame(170)));
    expect(engine.getState().heldMs).toBeGreaterThan(0);

    engine.reset();
    const state = engine.getState();
    expect(state).toMatchObject({ phase: "idle", heldMs: 0, everHeld: false });
    expect(state.heldSeconds).toBe(0);
  });
});

describe("createHoldEngine — varsayılan hold eşikleri", () => {
  it("exercise.hold verilmezse güvenli varsayılan eşikler kullanılır", () => {
    // hold yok → varsayılan {straightEnter:160, enterFrames:4, ...}
    const engine = createHoldEngine(makeExercise({ hold: undefined }));
    run(engine, rep(4, holdFrame(175)));
    expect(engine.getState().phase).toBe("holding");
  });
});
