// Çoklu kişi takibi + KULLANICI KİLİDİ (registration) testleri.
// Saf — kamera/React yok; sentetik track/detection dizileriyle frame iterasyonu.

import { describe, it, expect } from "vitest";
import {
  createTrackerState,
  updateTracks,
  selectActiveTrack,
  resetLock,
  TRACK_CONFIRM_FRAMES,
  TRACK_MAX_MISSING_FRAMES,
  ACTIVE_RELOCK_WAIT_FRAMES,
  REGISTER_STABLE_FRAMES,
} from "../tracking";

// Kilitli kişi düşene VE relock bekleme penceresi dolana kadar yeterli boş frame.
// (Track listeden TRACK_MAX_MISSING_FRAMES sonra düşer; sonra activeLostFrames sayılır.)
const VANISH_FRAMES = TRACK_MAX_MISSING_FRAMES + ACTIVE_RELOCK_WAIT_FRAMES + 2;

// Tek noktalı landmark seti (33 nokta gerekmez; bbox/center yeterli, motor yok).
function det(id, cx, cy, area = 0.2) {
  const half = Math.sqrt(area) / 2;
  return {
    landmarks: [{ x: cx, y: cy, visibility: 1, presence: 1 }],
    worldLandmarks: null,
    centerNorm: { x: cx, y: cy },
    bbox: {
      minX: cx - half,
      maxX: cx + half,
      minY: cy - half,
      maxY: cy + half,
      area,
    },
    _id: id,
  };
}

// N frame boyunca aynı tespitleri besle + her frame kilit seçimini çalıştır.
function run(state, detections, frames) {
  let active = null;
  for (let i = 0; i < frames; i++) {
    updateTracks(state, detections);
    active = selectActiveTrack(state);
  }
  return active;
}

describe("updateTracks — temel takip (regresyon koruması)", () => {
  it("yeni track açar, ID atar, confirm eşiğinde onaylar", () => {
    const state = createTrackerState();
    const d = [det("a", 0.5, 0.5)];

    for (let i = 0; i < TRACK_CONFIRM_FRAMES - 1; i++) {
      const tracks = updateTracks(state, d);
      expect(tracks[0].isConfirmed).toBe(false);
    }
    const tracks = updateTracks(state, d);
    expect(tracks[0].isConfirmed).toBe(true);
    expect(tracks[0].id).toBe(1);
  });

  it("kaybolan track missingFrames sayar ve sonunda düşer", () => {
    const state = createTrackerState();
    const d = [det("a", 0.5, 0.5)];
    for (let i = 0; i < 5; i++) updateTracks(state, d);
    expect(state.tracks.length).toBe(1);

    let tracks;
    for (let i = 0; i < 20; i++) tracks = updateTracks(state, []);
    expect(tracks.length).toBe(0);
  });

  it("yakın merkezleri aynı track'e eşleştirir (ID korunur)", () => {
    const state = createTrackerState();
    updateTracks(state, [det("a", 0.5, 0.5)]);
    updateTracks(state, [det("a", 0.52, 0.5)]);
    expect(state.tracks.length).toBe(1);
    expect(state.tracks[0].id).toBe(1);
  });
});

describe("kullanıcı kilidi — kayıt (registration)", () => {
  it("merkezdeki büyük track stabil kalınca KİLİTLENİR", () => {
    const state = createTrackerState();
    const detections = [det("merkez", 0.5, 0.5, 0.25)];

    // Kayıt tamamlanmadan active YOK.
    run(state, detections, REGISTER_STABLE_FRAMES);
    expect(state.lockPhase).toBe("registering");

    // Birkaç frame daha → kilit.
    const active = run(state, detections, 5);
    expect(state.lockPhase).toBe("locked");
    expect(active).not.toBeNull();
    expect(active.id).toBe(state.activeTrackId);
  });

  it("kayıt sırasında daha büyük ama KENARDAKİ kişi seçilmez; merkez kilitlenir", () => {
    const state = createTrackerState();
    // Kenarda (x=0.95) büyük + merkezde (x=0.5) küçük.
    const detections = [det("kenar", 0.95, 0.5, 0.4), det("merkez", 0.5, 0.5, 0.15)];

    run(state, detections, REGISTER_STABLE_FRAMES + 6);
    expect(state.lockPhase).toBe("locked");
    // Kilitli olan merkezdeki track olmalı (kenardaki büyük değil).
    const locked = state.tracks.find((t) => t.id === state.activeTrackId);
    expect(locked.centerNorm.x).toBeCloseTo(0.5, 5);
  });

  it("kilit sonrası daha büyük biri girse de ACTIVE DEĞİŞMEZ", () => {
    const state = createTrackerState();
    const me = [det("me", 0.5, 0.5, 0.2)];
    run(state, me, REGISTER_STABLE_FRAMES + 6);
    const lockedId = state.activeTrackId;
    expect(state.lockPhase).toBe("locked");

    // Yeni, daha büyük biri merkeze yakın girer.
    const crowd = [det("me", 0.5, 0.5, 0.2), det("intruder", 0.55, 0.5, 0.6)];
    const active = run(state, crowd, 10);
    expect(active).not.toBeNull();
    expect(active.id).toBe(lockedId);
  });
});

