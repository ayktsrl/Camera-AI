// Merkezi eşik (tuning) config'i — TÜM hareketlerin ayarlanabilir sayısal eşikleri
// TEK YERDE tanımlanır. Egzersiz dosyaları bu tabloyu okur; motor/kalibrasyon modu
// da buradan besledir. Amaç: "yanlış saydı → eşik düzelt → doğrula" döngüsünü tek
// dosyaya indirgemek (kuzey yıldızı: takip kusursuzluğu).
//
// MEKANİK REFACTOR SÖZLEŞMESİ: bu dosyadaki varsayılan değerler, eski egzersiz
// dosyalarındaki gömülü değerlerle BİREBİR aynıdır. Bu refactor DAVRANIŞI DEĞİŞTİRMEZ;
// sadece değerlerin TANIM YERİNİ merkezileştirir. Değer değişikliği = ayrı bir karar.
//
// Katman modeli:
//   varsayılan (DEFAULT_TUNINGS, bu dosya)
//     ⊕ override (localStorage, kalibrasyon modunda owner'ın ayarladığı)
//     = etkin tuning (getTuning)
// Override yoksa varsayılan birebir döner.
//
// Şema (her hareket için):
//   phases:        { standingMin, bottomMax }   — rep FSM faz eşikleri (derece)
//   attemptBelow:  number                       — derinlik denemesi alt sınırı (derece)
//   phaseConfirmFrames: number                  — faz debounce (frame)
//   faults:        { [ruleId]: { threshold, tolerance? } }  — fault kuralı eşikleri
//   extra:         { ... }                       — harekete özgü ekstra eşikler
//                  (jumpingJack.legOpenRatio, lateralRaise yön çevirmeleri vb.)
//   hold:          { ... }                       — izometrik (plank) tutuş eşikleri
//   calibration:   { stableKneeMin, stableTorsoMax } — squat zemin kalibrasyon kapısı
//
// Egzersiz dosyaları yalnız KENDİ id'lerinin tuning bloğunu okur (getTuning(id) veya
// DEFAULT_TUNINGS[id]). Yeni hareket: buraya bir blok ekle + egzersiz dosyasında oku.

import { readStored, writeStored } from "./storage";

const OVERRIDE_KEY = "formcoach_tuning_overrides_v1";

