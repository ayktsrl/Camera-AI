// Hareket önizlemesi — in-app statik hedef-poz silüeti (PosePreview).
// YouTube thumbnail / dış link / "▶ İzle" TAMAMEN kaldırıldı (owner: "link falan koyma").
// Önizleme offline + telif-temiz; veri tarafındaki videoUrl arşivde kalır ama UI okumaz.
// API geriye uyumlu: size aynı; asLink prop'u artık YOK SAYILIR (kademeli temizlik).

import PosePreview from "./PosePreview";

/**
 * @param {object} exercise - { name, ruleSetRef }
 * @param {string} size     - "strip" (liste) | "sm" (pose ekranı) | "md" (rehberli), varsayılan "md"
 */
export default function ExercisePreview({ exercise, size = "md" }) {
  return <PosePreview exercise={exercise} size={size} />;
}
