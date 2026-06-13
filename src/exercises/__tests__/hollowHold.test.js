// hollowHold — İZOMETRİK. computeMetrics (yön çevirme: bodyLineAngle = 180 - hamHipAngle,
// derin kaşık → yüksek değer; isHorizontal giriş kapısı) + plank holdEngine entegrasyonu
// (geçerli hollow → timer akar; bozuk → durur, sahte süre yok) + backDrop fault kuralı.
// plank.test.js deseni (holdEngine KULLANILIR, değiştirilmez).

import { describe, it, expect } from "vitest";
import { hollowHold } from "../hollowHold";
import { createHoldEngine } from "../../lib/holdEngine";
import { createFaultRuleEngine } from "../../lib/faultRules";
import { LM } from "../../lib/pose";

function makeLm2d(positions = {}) {
  const lm = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 1,
    presence: 1,
  }));
  for (const [idx, pos] of Object.entries(positions)) {
    lm[idx] = { visibility: 1, presence: 1, ...lm[idx], ...pos };
  }
  return lm;
}

function makeWlm(positions = {}) {
  const wlm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [idx, pos] of Object.entries(positions)) {
    wlm[idx] = pos;
  }
  return wlm;
}

// Sırtüstü DÜZ yatış (gevşek) — omuz→kalça→ayakBileği neredeyse düz hat (~180°).
// World yan profil: x ileri (baş→ayak), y yukarı. Hepsi yerde (y~0).
function flatSupineWorld() {
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: 0, y: 0.02, z: -0.18 },
    [LM.RIGHT_SHOULDER]: { x: 0, y: 0.02, z: 0.18 },
    [LM.LEFT_HIP]: { x: 0.55, y: 0.0, z: -0.12 },
    [LM.RIGHT_HIP]: { x: 0.55, y: 0.0, z: 0.12 },
    [LM.LEFT_ANKLE]: { x: 1.4, y: 0.02, z: -0.12 },
    [LM.RIGHT_ANKLE]: { x: 1.4, y: 0.02, z: 0.12 },
  });
}

// Geçerli HOLLOW (kaşık): omuzlar yukarı + bacaklar yukarı, bel basık (kalça düşük).
// omuz→kalça→ayakBileği katlanır → ham açı ~140° → bodyLineAngle ~40 (geçerli).
function hollowWorld({ depth = 1.0 } = {}) {
  // depth 1.0 = belirgin kaşık; 0.5 = sığ kaşık. Omuz ve ayak yukarı, kalça yerde.
  const lift = 0.55 * depth;
  return makeWlm({
    [LM.LEFT_SHOULDER]: { x: 0, y: lift, z: -0.18 },
    [LM.RIGHT_SHOULDER]: { x: 0, y: lift, z: 0.18 },
    [LM.LEFT_HIP]: { x: 0.55, y: 0.0, z: -0.12 },
    [LM.RIGHT_HIP]: { x: 0.55, y: 0.0, z: 0.12 },
    [LM.LEFT_ANKLE]: { x: 1.1, y: lift, z: -0.12 },
    [LM.RIGHT_ANKLE]: { x: 1.1, y: lift, z: 0.12 },
  });
}

describe("hollowHold.computeMetrics — yön çevirme + giriş kapısı", () => {
  it("düz yatış (gevşek): bodyLineAngle düşük → geçerli hollow DEĞİL", () => {
    const m = hollowHold.computeMetrics(makeLm2d(), flatSupineWorld());
    expect(m.hipAngleRaw).toBeGreaterThan(165); // neredeyse düz
    expect(m.bodyLineAngle).toBeLessThan(20); // 180 - ham → küçük
    expect(m.isHorizontal).toBe(false); // giriş kapısı kapalı
  });

  it("derin kaşık (hollow): ham açı düşer → bodyLineAngle yükselir → geçerli", () => {
    const m = hollowHold.computeMetrics(makeLm2d(), hollowWorld({ depth: 1.0 }));
    expect(m.hipAngleRaw).toBeLessThan(150); // belirgin kaşık
    expect(m.bodyLineAngle).toBeGreaterThan(hollowHold.hold.straightEnter);
    expect(m.isHorizontal).toBe(true); // giriş kapısı açık
  });

  it("worldLandmarks yoksa metrik null (izometrik 3D gerektirir)", () => {
    expect(hollowHold.computeMetrics(makeLm2d(), null)).toBeNull();
  });

  it("gövde landmark'ları görünmüyorsa null (susturma)", () => {
    const lm = makeLm2d({
      [LM.LEFT_HIP]: { visibility: 0.1 },
      [LM.RIGHT_HIP]: { visibility: 0.1 },
      [LM.LEFT_ANKLE]: { visibility: 0.1 },
      [LM.RIGHT_ANKLE]: { visibility: 0.1 },
    });
    expect(hollowHold.computeMetrics(lm, hollowWorld())).toBeNull();
  });
});

