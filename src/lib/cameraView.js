// Kamera görünüm yardımcıları — SADECE görsel sunum (ayna/yön). Pose motoru,
// rep/hold/form/takip mantığı bu modülden ETKİLENMEZ: ayna yalnız .stage'e
// uygulanan CSS scaleX(-1) transform'unu açar/kapatır; video VE canvas birlikte
// çevrilir, landmark koordinatları/çizim ham kalır (usePoseTracking değişmez).
//
// Ayna varsayılanı facingMode'a göre türetilir (ön=ayna açık, arka=kapalı) ama
// owner manuel override edebilir (sol/sağ form uyarısında ayna karıştırmasın diye
// ön kamerada bile aynayı kapatabilsin). Bu yüzden ayna AYRI kalıcı state'tir.

export const CAMERA_FACING_KEY = "formcoach_camera_facing_v1";
export const CAMERA_MIRROR_KEY = "formcoach_camera_mirror_v1";

/**
 * facingMode'a göre ayna varsayılanı.
 * Ön kamera (user) → kullanıcı kendini doğal/ayna görür → true.
 * Arka kamera (environment) → dünya zaten doğru → false.
 * @param {"user"|"environment"} facingMode
 * @returns {boolean}
 */
export function defaultMirrorFor(facingMode) {
  return facingMode === "user";
}
