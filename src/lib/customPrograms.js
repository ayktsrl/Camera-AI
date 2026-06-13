// Özel Programlar — kullanıcının kendi kurduğu programların üretimi + localStorage kalıcılığı.
//
// SINIR: programPlayer/pose/faultRules motoruna DOKUNULMAZ. Bu modül yalnız VERİ üretir:
// kütüphane seçimlerini, mevcut createWorkoutSession'ın AYNEN tükettiği Program şemasına
// (src/programs/SCHEMA.md) çevirir. Trackable hareketler (squat/push-up) pose modunda
// otomatik sayılır — çünkü üretilen exercise objesi {trackable, ruleSetRef, trackingPhase}
// alanlarını kütüphaneden birebir taşır ve isPoseTracked aynı kuralı uygular.

import { readStored, writeStored } from "./storage";
import { getLibraryExercise } from "../programs/exerciseLibrary";

export const CUSTOM_PROGRAMS_KEY = "formcoach_custom_programs";

export const DEFAULT_REST_SEC = 60;
const DEFAULT_PROGRAM_NAME = "Programım";

/**
 * Builder taslağı → şema-geçerli Program.
 * Özel program tek "gün" (day1) içerir; her seçili hareket kendi "straight" bloğudur
 * (set × tekrar). Bu, createWorkoutSession'ın buildSlots'unun aynen açtığı yapıdır:
 * her set bir slot, set arası dinlenme restSec[0].
 *
 * @param {object} draft
 * @param {string} [draft.name]
 * @param {number} [draft.restSec]  set arası dinlenme (sn), varsayılan 60
 * @param {Array<{libraryId:string, sets:number, reps?:number, seconds?:number}>} draft.items
 * @returns {object} Program (SCHEMA.md uyumlu)
 */
export function buildCustomProgram(draft) {
  const restSec = clampRest(draft?.restSec);
  const name = (draft?.name || "").trim() || DEFAULT_PROGRAM_NAME;
  const items = Array.isArray(draft?.items) ? draft.items : [];

  const usedIds = new Map(); // libraryId → kaç kez kullanıldı (id benzersizliği)
  const exercises = items
    .map((item) => toExercise(item, usedIds, restSec))
    .filter(Boolean);

  return {
    id: draft?.id || makeProgramId(),
    name,
    source: "custom",
    version: 1,
    custom: true,
    restSec,
    // Builder taslağını saklarız → düzenlemede geri yüklenir (motor bu alanı okumaz).
    draft: { name, restSec, items },
    generalRules: {
      cardio: null,
      plank: null,
      defaultRestSec: [restSec, restSec],
      negativeTempoSec: [2, 3],
      daysFlexible: true,
    },
    days: [
      {
        id: "day1",
        label: name,
        suggestedDay: null,
        blocks: [
          {
            type: "straight",
            label: "Antrenman",
            exercises,
          },
        ],
      },
    ],
  };
}

/** Tek builder kalemini şema-geçerli Exercise'e çevirir. */
function toExercise(item, usedIds, restSec) {
  const lib = getLibraryExercise(item?.libraryId);
  if (!lib) return null;

  const sets = clampSets(item.sets);
  const dose = buildDose(lib, item);

  // Gün içinde benzersiz id (aynı hareket iki kez eklenebilir → sonek).
  const n = (usedIds.get(lib.id) || 0) + 1;
  usedIds.set(lib.id, n);
  const id = n === 1 ? lib.id : `${lib.id}-${n}`;

  return {
    id,
    name: lib.name,
    coachNote: lib.coachNote ?? null,
    // videoUrl: owner programındaki UI link okumuyor; özel programda da dış link YOK.
    // Şema videoUrl bekler ama player/UI bunu kullanmaz → boş bırakmıyoruz, alan yok.
    embeddable: false,
    sets,
    dose,
    restSec: [restSec, restSec],
    // Pose alanları kütüphaneden BİREBİR → isPoseTracked aynen değerlendirir.
    trackable: lib.trackable,
    trackingPhase: lib.trackingPhase,
    ruleSetRef: lib.ruleSetRef,
    untrackableReason: lib.trackable ? null : lib.untrackableReason,
  };
}

/** Doz: reps girilmişse reps; aksi halde kütüphane varsayılanı (time/perSide korunur). */
function buildDose(lib, item) {
  if (typeof item.reps === "number" && item.reps > 0) {
    return { type: "reps", value: Math.round(item.reps) };
  }
  if (typeof item.seconds === "number" && item.seconds > 0) {
    return { type: "time", seconds: Math.round(item.seconds) };
  }
  return { ...lib.defaultDose };
}

function clampSets(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 20);
}

function clampRest(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_REST_SEC;
  return Math.min(Math.max(n, 0), 600);
}

function makeProgramId() {
  return `custom-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

// ─────────── localStorage CRUD ───────────

/** Tüm özel programları döner (dizi). Bozuk kayıt → boş dizi. */
export function loadCustomPrograms() {
  const list = readStored(CUSTOM_PROGRAMS_KEY, []);
  return Array.isArray(list) ? list : [];
}

/**
 * Programı kaydeder (id eşleşirse günceller, yoksa ekler) → güncel listeyi döner.
 * Round-trip: buildCustomProgram çıktısı verilir, aynısı geri okunur.
 */
export function saveCustomProgram(program) {
  if (!program?.id) return loadCustomPrograms();
  const list = loadCustomPrograms();
  const idx = list.findIndex((p) => p.id === program.id);
  if (idx >= 0) list[idx] = program;
  else list.push(program);
  writeStored(CUSTOM_PROGRAMS_KEY, list);
  return list;
}

/** id ile siler → güncel listeyi döner. */
export function deleteCustomProgram(id) {
  const list = loadCustomPrograms().filter((p) => p.id !== id);
  writeStored(CUSTOM_PROGRAMS_KEY, list);
  return list;
}
