// Program Modu — owner'ın hoca programı: gün seçimi → workout player → gün özeti.
// Akış mantığı saf src/lib/programPlayer.js'te; bu görünüm sadece state'i sürer.

import { useEffect, useState } from "react";
import { ownerProgram } from "../programs/default-program";
import {
  createWorkoutSession,
  isPoseTracked,
  countDayExercises,
  estimateDayMinutes,
} from "../lib/programPlayer";
import { createCoach } from "../lib/speech";
import { readStored, writeStored } from "../lib/storage";
import { EXERCISES } from "../exercises";
import GuidedSetScreen from "../components/GuidedSetScreen";
import PoseSetScreen from "../components/PoseSetScreen";
import RestScreen from "../components/RestScreen";
import DaySummary from "../components/DaySummary";
import ExercisePreview from "../components/ExercisePreview";
import AnnounceScreen from "../components/AnnounceScreen";
import CountdownScreen from "../components/CountdownScreen";

// Gün satırı için "ne yapacağım" önizleme şeridi: bloklardaki hareketleri
// (aynı id tekrarını eleyerek) düzleştirir. Saf görsel — akışa dokunmaz.
// (Dedup artık id'ye bakar; videoUrl UI'dan koparıldı — owner: "link falan koyma".)
const PREVIEW_STRIP_MAX = 6;
function dayPreviewExercises(day) {
  const seen = new Set();
  const out = [];
  for (const block of day.blocks) {
    for (const ex of block.exercises) {
      if (seen.has(ex.id)) continue;
      seen.add(ex.id);
      out.push(ex);
    }
  }
  return out;
}

const STORAGE_KEYS = {
  voice: "formcoach_voice_v1",
  repVoice: "formcoach_rep_voice_v1", // tekrar sayımı sesi (varsayılan açık)
  history: "formcoach_program_history_v1", // { [dayId]: ISO tarih } — son tamamlanma
};

/** En uzun süredir yapılmamış gün — ince "sırada" imi için (zorlamasız öneri). */
function pickNextDayId(days) {
  const history = readStored(STORAGE_KEYS.history, {});
  const never = days.find((d) => !history[d.id]);
  if (never) return never.id;
  return days.reduce((oldest, d) =>
    history[d.id] < history[oldest.id] ? d : oldest
  ).id;
}

