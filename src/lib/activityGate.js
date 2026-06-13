// Aktivite kapısı — SÜRE-DOZLU TAKİPLİ hareketlerde (örn. Jumping Jack 45 sn)
// geri sayımın "kör kronometre" olmasını engeller. Saf, React'siz.
//
// KÖK NEDEN (owner canlı test): PoseSetScreen'in süre-dozlu geri sayımı yalnız
// VARLIK (hasActiveUser) + pause ile duraklıyordu → kişi karede AMA hareketsizse
// süre yine de akıyordu (kör). Owner: "yapmasam da saymaya devam ediyor."
//
// Felsefe (plank holdEngine "smart-pause" ile aynı): süre yalnız hareket AKTİF
// algılandıkça akar; kişi durunca DONAR, tekrar harekete geçince DEVAM eder.
//
// Sinyal kaynağı: rep FSM. Gerçek bir tekrar (rep) VEYA anlamlı bir faz geçişi
// (standing↔descent↔bottom↔ascent) "hareket var" demektir. jumpingJack zaten
// bacak-kapılı rep sayıyor; faz geçişi rep'ten daha erken/sık sinyal verir
// (yarım hareket bile faz değiştirir) → daha duyarlı. İkisinden herhangi biri
// aktiviteyi tazeler.
//
// Çıktı: noteActivity(ts) ile beslenir; isActive(ts) son aktiviteden bu yana
// activeWindowMs geçmediyse true. shouldPrompt(ts) uzun durmada (idleVoiceMs)
// TEK sesli hatırlatma için cooldown'lu sinyal verir.
//
// Bu motor rep SAYMAZ ve repEngine'e dokunmaz — yalnız zaten yayılan event'leri
// "hareket var mı" sinyaline indirger. Rep-dozlu setlerde KULLANILMAZ (onlar
// zaten yalnız gerçek rep sayar; süre kavramı yoktur).

// Son aktiviteden bu yana bu kadar ms geçerse "duraklatıldı" sayılır → süre donar.
// holdEngine breakEndMs (6 sn, set bitişi) değil; bu daha kısa bir DURAKLAMA penceresi.
// KALİBRASYON ADAYI: tempo/owner canlı testine göre ince ayar (2.5–3 sn bandı).
export const DEFAULT_ACTIVE_WINDOW_MS = 2800;

// Bu kadar ms hiç hareket yoksa TEK nazik sesli hatırlatma (cooldown'lu).
export const DEFAULT_IDLE_VOICE_MS = 5000;

// Hatırlatma tekrar aralığı — aktivite geri gelmeden bir daha söyleme.
const PROMPT_COOLDOWN_MS = 12000;

/**
 * @param {object} [opts]
 * @param {number} [opts.activeWindowMs] Aktif sayılma penceresi (ms).
 * @param {number} [opts.idleVoiceMs] Sesli hatırlatma eşiği (ms).
 */
export function createActivityGate({
  activeWindowMs = DEFAULT_ACTIVE_WINDOW_MS,
  idleVoiceMs = DEFAULT_IDLE_VOICE_MS,
} = {}) {
  // Son anlamlı hareket anı. null → henüz hiç hareket olmadı (set yeni başladı):
  // bu durumda kişi başlamayı bekliyordur → AKTİF DEĞİL (süre akmaz, kör başlamaz).
  let lastActivityAt = null;
  let lastPromptAt = null;

  /** Anlamlı hareket (rep veya faz geçişi) bildir → pencereyi tazele. */
  function noteActivity(timestamp) {
    lastActivityAt = timestamp;
  }

  /**
   * Hareket event'lerinden aktivite mi? rep her zaman; phase yalnız "idle"
   * dışına/arasına gerçek geçişlerde (idle → ... süre akıtmaz; idle pozisyon yokluğu).
   * @param {{type:string, phase?:string}} event repEngine/useRepCounter event'i
   * @returns {boolean}
   */
  function isActivityEvent(event) {
    if (!event) return false;
    if (event.type === "rep") return true;
    if (event.type === "phase") {
      // "idle" pozisyon/metrik yokluğudur (hareket değil). Diğer tüm fazlar
      // (standing/descent/bottom/ascent) gerçek bir geçiştir → hareket sinyali.
      return event.phase != null && event.phase !== "idle";
    }
    return false;
  }

  /** Son aktiviteden bu yana activeWindowMs geçmediyse aktif. */
  function isActive(timestamp) {
    if (lastActivityAt == null) return false;
    return timestamp - lastActivityAt < activeWindowMs;
  }

  /**
   * Uzun hareketsizlikte TEK sesli hatırlatma sinyali (cooldown'lu).
   * Aktivite varsa asla; idleVoiceMs aşıldıysa ve cooldown dolduysa true döner
   * (ve cooldown'u tazeler — çağıran konuşur).
   */
  function shouldPrompt(timestamp) {
    // Hiç başlamadıysa hatırlatma yok (başlama anonsu akış katmanında yapılır).
    if (lastActivityAt == null) return false;
    if (isActive(timestamp)) return false;
    if (timestamp - lastActivityAt < idleVoiceMs) return false;
    if (lastPromptAt != null && timestamp - lastPromptAt < PROMPT_COOLDOWN_MS) {
      return false;
    }
    lastPromptAt = timestamp;
    return true;
  }

  /** Yeni set / yeniden başlangıç. */
  function reset() {
    lastActivityAt = null;
    lastPromptAt = null;
  }

  return {
    noteActivity,
    isActivityEvent,
    isActive,
    shouldPrompt,
    reset,
  };
}