// --- holdEngine: geçerli hollow → timer ilerler; bozuk → timer durur ---

function driveHold(engine, steps) {
  const events = [];
  let t = 0;
  for (const { lm, wlm, dt = 100 } of steps) {
    t += dt;
    const frame = wlm === null && lm === null ? null : { landmarks: lm, worldLandmarks: wlm };
    for (const e of engine.step(frame, t)) events.push(e);
  }
  return { events, state: engine.getState() };
}

function holdFrames(n, opts = {}) {
  const lm = makeLm2d();
  const wlm = hollowWorld(opts);
  return Array.from({ length: n }, () => ({ lm, wlm, dt: 100 }));
}

describe("hollowHold holdEngine — geçerli kaşık timer'ı ilerletir (sahte süre yok)", () => {
  it("geçerli hollow pozisyonunda hold timer ilerler (süre birikir)", () => {
    const engine = createHoldEngine(hollowHold);
    const { state } = driveHold(engine, holdFrames(20));
    expect(state.phase).toBe("holding");
    expect(state.heldMs).toBeGreaterThan(0);
    expect(state.heldSeconds).toBeGreaterThanOrEqual(1);
  });

  it("kaşık bozulunca (düz yatışa geçince) timer DURUR — süre korunur", () => {
    const engine = createHoldEngine(hollowHold);
    const lmF = makeLm2d();
    const seq = [
      ...holdFrames(14), // tutuş → süre birikir
      ...Array.from({ length: 6 }, () => ({ lm: lmF, wlm: flatSupineWorld(), dt: 100 })),
    ];
    const { state } = driveHold(engine, seq);
    const heldAfterBreak = state.heldMs;
    expect(state.phase).toBe("broken");
    expect(heldAfterBreak).toBeGreaterThan(0);

    // Bozuk kalmaya devam → süre artmaz (durdu, sahte süre yok).
    const { state: state2 } = driveHold(engine, [
      { lm: lmF, wlm: flatSupineWorld(), dt: 100 },
      { lm: lmF, wlm: flatSupineWorld(), dt: 100 },
    ]);
    expect(state2.heldMs).toBe(heldAfterBreak);
  });

  it("tekrar kaşığa dönülünce süre kaldığı yerden devam eder", () => {
    const engine = createHoldEngine(hollowHold);
    const lmF = makeLm2d();
    driveHold(engine, holdFrames(14));
    const afterFirst = engine.getState().heldMs;
    driveHold(engine, [
      ...Array.from({ length: 3 }, () => ({ lm: lmF, wlm: flatSupineWorld(), dt: 100 })),
      ...holdFrames(14),
    ]);
    expect(engine.getState().phase).toBe("holding");
    expect(engine.getState().heldMs).toBeGreaterThan(afterFirst);
  });

  it("hiç kaşık olmadan (hep düz yatış) end sinyali çıkmaz", () => {
    const engine = createHoldEngine(hollowHold);
    const lmF = makeLm2d();
    const { events } = driveHold(engine, [
      { lm: lmF, wlm: flatSupineWorld(), dt: 4000 },
      { lm: lmF, wlm: flatSupineWorld(), dt: 4000 },
    ]);
    expect(events.some((e) => e.type === "end")).toBe(false);
  });

  it("uzun süre bozuk kalınca 'end' sinyali (hands-free otomatik bitiş)", () => {
    const engine = createHoldEngine(hollowHold);
    const lmF = makeLm2d();
    const { events } = driveHold(engine, [
      ...holdFrames(8),
      { lm: lmF, wlm: flatSupineWorld(), dt: 100 },
      { lm: lmF, wlm: flatSupineWorld(), dt: 3500 },
      { lm: lmF, wlm: flatSupineWorld(), dt: 3500 }, // toplam > breakEndMs (6000)
    ]);
    expect(events.some((e) => e.type === "end")).toBe(true);
  });
});

// --- backDrop fault kuralı — holding fazında kaşık zayıflaması ---

function fireFaults(metrics, phase, frames = 14) {
  const engine = createFaultRuleEngine(hollowHold.faultRules);
  const lm = makeLm2d();
  const events = [];
  let t = 0;
  for (let i = 0; i < frames; i++) {
    t += 100;
    for (const e of engine.step({ metrics, landmarks: lm, phase, timestamp: t })) {
      events.push(e);
    }
  }
  return events;
}

describe("hollowHold backDrop kuralı — omuz/bacak düşmesi", () => {
  it("holding fazında bodyLineAngle düşük (kaşık zayıf) → uyarı", () => {
    const events = fireFaults({ bodyLineAngle: 24 }, "holding");
    const fire = events.find((e) => e.rule === "backDrop");
    expect(fire).toBeTruthy();
    expect(fire.speech).toContain("yerden kaldır");
  });

  it("güçlü kaşık (bodyLineAngle yüksek) → uyarı YOK", () => {
    expect(fireFaults({ bodyLineAngle: 45 }, "holding")).toHaveLength(0);
  });
});
