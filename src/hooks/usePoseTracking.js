// Webcam + MediaPipe PoseLandmarker pipeline'ı.
// Self-hosted wasm + model (public/mediapipe/wasm, public/models) — offline çalışır.

import { useEffect, useRef, useState } from "react";
import * as mpVision from "../lib/vision_bundle.mjs";
import {
  isPointReliable,
  countReliablePoints,
  getBBoxFromLandmarks,
} from "../lib/pose";
import {
  createTrackerState,
  updateTracks,
  selectActiveTrack,
} from "../lib/tracking";
import { createLandmarkSetFilter } from "../lib/oneEuro";
import { drawPose, drawBoundingBox } from "../lib/drawing";

export const STAGE_WIDTH = 960;
export const STAGE_HEIGHT = 540;

const MIN_RELIABLE_POINTS = 8;

/**
 * Kamerayı açar, pose tespiti + çoklu kişi takibi + aktif kullanıcı kilidi
 * çalıştırır, iskeleti canvas'a çizer.
 *
 * @param {object} params
 * @param {React.RefObject} params.videoRef
 * @param {React.RefObject} params.canvasRef
 * @param {(frame: {activeTrack, tracks, timestamp}) => void} params.onFrame
 *   Her frame'de çağrılır (aktif kullanıcı yoksa activeTrack null).
 */
export function usePoseTracking({ videoRef, canvasRef, onFrame, facingMode = "user" }) {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState("");
  const [personCount, setPersonCount] = useState(0);
  const [hasActiveUser, setHasActiveUser] = useState(false);

  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  useEffect(() => {
    let isMounted = true;
    let landmarker = null;
    let stream = null;
    let animationFrame = null;
    const trackerState = createTrackerState();
    // Track başına One Euro filtre seti — 2D (çizim + topuk screen-y) ve
    // 3D world (açı metrikleri) ayrı kanallar. Track düşünce silinir (reset).
    const trackFilters = new Map();
    let lastActiveState = null;
    let lastCount = -1;

    function getTrackFilters(trackId) {
      let filters = trackFilters.get(trackId);
      if (!filters) {
        filters = {
          screen: createLandmarkSetFilter(),
          world: createLandmarkSetFilter(),
        };
        trackFilters.set(trackId, filters);
      }
      return filters;
    }

    function processFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || !landmarker || video.readyState < 2) return;

      const ctx = canvas.getContext("2d");
      canvas.width = STAGE_WIDTH;
      canvas.height = STAGE_HEIGHT;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const timestamp = performance.now();
      const result = landmarker.detectForVideo(video, timestamp);
      const allLandmarks = result.landmarks ?? [];
      const allWorldLandmarks = result.worldLandmarks ?? [];

      const detections = allLandmarks
        .map((landmarks, poseIndex) => {
          if (countReliablePoints(landmarks) < MIN_RELIABLE_POINTS) return null;

          const bbox = getBBoxFromLandmarks(landmarks, isPointReliable);
          if (!bbox) return null;

          return {
            landmarks,
            worldLandmarks: allWorldLandmarks[poseIndex] ?? null,
            centerNorm: {
              x: (bbox.minX + bbox.maxX) / 2,
              y: (bbox.minY + bbox.maxY) / 2,
            },
            bbox,
          };
        })
        .filter(Boolean);

      const tracks = updateTracks(trackerState, detections);

      // One Euro filtre — bu frame'de yeni örnek alan track'lere uygulanır;
      // kaybolan track'lerin filtre state'i silinir (geri dönüşte sıçrama yok).
      const timeSec = timestamp / 1000;
      const liveIds = new Set();
      for (const track of tracks) {
        liveIds.add(track.id);
        if (track.missingFrames > 0) continue; // yeni örnek yok — filtreleme yapma

        const filters = getTrackFilters(track.id);
        track.landmarks = filters.screen.apply(track.landmarks, timeSec);
        track.worldLandmarks = filters.world.apply(track.worldLandmarks, timeSec);
      }
      for (const id of trackFilters.keys()) {
        if (!liveIds.has(id)) trackFilters.delete(id);
      }

      const confirmedTracks = tracks.filter((t) => t.isConfirmed);
      const activeTrack = selectActiveTrack(trackerState);

      drawPose(
        ctx,
        confirmedTracks,
        canvas.width,
        canvas.height,
        activeTrack?.id ?? null
      );
      if (activeTrack) {
        drawBoundingBox(ctx, activeTrack, canvas.width, canvas.height, true);
      }

      if (confirmedTracks.length !== lastCount) {
        lastCount = confirmedTracks.length;
        setPersonCount(lastCount);
      }

      const activeNow = Boolean(activeTrack);
      if (activeNow !== lastActiveState) {
        lastActiveState = activeNow;
        setHasActiveUser(activeNow);
      }

      onFrameRef.current?.({ activeTrack, tracks: confirmedTracks, timestamp });
    }

    function loop() {
      if (!isMounted) return;
      try {
        processFrame();
      } catch (err) {
        console.error("FormCoach frame error:", err);
      }
      animationFrame = requestAnimationFrame(loop);
    }

    async function init() {
      try {
        const base = import.meta.env.BASE_URL;

        const fileset = await mpVision.FilesetResolver.forVisionTasks(
          `${base}mediapipe/wasm`
        );

        landmarker = await mpVision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: `${base}models/pose_landmarker_lite.task`,
          },
          runningMode: "VIDEO",
          numPoses: 4,
        });

        if (!isMounted) return;

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            // Ön (user) / arka (environment) kamera — owner uzaktan kullanımda
            // arka kamera + ses ile ekranı görmeden çalışabilir. Sadece kaynak
            // seçimi; landmark/motor mantığı ham koordinatla çalışır (etkilenmez).
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const video = videoRef.current;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();

        if (!isMounted) return;

        setStatus("ready");
        loop();
      } catch (error) {
        console.error("FormCoach init error:", error);
        if (!isMounted) return;
        setStatus("error");
        setErrorMessage(
          error?.name === "NotAllowedError"
            ? "Kamera izni verilmedi. Tarayıcı ayarlarından kameraya izin verin."
            : error?.message || "Bilinmeyen hata"
        );
      }
    }

    init();

    return () => {
      isMounted = false;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      landmarker?.close?.();
    };
  }, [videoRef, canvasRef, facingMode]);

  return { status, errorMessage, personCount, hasActiveUser };
}
