// Egzersiz fotoğraf eşleme KONTRATI — PosePreview'in çöp adam yerine gerçek foto
// göstermesinin temeli. Owner çöp adamı 2 kez reddetti; bu test foto eşlemesini ve
// graceful fallback'i (foto yok → null → PosePreview nötr placeholder) sabitler.
//
// DOM yok (bu repoda jsdom kurulu değil) → saf eşleme mantığı test edilir.

import { describe, it, expect } from "vitest";
import { photoKeyFor, photosFor, hasPhotos } from "../exercisePhotos";
import { EXERCISE_LIBRARY } from "../../programs/exerciseLibrary";

describe("exercisePhotos — ruleSetRef eşlemesi", () => {
  const REFS = [
    "squat",
    "pushup",
    "lunge",
    "plank",
    "jumpingJack",
    "kneeRaise",
    "lateralRaise",
    "hammerCurl",
    "shoulderPress",
  ];

  it("9 takipli ruleSetRef'in hepsi bir foto klasörüne eşlenir", () => {
    for (const ref of REFS) {
      expect(photoKeyFor({ ruleSetRef: ref })).toBe(ref);
    }
  });

  it("photosFor start + end URL döner ve /exercises/<key>/ yolunu içerir", () => {
    const photos = photosFor({ ruleSetRef: "squat" });
    expect(photos).not.toBeNull();
    expect(photos.start).toContain("exercises/squat/start.jpg");
    expect(photos.end).toContain("exercises/squat/end.jpg");
  });
});

describe("exercisePhotos — library id eşlemesi", () => {
  it("library id (ruleSetRef'siz) tam eşleşir", () => {
    expect(photoKeyFor({ id: "push-up" })).toBe("pushup");
    expect(photoKeyFor({ id: "bodyweight-squat" })).toBe("squat");
    expect(photoKeyFor({ id: "barbell-squat" })).toBe("squat");
    expect(photoKeyFor({ id: "standing-knee-raise" })).toBe("kneeRaise");
  });

  it("özel programdaki köklenmiş id ('lunge-2') köke göre eşleşir", () => {
    expect(photoKeyFor({ id: "lunge-2" })).toBe("lunge");
    expect(photoKeyFor({ id: "jumping-jack-3" })).toBe("jumpingJack");
  });

  it("ruleSetRef id'ye göre önceliklidir", () => {
    // id farklı olsa da ruleSetRef varsa onu kullanır.
    expect(photoKeyFor({ ruleSetRef: "squat", id: "push-up" })).toBe("squat");
  });
});

describe("exercisePhotos — graceful fallback (çöp adam DEĞİL)", () => {
  it("eşleşmeyen hareket null döner (PosePreview placeholder'a düşer)", () => {
    expect(photoKeyFor({ id: "burpee", ruleSetRef: null })).toBeNull();
    expect(photoKeyFor({ id: "leg-press" })).toBeNull();
    expect(photoKeyFor({})).toBeNull();
    expect(photoKeyFor(null)).toBeNull();
    expect(photosFor({ id: "burpee" })).toBeNull();
    expect(hasPhotos({ id: "burpee" })).toBe(false);
  });
});

describe("exercisePhotos — foto-boşluk doldurma (2026-06-13)", () => {
  // Eksik/zayıf hareketlere bundle'lı gerçek görsel eklendi. Eşlemeler çözülmeli.
  it("hollow hold artık kendi fotosuna eşlenir (eski placeholder kaldırıldı)", () => {
    expect(photoKeyFor({ ruleSetRef: "hollowHold" })).toBe("hollow-hold");
    expect(photoKeyFor({ id: "cxB-hollow-hold", ruleSetRef: "hollowHold" })).toBe(
      "hollow-hold"
    );
  });

  it("leg swings (rehberli, ruleSetRef'siz) kendi fotosuna eşlenir", () => {
    expect(photoKeyFor({ id: "leg-swings" })).toBe("leg-swings");
    expect(photoKeyFor({ id: "cxB-leg-swings" })).toBe("leg-swings");
  });

  it("pike push-up geri alındı — placeholder bekleniyor (handstand görseli yanlıştı)", () => {
    // Yanlış demonstrasyon (handstand push-up) kaldırıldı; doğru zemin-pike
    // görseli bulunana dek pike-pushup nötr placeholder'a düşer (null).
    expect(photoKeyFor({ id: "pike-pushup" })).toBeNull();
    expect(photoKeyFor({ id: "cxA-pike-pushup" })).toBeNull();
  });

  it("high-knees, kneeRaise motorunu paylaşsa da KENDİ fotosunu alır (ID ezme)", () => {
    // ruleSetRef "kneeRaise" olmasına rağmen id ezmesi devreye girer.
    expect(photoKeyFor({ id: "high-knees", ruleSetRef: "kneeRaise" })).toBe(
      "high-knees"
    );
    expect(photoKeyFor({ id: "cxB-high-knees", ruleSetRef: "kneeRaise" })).toBe(
      "high-knees"
    );
  });

  it("standing knee raise high-knees'ten ayrı — kendi kneeRaise fotosunda kalır", () => {
    expect(photoKeyFor({ id: "standing-knee-raise", ruleSetRef: "kneeRaise" })).toBe(
      "kneeRaise"
    );
    expect(photoKeyFor({ id: "cxA-knee-raise", ruleSetRef: "kneeRaise" })).toBe(
      "kneeRaise"
    );
  });
});

describe("exercisePhotos — kütüphane bütünlüğü", () => {
  it("takipli (trackable + ruleSetRef) hareketlerin hepsinin fotoğrafı vardır", () => {
    // Foto-boşluk doldurma sonrası: hollowHold dahil her takiplinin gerçek fotosu var.
    const tracked = EXERCISE_LIBRARY.filter((e) => e.trackable && e.ruleSetRef);
    expect(tracked.length).toBeGreaterThan(0);
    for (const ex of tracked) {
      expect(hasPhotos(ex)).toBe(true);
    }
  });
});
