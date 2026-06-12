// Fault-rule motoru — bildirimsel kural şemasını kural-bilinçsiz tek döngüyle işler.
// Saf, React'siz; repEngine her frame'de step() çağırır.
//
// Kural şeması (exercise.faultRules[] elemanı):
// {
//   id: "valgus",                 // benzersiz
//   label: "Diz valgus",          // set özeti etiketi
//   metric: "kneeValgusFPPA",     // computeMetrics çıktısındaki alan adı
//   space: "world3d",             // world3d | screen2d (dokümantasyon)
//   joints: [LM.LEFT_HIP, ...],   // visibility susturma için kontrol edilen eklemler
//   phases: ["descent", ...],     // hangi fazlarda aktif ("attemptClose" = özel: frame döngüsü dışı)
//   predicate: { op: "lt"|"gt", threshold, tolerance },
//     // histerezis: ihlal eşik±tolerans dışında BAŞLAR, karşı tarafta TEMİZLENİR
//     // → eşikte titreyen değer uyarı yağdırmaz
//   minFrames: 5,                 // ardışık ihlal frame'i (confirm)
//   cooldownMs: 4000,             // aynı uyarının tekrar aralığı
//   severity: "critical"|"major"|"minor",
//   minVisibility: 0.6,           // joints ort. visibility alt sınırı (susturma)
//   cameraHint: "front45"|"side"|"any",
//   message, speech
// }
//
// Susturma sözleşmesi (yanlış uyarı > kaçan uyarı, ama sessiz PASS de yok):
// - visibility < minVisibility VEYA metrik null → frame DEĞERLENDİRİLMEZ,
//   confirm sayacı sıfırlanmaz, DONDURULUR.
// - Set boyunca aktif frame'lerin > %50'si susturulmuşsa özet "değerlendirilemedi" der.

const DEFAULT_MIN_VISIBILITY = 0.6;
const DEFAULT_COOLDOWN_MS = 4000;

export const CAMERA_HINT_LABELS = {
  front45: "kamerayı 45° öne al",
  side: "kamerayı yana al",
  any: "kamera açısını değiştir",
};

function avgVisibility(landmarks, joints) {
  if (!landmarks || !joints?.length) return 0;
  let sum = 0;
  for (const idx of joints) {
    const p = landmarks[idx];
    if (!p) return 0;
    sum += p.visibility ?? 1;
  }
  return sum / joints.length;
}

function checkHysteresis(rule, value, wasViolating) {
  const { op, threshold, tolerance = 0 } = rule.predicate;
  if (op === "lt") {
    if (wasViolating) return value < threshold + tolerance; // temizlenme üst bantta
    return value < threshold - tolerance; // ihlal alt bantta başlar
  }
  if (op === "gt") {
    if (wasViolating) return value > threshold - tolerance;
    return value > threshold + tolerance;
  }
  return false;
}

/**
 * @param {Array} rules exercise.faultRules (frame-bazlı olanlar işlenir;
 *   phases "attemptClose" içerenler bu döngüde atlanır — repEngine ele alır)
 */
export function createFaultRuleEngine(rules = []) {
  const frameRules = rules.filter(
    (r) => !(r.phases || []).includes("attemptClose")
  );

  let ruleState = null;

  function freshRuleState() {
    const map = new Map();
    for (const rule of frameRules) {
      map.set(rule.id, {
        badFrames: 0,
        violating: false,
        lastFiredAt: -Infinity,
        evaluatedFrames: 0,
        mutedFrames: 0,
        fires: 0,
      });
    }
    return map;
  }

  ruleState = freshRuleState();

  /**
   * Her frame'de çağrılır.
   * @param {object} frame { metrics, landmarks, phase, timestamp }
   * @returns {Array} events: { type:"fault", rule, severity, message, speech }
   */
  function step({ metrics, landmarks, phase, timestamp }) {
    const events = [];
    if (!metrics) return events;

    for (const rule of frameRules) {
      const rs = ruleState.get(rule.id);

      // Faz dışı: ihlal durumu temizlenir (susturma DEĞİL — sayılmaz).
      if (!(rule.phases || []).includes(phase)) {
        rs.badFrames = 0;
        rs.violating = false;
        continue;
      }

      // Susturma: düşük visibility veya hesaplanamayan metrik → sayaç donar.
      const visibility = avgVisibility(landmarks, rule.joints);
      const value = metrics[rule.metric];
      const minVis = rule.minVisibility ?? DEFAULT_MIN_VISIBILITY;

      if (visibility < minVis || value == null) {
        rs.mutedFrames += 1;
        continue;
      }

      rs.evaluatedFrames += 1;
      rs.violating = checkHysteresis(rule, value, rs.violating);

      if (!rs.violating) {
        rs.badFrames = 0;
        continue;
      }

      rs.badFrames += 1;
      const cooldown = rule.cooldownMs ?? DEFAULT_COOLDOWN_MS;

      if (
        rs.badFrames >= (rule.minFrames ?? 1) &&
        timestamp - rs.lastFiredAt >= cooldown
      ) {
        rs.lastFiredAt = timestamp;
        rs.fires += 1;
        events.push({
          type: "fault",
          rule: rule.id,
          severity: rule.severity ?? "major",
          message: rule.message,
          speech: rule.speech ?? rule.message,
        });
      }
    }

    return events;
  }

  /**
   * Set özeti — kural başına ihlal sayısı + "değerlendirilemedi" durumu.
   * @returns {Array<{id, label, severity, cameraHint, fires, unevaluated}>}
   */
  function getSummary() {
    return frameRules.map((rule) => {
      const rs = ruleState.get(rule.id);
      const active = rs.evaluatedFrames + rs.mutedFrames;
      return {
        id: rule.id,
        label: rule.label ?? rule.id,
        severity: rule.severity ?? "major",
        cameraHint: rule.cameraHint ?? "any",
        fires: rs.fires,
        unevaluated: active > 0 && rs.mutedFrames / active > 0.5,
      };
    });
  }

  /** Geçici sayaçları temizler (idle reset) — set toplamları korunur. */
  function clearTransient() {
    for (const rs of ruleState.values()) {
      rs.badFrames = 0;
      rs.violating = false;
    }
  }

  /** Yeni set: her şey sıfırlanır. */
  function reset() {
    ruleState = freshRuleState();
  }

  return { step, getSummary, clearTransient, reset };
}
