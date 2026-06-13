// Aktivite kapısı kontratı — süre-dozlu takipli harekette "kör kronometre"
// regresyon kalkanı (owner canlı test: "yapmasam da saymaya devam ediyor").
//
// Doğrulanan davranış: hareket VAR → aktif (süre akar), hareket YOK → donar,
// tekrar hareket → devam. Ayrıca: rep + faz geçişi hareket sayılır (idle değil),
// uzun durmada TEK ölçülü sesli hatırlatma (cooldown'lu).

import { describe, it, expect } from "vitest";
import {
  createActivityGate,
  DEFAULT_ACTIVE_WINDOW_MS,
  DEFAULT_IDLE_VOICE_MS,
} from "../activityGate";

describe("activityGate — hareket sinyali sınıflandırma", () => {
  it("rep event'i her zaman hareket sayılır", () => {
    const g = createActivityGate();
    expect(g.isActivityEvent({ type: "rep", count: 1 })).toBe(true);
  });

  it("anlamlı faz geçişleri hareket sayılır (standing/descent/bottom/ascent)", () => {
    const g = createActivityGate();
    for (const phase of ["standing", "descent", "bottom", "ascent"]) {
      expect(g.isActivityEvent({ type: "phase", phase })).toBe(true);
    }
  });

  it("idle fazı (pozisyon/metrik yokluğu) hareket DEĞİLDİR", () => {
    const g = createActivityGate();
    expect(g.isActivityEvent({ type: "phase", phase: "idle" })).toBe(false);
  });

  it("warning ve diğer event'ler hareket sayılmaz", () => {
    const g = createActivityGate();
    expect(g.isActivityEvent({ type: "warning", rule: "depth" })).toBe(false);
    expect(g.isActivityEvent(null)).toBe(false);
  });
});

describe("activityGate — aktif/duraklama penceresi (süre akışı kapısı)", () => {
  it("hiç hareket olmadan AKTİF DEĞİL (kör başlama yok)", () => {
    const g = createActivityGate();
    expect(g.isActive(0)).toBe(false);
    expect(g.isActive(10_000)).toBe(false);
  });

  it("HAREKET VAR → aktif (süre akar): pencere içinde true", () => {
    const g = createActivityGate({ activeWindowMs: 2800 });
    g.noteActivity(1000);
    expect(g.isActive(1000)).toBe(true); // hemen
    expect(g.isActive(1000 + 2799)).toBe(true); // pencere bitmeden
  });

  it("HAREKET YOK → donar: pencere aşılınca pasif", () => {
    const g = createActivityGate({ activeWindowMs: 2800 });
    g.noteActivity(1000);
    expect(g.isActive(1000 + 2800)).toBe(false); // pencere doldu → duraklatıldı
    expect(g.isActive(1000 + 10_000)).toBe(false);
  });

  it("TEKRAR HAREKET → devam: yeni aktivite pencereyi tazeler", () => {
    const g = createActivityGate({ activeWindowMs: 2800 });
    g.noteActivity(1000);
    expect(g.isActive(5000)).toBe(false); // durmuş
    g.noteActivity(5000); // tekrar hareket
    expect(g.isActive(5000)).toBe(true); // devam
    expect(g.isActive(7000)).toBe(true);
    expect(g.isActive(8000)).toBe(false); // tekrar durdu
  });

  it("reset() yeni sette kapıyı temizler (pasif başlar)", () => {
    const g = createActivityGate();
    g.noteActivity(1000);
    expect(g.isActive(1000)).toBe(true);
    g.reset();
    expect(g.isActive(1000)).toBe(false);
  });
});

describe("activityGate — ölçülü sesli hatırlatma (cooldown'lu)", () => {
  it("aktifken VEYA hiç başlamadan hatırlatma YOK", () => {
    const g = createActivityGate({ idleVoiceMs: 5000 });
    expect(g.shouldPrompt(0)).toBe(false); // hiç hareket yok
    g.noteActivity(1000);
    expect(g.shouldPrompt(1000)).toBe(false); // aktif
  });

  it("idleVoiceMs aşılınca TEK kez true, sonra cooldown'da false", () => {
    const g = createActivityGate({ idleVoiceMs: 5000 });
    g.noteActivity(0);
    expect(g.shouldPrompt(4000)).toBe(false); // henüz eşik dolmadı
    expect(g.shouldPrompt(5000)).toBe(true); // eşik doldu → bir kez
    expect(g.shouldPrompt(6000)).toBe(false); // cooldown
    expect(g.shouldPrompt(10_000)).toBe(false); // hâlâ cooldown (<12 sn)
  });

  it("cooldown sonrası ve durmaya devam ediyorsa tekrar uyarabilir", () => {
    const g = createActivityGate({ idleVoiceMs: 5000 });
    g.noteActivity(0);
    expect(g.shouldPrompt(5000)).toBe(true);
    // 12 sn cooldown sonrası, hâlâ hareketsiz → tekrar bir kez
    expect(g.shouldPrompt(17_500)).toBe(true);
  });

  it("varsayılan eşikler makul aralıkta (kalibrasyon adayı)", () => {
    expect(DEFAULT_ACTIVE_WINDOW_MS).toBeGreaterThanOrEqual(2000);
    expect(DEFAULT_ACTIVE_WINDOW_MS).toBeLessThanOrEqual(4000);
    expect(DEFAULT_IDLE_VOICE_MS).toBeGreaterThan(DEFAULT_ACTIVE_WINDOW_MS);
  });
});
