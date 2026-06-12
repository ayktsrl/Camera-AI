// Mod yönlendirici — Serbest (tek egzersiz, kamera) ↔ Program (hoca programı player'ı).
// Serbest moddan çıkınca kamera bileşenle birlikte kapanır; Program Modu kamerayı
// sadece pose-takipli setlerde açar.

import { useState } from "react";
import "@fontsource-variable/space-grotesk";
import "./index.css";
import FreeMode from "./views/FreeMode";
import ProgramMode from "./views/ProgramMode";

export default function App() {
  const [mode, setMode] = useState("free");

  return mode === "program" ? (
    <ProgramMode onExit={() => setMode("free")} />
  ) : (
    <FreeMode onOpenProgram={() => setMode("program")} />
  );
}