export default function ProgramMode({ onExit }) {
  // Tek koç örneği — useState lazy init render'da güvenlidir.
  const [coach] = useState(() => createCoach({ lang: "tr-TR" }));

  const [voiceOn, setVoiceOn] = useState(() =>
    readStored(STORAGE_KEYS.voice, true)
  );
  useEffect(() => {
    coach.setEnabled(voiceOn);
    writeStored(STORAGE_KEYS.voice, voiceOn);
  }, [coach, voiceOn]);

  // Tekrar sayımı sesi — owner kararı 1: varsayılan AÇIK, ayardan kapatılabilir.
  const [repVoiceOn, setRepVoiceOn] = useState(() =>
    readStored(STORAGE_KEYS.repVoice, true)
  );
  useEffect(() => {
    writeStored(STORAGE_KEYS.repVoice, repVoiceOn);
  }, [repVoiceOn]);

  // session: mutable akış motoru (stabil nesne); playerState: render snapshot'ı.
  const [session, setSession] = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const [paused, setPaused] = useState(false);
  const [nextDayId] = useState(() => pickNextDayId(ownerProgram.days));

  function startDay(dayId) {
    // Hands-free: tüm seans dokunmasız akar (ANNOUNCE → COUNTDOWN → … → DONE).
    const next = createWorkoutSession(ownerProgram, dayId, { handsFree: true });
    setSession(next);
    setPlayerState(next.getState());
    setPaused(false);
  }

  function exitToDays() {
    if (coach.isSupported) coach.setEnabled(voiceOn); // kuyruğu temizle
    setSession(null);
    setPlayerState(null);
    setPaused(false);
  }

  function handleCompleteSet(result) {
    setPlayerState(session.completeSet(result));
  }

  function handleFinishRest() {
    setPlayerState(session.finishRest());
  }

  // Hands-free ön durum ilerletici (ANNOUNCE → COUNTDOWN → EXERCISE).
  function handleAdvancePhase() {
    setPlayerState(session.advancePhase());
  }

  function togglePause() {
    setPaused((p) => {
      const next = !p;
      // Duraklatınca konuşmayı sustur; devam edince ses ayarını geri ver.
      if (next) coach.setEnabled(false);
      else coach.setEnabled(voiceOn);
      return next;
    });
  }

  // Bir sonraki harekete atla — aktif seti atlanmış olarak loglar, akış sürer.
  function skipSlot() {
    if (!session || playerState?.status === "done") return;
    setPaused(false);
    coach.setEnabled(voiceOn);
    // announce/countdown'da set henüz başlamadı → completeSet exercise dışında
    // no-op olur; bu yüzden önce exercise'e ilerlet, sonra atlanmış logla.
    let s = session.getState();
    while (s.status === "announce" || s.status === "countdown") {
      s = session.advancePhase();
    }
    if (s.status === "exercise") {
      setPlayerState(session.completeSet({ reps: null, skipped: true }));
    } else if (s.status === "rest") {
      setPlayerState(session.finishRest());
    } else {
      setPlayerState(s);
    }
  }

  // Gün tamamlandığında geçmişe işle (gün seçimi "sırada" imi için).
  const doneDayId = playerState?.status === "done" ? playerState.day.id : null;
  useEffect(() => {
    if (!doneDayId) return;
    const history = readStored(STORAGE_KEYS.history, {});
    history[doneDayId] = new Date().toISOString();
    writeStored(STORAGE_KEYS.history, history);
  }, [doneDayId]);

  let content;
  if (!playerState) {
    content = (
      <section className="day-select">
        <p className="program-kicker">{ownerProgram.name}</p>
        <h2 className="program-title">Günü seç</h2>
        <p className="program-note">
          Günler esnek. Hoca: her harekette negatif 2–3 saniye.
        </p>
        <ul className="day-list">
          {ownerProgram.days.map((day) => (
            <li key={day.id}>
              <button
                type="button"
                className="day-row"
                onClick={() => startDay(day.id)}
              >
                <span className="day-row-head">
                  <span className="day-row-label">{day.label}</span>
                  <span className="day-row-meta">
                    {day.suggestedDay} · {countDayExercises(day)} hareket · ~
                    {estimateDayMinutes(day)} dk
                  </span>
                  {day.id === nextDayId && (
                    <span className="day-next">sırada</span>
                  )}
                </span>
                <span className="day-preview-strip" aria-hidden="true">
                  {dayPreviewExercises(day)
                    .slice(0, PREVIEW_STRIP_MAX)
                    .map((ex) => (
                      <ExercisePreview
                        key={ex.id}
                        exercise={ex}
                        size="strip"
                      />
                    ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="program-general">
          Kardiyo: antrenman günü {ownerProgram.generalRules.cardio.trainingDayMin}{" "}
          dk / diğer günler {ownerProgram.generalRules.cardio.restDayMin} dk,{" "}
          {ownerProgram.generalRules.cardio.hrBpm[0]}–
          {ownerProgram.generalRules.cardio.hrBpm[1]} bpm · Plank: haftada{" "}
          {ownerProgram.generalRules.plank.perWeek} gün, kardiyo sonrası{" "}
          {ownerProgram.generalRules.plank.sets} set max
        </p>
      </section>
    );
  } else if (playerState.status === "done") {
    content = (
      <DaySummary
        summary={session.getDaySummary()}
        onFinish={exitToDays}
      />
    );
  } else if (playerState.status === "rest") {
    content = (
      <RestScreen
        key={`rest-${playerState.slotIndex}`}
        rest={playerState.rest}
        nextSlot={playerState.nextSlot}
        coach={coach}
        paused={paused}
        onDone={handleFinishRest}
      />
    );
  } else if (playerState.status === "announce") {
    content = (
      <AnnounceScreen
        key={`announce-${playerState.slotIndex}`}
        slot={playerState.slot}
        coach={coach}
        paused={paused}
        onDone={handleAdvancePhase}
      />
    );
  } else if (playerState.status === "countdown") {
    content = (
      <CountdownScreen
        key={`countdown-${playerState.slotIndex}`}
        slot={playerState.slot}
        coach={coach}
        paused={paused}
        onDone={handleAdvancePhase}
      />
    );
  } else {
    const slot = playerState.slot;
    const poseReady =
      isPoseTracked(slot.exercise) &&
      EXERCISES.some((e) => e.id === slot.exercise.ruleSetRef);
    content = poseReady ? (
      <PoseSetScreen
        key={`set-${playerState.slotIndex}`}
        slot={slot}
        coach={coach}
        onComplete={handleCompleteSet}
        repVoice={repVoiceOn}
        paused={paused}
        handsFree={playerState.handsFree}
      />
    ) : (
      <GuidedSetScreen
        key={`set-${playerState.slotIndex}`}
        slot={slot}
        onComplete={handleCompleteSet}
        paused={paused}
        handsFree={playerState.handsFree}
      />
    );
  }

  const inWorkout = playerState != null && playerState.status !== "done";

  return (
    <div className="program">
      <header className="program-top">
        <h1 className="program-brand">
          FormCoach<span className="brand-dot">.</span>
        </h1>
        <nav className="modes" aria-label="Mod seçimi">
          <button type="button" className="mode" onClick={onExit}>
            Serbest
          </button>
          <span className="mode mode-active">Program</span>
        </nav>
        <div className="program-top-actions">
          {inWorkout && (
            <button type="button" className="mode" onClick={exitToDays}>
              Günü bırak
            </button>
          )}
          <button
            type="button"
            className="mode"
            onClick={() => setRepVoiceOn((v) => !v)}
            aria-pressed={repVoiceOn}
            title="Tekrar sayımını sesli oku"
          >
            {repVoiceOn ? "Sayım açık" : "Sayım kapalı"}
          </button>
          <button
            type="button"
            className="mode"
            onClick={() => setVoiceOn((v) => !v)}
            aria-pressed={voiceOn}
          >
            {voiceOn ? "Ses açık" : "Ses kapalı"}
          </button>
        </div>
      </header>
      {inWorkout && (
        <p className="program-progress">
          {playerState.day.label} · {playerState.completedSets}/
          {playerState.slotCount} set
        </p>
      )}
      {content}

      {/* Tek kalıcı kontrol — akışı yalnız bu böler (tam-ekran tap YOK). */}
      {inWorkout && (
        <div className="handsfree-control">
          {paused ? (
            <div className="handsfree-paused">
              <button
                type="button"
                className="btn btn-start handsfree-resume"
                onClick={togglePause}
              >
                Devam et
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={skipSlot}
              >
                Atla
              </button>
              <button
                type="button"
                className="btn btn-stop"
                onClick={exitToDays}
              >
                Bitir
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-stop handsfree-pause"
              onClick={togglePause}
            >
              Duraklat
            </button>
          )}
        </div>
      )}
    </div>
  );
}
