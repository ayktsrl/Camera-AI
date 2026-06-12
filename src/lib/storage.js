// localStorage yardımcıları — kalıcılık opsiyonel, hata sessiz yutulur.

export function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sessiz — kalıcılık opsiyonel */
  }
}
