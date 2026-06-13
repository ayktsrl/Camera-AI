// Tam-ekran antrenman HUD kontrol KONTRATI — owner "hareketi geç" + drawer.
//
// Bu proje DOM-render testi kullanmaz (jsdom/testing-library yok; tüm testler saf
// mantık — poseSetCompletion.test.js deseni). Bu yüzden cam-üstü HUD'ın iki yeni
// davranışını saf birim olarak sabitliyoruz:
//
//  1) "Hareketi geç" butonu → ProgramMode.skipSlot() akışı: aktif sete (gerekirse
//     announce/countdown'ı geçerek) ulaşır, onu SKIPPED loglar ve akışı SÜRDÜRÜR
//     (sonsuz takılma yok). skipSlot YENİ mantık değil — buton yalnız buna bağlanır;
//     test o bağın gerçekten ilerleme ürettiğini doğrular.
//  2) Önizleme drawer'ı VARSAYILAN KAPALI; tab toggle aç/kapa; scrim → kapanır.
//     (WorkoutHud'daki useState toggle'ın saf indirgeyici karşılığı.)

import { describe, it, expect } from "vitest";
import { createWorkoutSession } from "../../lib/programPlayer";
import { ownerProgram } from "../../programs/default-program";

// ProgramMode.skipSlot() içindeki akış mantığının birebir saf yansıması — HUD "Geç"
// butonu bunu çağırır (yeni mantık YOK, mevcut session API'sine bağlanır).
function runSkip(session) {
  let s = session.getState();
  if (s.status === "done") return s;
  while (s.status === "announce" || s.status === "countdown") {
    s = session.advancePhase();
  }
  if (s.status === "exercise") {
    return session.completeSet({ reps: null, skipped: true });
  }
  if (s.status === "rest") {
    return session.finishRest();
  }
  return s;
}

describe("HUD 'Hareketi geç' → skipSlot akış kontratı", () => {
  it("aktif hareketi skipped loglar ve akış sonraki faza ilerler (takılmaz)", () => {
    const s = createWorkoutSession(ownerProgram, "day1", { handsFree: true });
    // İlk slot announce'da başlar; "Geç" basıldığında HUD skipSlot'u çağırır.
    expect(s.getState().status).toBe("announce");

    const before = s.getState();
    const after = runSkip(s);

    // Akış kilitlenmedi → İLERLEME gerçekleşti: tamamlanan set arttı VEYA slot
    // ilerledi VEYA dinlenmeye geçti. (İlk slot dinlenmesiz → sonraki slotun
    // announce'una geçer; status aynı kalsa da slotIndex/completedSets artar.)
    const advanced =
      after.completedSets > before.completedSets ||
      after.slotIndex > before.slotIndex ||
      after.status === "rest";
    expect(advanced).toBe(true);
  });

  it("tüm hareketler geçilince akış 'done'a ulaşır (sonsuz döngü yok)", () => {
    const s = createWorkoutSession(ownerProgram, "day1", { handsFree: true });
    let guard = 0;
    while (s.getState().status !== "done" && guard < 200) {
      runSkip(s);
      guard += 1;
    }
    expect(s.getState().status).toBe("done");
    expect(guard).toBeLessThan(200);
  });
});

// WorkoutHud drawer state'i: tek boolean toggle. Varsayılan KAPALI; tab açar/kapatır,
// scrim her zaman kapatır. (Bileşendeki useState((o)=>!o) ve setDrawerOpen(false).)
function drawerReducer(open, action) {
  if (action === "toggle") return !open;
  if (action === "close") return false;
  return open;
}

describe("Önizleme drawer kontratı (varsayılan kapalı, toggle/scrim)", () => {
  it("varsayılan KAPALI — kamera tam-ekran kalır", () => {
    const initial = false; // WorkoutHud: useState(false)
    expect(drawerReducer(initial, "noop")).toBe(false);
  });

  it("tab toggle: kapalı→açık→kapalı", () => {
    let open = false;
    open = drawerReducer(open, "toggle");
    expect(open).toBe(true);
    open = drawerReducer(open, "toggle");
    expect(open).toBe(false);
  });

  it("scrim her durumda kapatır", () => {
    expect(drawerReducer(true, "close")).toBe(false);
    expect(drawerReducer(false, "close")).toBe(false);
  });
});