describe("kullanıcı kilidi — tek kişi fast-path", () => {
  it("kenardaki tek kişi de kilitlenir (merkez filtresi gevşer)", () => {
    const state = createTrackerState();
    // Tek kişi, kadraj kenarında (merkez filtresi normalde elerdi).
    const detections = [det("solo", 0.9, 0.5, 0.2)];
    const active = run(state, detections, REGISTER_STABLE_FRAMES + 6);
    expect(state.lockPhase).toBe("locked");
    expect(active).not.toBeNull();
  });
});

describe("kullanıcı kilidi — kayıp + proximity re-acquire", () => {
  it("son bilinen merkeze YAKIN track'e yeniden kilitlenir", () => {
    const state = createTrackerState();
    const me = [det("me", 0.5, 0.5, 0.2)];
    run(state, me, REGISTER_STABLE_FRAMES + 6);
    expect(state.lockPhase).toBe("locked");

    const lockedId = state.activeTrackId;

    // Kilitli kişi listeden düşer (TRACK_MAX_MISSING_FRAMES) ama relock bekleme
    // penceresi henüz AÇIK → bu pencerede aynı yerde yeni track belirirse re-acquire.
    let active = null;
    for (let i = 0; i < TRACK_MAX_MISSING_FRAMES + 1; i++) {
      updateTracks(state, []);
      active = selectActiveTrack(state);
    }
    expect(active).toBeNull(); // kilitli kayıp, bekleme penceresinde
    expect(state.lockPhase).toBe("locked"); // henüz idle'a düşmedi

    // Aynı yerde (yakın) yeni track belirir → onaylanınca proximity re-acquire.
    const back = [det("back", 0.52, 0.5, 0.2)];
    active = run(state, back, TRACK_CONFIRM_FRAMES + 2);
    expect(state.lockPhase).toBe("locked");
    expect(active).not.toBeNull();
    expect(active.id).not.toBe(lockedId); // yeni track id (eski düşmüştü)
  });

  it("UZAKTAKİ yanlış kişiye ATLAMAZ → idle'a düşer (yeniden kayıt)", () => {
    const state = createTrackerState();
    const me = [det("me", 0.5, 0.5, 0.2)];
    run(state, me, REGISTER_STABLE_FRAMES + 6);

    // Kilitli kayboluyor — track düşer + bekleme penceresi dolar.
    for (let i = 0; i < VANISH_FRAMES; i++) {
      updateTracks(state, []);
      selectActiveTrack(state);
    }

    // Yalnız UZAKTA (proximity dışı) biri var → re-acquire reddedilir,
    // resetLock ile idle'a düşülür (yanlış kişiye atlama yok).
    const far = [det("far", 0.05, 0.95, 0.2)];
    updateTracks(state, far);
    const active = selectActiveTrack(state);
    expect(state.lockPhase).not.toBe("locked");
    // İlk denemede uzaktaki kilitlenmemiş olmalı (kayıt yeniden başlar).
    expect(active).toBeNull();
  });
});

describe("kullanıcı kilidi — resetLock", () => {
  it("idle'a döner ve yeni kayıt başlar", () => {
    const state = createTrackerState();
    const me = [det("me", 0.5, 0.5, 0.2)];
    run(state, me, REGISTER_STABLE_FRAMES + 6);
    expect(state.lockPhase).toBe("locked");

    resetLock(state);
    expect(state.lockPhase).toBe("idle");
    expect(state.activeTrackId).toBeNull();
    expect(state.lastActiveCenter).toBeNull();

    // Tekrar kilit kurulabilir.
    run(state, me, REGISTER_STABLE_FRAMES + 6);
    expect(state.lockPhase).toBe("locked");
  });
});
