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

const STORAGE_KEYS = {
  voice: "formcoach_voice_v1",
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

  // session: mutable akış motoru (stabil nesne); playerState: render snapshot'ı.
  const [session, setSession] = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const [nextDayId] = useState(() => pickNextDayId(ownerProgram.days));

  function startDay(dayId) {
    const next = createWorkoutSession(ownerProgram, dayId);
    setSession(next);
    setPlayerState(next.getState());
  }

  function exitToDays() {
    setSession(null);
    setPlayerState(null);
  }

  function handleCompleteSet(result) {
    setPlayerState(session.completeSet(result));
  }

  function handleFinishRest() {
    setPlayerState(session.finishRest());
  }

  // Hoca notu — her set başında BİR kez sesli (cooldown'suz announce; slot
  // değişimi anahtardır, aynı set içinde tekrarlanmaz).
  const announceKey =
    playerState?.status === "exercise" ? playerState.slotIndex : null;
  const announceText =
    playerState?.status === "exercise" && playerState.slot
      ? playerState.slot.exercise.coachNote
        ? `${playerState.slot.exercise.name}. ${playerState.slot.exercise.coachNote}`
        : playerState.slot.exercise.name
      : null;
  useEffect(() => {
    if (announceKey == null || !announceText) return;
    coach.announce(announceText);
  }, [coach, announceKey, announceText]);

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
                <span className="day-row-label">{day.label}</span>
                <span className="day-row-meta">
                  {day.suggestedDay} · {countDayExercises(day)} hareket · ~
                  {estimateDayMinutes(day)} dk
                </span>
                {day.id === nextDayId && (
                  <span className="day-next">sırada</span>
                )}
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
        onDone={handleFinishRest}
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
      />
    ) : (
      <GuidedSetScreen
        key={`set-${playerState.slotIndex}`}
        slot={slot}
        onComplete={handleCompleteSet}
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
    </div>
  );
}
