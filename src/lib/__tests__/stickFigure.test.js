// Stick figure interpolasyon util — saf fonksiyon testleri (salt görsel mantık).

import { describe, it, expect } from "vitest";
import {
  easeInOut,
  lerpJoints,
  poseAt,
  keyframeKeyFor,
  keyframesFor,
  staticFrame,
  groundYFor,
  POSE_PERIOD_MS,
} from "../stickFigure";

describe("easeInOut", () => {
  it("uçlarda 0 ve 1 verir, ortada 0.5", () => {
    expect(easeInOut(0)).toBeCloseTo(0, 6);
    expect(easeInOut(1)).toBeCloseTo(1, 6);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
  });

  it("aralık dışını kırpar", () => {
    expect(easeInOut(-1)).toBeCloseTo(0, 6);
    expect(easeInOut(2)).toBeCloseTo(1, 6);
  });

  it("monoton artan", () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const v = easeInOut(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("lerpJoints", () => {
  const a = { head: [0, 0], hip: [10, 10] };
  const b = { head: [10, 20], hip: [20, 30] };

  it("t=0 → a, t=1 → b", () => {
    expect(lerpJoints(a, b, 0).head).toEqual([0, 0]);
    expect(lerpJoints(a, b, 1).head).toEqual([10, 20]);
  });

  it("t=0.5 → orta nokta", () => {
    const m = lerpJoints(a, b, 0.5);
    expect(m.head).toEqual([5, 10]);
    expect(m.hip).toEqual([15, 20]);
  });

  it("tek tarafta olan eklemi taşır (interpole etmez)", () => {
    const out = lerpJoints({ head: [0, 0], elbow: [5, 5] }, { head: [10, 10] }, 0.5);
    expect(out.head).toEqual([5, 5]);
    expect(out.elbow).toEqual([5, 5]); // sadece a'da → olduğu gibi
  });
});

describe("poseAt — ping-pong döngü", () => {
  const frames = [
    { hip: [0, 0] },
    { hip: [100, 0] },
  ];

  it("başlangıçta ilk kare", () => {
    expect(poseAt(frames, 0, POSE_PERIOD_MS).hip).toEqual([0, 0]);
  });

  it("period sonunda son kareye ulaşır", () => {
    expect(poseAt(frames, POSE_PERIOD_MS, POSE_PERIOD_MS).hip[0]).toBeCloseTo(100, 4);
  });

  it("tam döngü (2*period) başa döner", () => {
    expect(poseAt(frames, 2 * POSE_PERIOD_MS, POSE_PERIOD_MS).hip[0]).toBeCloseTo(0, 4);
  });

  it("dönüş yarısı geri gider (ileri ≠ geri aynı x, simetrik)", () => {
    const forwardQuarter = poseAt(frames, POSE_PERIOD_MS * 0.5, POSE_PERIOD_MS).hip[0];
    const backQuarter = poseAt(frames, POSE_PERIOD_MS * 1.5, POSE_PERIOD_MS).hip[0];
    expect(forwardQuarter).toBeCloseTo(backQuarter, 4); // ping-pong simetrisi
  });

  it("tek kare → o kareyi döndürür", () => {
    expect(poseAt([{ hip: [7, 7] }], 1234, POSE_PERIOD_MS).hip).toEqual([7, 7]);
  });

  it("boş dizide patlamaz", () => {
    expect(poseAt([], 100, POSE_PERIOD_MS)).toEqual({});
  });
});

describe("keyframeKeyFor — hareket eşleme", () => {
  it("takipli ruleSetRef'leri özel animasyona eşler", () => {
    expect(keyframeKeyFor({ ruleSetRef: "squat" })).toBe("squat");
    expect(keyframeKeyFor({ ruleSetRef: "pushup" })).toBe("pushup");
    expect(keyframeKeyFor({ ruleSetRef: "lunge" })).toBe("lunge");
  });

  it("library id ile rehberli özel hareketleri eşler", () => {
    expect(keyframeKeyFor({ id: "jumping-jack" })).toBe("jumping-jack");
    expect(keyframeKeyFor({ id: "db-lateral-raise" })).toBe("db-lateral-raise");
    expect(keyframeKeyFor({ id: "db-hammer-curl-2" })).toBe("db-hammer-curl");
  });

  it("ısınma takipli ruleSetRef (camelCase) ve standing-knee-raise id'sini eşler", () => {
    // ruleSetRef camelCase → kebab-case keyframe anahtarı
    expect(keyframeKeyFor({ ruleSetRef: "jumpingJack" })).toBe("jumping-jack");
    expect(keyframeKeyFor({ ruleSetRef: "kneeRaise" })).toBe("knee-raise");
    // program slot id'leri
    expect(keyframeKeyFor({ id: "standing-knee-raise" })).toBe("knee-raise");
    expect(keyframeKeyFor({ id: "standing-knee-raise-4" })).toBe("knee-raise");
    expect(keyframeKeyFor({ id: "jumping-jack-4" })).toBe("jumping-jack");
  });

  it("bilinmeyen → generic", () => {
    expect(keyframeKeyFor({ id: "plank" })).toBe("generic");
    expect(keyframeKeyFor({})).toBe("generic");
    expect(keyframeKeyFor(null)).toBe("generic");
  });
});

describe("keyframesFor / staticFrame / groundY", () => {
  it("her hareket en az 2 kare", () => {
    for (const ex of [
      { ruleSetRef: "squat" },
      { ruleSetRef: "pushup" },
      { ruleSetRef: "lunge" },
      { id: "jumping-jack" },
      {},
    ]) {
      expect(keyframesFor(ex).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("her karede head var (figür kafadan ayağa görünür)", () => {
    for (const ex of [{ ruleSetRef: "squat" }, { ruleSetRef: "pushup" }, {}]) {
      keyframesFor(ex).forEach((f) => expect(f.head).toBeDefined());
    }
  });

  it("staticFrame son kareyi verir", () => {
    const frames = keyframesFor({ ruleSetRef: "squat" });
    expect(staticFrame({ ruleSetRef: "squat" })).toEqual(frames[frames.length - 1]);
  });

  it("push-up zemin çizgisi farklı (yatay düzlem)", () => {
    expect(groundYFor({ ruleSetRef: "pushup" })).toBe(90);
    expect(groundYFor({ ruleSetRef: "squat" })).toBe(92);
  });
});
