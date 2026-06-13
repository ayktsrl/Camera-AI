// Eklem NOKTA çizimi testleri — skeleton ÇİZGİSİ YOK + SADECE kilitli kullanıcı.
// Saf: 2D context çağrılarını kaydeden mock ile davranış doğrulanır (DOM yok).

import { describe, it, expect, beforeEach } from "vitest";
import { drawPose } from "../drawing";

// Çağrı kaydeden minimal CanvasRenderingContext2D mock'u.
function mockCtx() {
  const calls = { arc: 0, fill: 0, stroke: 0, moveTo: 0, lineTo: 0, beginPath: 0 };
  return {
    calls,
    beginPath() { calls.beginPath++; },
    arc() { calls.arc++; },
    fill() { calls.fill++; },
    stroke() { calls.stroke++; },
    moveTo() { calls.moveTo++; },
    lineTo() { calls.lineTo++; },
    set fillStyle(_) {},
    get fillStyle() { return ""; },
    set strokeStyle(_) {},
    get strokeStyle() { return ""; },
    set lineWidth(_) {},
    get lineWidth() { return 0; },
  };
}

function pt(x, y, ok = true) {
  return ok
    ? { x, y, visibility: 1, presence: 1 }
    : { x, y, visibility: 0, presence: 0 };
}

// 5 güvenilir + 1 güvenilmez nokta.
function track(id, reliableCount = 5) {
  const landmarks = [];
  for (let i = 0; i < reliableCount; i++) landmarks.push(pt(0.5, 0.1 * i));
  landmarks.push(pt(0.9, 0.9, false)); // güvenilmez — atlanmalı
  return { id, landmarks };
}

describe("drawPose — NOKTA eklemler (skeleton çizgisi yok)", () => {
  let ctx;
  beforeEach(() => {
    ctx = mockCtx();
  });

  it("bağlantı ÇİZGİSİ çizmez (moveTo/lineTo çağrılmaz)", () => {
    drawPose(ctx, [track(1)], 960, 540, 1);
    expect(ctx.calls.moveTo).toBe(0);
    expect(ctx.calls.lineTo).toBe(0);
  });

  it("her güvenilir eklem için bir NOKTA çizer (arc + fill)", () => {
    drawPose(ctx, [track(1, 5)], 960, 540, 1);
    expect(ctx.calls.arc).toBe(5); // 5 güvenilir, güvenilmez atlandı
    expect(ctx.calls.fill).toBe(5);
  });

  it("noktaya okunabilirlik halkası ekler (stroke)", () => {
    drawPose(ctx, [track(1, 5)], 960, 540, 1);
    expect(ctx.calls.stroke).toBe(5);
  });
});

describe("drawPose — SADECE kilitli kullanıcı çizilir", () => {
  let ctx;
  beforeEach(() => {
    ctx = mockCtx();
  });

  it("yalnız activeTrackId eşleşen track'in noktalarını çizer", () => {
    const tracks = [track(1, 5), track(2, 5)];
    drawPose(ctx, tracks, 960, 540, 1); // sadece id=1 aktif
    expect(ctx.calls.arc).toBe(5); // 2. track çizilmez
  });

  it("aktif kullanıcı yoksa (null) hiçbir şey çizilmez", () => {
    drawPose(ctx, [track(1), track(2)], 960, 540, null);
    expect(ctx.calls.arc).toBe(0);
    expect(ctx.calls.beginPath).toBe(0);
  });

  it("aktif id listede yoksa hiçbir şey çizilmez", () => {
    drawPose(ctx, [track(1)], 960, 540, 99);
    expect(ctx.calls.arc).toBe(0);
  });

  it("boş track listesinde güvenli (çizim yok)", () => {
    drawPose(ctx, [], 960, 540, 1);
    expect(ctx.calls.arc).toBe(0);
  });
});
