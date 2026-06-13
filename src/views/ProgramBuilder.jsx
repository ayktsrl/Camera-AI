// Program Builder — kullanıcı kendi programını kurar: ad + hareketler (set × tekrar) + dinlenme.
// SINIR: motora dokunmaz. Yalnız taslak toplar → kaydetmede buildCustomProgram ile
// şema-geçerli Program üretip parent'a (ProgramMode) verir. Parent localStorage + "Başla".
//
// "push up 10x3" akışı: push-up seç → set 3 / tekrar 10 → Ekle → Kaydet & Başla. Sade.

import { useMemo, useState } from "react";
import {
  TYPE_LABELS,
  searchLibrary,
  getLibraryExercise,
} from "../programs/exerciseLibrary";
import { buildCustomProgram, DEFAULT_REST_SEC } from "../lib/customPrograms";
import ExercisePreview from "../components/ExercisePreview";

const DEFAULT_SETS = 3;
const DEFAULT_REPS = 10;

/**
 * @param {object} props
 * @param {object|null} props.editing  Düzenlenen program (draft taşır) veya null (yeni)
 * @param {(program:object, action:"save"|"start") => void} props.onSave
 * @param {() => void} props.onCancel
 */
export default function ProgramBuilder({ editing = null, onSave, onCancel }) {
  const [name, setName] = useState(() => editing?.draft?.name ?? "");
  const [restSec, setRestSec] = useState(
    () => editing?.draft?.restSec ?? DEFAULT_REST_SEC
  );
  const [items, setItems] = useState(() => editing?.draft?.items ?? []);

  // Seçim paneli: hangi kütüphane hareketi açık (set/tekrar girilecek).
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(null); // libraryId | null
  const [pickSets, setPickSets] = useState(DEFAULT_SETS);
  const [pickReps, setPickReps] = useState(DEFAULT_REPS);

  const results = useMemo(() => searchLibrary(query), [query]);

  function openPicker(libraryId) {
    const lib = getLibraryExercise(libraryId);
    setPicking(libraryId);
    setPickSets(DEFAULT_SETS);
    // Süre bazlı varsayılanlarda tekrar yerine süre alanını sürmüyoruz (sade):
    // reps alanı reps/perSide için; time hareketlerinde varsayılan doz kullanılır.
    setPickReps(
      lib?.defaultDose?.type === "reps"
        ? lib.defaultDose.value
        : lib?.defaultDose?.type === "perSide"
          ? lib.defaultDose.value
          : DEFAULT_REPS
    );
  }

  function confirmPick() {
    if (!picking) return;
    const lib = getLibraryExercise(picking);
    const item = { libraryId: picking, sets: pickSets };
    // Tekrar bazlı hareketlerde girilen tekrarı uygula; süre bazlıda varsayılanı koru.
    if (lib?.defaultDose?.type === "time") {
      item.seconds = lib.defaultDose.seconds;
    } else {
      item.reps = pickReps;
    }
    setItems((prev) => [...prev, item]);
    setPicking(null);
    setQuery("");
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function moveItem(index, dir) {
    setItems((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function build() {
    return buildCustomProgram({
      id: editing?.id, // düzenlemede aynı id → üzerine yazılır
      name,
      restSec,
      items,
    });
  }

  const canSave = items.length > 0;

  return (
    <section className="builder">
      <div className="builder-head">
        <button type="button" className="mode" onClick={onCancel}>
          Geri
        </button>
        <h2 className="program-title builder-title">
          {editing ? "Programı düzenle" : "Program ekle"}
        </h2>
      </div>

      <label className="builder-field">
        <span className="builder-field-label">Program adı</span>
        <input
          className="builder-input"
          type="text"
          value={name}
          placeholder="Programım"
          maxLength={48}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      {/* Eklenen hareketler */}
      {items.length > 0 && (
        <ol className="builder-items">
          {items.map((item, i) => {
            const lib = getLibraryExercise(item.libraryId);
            if (!lib) return null;
            const doseText =
              typeof item.reps === "number"
                ? `${item.sets} × ${item.reps}`
                : typeof item.seconds === "number"
                  ? `${item.sets} × ${item.seconds} sn`
                  : `${item.sets} set`;
            return (
              <li className="builder-item" key={`${item.libraryId}-${i}`}>
                <ExercisePreview exercise={lib} size="sm" />
                <span className="builder-item-body">
                  <span className="builder-item-name">{lib.name}</span>
                  <span className="builder-item-meta">
                    {doseText}
                    {lib.trackable ? (
                      <span className="track-badge track-badge--on">
                        📹 takipli
                      </span>
                    ) : (
                      <span className="track-badge">rehberli</span>
                    )}
                  </span>
                </span>
                <span className="builder-item-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Yukarı taşı"
                    disabled={i === 0}
                    onClick={() => moveItem(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Aşağı taşı"
                    disabled={i === items.length - 1}
                    onClick={() => moveItem(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--del"
                    aria-label="Sil"
                    onClick={() => removeItem(i)}
                  >
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {/* Hareket ekle */}
      {picking ? (
        <div className="builder-picker">
          <p className="builder-picker-name">
            {getLibraryExercise(picking)?.name}
          </p>
          <div className="builder-dose">
            <label className="builder-dose-field">
              <span className="builder-field-label">Set</span>
              <input
                className="builder-input builder-input--num"
                type="number"
                min={1}
                max={20}
                value={pickSets}
                onChange={(e) => setPickSets(Number(e.target.value))}
              />
            </label>
            <span className="builder-dose-x">×</span>
            <label className="builder-dose-field">
              <span className="builder-field-label">
                {getLibraryExercise(picking)?.defaultDose?.type === "time"
                  ? "Süre (sn)"
                  : "Tekrar"}
              </span>
              <input
                className="builder-input builder-input--num"
                type="number"
                min={1}
                max={999}
                value={pickReps}
                disabled={
                  getLibraryExercise(picking)?.defaultDose?.type === "time"
                }
                onChange={(e) => setPickReps(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="builder-picker-actions">
            <button
              type="button"
              className="btn btn-start"
              onClick={confirmPick}
            >
              Listeye ekle
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setPicking(null)}
            >
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <div className="builder-add">
          <input
            className="builder-input builder-search"
            type="search"
            value={query}
            placeholder="Hareket ara (push, squat, plank…)"
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="builder-lib">
            {results.map((lib) => (
              <li key={lib.id}>
                <button
                  type="button"
                  className="builder-lib-row"
                  onClick={() => openPicker(lib.id)}
                >
                  <ExercisePreview exercise={lib} size="strip" />
                  <span className="builder-lib-body">
                    <span className="builder-lib-name">{lib.name}</span>
                    <span className="builder-lib-meta">
                      {TYPE_LABELS[lib.type] || lib.type}
                      {lib.trackable ? (
                        <span className="track-badge track-badge--on">
                          📹 takipli
                        </span>
                      ) : (
                        <span className="track-badge">rehberli</span>
                      )}
                    </span>
                  </span>
                  <span className="builder-lib-plus" aria-hidden="true">
                    +
                  </span>
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="builder-empty">Eşleşen hareket yok.</li>
            )}
          </ul>
        </div>
      )}

      {/* Dinlenme */}
      <label className="builder-field builder-rest">
        <span className="builder-field-label">Set arası dinlenme (sn)</span>
        <input
          className="builder-input builder-input--num"
          type="number"
          min={0}
          max={600}
          value={restSec}
          onChange={(e) => setRestSec(Number(e.target.value))}
        />
      </label>

      {/* Kaydet / Başla */}
      <div className="builder-footer">
        <button
          type="button"
          className="btn btn-stop"
          disabled={!canSave}
          onClick={() => onSave(build(), "save")}
        >
          Kaydet
        </button>
        <button
          type="button"
          className="btn btn-start"
          disabled={!canSave}
          onClick={() => onSave(build(), "start")}
        >
          Kaydet ve başla
        </button>
      </div>
      {!canSave && (
        <p className="builder-hint">En az bir hareket ekle.</p>
      )}
    </section>
  );
}
