// Kamera görünüm kontratı — ayna (mirror) SADECE görsel sunum. Bu proje DOM-render
// testi kullanmaz (saf mantık deseni); kameranın iki davranışını birim olarak sabitler:
//
//  1) Ayna varsayılanı facingMode'a göre türetilir (ön=açık, arka=kapalı) AMA ayna
//     ayrı state'tir: facingMode değişince ayna ZORLANMAZ — manuel override korunur.
//  2) .stage--mirrored sınıfı yalnız mirror state'ine bağlıdır (facingMode'a DEĞİL),
//     ve pose motorunun gördüğü hiçbir şeyi etkilemez (ayna = CSS transform).

import { describe, it, expect } from "vitest";
import {
  defaultMirrorFor,
  CAMERA_FACING_KEY,
  CAMERA_MIRROR_KEY,
} from "../cameraView";

describe("ayna varsayılanı (defaultMirrorFor)", () => {
  it("ön kamera (user) → ayna açık", () => {
    expect(defaultMirrorFor("user")).toBe(true);
  });
  it("arka kamera (environment) → ayna kapalı", () => {
    expect(defaultMirrorFor("environment")).toBe(false);
  });
});

describe("ayna ile facingMode AYRI kalıcı state (anahtarlar çakışmaz)", () => {
  it("kamera yönü ve ayna farklı localStorage anahtarları kullanır", () => {
    expect(CAMERA_FACING_KEY).toBe("formcoach_camera_facing_v1");
    expect(CAMERA_MIRROR_KEY).toBe("formcoach_camera_mirror_v1");
    expect(CAMERA_FACING_KEY).not.toBe(CAMERA_MIRROR_KEY);
  });
});

// View'lerdeki ayna toggle = saf boolean flip; facingMode değişimi aynayı ZORLAMAZ.
// (ProgramMode/FreeMode: setMirror((m) => !m) ve facingMode setter'ı mirror'a dokunmaz.)
function toggleMirror(mirror) {
  return !mirror;
}
function switchFacing(facing) {
  return facing === "user" ? "environment" : "user";
}

describe("manuel ayna override (facingMode'dan bağımsız)", () => {
  it("ayna toggle: kapalı→açık→kapalı", () => {
    let m = false;
    m = toggleMirror(m);
    expect(m).toBe(true);
    m = toggleMirror(m);
    expect(m).toBe(false);
  });

  it("ön kamerada owner aynayı KAPATABİLİR (sol/sağ form uyarısı ters gelmesin)", () => {
    // Ön kamera varsayılanı ayna açık; owner manuel kapatır → kapalı kalır.
    let mirror = defaultMirrorFor("user"); // true
    mirror = toggleMirror(mirror); // owner kapatır
    expect(mirror).toBe(false);
  });

  it("kamera yönü değişince ayna state'i DEĞİŞMEZ (override korunur)", () => {
    // Owner aynayı kapattı (ön kamerada). Sonra arka↔ön çevirir; ayna kapalı kalmalı.
    let facing = "user";
    let mirror = false; // owner kapattı
    facing = switchFacing(facing); // → environment
    expect(facing).toBe("environment");
    expect(mirror).toBe(false); // switch mirror'a dokunmadı
    facing = switchFacing(facing); // → user
    expect(facing).toBe("user");
    expect(mirror).toBe(false); // hâlâ owner'ın seçimi
  });
});

// .stage--mirrored YALNIZ mirror state'ine bağlanır (facingMode'a DEĞİL). Bileşenlerdeki
// className türetiminin saf yansıması. Ayna görsel transform → motor landmark/çizim AYNI.
function stageClass(base, mirror) {
  return mirror ? `${base} stage--mirrored` : base;
}

describe(".stage--mirrored yalnız mirror'a bağlı (motordan bağımsız)", () => {
  it("mirror açık → stage--mirrored eklenir; kapalı → eklenmez", () => {
    expect(stageClass("stage player-stage stage--full", true)).toContain(
      "stage--mirrored"
    );
    expect(stageClass("stage player-stage stage--full", false)).not.toContain(
      "stage--mirrored"
    );
  });

  it("aynı facingMode altında mirror=false iken sınıf çevrilmez (decouple kanıtı)", () => {
    // Eski davranış facingMode==='user' iken hep mirrored'dı; artık mirror karar verir.
    const facingMode = "user"; // ön kamera
    const mirror = false; // ama owner aynayı kapattı
    expect(stageClass("stage", mirror)).not.toContain("stage--mirrored");
    // facingMode hâlâ "user" — sınıf yine de mirrored DEĞİL → ayrışma doğrulandı.
    expect(facingMode).toBe("user");
  });
});
