// Tuning → düzenlenebilir slider satırları dönüşümü. Kalibrasyon ekranı bunu okur,
// böylece ekran 9 hareketin HER BİRİNE jenerik uyum sağlar (harekete özel UI yok).
//
// Her satır: { path, label, value, min, max, step, unit, faultId? }
//   path: tuning içindeki yol (örn. "phases.standingMin", "faults.valgus.threshold")
//   value: güncel taslak değer; min/max/step: slider sınırları (TUNING_BOUNDS'tan)
//
// setByPath / getByPath ile taslak tuning üzerinde nokta-yolu okuma/yazma yapılır.

import { TUNING_BOUNDS, boundsForFault } from "./thresholds";

/** Nokta-yolundan değer okur (örn. "faults.valgus.threshold"). */
export function getByPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

/** Nokta-yoluna değer yazar — saf (yeni nesne döndürür, girdiyi bozmaz). */
export function setByPath(obj, path, value) {
  const keys = path.split(".");
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  let cursor = out;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cursor[k] = cursor[k] == null ? {} : { ...cursor[k] };
    cursor = cursor[k];
  }
  cursor[keys[keys.length - 1]] = value;
  return out;
}

// Fault eşikleri için okunabilir etiketler (kural id → kısa Türkçe).
const FAULT_LABELS = {
  depth: "Derinlik eşiği",
  valgus: "Valgus (diz içe) eşiği",
  torso: "Gövde eğimi eşiği",
  heel: "Topuk kalkması eşiği",
  asymmetry: "Asimetri eşiği",
  bodyLine: "Gövde hattı eşiği",
  neckLine: "Boyun hizası eşiği",
  kneeOverToe: "Diz-ayak ucu eşiği",
  tooHigh: "Çok yüksek eşiği",
  elbowDrift: "Dirsek kayması eşiği",
  elbowFlare: "Dirsek yana açılma eşiği",
  hipSag: "Kalça düşmesi eşiği",
  hipPike: "Kalça yukarı eşiği",
};

/**
 * Tuning'i slider satırlarına çevirir.
 * @param {object} tuning getTuning(id) / taslak tuning
 * @returns {Array<{path,label,value,min,max,step,unit,faultId?}>}
 */
export function buildTuningRows(tuning) {
  if (!tuning) return [];
  const rows = [];

  // Faz eşikleri (rep hareketleri).
  if (tuning.phases) {
    rows.push({
      path: "phases.standingMin",
      label: "Başlangıç fazı (standingMin)",
      value: tuning.phases.standingMin,
      ...TUNING_BOUNDS.phase,
      unit: "°",
    });
    rows.push({
      path: "phases.bottomMax",
      label: "Dip fazı (bottomMax)",
      value: tuning.phases.bottomMax,
      ...TUNING_BOUNDS.phase,
      unit: "°",
    });
  }
  if (typeof tuning.attemptBelow === "number") {
    rows.push({
      path: "attemptBelow",
      label: "Deneme alt sınırı (attemptBelow)",
      value: tuning.attemptBelow,
      ...TUNING_BOUNDS.attemptBelow,
      unit: "°",
    });
  }
  if (typeof tuning.phaseConfirmFrames === "number") {
    rows.push({
      path: "phaseConfirmFrames",
      label: "Faz onay karesi (debounce)",
      value: tuning.phaseConfirmFrames,
      ...TUNING_BOUNDS.phaseConfirmFrames,
      unit: "kare",
    });
  }

  // İzometrik hold eşikleri (plank).
  if (tuning.hold) {
    const h = tuning.hold;
    rows.push({
      path: "hold.horizontalMinTilt",
      label: "Yatay kabul açısı",
      value: h.horizontalMinTilt,
      ...TUNING_BOUNDS.phase,
      unit: "°",
    });
    rows.push({
      path: "hold.straightEnter",
      label: "Düz hat giriş eşiği",
      value: h.straightEnter,
      ...TUNING_BOUNDS.phase,
      unit: "°",
    });
    rows.push({
      path: "hold.straightExit",
      label: "Düz hat çıkış eşiği",
      value: h.straightExit,
      ...TUNING_BOUNDS.phase,
      unit: "°",
    });
    rows.push({
      path: "hold.enterFrames",
      label: "Giriş onay karesi",
      value: h.enterFrames,
      ...TUNING_BOUNDS.phaseConfirmFrames,
      unit: "kare",
    });
    rows.push({
      path: "hold.breakEndMs",
      label: "Bitiş penceresi (bozuk kalma)",
      value: h.breakEndMs,
      ...TUNING_BOUNDS.ms,
      unit: "ms",
    });
  }

  // Fault eşikleri — kural-kural threshold (+ varsa tolerance).
  if (tuning.faults) {
    for (const [ruleId, f] of Object.entries(tuning.faults)) {
      const b = boundsForFault(ruleId);
      rows.push({
        path: `faults.${ruleId}.threshold`,
        label: FAULT_LABELS[ruleId] ?? `${ruleId} eşiği`,
        value: f.threshold,
        ...b,
        unit: b === TUNING_BOUNDS.pctFault ? "%" : "°",
        faultId: ruleId,
      });
      if (typeof f.tolerance === "number") {
        rows.push({
          path: `faults.${ruleId}.tolerance`,
          label: `↳ tolerans (histerezis)`,
          value: f.tolerance,
          ...TUNING_BOUNDS.tolerance,
          unit: b === TUNING_BOUNDS.pctFault ? "%" : "°",
          faultId: ruleId,
        });
      }
    }
  }

  // Harekete özel ekstra (jumpingJack legOpenRatio).
  if (tuning.extra && typeof tuning.extra.legOpenRatio === "number") {
    rows.push({
      path: "extra.legOpenRatio",
      label: "Bacak açıklık oranı (legOpenRatio)",
      value: tuning.extra.legOpenRatio,
      ...TUNING_BOUNDS.ratio,
      unit: "×",
      note: "Not: bu eşik şu an canlı önizlemeyi etkilemez (computeMetrics import-anı okur); kayıt sonrası geçerlidir.",
    });
  }

  return rows;
}
