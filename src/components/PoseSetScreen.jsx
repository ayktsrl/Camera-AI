// Pose-takipli set ekranı — squat slotları: kamera açılır, mevcut motor
// (Precision kuralları + rep FSM) otomatik sayar, hedefe ulaşınca set biter.
// Elle bitirme her zaman mümkün. Bileşen unmount olunca kamera kapanır.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePoseTracking } from "../hooks/usePoseTracking";
import { useRepCounter } from "../hooks/useRepCounter";
import { getExercise } from "../exercises";
import {
  doseLabel,
  doseTargetReps,
  doseTargetSeconds,
  slotPositionLabel,
} from "../lib/programPlayer";
import { createActivityGate } from "../lib/activityGate";
import {
  repMilestone,
  setDoneReps,
  setDoneTimed,
  warningSayOptions,
} from "../lib/coachLines";
import ExercisePreview from "./ExercisePreview";

// >45 sn yokluk → TEK nazik sesli hatırlatma (owner kararı). Sonra sessiz.
const ABSENCE_REMINDER_MS = 45000;

export default function PoseSetScreen({
  slot,
  coach,
  onComplete,
  repVoice = true,
  paused = false,
  handsFree = false,
  facingMode = "user",
}) {
  const { exercise, block } = slot;
  const exerciseDef = getExercise(exercise.ruleSetRef);
  const target = doseTargetReps(exercise.dose);
  // Süre-dozlu pose hareketi (örn. Jumping Jack 45 sn): hedef rep YOK → geri sayımla
  // biter. KÖK NEDEN düzeltmesi: bu yol olmadan time-dozlu pose seti hiç bitmiyordu
  // → hands-free akış (rest/sonraki hareket) hiç görünmüyordu.
  const targetSeconds = target == null ? doseTargetSeconds(exercise.dose) : null;
  const cameraHint = exerciseDef.cameraHint ?? "Kamera: 45° çapraz, ~2 m";

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Süre-dozlu TAKİPLİ harekette aktivite kapısı devrededir (örn. Jumping Jack).
  // Rep-dozlu setlerde (target != null) hiç kullanılmaz — onlar zaten yalnız
  // gerçek rep sayar. (target == null && targetSeconds != null) → activity-gated.
  const activityGated = targetSeconds != null;

  const [running, setRunning] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(targetSeconds);
  // Süre-dozlu sette HAREKET algılanıyor mu (görünür durum + süre akışı kapısı).
  const [movementActive, setMovementActive] = useState(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);

  // Akıllı duraklama: kullanıcı kareden çıkınca sayım sessizce durur (motor
  // zaten frame=null'da ilerlemez); >45 sn yoklukta TEK nazik ses.
  const absenceSinceRef = useRef(null);
  const reminderFiredRef = useRef(false);

  // Aktivite kapısı — rep/faz event'lerinden "hareket var mı" sinyali (plank
  // holdEngine smart-pause felsefesi). Yalnız süre-dozlu takipli harekette anlamlı.
  const activityGateRef = useRef(null);
  if (activityGateRef.current === null) {
    activityGateRef.current = createActivityGate();
  }

  // Tekrar sayımı sesi ayardan kapatılabilir (varsayılan açık) — owner kararı 1.
  const repVoiceRef = useRef(repVoice);
  useEffect(() => {
    repVoiceRef.current = repVoice;
  }, [repVoice]);

  const handleCoachEvent = useCallback(
    (event) => {
      // Aktivite kapısını HER anlamlı hareket event'iyle besle (rep + faz geçişi).
      // Süre-dozlu sette bu sinyal geri sayımı sürer; rep-dozlu sette zararsız.
      if (activityGateRef.current.isActivityEvent(event)) {
        activityGateRef.current.noteActivity(performance.now());
      }
      if (event.type === "rep") {
        if (repVoiceRef.current) coach.sayCount(event.count);
        // Kalan-tekrar kilometre taşı — eyes-free için KRİTİK (sayım kapalı olsa da
        // söylenir). Salonda her tekrarı saymak yerine hedefe yaklaşınca kalanı vurgular.
        const milestone = repMilestone(event.count, target);
        if (milestone) {
          coach.say(milestone.speech, { key: milestone.key, cooldownMs: 1500 });
        }
      } else if (event.type === "warning") {
        // Kritik form hatası (bel/diz güvenliği) öne çıkar; major/minor mevcut desende.
        coach.say(event.speech, warningSayOptions(event));
      }
    },
    [coach, target]
  );

  const {
    processFrame,
    reset,
    finishSet,
    repCount,
    faultyCount,
    warning,
    warningSeverity,
    setSummary,
    repFlash,
  } = useRepCounter({
    exercise: exerciseDef,
    // Pause veya akıllı-duraklama → motor beslenmez (sayım sessizce donar).
    running: running && !paused,
    onEvent: handleCoachEvent,
  });

  const { status, errorMessage, hasActiveUser } = usePoseTracking({
    videoRef,
    canvasRef,
    onFrame: processFrame,
    facingMode,
  });

  // Kamera hazır olunca set otomatik başlar.
  useEffect(() => {
    if (status !== "ready" || startedRef.current) return;
    startedRef.current = true;
    reset();
    activityGateRef.current.reset();
    setMovementActive(false);
    setRunning(true);
  }, [status, reset]);

  // Akıllı duraklama: kullanıcı kareden çıkınca süreyi izle; 45 sn'de TEK ses.
  useEffect(() => {
    if (paused || status !== "ready") return;
    if (hasActiveUser) {
      absenceSinceRef.current = null;
      reminderFiredRef.current = false;
      return undefined;
    }
    // Kullanıcı yok — sayaç başlat, 45 sn'de tek hatırlatma.
    if (absenceSinceRef.current == null) absenceSinceRef.current = Date.now();
    const timer = setInterval(() => {
      if (reminderFiredRef.current || absenceSinceRef.current == null) return;
      if (Date.now() - absenceSinceRef.current >= ABSENCE_REMINDER_MS) {
        reminderFiredRef.current = true;
        coach.announce("Hazır olduğunda devam edelim", { interrupt: true });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [hasActiveUser, paused, status, coach]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setRunning(false);
    // Set bitti — eyes-free KRİTİK geçiş, asla sessiz kalmaz. Rep/süreyi de söyle.
    const line = target != null ? setDoneReps(repCount) : setDoneTimed();
    coach.announce(line, { interrupt: true });
    finishSet();
    setFinishing(true);
  }, [finishSet, coach, target, repCount]);

  // Hedefe ulaşınca set otomatik biter (rep-dozlu).
  useEffect(() => {
    if (!running || target == null) return;
    if (repCount >= target) finish();
  }, [repCount, running, target, finish]);

  // Süre-dozlu (örn. Jumping Jack 45 sn): ACTIVITY-GATED geri sayım. Süre YALNIZ
  // hareket aktif algılandıkça akar — kişi karede olsa da hareketsizse DONAR
  // (kör kronometre değil; plank holdEngine smart-pause felsefesi). Aktivite
  // kapısı rep + faz geçişlerinden beslenir (handleCoachEvent → noteActivity).
  //
  // Poll loop (250 ms): her tikte gerçek geçen aktif zamanı biriktirir → tam
  // saniye dolduğunda secondsLeft -1. Görünür durumu (movementActive) ve uzun
  // hareketsizlikte TEK ölçülü sesli hatırlatmayı da bu loop sürer.
  useEffect(() => {
    if (!running || !activityGated) return undefined;
    // Pause iken loop hiç çalışmaz → süre donar. Görünür rozet zaten paused'da
    // gizli (showActivityState !paused gerektirir), ayrıca setState gerekmez.
    if (paused) return undefined;

    const gate = activityGateRef.current;
    let lastTick = performance.now();
    let activeMsAccum = 0; // birikmiş aktif zaman (ms) — tam saniyede secondsLeft düşer

    const id = setInterval(() => {
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;

      // Kişi karede mi (varlık) VE hareket ediyor mu (aktivite)? İkisi de gerekli.
      const active = hasActiveUser && gate.isActive(now);
      setMovementActive(active);

      if (active) {
        if (dt > 0 && dt < 2000) activeMsAccum += dt; // sıçrama emniyeti (holdEngine ile aynı)
        if (activeMsAccum >= 1000) {
          const whole = Math.floor(activeMsAccum / 1000);
          activeMsAccum -= whole * 1000;
          setSecondsLeft((s) => (s == null ? s : Math.max(0, s - whole)));
        }
      } else {
        // Duraklamada birikimi sıfırlama gerekmez; akış zaten durdu. Uzun
        // hareketsizlikte ölçülü tek hatırlatma (cooldown gate içinde).
        if (gate.shouldPrompt(now)) {
          coach.announce("Hareketi göremiyorum, devam et", { interrupt: true });
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, activityGated, paused, hasActiveUser, coach]);

  // Süre dolunca set otomatik biter → repEngine özeti teslim → REST → sonraki ANNOUNCE.
  useEffect(() => {
    if (!running || targetSeconds == null || secondsLeft == null) return;
    if (secondsLeft <= 0) finish();
  }, [secondsLeft, running, targetSeconds, finish]);

  // finishSet sonrası özet state'e düşünce sonucu teslim et.
  useEffect(() => {
    if (!finishing || setSummary == null) return;
    onComplete({
      reps: setSummary.repCount,
      summary: {
        repCount: setSummary.repCount,
        faultyCount: setSummary.faultyCount,
        rules: setSummary.rules,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishing, setSummary]);

  let stageNotice = null;
  if (status === "loading") {
    stageNotice = "Model yükleniyor…";
  } else if (status === "error") {
    stageNotice = errorMessage;
  } else if (paused) {
    stageNotice = "Duraklatıldı";
  } else if (running && !hasActiveUser && !activityGated) {
    // Akıllı duraklama — sessiz nötr im (owner: "demeden bekle").
    // Süre-dozlu sette yokluk da activity-gated rozetle gösterilir (aşağıda).
    stageNotice = "Bekleniyor…";
  }

  // Süre-dozlu sette GÖRÜNÜR aktivite durumu (owner güveni için kritik):
  // hareket algılanıyorsa süre akıyor; algılanmıyorsa BÜYÜK net "duraklatıldı".
  const showActivityState = running && activityGated && !paused && status === "ready";

  return (
    <section className="player player--pose">
      <div
        className={
          facingMode === "user"
            ? "stage player-stage stage--mirrored"
            : "stage player-stage"
        }
      >
        <video ref={videoRef} className="stage-video" />
        <canvas ref={canvasRef} className="stage-canvas" />

        {/* UZAKTAN OKUNUR: aktif hareket adı sahne üst şeridinde. */}
        {running && (
          <p className="stage-exercise-name" aria-hidden="true">
            {exercise.name}
          </p>
        )}

        {stageNotice && (
          <div className="stage-notice">
            <span>{stageNotice}</span>
          </div>
        )}

        {warning && running && (
          <div
            className={
              warningSeverity === "critical"
                ? "stage-warning stage-warning--critical"
                : "stage-warning"
            }
            role="alert"
          >
            {warning}
          </div>
        )}

        {running && (
          <div className="stage-count" key={repFlash} aria-label="Tekrar sayısı">
            {repCount}
            {/* UZAKTAN OKUNUR: hedefle birlikte — ne kadar kaldığı okunur. */}
            {target != null && (
              <span className="stage-count-target">/ {target}</span>
            )}
          </div>
        )}

        {/* Süre-dozlu pose seti: büyük geri sayım rozeti. ACTIVE iken accent
            (akıyor), duraklamada soluk (donmuş) — plank hold timer ile aynı dil. */}
        {running && targetSeconds != null && secondsLeft != null && (
          <div
            className={
              showActivityState && !movementActive
                ? "stage-count stage-count--time stage-count--time-paused"
                : "stage-count stage-count--time"
            }
            aria-label="Kalan aktif süre"
          >
            {Math.max(0, secondsLeft)}
            <span className="stage-count-unit">sn</span>
          </div>
        )}

        {/* GÖRÜNÜR aktivite durumu — owner uygulamanın GERÇEKTEN algıladığını GÖRSÜN. */}
        {showActivityState && (
          <div
            className={
              movementActive
                ? "activity-state activity-state--active"
                : "activity-state activity-state--paused"
            }
            role="status"
            aria-live="polite"
          >
            {movementActive ? "✓ ALGILANIYOR" : "⏸ DURAKLATILDI — HAREKET YOK"}
          </div>
        )}
      </div>

      <div className="player-pose-panel">
        <p className="player-position">
          {block.label} · {slotPositionLabel(slot)}
        </p>
        <div className="player-exercise-head">
          {/* Kamera ana sahne — önizleme küçük (sm) kalır, kamerayı ezmez. */}
          <ExercisePreview exercise={exercise} size="sm" />
          <h2 className="player-exercise">{exercise.name}</h2>
        </div>
        {exercise.coachNote && (
          <p className="coach-note">“{exercise.coachNote}”</p>
        )}
        <p className="player-dose">
          {doseLabel(exercise.dose)}
          {target != null && ` · hedefte set otomatik biter`}
          {targetSeconds != null && ` · süre dolunca set otomatik biter`}
        </p>

        <div className="player-links">
          <span className="meta-hint">{cameraHint}</span>
        </div>

        {/* Hands-free'de akışı tek Duraklat butonu (ProgramMode) yönetir;
            manuel "Seti bitir" yalnız klasik (handsFree=false) modda. */}
        {!handsFree && (
          <button
            type="button"
            className="btn btn-stop set-done"
            onClick={finish}
            disabled={status === "loading"}
          >
            Seti bitir{repCount > 0 && faultyCount > 0 ? ` (${faultyCount} hatalı)` : ""}
          </button>
        )}
      </div>
    </section>
  );
}
