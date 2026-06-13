// Hareket önizlemesi — küçük 16:9 YouTube thumbnail'ı.
// Graceful fallback: thumbnail yoksa (ID yok) veya yüklenemezse (offline)
// hareket adının baş harfini taşıyan nötr kireç-zemin placeholder gösterir.
// KIRIK resim ikonu asla görünmez. Lazy load + saf <img>, ağır bağımlılık yok.

import { useState } from "react";
import { thumbUrl } from "../lib/videoThumb";

function initialOf(name) {
  const ch = (name ?? "").trim().charAt(0);
  return ch ? ch.toLocaleUpperCase("tr-TR") : "•";
}

/**
 * @param {object}  exercise  - { name, videoUrl }
 * @param {string}  size      - "sm" (liste) | "md" (set ekranı), varsayılan "md"
 * @param {boolean} asLink    - true ise dokununca videoyu yeni sekmede açar
 */
export default function ExercisePreview({ exercise, size = "md", asLink = false }) {
  const src = thumbUrl(exercise.videoUrl);
  const [broken, setBroken] = useState(false);
  const showImage = src && !broken;

  const media = showImage ? (
    <img
      className="exercise-preview-img"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  ) : (
    <span className="exercise-preview-fallback" aria-hidden="true">
      {initialOf(exercise.name)}
    </span>
  );

  const className = `exercise-preview exercise-preview--${size}`;

  if (asLink && exercise.videoUrl) {
    return (
      <a
        className={`${className} exercise-preview--link`}
        href={exercise.videoUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`${exercise.name} videosunu izle`}
      >
        {media}
        <span className="exercise-preview-play" aria-hidden="true">
          ▶ İzle
        </span>
      </a>
    );
  }

  return <span className={className}>{media}</span>;
}
