// Yerleştirme (kadraj) kontrolü kontratı — owner "ekrana bakmadan yerleş" sinyali.
// Sentetik landmark dizileriyle her durum: full eksik-bacak → geri git; upper
// eksik-bacak → ok; kadraj-dışı; kişi yok. SAF util — tarayıcı/kamera gerekmez.

import { describe, it, expect } from "vitest";
import { evaluateFraming } from "../framingCheck";
import { LM } from "../pose";

// 33 noktalık landmark dizisi üretir; verilen indekslere {x,y,visibility,presence}
// koyar, gerisini görünmez (visibility 0) bırakır.
function mkLandmarks(points) {
  const arr = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0,
    presence: 0,
  }));
  for (const [idx, pos] of Object.entries(points)) {
    arr[idx] = { x: 0.5, y: 0.5, visibility: 1, presence: 1, ...pos };
  }
  return arr;
}

// Kadraj-içi tam vücut (omuz üstte, ayak altta, kenarlardan uzak).
const FULL_BODY = {
  [LM.LEFT_SHOULDER]: { x: 0.42, y: 0.25 },
  [LM.RIGHT_SHOULDER]: { x: 0.58, y: 0.25 },
  [LM.LEFT_HIP]: { x: 0.44, y: 0.5 },
  [LM.RIGHT_HIP]: { x: 0.56, y: 0.5 },
  [LM.LEFT_KNEE]: { x: 0.44, y: 0.72 },
  [LM.RIGHT_KNEE]: { x: 0.56, y: 0.72 },
  [LM.LEFT_ANKLE]: { x: 0.44, y: 0.9 },
  [LM.RIGHT_ANKLE]: { x: 0.56, y: 0.9 },
  [LM.LEFT_ELBOW]: { x: 0.38, y: 0.4 },
  [LM.RIGHT_ELBOW]: { x: 0.62, y: 0.4 },
};

describe("evaluateFraming — kişi yok", () => {
  it("landmark null → no-person", () => {
    const r = evaluateFraming({ landmarks: null, framing: "full" });
    expect(r.status).toBe("no-person");
    expect(r.ok).toBe(false);
  });

  it("omuzlar görünmüyor → no-person", () => {
    const lm = mkLandmarks({ [LM.LEFT_KNEE]: {}, [LM.RIGHT_KNEE]: {} });
    const r = evaluateFraming({ landmarks: lm, framing: "full" });
    expect(r.status).toBe("no-person");
  });
});

describe("evaluateFraming — full (tüm vücut)", () => {
  it("tüm landmark kadrajda → ok", () => {
    const r = evaluateFraming({ landmarks: mkLandmarks(FULL_BODY), framing: "full" });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("ok");
    expect(r.speech).toMatch(/başlıyoruz/i);
  });

  it("bacak (diz/ayak) görünmüyor → too-close (geri git)", () => {
    const lm = mkLandmarks({
      [LM.LEFT_SHOULDER]: { x: 0.42, y: 0.2 },
      [LM.RIGHT_SHOULDER]: { x: 0.58, y: 0.2 },
      [LM.LEFT_HIP]: { x: 0.44, y: 0.55 },
      [LM.RIGHT_HIP]: { x: 0.56, y: 0.55 },
      [LM.LEFT_ELBOW]: { x: 0.38, y: 0.4 },
      [LM.RIGHT_ELBOW]: { x: 0.62, y: 0.4 },
    });
    const r = evaluateFraming({ landmarks: lm, framing: "full" });
    expect(r.status).toBe("too-close");
    expect(r.speech).toMatch(/geri git/i);
  });

  it("ayak alt kenara taşıyor → partial-bottom", () => {
    const lm = mkLandmarks({
      ...FULL_BODY,
      [LM.LEFT_ANKLE]: { x: 0.44, y: 0.99 },
      [LM.RIGHT_ANKLE]: { x: 0.56, y: 0.99 },
    });
    const r = evaluateFraming({ landmarks: lm, framing: "full" });
    expect(r.status).toBe("partial-bottom");
  });

  it("vücut sol kenara yapışık → out-left (sağa kay)", () => {
    const shifted = {};
    for (const [idx, pos] of Object.entries(FULL_BODY)) {
      shifted[idx] = { ...pos, x: Math.max(0.02, pos.x - 0.42) };
    }
    const r = evaluateFraming({ landmarks: mkLandmarks(shifted), framing: "full" });
    expect(r.status).toBe("out-left");
    expect(r.speech).toMatch(/sağa/i);
  });
});

describe("evaluateFraming — upper (üst vücut)", () => {
  it("bacak görünmese de üst vücut tam → ok (yakın durabilir)", () => {
    const lm = mkLandmarks({
      [LM.LEFT_SHOULDER]: { x: 0.4, y: 0.2 },
      [LM.RIGHT_SHOULDER]: { x: 0.6, y: 0.2 },
      [LM.LEFT_ELBOW]: { x: 0.35, y: 0.45 },
      [LM.RIGHT_ELBOW]: { x: 0.65, y: 0.45 },
      [LM.LEFT_HIP]: { x: 0.42, y: 0.8 },
      [LM.RIGHT_HIP]: { x: 0.58, y: 0.8 },
    });
    const r = evaluateFraming({ landmarks: lm, framing: "upper" });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("ok");
  });

  it("dirsek görünmüyor → ok değil (too-far / yönlendirme)", () => {
    const lm = mkLandmarks({
      [LM.LEFT_SHOULDER]: { x: 0.45, y: 0.4 },
      [LM.RIGHT_SHOULDER]: { x: 0.55, y: 0.4 },
    });
    const r = evaluateFraming({ landmarks: lm, framing: "upper" });
    expect(r.ok).toBe(false);
  });

  it("üst vücut çok küçük (uzak) → too-far (yaklaş)", () => {
    // Omuz-kalça yüksekliği < eşik → uzak.
    const lm = mkLandmarks({
      [LM.LEFT_SHOULDER]: { x: 0.47, y: 0.48 },
      [LM.RIGHT_SHOULDER]: { x: 0.53, y: 0.48 },
      [LM.LEFT_ELBOW]: { x: 0.45, y: 0.55 },
      [LM.RIGHT_ELBOW]: { x: 0.55, y: 0.55 },
      [LM.LEFT_HIP]: { x: 0.48, y: 0.62 },
      [LM.RIGHT_HIP]: { x: 0.52, y: 0.62 },
    });
    const r = evaluateFraming({ landmarks: lm, framing: "upper" });
    expect(r.status).toBe("too-far");
    expect(r.speech).toMatch(/yaklaş/i);
  });
});

describe("evaluateFraming — varsayılan framing", () => {
  it("framing verilmezse full davranır", () => {
    const lm = mkLandmarks({
      [LM.LEFT_SHOULDER]: { x: 0.42, y: 0.2 },
      [LM.RIGHT_SHOULDER]: { x: 0.58, y: 0.2 },
      [LM.LEFT_HIP]: { x: 0.44, y: 0.55 },
      [LM.RIGHT_HIP]: { x: 0.56, y: 0.55 },
    });
    const r = evaluateFraming({ landmarks: lm });
    expect(r.status).toBe("too-close"); // bacak yok → full kuralı
  });
});
