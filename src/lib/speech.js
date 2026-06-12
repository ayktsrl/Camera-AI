// Sesli koçluk — Web Speech API (speechSynthesis), Türkçe.
// Uyarı başına cooldown ile spam engellenir; tekrar sayısı anında söylenir.

const DEFAULT_COOLDOWN_MS = 4000;

export function createCoach({ lang = "tr-TR" } = {}) {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  let enabled = true;
  let voice = null;
  const lastSpokenAt = new Map();

  function pickVoice() {
    if (!supported) return;
    const voices = window.speechSynthesis.getVoices();
    voice =
      voices.find((v) => v.lang === lang) ||
      voices.find((v) => v.lang?.toLowerCase().startsWith("tr")) ||
      null;
  }

  if (supported) {
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }

  function speak(text, { interrupt = false } = {}) {
    if (!supported) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    if (voice) utterance.voice = voice;
    utterance.rate = 1.05;
    if (interrupt) window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  /**
   * Cooldown'lu konuşma. Aynı key cooldown süresi dolmadan tekrar söylenmez.
   */
  function say(text, { key = text, cooldownMs = DEFAULT_COOLDOWN_MS } = {}) {
    if (!enabled || !supported) return;

    const now = Date.now();
    const last = lastSpokenAt.get(key) || 0;
    if (now - last < cooldownMs) return;
    lastSpokenAt.set(key, now);

    speak(text);
  }

  /** Tekrar sayısını söyler — kuyruğu keser, gecikmesiz. */
  function sayCount(count) {
    if (!enabled || !supported) return;
    speak(String(count), { interrupt: true });
  }

  function setEnabled(value) {
    enabled = value;
    if (!value && supported) window.speechSynthesis.cancel();
  }

  return {
    say,
    sayCount,
    setEnabled,
    isSupported: supported,
  };
}
