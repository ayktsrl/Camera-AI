// Mod yönlendirici — Serbest (tek egzersiz, kamera) ↔ Program (hoca programı player'ı).
// Serbest moddan çıkınca kamera bileşenle birlikte kapanır; Program Modu kamerayı
// sadece pose-takipli setlerde açar.

import { useState } from "react";
import "@fontsource-variable/space-grotesk";
import "./index.css";
import FreeMode from "./views/FreeMode";
import ProgramMode from "./views/ProgramMode";
import CalibrationScreen from "./components/CalibrationScreen";

// ?calibrate URL param → kalibrasyon modunda aç (keşfedilebilir, basit).
function initialMode() {
  if (typeof window === "undefined") return "free";
  return new URLSearchParams(window.location.search).has("calibrate")
    ? "calibrate"
    : "free";
}

export default function App() {
  const [mode, setMode] = useState(initialMode);

  if (mode === "calibrate") {
    return <CalibrationScreen onExit={() => setMode("free")} />;
  }

  return mode === "program" ? (
    <ProgramMode onExit={() => setMode("free")} />
  ) : (
    <FreeMode
      onOpenProgram={() => setMode("program")}
      onOpenCalibration={() => setMode("calibrate")}
    />
  );
}
