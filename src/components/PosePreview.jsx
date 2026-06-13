// İn-app hedef-hareket önizlemesi — GERÇEK EGZERSİZ FOTOĞRAFLARI.
// Owner çöp adamı (stick figure) iki kez reddetti → artık gerçek kişi demonstrasyon
// fotoğrafı kullanıyoruz. Görseller offline bundle'lı (public/exercises/<key>/),
// Unlicense / kamu malı (free-exercise-db). Dış link / video / CDN fetch YOK.
//
// Hareketi göstermek için: BAŞLANGIÇ (start.jpg) ↔ BİTİŞ (end.jpg) pozları arası
// yavaş crossfade döngüsü (~2.5s tam tur) — kullanıcı "başlangıç → bitiş" geçişini
// görür. İki <img> üst üste; opacity CSS animasyonuyla salınır (GPU dostu, React
// re-render yok → pose ekranındaki kamera FPS'ini etkilemez).
//
// Erişilebilirlik / performans:
//  - prefers-reduced-motion → crossfade durur, BİTİŞ pozu statik gösterilir.
//  - size="strip" (listeler / gün şeridi) → statik bitiş pozu (çok kare animasyonu yok).
//  - Foto yoksa (eşleşme yok) veya yüklenemezse → nötr "egzersiz" placeholder
//    (ÇÖP ADAM DEĞİL — owner reddetti; ilk harf + nötr kutu).
//
// stickFigure.js artık önizlemede KULLANILMAZ (dosya arşivde kalır).

import { useRef, useState } from "react";
import { photosFor } from "../lib/exercisePhotos";

// Hangi boyutlar canlanır — strip listede çok kare olur, statik tutulur.
const ANIMATED_SIZES = new Set(["sm", "md"]);

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Hareketin görünen adından nötr placeholder harfi (foto yok/yüklenemez fallback).
function initialLetterFor(exercise) {
  const name = (exercise?.name || "").trim();
  if (name) return name.charAt(0).toLocaleUpperCase("tr");
  return "E"; // "Egzersiz"
}

/**
 * @param {object} exercise - { name, ruleSetRef, id }
 * @param {string} size     - "strip" | "sm" | "md", varsayılan "md"
 */
export default function PosePreview({ exercise, size = "md" }) {
  const className = `pose-preview pose-preview--${size}`;
  const photos = photosFor(exercise);

  // Foto yüklenemedi mi (404 / bozuk) → fallback placeholder'a düş.
  const [failed, setFailed] = useState(false);

  // matchMedia anlık değeri — mount'ta okunur (SSR güvenli).
  const reduced = prefersReducedMotion();
  const animated = ANIMATED_SIZES.has(size) && !reduced;

  // Foto seti değişirse hata bayrağını render sırasında sıfırla (React'ın önerdiği
  // "store info from previous renders" deseni — effect + setState cascade'i yok).
  const photoStartUrl = photos?.start || null;
  const prevUrlRef = useRef(photoStartUrl);
  if (prevUrlRef.current !== photoStartUrl) {
    prevUrlRef.current = photoStartUrl;
    if (failed) setFailed(false);
  }

  // Eşleşme yok ya da yükleme başarısız → nötr placeholder (çöp adam DEĞİL).
  if (!photos || failed) {
    return (
      <span className={className} aria-hidden="true">
        <span className="pose-preview-placeholder">
          {initialLetterFor(exercise)}
        </span>
      </span>
    );
  }

  // Statik mod (strip ya da reduced-motion): yalnız BİTİŞ pozu — hedefi net gösterir.
  if (!animated) {
    return (
      <span className={className} aria-hidden="true">
        <img
          className="pose-preview-img"
          src={photos.end}
          alt=""
          loading="lazy"
          decoding="async"
          draggable="false"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  // Animasyonlu crossfade: start (altta, hep görünür) + end (üstte, opacity salınır).
  // CSS @keyframes pose-crossfade end katmanını 0→1→0 yumuşak döngüde gezdirir.
  return (
    <span className={`${className} pose-preview--animated`} aria-hidden="true">
      <img
        className="pose-preview-img pose-preview-img--start"
        src={photos.start}
        alt=""
        loading="lazy"
        decoding="async"
        draggable="false"
        onError={() => setFailed(true)}
      />
      <img
        className="pose-preview-img pose-preview-img--end"
        src={photos.end}
        alt=""
        loading="lazy"
        decoding="async"
        draggable="false"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
