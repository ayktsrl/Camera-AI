// Kalibrasyon Modu — gizli/geliştirici ekranı (owner kullanır).
// Erişim: Serbest mod'da "Kalibrasyon" düğmesi VEYA ?calibrate URL param.
//
// Amaç (kuzey yıldızı: takip kusursuzluğu): owner hareketi yaparken HAM değerleri
// canlı görür (rep FSM açısı, faz, her fault kuralının ham ölçümü, güncel rep sayısı)
// ve eşikleri SLIDER ile canlı ayarlar. Değişiklik ANINDA çalışan algılamaya uygulanır
// (deploy yok). Ayarlanan eşikler localStorage'a yazılır → normal antrenmanda da geçerli.
//
// Bu ekran izoledir: normal Serbest/Program akışını bozmaz, kendi kamerasını kullanır.
// Fonksiyon öncelikli — sayılar net, minimal kromu (Space Grotesk, ink/kireç).

import { useCallback, useMemo, useRef, useState } from "react";
import { usePoseTracking } from "../hooks/usePoseTracking";
import { useCalibration } from "../hooks/useCalibration";
import { EXERCISES, getExercise } from "../exercises";
import {
  getTuning,
  getDefaultTuning,
  setOverride,
  clearOverride,
  hasOverride,
  DEFAULT_TUNINGS,
} from "../lib/thresholds";
import { buildTuningRows, setByPath } from "../lib/tuningModel";

// Ham metriği okunur biçime çevir (sayı → 1 ondalık; null → "—").
function fmt(v) {
  if (v == null || Number.isNaN(v)) return "—";
  if (typeof v !== "number") return String(v);
  return v.toFixed(1);
}

// Bir fault kuralının canlı ham ölçümünü çıkar. attemptClose kuralları (depth)
// frame-anı metrik üretmez; bunlar deneme kapanışında değerlendirilir → primaryAngle
// üzerinden "anlık" değer gösterilir (owner dibe inerken min'i görür).
function faultLiveValue(rule, metrics, primaryAngle) {
  const isAttemptClose = (rule.phases ?? []).includes("attemptClose");
  if (isAttemptClose) return primaryAngle; // dip eşiği — anlık faz açısı izlenir
  if (!metrics) return null;
  return metrics[rule.metric] ?? null;
}

