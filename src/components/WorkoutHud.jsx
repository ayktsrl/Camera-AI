// Tam-ekran kamera ÜZERİ HUD — saydam overlay kontroller + yandan açılır
// önizleme paneli (drawer). Egzersiz (PoseSetScreen) ve tutuş (PoseHoldScreen)
// ekranları ortak kullanır; SIFIR iş mantığı içerir — yalnız ProgramMode'dan
// gelen hazır callback'leri (duraklat/geç/ses/çıkış) cam-üstü butonlara bağlar
// ve drawer aç/kapa state'ini tutar.
//
// Performans: butonlar/drawer saf CSS + tek useState (drawer). Kamera FPS'ine
// dokunmaz (overlay GPU katmanı; PosePreview crossfade React re-render YOK).
// Drawer VARSAYILAN KAPALI → kamera tam-ekran kalır.

import { useState } from "react";
import { doseLabel } from "../lib/programPlayer";
import PosePreview from "./PosePreview";

export default function WorkoutHud({
  exercise,
  cameraHint,
  paused,
  voiceOn,
  onTogglePause,
  onSkip,
  onToggleVoice,
  onExit,
  lockPhase,
  onRelock,
}) {
  const [drawerOpen, setDrawerOpen] = useState(false); // varsayılan KAPALI

  return (
    <>
      {/* Kullanıcı kilidi göstergesi — kilit durumu görünür; tıkla → yeniden tanıt.
          Sol üst köşe, cam-üstü hafif rozet. lockPhase verilmezse hiç gösterilmez
          (PoseHoldScreen gibi kullanmayan ekranlar etkilenmez). */}
      {lockPhase && onRelock && (
        <button
          type="button"
          className={`lock-indicator lock-indicator--${lockPhase}`}
          onClick={onRelock}
          title="Yeniden tanıt / kilitle"
        >
          <span className="lock-indicator-dot" aria-hidden="true">●</span>
          <span className="lock-indicator-label">
            {lockPhase === "locked"
              ? "Kilitli"
              : lockPhase === "registering"
                ? "Tanıyorum…"
                : "Ekrana gel"}
          </span>
        </button>
      )}

      {/* Cam-üstü kontrol grubu — sağ alt, yarı-saydam, hafif. Görüşü kapatmaz;
          yalnız bu öğe pointer-events alır (HUD bilgi katmanı tıklamayı yutmaz). */}
      <div className="hud-controls" role="group" aria-label="Antrenman kontrolleri">
        {onTogglePause && (
          <button
            type="button"
            className="hud-btn"
            onClick={onTogglePause}
            aria-pressed={paused}
            title={paused ? "Devam et" : "Duraklat"}
          >
            <span className="hud-icon" aria-hidden="true">
              {paused ? "▶" : "❚❚"}
            </span>
            <span className="hud-label">{paused ? "Devam" : "Durdur"}</span>
          </button>
        )}
        {onSkip && (
          <button
            type="button"
            className="hud-btn"
            onClick={onSkip}
            title="Bu hareketi geç"
          >
            <span className="hud-icon" aria-hidden="true">⏭</span>
            <span className="hud-label">Geç</span>
          </button>
        )}
        {onToggleVoice && (
          <button
            type="button"
            className="hud-btn"
            onClick={onToggleVoice}
            aria-pressed={voiceOn}
            title={voiceOn ? "Sesi kapat" : "Sesi aç"}
          >
            <span className="hud-icon" aria-hidden="true">
              {voiceOn ? "🔊" : "🔇"}
            </span>
            <span className="hud-label">{voiceOn ? "Ses" : "Sessiz"}</span>
          </button>
        )}
        {onExit && (
          <button
            type="button"
            className="hud-btn hud-btn--exit"
            onClick={onExit}
            title="Antrenmandan çık"
          >
            <span className="hud-icon" aria-hidden="true">✕</span>
            <span className="hud-label">Çık</span>
          </button>
        )}
      </div>

      {/* Yandan açılır önizleme — sağ kenarda ince tab; tıkla → drawer kayar.
          Scrim'e/tab'e tekrar dokun → kapanır. Kapalıyken kamera tam-ekran. */}
      <button
        type="button"
        className={drawerOpen ? "preview-tab preview-tab--open" : "preview-tab"}
        onClick={() => setDrawerOpen((o) => !o)}
        aria-expanded={drawerOpen}
        aria-controls="preview-drawer"
        title={drawerOpen ? "Önizlemeyi kapat" : "Hareket önizlemesi"}
      >
        <span className="preview-tab-arrow" aria-hidden="true">
          {drawerOpen ? "›" : "‹"}
        </span>
        {!drawerOpen && <span className="preview-tab-label">Önizleme</span>}
      </button>

      {drawerOpen && (
        <div
          className="preview-scrim"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="preview-drawer"
        className={
          drawerOpen ? "preview-drawer preview-drawer--open" : "preview-drawer"
        }
        aria-hidden={!drawerOpen}
      >
        <PosePreview exercise={exercise} size="md" />
        <h2 className="preview-drawer-name">{exercise.name}</h2>
        {exercise.coachNote && (
          <p className="preview-drawer-note">“{exercise.coachNote}”</p>
        )}
        <p className="preview-drawer-dose">{doseLabel(exercise.dose)}</p>
        {cameraHint && (
          <p className="preview-drawer-hint">{cameraHint}</p>
        )}
      </aside>
    </>
  );
}
