// Sesli yerleştirme asistanı hook'u — owner ekrana BAKMADAN doğru yerleşsin.
//
// usePoseTracking'in onFrame'inden gelen aktif kullanıcının landmark'larını
// evaluateFraming (saf util) ile değerlendirir; durum değişince SESLİ yönlendirir
// (mevcut coach.say cooldown deseni → spam yok) ve ekran ipucunu döndürür.
//
// SINIR: takip motorunu beslemez, yalnız gözlemler. Frame değerlendirmesi throttle'lı
// (varsayılan ~4 Hz) → kamera FPS'i etkilenmez. Durum debounce'lı (titreşim yok).

import { useCallback, useEffect, useRef, useState } from "react";
import { evaluateFraming } from "../lib/framingCheck";

const EVAL_INTERVAL_MS = 250; // ~4 Hz — FPS'e dokunmaz
const STABLE_FRAMES = 3; // aynı durum N kez → stabil (titreşim kalkanı)
const SPEECH_COOLDOWN_MS = 3500;

/**
 * @param {object} params
 * @param {"full"|"upper"} params.framing aktif hareketin kadraj gereksinimi
 * @param {object} params.coach createCoach örneği (say/announce)
 * @param {boolean} [params.active=true] asistan açık mı (yalnız yerleştirme penceresinde)
 * @returns {{
 *   placement: {ok, status, hint, speech}|null,
 *   pushFrame: (landmarks) => void,   // onFrame içinden çağrılır
 *   reset: () => void,
 * }}
 */
export function usePlacementCheck({ framing = "full", coach, active = true }) {
  const [placement, setPlacement] = useState(null);

  const lastEvalRef = useRef(0);
  const candidateRef = useRef(null); // { status, count }
  const stableStatusRef = useRef(null);
  const okSpokenRef = useRef(false);

  // En güncel değerleri okumak için "latest ref" — güncelleme effect gövdesinde
  // (render sırasında ref yazımı react-hooks/refs kuralını ihlal eder).
  const framingRef = useRef(framing);
  const activeRef = useRef(active);
  const coachRef = useRef(coach);
  useEffect(() => {
    framingRef.current = framing;
    activeRef.current = active;
    coachRef.current = coach;
  });

  const reset = useCallback(() => {
    lastEvalRef.current = 0;
    candidateRef.current = null;
    stableStatusRef.current = null;
    okSpokenRef.current = false;
    setPlacement(null);
  }, []);

  // onFrame'den çağrılır — landmark dizisi (aktif kullanıcı) veya null.
  const pushFrame = useCallback((landmarks) => {
    if (!activeRef.current) return;

    const now = performance.now();
    if (now - lastEvalRef.current < EVAL_INTERVAL_MS) return;
    lastEvalRef.current = now;

    const res = evaluateFraming({ landmarks, framing: framingRef.current });

    // Debounce — aynı durum STABLE_FRAMES kez tekrarlanınca yayınla.
    const cand = candidateRef.current;
    if (cand && cand.status === res.status) {
      cand.count += 1;
    } else {
      candidateRef.current = { status: res.status, count: 1 };
    }
    if (candidateRef.current.count < STABLE_FRAMES) return;

    // Stabil durum değişti mi?
    if (stableStatusRef.current === res.status) {
      setPlacement(res); // hint metni güncel kalsın (yön değişebilir)
      return;
    }
    stableStatusRef.current = res.status;
    setPlacement(res);

    const c = coachRef.current;
    if (!c) return;

    if (res.ok) {
      // "ok"a ilk kez geçince tek kez "görüyorum, başlıyoruz".
      if (!okSpokenRef.current) {
        okSpokenRef.current = true;
        c.announce(res.speech, { interrupt: true });
      }
    } else {
      okSpokenRef.current = false;
      c.say(res.speech, { key: `placement-${res.status}`, cooldownMs: SPEECH_COOLDOWN_MS });
    }
  }, []);

  return { placement, pushFrame, reset };
}
