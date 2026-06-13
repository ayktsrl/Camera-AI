// İn-app hedef-poz önizlemesi — ANİMASYONLU çöp adam (stick figure) döngüsü.
// Owner: "hareket önizlemesi lazım — çöp adam gibi basit bir şey bile hangi hareketi
// yapacağımı gösterse yeterli." Statik silüet yerine inip-kalkan figür.
//
// Saf SVG + requestAnimationFrame interpolasyon. Dış link / video / bağımlılık YOK,
// offline + telif-temiz. Eklem koordinatları ve döngü mantığı src/lib/stickFigure.js'te
// (salt görsel; pose/repEngine mantığına dokunmaz).
//
// Performans/erişilebilirlik:
//  - prefers-reduced-motion → animasyon durur, statik orta kare gösterilir.
//  - size="strip" (listeler/gün şeridi) → çok figür performansı için statik kalır.
//  - rAF'te SVG attribute'ları doğrudan güncellenir (React re-render yok) → hafif;
//    pose ekranındaki kamera FPS'ini etkilemez.

import { useEffect, useRef } from "react";
import {
  keyframesFor,
  poseAt,
  staticFrame,
  groundYFor,
  POSE_PERIOD_MS,
} from "../lib/stickFigure";

// Hangi boyutlar canlanır — strip listede çok figür olur, statik tutulur.
const ANIMATED_SIZES = new Set(["sm", "md"]);

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Çizim primitifleri — bir <g> içindeki çizgilere ref ile attribute basarız.
const BONES = [
  ["shoulder", "hip"],
  ["hip", "knee"],
  ["knee", "ankle"],
  ["shoulder", "elbow"],
  ["elbow", "wrist"],
];

/**
 * @param {object} exercise - { name, ruleSetRef, id }
 * @param {string} size     - "strip" | "sm" | "md", varsayılan "md"
 */
export default function PosePreview({ exercise, size = "md" }) {
  const frames = keyframesFor(exercise);
  const groundY = groundYFor(exercise);
  const className = `pose-preview pose-preview--${size}`;

  const lineRefs = useRef([]);
  const headRef = useRef(null);
  const rafRef = useRef(0);

  const animated = ANIMATED_SIZES.has(size) && !prefersReducedMotion();

  // İlk render referans pozu (statikse bu. animasyonda rAF üzerine yazar).
  const initial = animated ? frames[0] : staticFrame(exercise);

  useEffect(() => {
    if (!animated) return undefined;
    if (prefersReducedMotion()) return undefined; // matchMedia anlık değişimi

    const start = performance.now();

    const apply = (j) => {
      lineRefs.current.forEach((el, i) => {
        if (!el) return;
        const [aKey, bKey] = BONES[i];
        const a = j[aKey];
        const b = j[bKey];
        if (a && b) {
          el.setAttribute("x1", a[0]);
          el.setAttribute("y1", a[1]);
          el.setAttribute("x2", b[0]);
          el.setAttribute("y2", b[1]);
          el.style.display = "";
        } else {
          el.style.display = "none";
        }
      });
      if (headRef.current && j.head) {
        headRef.current.setAttribute("cx", j.head[0]);
        headRef.current.setAttribute("cy", j.head[1]);
      }
    };

    const tick = (now) => {
      apply(poseAt(frames, now - start, POSE_PERIOD_MS));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [animated, frames]);

  const renderBone = (aKey, bKey, i) => {
    const a = initial[aKey];
    const b = initial[bKey];
    const visible = a && b;
    return (
      <line
        key={`${aKey}-${bKey}`}
        ref={(el) => (lineRefs.current[i] = el)}
        x1={visible ? a[0] : 0}
        y1={visible ? a[1] : 0}
        x2={visible ? b[0] : 0}
        y2={visible ? b[1] : 0}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        style={visible ? undefined : { display: "none" }}
      />
    );
  };

  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="pose-preview-svg">
        {/* zemin/destek çizgisi — duruşu yere oturtur */}
        <line
          x1="8"
          y1={groundY}
          x2="92"
          y2={groundY}
          stroke="currentColor"
          strokeWidth="1.2"
          opacity="0.35"
        />
        <g>
          {BONES.map(([a, b], i) => renderBone(a, b, i))}
          {initial.head && (
            <circle
              ref={headRef}
              cx={initial.head[0]}
              cy={initial.head[1]}
              r="5.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            />
          )}
        </g>
      </svg>
    </span>
  );
}
