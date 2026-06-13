// Eklem NOKTA çizimi (skeleton ÇİZGİSİ YOK — owner kararı) + kilit çerçevesi.
//
// Owner pozu çizgi-iskelet halinde görmek istemiyor: eklemler dolu daire (nokta)
// olarak çizilir, bağlantı çizgileri çizilmez. SADECE kilitli (aktif) kullanıcının
// noktaları çizilir → salonda diğer kişiler ekranda görünmez (dikkat dağılmaz).

import { isPointReliable } from "./pose";

const ACTIVE_RGB = "200, 242, 78"; // kireç accent (rgb)
const INK_RGB = "19, 21, 18"; // koyu ink — parlak kamera arka planında okunabilirlik halkası
const DOT_RADIUS = 5; // net görünür nokta (çok büyük değil)

/**
 * Yalnız kilitli (aktif) kullanıcının eklemlerini NOKTA olarak çizer.
 * Diğer track'ler çizilmez. Skeleton bağlantı çizgisi YOK.
 *
 * @param {object[]} tracks onaylanmış track listesi
 * @param {number|null} activeTrackId kilitli track id (yoksa hiçbir şey çizilmez)
 */
export function drawPose(ctx, tracks, width, height, activeTrackId) {
  if (!tracks.length || activeTrackId == null) return;

  const track = tracks.find((t) => t.id === activeTrackId);
  if (!track?.landmarks) return;

  track.landmarks.forEach((point) => {
    if (!isPointReliable(point)) return;

    const cx = point.x * width;
    const cy = point.y * height;

    ctx.beginPath();
    ctx.arc(cx, cy, DOT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${ACTIVE_RGB}, 1)`;
    ctx.fill();

    // İnce ink halka — açık/parlak arka planda nokta kaybolmasın.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(${INK_RGB}, 0.85)`;
    ctx.stroke();
  });
}

export function drawBoundingBox(ctx, track, width, height, isActive) {
  if (!track?.bbox) return;

  const padding = 16;

  const minX = track.bbox.minX * width;
  const maxX = track.bbox.maxX * width;
  const minY = track.bbox.minY * height;
  const maxY = track.bbox.maxY * height;

  ctx.strokeStyle = `rgba(${ACTIVE_RGB}, ${isActive ? 0.8 : 0.18})`;
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