export default function CalibrationScreen({ onExit, initialExerciseId = "squat" }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [exerciseId, setExerciseId] = useState(initialExerciseId);
  const exercise = getExercise(exerciseId);

  // Taslak tuning = kayıtlı etkin tuning (varsayılan ⊕ override) ile başlatılır.
  const [draft, setDraft] = useState(() => getTuning(exerciseId));
  const [running, setRunning] = useState(true);
  const [overridden, setOverridden] = useState(() => hasOverride(exerciseId));

  // Hareket değişince taslağı o hareketin etkin tuning'iyle yenile.
  const handleSelectExercise = useCallback((id) => {
    setExerciseId(id);
    setDraft(getTuning(id));
    setOverridden(hasOverride(id));
  }, []);

  const {
    processFrame,
    resetCounts,
    isometric,
    metrics,
    phase,
    primaryMetric,
    primaryAngle,
    repCount,
    heldSeconds,
    phaseLabels,
    faultRules,
  } = useCalibration({ exercise, tuning: draft, running });

  const { status, errorMessage, hasActiveUser } = usePoseTracking({
    videoRef,
    canvasRef,
    onFrame: processFrame,
  });

  const rows = useMemo(() => buildTuningRows(draft), [draft]);

  // Slider değişimi → taslağı güncelle (motor useCalibration içinde ANINDA yeniden kurulur).
  const handleSlider = useCallback((path, value) => {
    setDraft((d) => setByPath(d, path, value));
  }, []);

  // Kaydet: taslakla varsayılan arasındaki FARK'ı override olarak yaz (minimal override).
  const handleSave = useCallback(() => {
    const def = DEFAULT_TUNINGS[exerciseId];
    const diff = diffTuning(def, draft);
    setOverride(exerciseId, diff);
    setOverridden(Boolean(diff && Object.keys(diff).length));
  }, [exerciseId, draft]);

  // Varsayılana sıfırla: override sil + taslağı varsayılana çek.
  const handleReset = useCallback(() => {
    clearOverride(exerciseId);
    setDraft(getDefaultTuning(exerciseId));
    setOverridden(false);
    resetCounts();
  }, [exerciseId, resetCounts]);

  let stageNotice = null;
  if (status === "loading") stageNotice = "Model yükleniyor…";
  else if (status === "error") stageNotice = errorMessage;
  else if (!hasActiveUser) stageNotice = "Kameranın karşısına geç";

  const phaseLabel = phaseLabels[phase] ?? phase;

  return (
    <div className="app app--calibrate">
      <main className="stage stage--mirrored">
        <video ref={videoRef} className="stage-video" />
        <canvas ref={canvasRef} className="stage-canvas" />

        {stageNotice && (
          <div className="stage-notice">
            <span>{stageNotice}</span>
          </div>
        )}

        {/* Canlı ham değer paneli — sahnenin üstüne bindirilmiş */}
        <div className="calib-live" aria-live="polite">
          <div className="calib-live-row calib-live-primary">
            <span className="calib-live-key">{primaryMetric}</span>
            <span className="calib-live-val">{fmt(primaryAngle)}°</span>
          </div>
          <div className="calib-live-row">
            <span className="calib-live-key">Faz</span>
            <span className="calib-live-val">{phaseLabel}</span>
          </div>
          <div className="calib-live-row">
            <span className="calib-live-key">{isometric ? "Süre" : "Tekrar"}</span>
            <span className="calib-live-val calib-live-count">
              {isometric ? `${heldSeconds} sn` : repCount}
            </span>
          </div>
          <div className="calib-live-divider" />
          {faultRules.map((rule) => {
            const v = faultLiveValue(rule, metrics, primaryAngle);
            return (
              <div key={rule.id} className="calib-live-row">
                <span className="calib-live-key">{rule.label}</span>
                <span className="calib-live-val">{fmt(v)}</span>
              </div>
            );
          })}
        </div>
      </main>

      <aside className="panel panel--calibrate">
        <header className="brand">
          <h1>
            Kalibrasyon<span className="brand-dot">.</span>
          </h1>
          <p className="brand-sub">
            Ham değerleri izle, eşiği canlı ayarla — deploy beklemeden.
          </p>
          <nav className="modes">
            <button type="button" className="mode" onClick={onExit}>
              ← Serbest mod
            </button>
          </nav>
        </header>

        <section className="block">
          <label className="block-label" htmlFor="calib-exercise">
            Hareket {overridden && <span className="calib-badge">özelleştirildi</span>}
          </label>
          <select
            id="calib-exercise"
            className="exercise-select"
            value={exerciseId}
            onChange={(e) => handleSelectExercise(e.target.value)}
          >
            {EXERCISES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
        </section>

        <section className="block">
          <div className="calib-controls">
            <button
              type="button"
              className={running ? "btn btn-stop" : "btn btn-start"}
              onClick={() => {
                if (running) setRunning(false);
                else {
                  resetCounts();
                  setRunning(true);
                }
              }}
            >
              {running ? "Sayımı durdur" : "Sayımı başlat"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetCounts}>
              Sayacı sıfırla
            </button>
          </div>
        </section>

        <section className="block calib-sliders">
          <span className="block-label">Eşikler</span>
          {rows.map((row) => (
            <div className="calib-slider" key={row.path}>
              <div className="calib-slider-head">
                <span className="calib-slider-label">{row.label}</span>
                <span className="calib-slider-value">
                  {row.value}
                  {row.unit}
                </span>
              </div>
              <input
                type="range"
                min={row.min}
                max={row.max}
                step={row.step}
                value={row.value}
                onChange={(e) =>
                  handleSlider(row.path, Number(e.target.value))
                }
                aria-label={row.label}
              />
              {row.note && <p className="calib-slider-note">{row.note}</p>}
            </div>
          ))}
        </section>

        <section className="block calib-persist">
          <button type="button" className="btn btn-start" onClick={handleSave}>
            Kaydet (kalıcı)
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleReset}>
            Varsayılana sıfırla
          </button>
          <p className="calib-hint">
            Kaydedilen eşikler normal antrenmanda da geçerli olur (localStorage).
          </p>
        </section>
      </aside>
    </div>
  );
}

// ── Taslak ile varsayılan arasındaki farkı çıkar (minimal override) ───────────
// Yalnız değişen sayısal alanlar yazılır; aynısı atlanır → override sade kalır.
function diffTuning(def, draft) {
  const out = {};
  for (const [key, dv] of Object.entries(draft)) {
    const bv = def?.[key];
    if (dv && typeof dv === "object" && !Array.isArray(dv)) {
      const sub = diffTuning(bv ?? {}, dv);
      if (Object.keys(sub).length) out[key] = sub;
    } else if (dv !== bv) {
      out[key] = dv;
    }
  }
  return out;
}
