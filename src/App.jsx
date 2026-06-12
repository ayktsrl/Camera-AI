import { useRef } from "react";
import "./index.css";
import { usePoseTracking } from "./hooks/usePoseTracking";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const { status, errorMessage, personCount } = usePoseTracking({
    videoRef,
    canvasRef,
  });

  return (
    <div className="page">
      <div className="panel">
        <h1>FormCoach</h1>
        <p className="subtitle">
          Pose çekirdeği — durum: {status}
          {status === "error" ? ` (${errorMessage})` : ""} — kişi: {personCount}
        </p>
        <div className="videoWrap">
          <video ref={videoRef} className="video" />
          <canvas ref={canvasRef} className="canvas" />
        </div>
      </div>
    </div>
  );
}
