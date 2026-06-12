// Eklem açısı hesaplama yardımcıları (2D, normalize landmark koordinatları).

/**
 * Üç noktadan orta noktadaki (b) eklem açısını derece olarak döndürür.
 * Örn: kalça-diz-ayak bileği → diz açısı. Tam düz bacak ≈ 180°.
 * @returns {number|null} 0–180 arası derece; nokta eksikse null
 */
export function angleAtPoint(a, b, c) {
  if (!a || !b || !c) return null;

  const abX = a.x - b.x;
  const abY = a.y - b.y;
  const cbX = c.x - b.x;
  const cbY = c.y - b.y;

  const abLen = Math.hypot(abX, abY);
  const cbLen = Math.hypot(cbX, cbY);
  if (abLen === 0 || cbLen === 0) return null;

  const dot = abX * cbX + abY * cbY;
  const cos = Math.min(1, Math.max(-1, dot / (abLen * cbLen)));

  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * İki noktayı birleştiren doğrunun DİKEY eksenle yaptığı açı (derece).
 * Örn: kalça→omuz hattı; 0° = dimdik gövde, 90° = yere paralel.
 * @returns {number|null}
 */
export function verticalTiltDeg(from, to) {
  if (!from || !to) return null;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;

  // Ekran koordinatlarında y aşağı doğru artar; dikeyden sapma:
  return (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
}

/** İki landmark'ın orta noktası. */
export function midpoint(a, b) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