// ── Varsayılan eşikler (eski egzersiz dosyalarından BİREBİR taşındı) ──────────
export const DEFAULT_TUNINGS = {
  squat: {
    phases: { standingMin: 160, bottomMax: 100 },
    attemptBelow: 140,
    phaseConfirmFrames: 4,
    faults: {
      depth: { threshold: 100, tolerance: 0 },
      valgus: { threshold: 165, tolerance: 3 },
      torso: { threshold: 55, tolerance: 3 },
      heel: { threshold: 2, tolerance: 0.5 },
      asymmetry: { threshold: 14, tolerance: 3 },
    },
    calibration: { stableKneeMin: 160, stableTorsoMax: 15 },
  },

  pushup: {
    phases: { standingMin: 155, bottomMax: 95 },
    attemptBelow: 130,
    phaseConfirmFrames: 4,
    faults: {
      depth: { threshold: 95, tolerance: 0 },
      bodyLine: { threshold: 156, tolerance: 4 },
      neckLine: { threshold: 130, tolerance: 5 },
    },
  },

  lunge: {
    phases: { standingMin: 155, bottomMax: 95 },
    attemptBelow: 130,
    phaseConfirmFrames: 4,
    faults: {
      depth: { threshold: 95, tolerance: 0 },
      kneeOverToe: { threshold: 5, tolerance: 1.5 },
      torso: { threshold: 40, tolerance: 5 },
    },
  },

  jumpingJack: {
    phases: { standingMin: 150, bottomMax: 60 },
    attemptBelow: 110,
    phaseConfirmFrames: 3,
    faults: {
      depth: { threshold: 60, tolerance: 0 },
    },
    // Bacak "açık" eşiği: ayak bileği yatay mesafesi / kalça genişliği bu katı aşarsa açık.
    extra: { legOpenRatio: 1.5 },
  },

  kneeRaise: {
    phases: { standingMin: 155, bottomMax: 100 },
    attemptBelow: 135,
    phaseConfirmFrames: 4,
    faults: {
      depth: { threshold: 100, tolerance: 0 },
    },
  },

  // Glute Bridge — metrik bridgeAngle = 180 - kalça açısı (yön çevirme, jumpingJack tekniği).
  // Yat (kalça açısı ~110–130, bükük diz ile düz gövde) → bridgeAngle ~50–70 → "standing".
  // Köprü (kalça açısı ~165–175, gövde-uyluk düz) → bridgeAngle ~5–15 → "bottom" (efor).
  // Eşikler bridgeAngle uzayında: standingMin yatta erişilmeli, bottomMax tam köprü.
  gluteBridge: {
    phases: { standingMin: 50, bottomMax: 25 },
    attemptBelow: 42,
    phaseConfirmFrames: 4,
    faults: {
      // attemptClose: tepe (en yüksek köprü) = bridgeAngle min; >eşik ise tam köprü değil.
      depth: { threshold: 25, tolerance: 0 },
      // bottom fazında bridgeAngle çok düşük (<eşik) = kalça açısı çok büyük = hiperekstansiyon.
      hyperextension: { threshold: 5, tolerance: 1 },
    },
  },

  // Leg Raise — metrik kalça fleksiyonu (omuz→kalça→ayakbileği), squat yönü (çevirme yok).
  // Bacak yerde (düz) ~160–180 → "standing"; bacak yukarı (dikey) ~90 → "bottom" (efor).
  legRaise: {
    phases: { standingMin: 150, bottomMax: 100 },
    attemptBelow: 135,
    phaseConfirmFrames: 4,
    faults: {
      depth: { threshold: 100, tolerance: 0 },
      // diz açısı <eşik = bacak aşırı bükük (düz tutulmadı).
      kneeBend: { threshold: 150, tolerance: 5 },
    },
  },

  lateralRaise: {
    phases: { standingMin: 150, bottomMax: 100 },
    attemptBelow: 130,
    phaseConfirmFrames: 4,
    faults: {
      tooHigh: { threshold: 100, tolerance: 5 },
      depth: { threshold: 100, tolerance: 0 },
    },
  },

  hammerCurl: {
    phases: { standingMin: 150, bottomMax: 65 },
    attemptBelow: 120,
    phaseConfirmFrames: 4,
    faults: {
      elbowDrift: { threshold: 25, tolerance: 5 },
      depth: { threshold: 65, tolerance: 0 },
    },
  },

  shoulderPress: {
    phases: { standingMin: 90, bottomMax: 30 },
    attemptBelow: 70,
    phaseConfirmFrames: 4,
    faults: {
      elbowFlare: { threshold: 75, tolerance: 5 },
      depth: { threshold: 30, tolerance: 0 },
    },
  },

  plank: {
    // İzometrik — rep faz eşiği yerine hold eşikleri.
    hold: {
      horizontalMinTilt: 62,
      straightEnter: 160,
      straightExit: 152,
      enterFrames: 4,
      breakEndMs: 6000,
    },
    faults: {
      hipSag: { threshold: 156, tolerance: 4 },
      hipPike: { threshold: 160, tolerance: 4 },
    },
  },

  // Mountain Climber — REP, primaryMetric = aktif (daha bükük) bacağın kalça fleksiyonu
  // (kneeRaise yönü, çevirme yok). Bacak geride ~160–175 → "standing"; diz göğüste ~90 → "bottom".
  // phaseConfirmFrames düşük (3) — hızlı tempo. hipPike: plank-hattı pike kuralı (anlık),
  // bodyLinePike uzayında (kalça yukarı + açı <eşik = pike; ters yön → 180, kural susar).
  mountainClimber: {
    phases: { standingMin: 155, bottomMax: 100 },
    attemptBelow: 135,
    phaseConfirmFrames: 3,
    faults: {
      hipPike: { threshold: 156, tolerance: 4 },
    },
  },

  // Hollow Hold — İZOMETRİK (holdEngine, plank deseni). holdEngine değeri = bodyLineAngle =
  // (180 - hamHipAngle): derin kaşık → YÜKSEK değer (gluteBridge yön çevirme tekniği).
  //   düz yatış (ham ~178) → bodyLineAngle ~2; derin hollow (ham ~130) → ~50.
  // horizontalMinTilt = giriş kapısı (kaba "kaşık başladı"); straightEnter = geçerli hold
  // kalitesi; straightExit = histerezis (altına düşünce broken → timer durur).
  hollowHold: {
    hold: {
      horizontalMinTilt: 20, // ham açı ≲160 → belirgin kaşık girişi
      straightEnter: 30, // ham açı ≲150 → geçerli hollow (timer akar)
      straightExit: 22, // ham açı ≳158 → kaşık bozuldu (timer durur)
      enterFrames: 4,
      breakEndMs: 6000,
    },
    faults: {
      // holding fazında bodyLineAngle <eşik = kaşık zayıfladı (omuz/bacak düşüyor).
      backDrop: { threshold: 28, tolerance: 2 },
    },
  },
};

