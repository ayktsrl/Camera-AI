// İskelet ve bounding box çizimi.
// Aktif kullanıcı tam renkte, diğer track'ler soluk çizilir.

import { CONNECTIONS, isPointReliable } from "./pose";

const ACTIVE_COLOR = "200, 242, 78"; // kireç accent (rgb)
const PASSIVE_COLOR = "244, 244, 241"; // kırık beyaz (rgb)

export function drawPose(ctx, tracks, width, height, activeTrackId) {
  if (!tracks.length) return;

  tracks.forEach((track) => {
    const isActive = track.id === activeTrackId;
    const rgb = isActive ? ACTIVE_COLOR : PASSIVE_COLOR;
    const lineAlpha = isActive ? 0.95 : 0.22;
    const pointAlpha = isActive ? 1 : 0.25;
    const landmarks = track.landmarks;

    ctx.lineWidth = isActive ? 3 : 2;
    ctx.strokeStyle = `rgba(${rgb}, ${lineAlpha})`;

    for (const [start, end] of CONNECTIONS) {
      const a = landmarks[start];
      const b = landmarks[end];

      if (!isPointReliable(a) || !isPointReliable(b)) continue;

      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }

    ctx.fillStyle = `rgba(${rgb}, ${pointAlpha})`;
    landmarks.forEach((point) => {
      if (!isPointReliable(point)) return;
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, isActive ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

export function drawBoundingBox(ctx, track, width, height, isActive) {
  if (!track?.bbox) return;

  const padding = 16;
  const rgb = isActive ? ACTIVE_COLOR : PASSIVE_COLOR;

  const minX = track.bbox.minX * width;
  const maxX = track.bbox.maxX * width;
  const minY = track.bbox.minY * height;
  const maxY = track.bbox.maxY * height;

  ctx.strokeStyle = `rgba(${rgb}, ${isActive ? 0.8 : 0.18})`;
  ctx.lineWidth = isActive ? 2 : 1.5;
  ctx.setLineDash(isActive ? [] : [6, 6]);
  ctx.strokeRect(
    minX - padding,
    minY - padding,
    maxX - minX + padding * 2,
    maxY - minY + padding * 2
  );
  ctx.setLineDash([]);
}