// Slider sınırları + adım — kalibrasyon modu UI bunları okur. Her eşik için makul
// bir bant; davranışı ETKİLEMEZ (yalnız UI clamp/step). [min, max, step].
export const TUNING_BOUNDS = {
  phase: { min: 0, max: 180, step: 1 },
  attemptBelow: { min: 0, max: 180, step: 1 },
  phaseConfirmFrames: { min: 1, max: 12, step: 1 },
  angleFault: { min: 0, max: 180, step: 1 }, // derece bazlı fault eşikleri
  pctFault: { min: 0, max: 30, step: 0.5 }, // % bazlı (heel, kneeOverToe)
  ratio: { min: 1, max: 3, step: 0.05 }, // jumpingJack legOpenRatio
  ms: { min: 1000, max: 15000, step: 250 }, // breakEndMs
  tolerance: { min: 0, max: 20, step: 0.5 },
};

// Hangi fault eşiği % bazlı (bbox-yüzdesi) — UI doğru slider bandını seçsin diye.
const PCT_FAULTS = new Set(["heel", "kneeOverToe"]);

/** Bir fault eşiği için uygun slider bandını döndürür. */
export function boundsForFault(ruleId) {
  return PCT_FAULTS.has(ruleId) ? TUNING_BOUNDS.pctFault : TUNING_BOUNDS.angleFault;
}

// ── Override katmanı (localStorage) ───────────────────────────────────────────

/** Tüm override haritasını okur ({ [exerciseId]: partialTuning }). */
export function readOverrides() {
  return readStored(OVERRIDE_KEY, {}) ?? {};
}

/** Tüm override haritasını yazar. */
function writeOverrides(map) {
  writeStored(OVERRIDE_KEY, map);
}

/**
 * Derin (2 katman) birleştirme — override'taki alanlar varsayılanın üzerine biner.
 * faults alt-nesnesi kural-kural birleşir; eksik kurallar varsayılandan gelir.
 * Saf: girdileri mutasyona uğratmaz.
 */
export function mergeTuning(base, override) {
  if (!override) return deepClone(base);
  const out = deepClone(base);
  for (const [key, val] of Object.entries(override)) {
    if (
      val &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      out[key] &&
      typeof out[key] === "object" &&
      !Array.isArray(out[key])
    ) {
      out[key] = mergeTuning(out[key], val);
    } else {
      out[key] = val && typeof val === "object" ? deepClone(val) : val;
    }
  }
  return out;
}

function deepClone(obj) {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = deepClone(v);
  return out;
}

/**
 * Etkin tuning = varsayılan ⊕ override. Override yoksa varsayılanın birebir kopyası.
 * @param {string} id egzersiz id
 * @returns {object|null} tuning bloğu (kopya — çağıran serbestçe okur)
 */
export function getTuning(id) {
  const base = DEFAULT_TUNINGS[id];
  if (!base) return null;
  const overrides = readOverrides();
  return mergeTuning(base, overrides[id]);
}

/** Varsayılan tuning'in kopyası (override'sız). */
export function getDefaultTuning(id) {
  const base = DEFAULT_TUNINGS[id];
  return base ? deepClone(base) : null;
}

/**
 * Bir hareketin override'ını tamamen ayarlar (kalibrasyon modu kaydeder).
 * Değer null/boş ise o hareketin override'ı silinir (= varsayılana döner).
 */
export function setOverride(id, tuningOverride) {
  const map = readOverrides();
  if (!tuningOverride || Object.keys(tuningOverride).length === 0) {
    delete map[id];
  } else {
    map[id] = tuningOverride;
  }
  writeOverrides(map);
}

/** Bir hareketin override'ını siler (varsayılana sıfırla). */
export function clearOverride(id) {
  const map = readOverrides();
  delete map[id];
  writeOverrides(map);
}

/** Bir hareketin override'ı var mı (UI "özelleştirildi" rozeti için). */
export function hasOverride(id) {
  return Boolean(readOverrides()[id]);
}

// ── Egzersiz nesnesine tuning uygulama ────────────────────────────────────────
//
// Egzersiz dosyaları ZATEN varsayılan tuning'i okuyarak inşa edilir (tanım yeri
// merkezi). Override KATMANI ise çalışma anında uygulanır: motor/kalibrasyon modu
// etkin tuning'i alıp egzersiz nesnesinin üstüne biner. Saf — girdiyi mutasyona
// uğratmaz, yeni (sığ-klon + yamalı) egzersiz döndürür.
//
// Yalnız SAYISAL eşikler yamalanır (phases, attemptBelow, phaseConfirmFrames, fault
// predicate threshold/tolerance, hold). computeMetrics / joints / mesaj gibi mantık
// alanları DEĞİŞMEZ.

/**
 * @param {object} exercise egzersiz tanım nesnesi (EXERCISES'ten)
 * @param {object|null} tuning getTuning(id) çıktısı; null → egzersiz olduğu gibi
 * @returns {object} tuning uygulanmış yeni egzersiz nesnesi
 */
export function applyTuning(exercise, tuning) {
  if (!tuning) return exercise;

  const tuned = { ...exercise };

  // Faz eşikleri (rep FSM) — tracking + geriye-uyum phases ikisi de güncellenir.
  if (tuning.phases) {
    if (exercise.tracking) {
      tuned.tracking = { ...exercise.tracking, phases: { ...tuning.phases } };
    }
    tuned.phases = { ...tuning.phases };
  }
  if (typeof tuning.attemptBelow === "number") {
    if (tuned.tracking) {
      tuned.tracking = { ...tuned.tracking, attemptBelow: tuning.attemptBelow };
    }
    tuned.attemptBelow = tuning.attemptBelow;
  }
  if (typeof tuning.phaseConfirmFrames === "number") {
    tuned.phaseConfirmFrames = tuning.phaseConfirmFrames;
  }

  // İzometrik hold eşikleri (plank).
  if (tuning.hold && exercise.hold) {
    tuned.hold = { ...exercise.hold, ...tuning.hold };
  }

  // Fault kuralı eşikleri — kural-kural predicate threshold/tolerance yaması.
  if (tuning.faults && Array.isArray(exercise.faultRules)) {
    tuned.faultRules = exercise.faultRules.map((rule) => {
      const f = tuning.faults[rule.id];
      if (!f) return rule;
      const predicate = { ...rule.predicate };
      if (typeof f.threshold === "number") predicate.threshold = f.threshold;
      if (typeof f.tolerance === "number") predicate.tolerance = f.tolerance;
      return { ...rule, predicate };
    });
  }

  return tuned;
}

/**
 * id'den etkin tuning'i çözüp egzersiz nesnesine uygular (kestirme).
 * @param {object} exercise
 * @returns {object} override katmanlı egzersiz
 */
export function resolveTunedExercise(exercise) {
  if (!exercise?.id) return exercise;
  return applyTuning(exercise, getTuning(exercise.id));
}
