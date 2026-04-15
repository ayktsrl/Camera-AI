import { useEffect, useRef, useState } from "react";
import "./index.css";
import { loadYoloModel, detectPeople } from "./YoloDetector";

const CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 32],
];

const DEFAULT_MIN_VISIBILITY = 0.55;
const DEFAULT_MIN_PRESENCE = 0.55;
const HANDLE_RADIUS = 10;
const WATCH_ZONE_ID = "frontWatch";

const COUNT_HISTORY_SIZE = 12;
const MANNING_CONFIRM_FRAMES = 10;

// Tracking tuning
const TRACK_MATCH_DISTANCE = 0.12; // normalized distance
const TRACK_MAX_MISSING_FRAMES = 18;
const TRACK_CONFIRM_FRAMES = 3;

const DEFAULT_ZONES = [
  {
    id: "chartTable",
    label: "Chart Table Zone",
    color: "#ffaa00",
    points: [
      { x: 0.23, y: 0.45 },
      { x: 0.5, y: 0.45 },
      { x: 0.5, y: 0.74 },
      { x: 0.26, y: 0.78 },
    ],
  },
  {
    id: "frontWatch",
    label: "Front Watch Zone",
    color: "#00ff88",
    points: [
      { x: 0.63, y: 0.1 },
      { x: 0.88, y: 0.1 },
      { x: 0.88, y: 0.22 },
      { x: 0.63, y: 0.22 },
    ],
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cloneZones(zones) {
  return zones.map((zone) => ({
    ...zone,
    points: zone.points.map((p) => ({ ...p })),
  }));
}

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 0.0000001) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = clamp(
    ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy),
    0,
    1
  );

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.hypot(px - projX, py - projY);
}

function buttonStyle(bg) {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: bg,
    color: "#fff",
    cursor: "pointer",
  };
}

function formatClock(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDurationMs(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function pushRollingValue(ref, value, maxSize = COUNT_HISTORY_SIZE) {
  ref.current.push(value);
  if (ref.current.length > maxSize) {
    ref.current.shift();
  }
}

function getModeValue(values, fallback = 0) {
  if (!values.length) return fallback;

  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  let bestValue = fallback;
  let bestCount = -1;

  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    } else if (count === bestCount && value > bestValue) {
      bestValue = value;
    }
  }

  return bestValue;
}

function getManningStatus(mode, actualCount) {
  const requiredCount = mode === "NIGHT" ? 2 : 1;

  if (actualCount >= requiredCount) {
    return mode === "NIGHT"
      ? "WATCH_MANNING_OK_NIGHT"
      : "WATCH_MANNING_OK_DAY";
  }

  return mode === "NIGHT"
    ? "WATCH_MANNING_INSUFFICIENT_NIGHT"
    : "WATCH_MANNING_INSUFFICIENT_DAY";
}

function getBBoxFromLandmarks(landmarks, isPointReliable) {
  const xs = [];
  const ys = [];

  landmarks.forEach((p) => {
    if (!isPointReliable(p)) return;
    xs.push(p.x);
    ys.push(p.y);
  });

  if (!xs.length || !ys.length) return null;

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    area:
      (Math.max(...xs) - Math.min(...xs)) *
      (Math.max(...ys) - Math.min(...ys)),
  };
}

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previousTorsoSizeRef = useRef(null);
  const poseRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const frameIndexRef = useRef(0);

  const interactionRef = useRef({
    draggingPoint: false,
    draggingZone: false,
    zoneId: null,
    pointIndex: null,
    lastMouseNorm: null,
  });

  const trackedPersonsRef = useRef([]);
  const nextTrackIdRef = useRef(1);

  const rawPeopleHistoryRef = useRef([]);
  const rawWatchHistoryRef = useRef([]);
  const watchModeRef = useRef("DAY");

  const manningStateRef = useRef({
    candidateStatus: null,
    candidateFrames: 0,
    confirmedStatus: null,
    confirmedStartedAt: null,
    confirmedRequired: 0,
    confirmedActual: 0,
    confirmedMode: "DAY",
  });

  const [status, setStatus] = useState("Loading...");
  const [personText, setPersonText] = useState("No detection");
  const [qualityText, setQualityText] = useState("Unknown");
  const [visiblePointsText, setVisiblePointsText] = useState("0");
  const [personCountText, setPersonCountText] = useState("0");
  const [zoneText, setZoneText] = useState("Outside defined zones");
  const [distanceText, setDistanceText] = useState("Stable distance");
  const [postureText, setPostureText] = useState("Upright posture");

  const [watchMode, setWatchMode] = useState("DAY");
  const [rawWatchZoneCountText, setRawWatchZoneCountText] = useState("0");
  const [stableWatchZoneCountText, setStableWatchZoneCountText] = useState("0");
  const [rawPeopleCountText, setRawPeopleCountText] = useState("0");
  const [stablePeopleCountText, setStablePeopleCountText] = useState("0");
  const [requiredWatchCountText, setRequiredWatchCountText] = useState("1");
  const [manningCandidateText, setManningCandidateText] = useState("UNKNOWN");
  const [manningConfirmedText, setManningConfirmedText] = useState("UNKNOWN");
  const [manningLogs, setManningLogs] = useState([]);
  const [yoloCountText, setYoloCountText] = useState("0");

  const [showVideo, setShowVideo] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showBoundingBox, setShowBoundingBox] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showCenterPoint, setShowCenterPoint] = useState(true);
  const [depthMode, setDepthMode] = useState(true);
  const [mirrorView, setMirrorView] = useState(true);

  const [minVisibility, setMinVisibility] = useState(DEFAULT_MIN_VISIBILITY);
  const [minPresence, setMinPresence] = useState(DEFAULT_MIN_PRESENCE);

  const [zones, setZones] = useState(cloneZones(DEFAULT_ZONES));
  const [selectedZoneId, setSelectedZoneId] = useState(DEFAULT_ZONES[0].id);
  const [selectedPointIndex, setSelectedPointIndex] = useState(null);
  const [addPointMode, setAddPointMode] = useState(false);

  const zonesRef = useRef(zones);
  const settingsRef = useRef({
    showSkeleton,
    showBoundingBox,
    showZones,
    showCenterPoint,
    depthMode,
    minVisibility,
    minPresence,
  });
  const selectedZoneIdRef = useRef(selectedZoneId);
  const selectedPointIndexRef = useRef(selectedPointIndex);

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  useEffect(() => {
    settingsRef.current = {
      showSkeleton,
      showBoundingBox,
      showZones,
      showCenterPoint,
      depthMode,
      minVisibility,
      minPresence,
    };
  }, [
    showSkeleton,
    showBoundingBox,
    showZones,
    showCenterPoint,
    depthMode,
    minVisibility,
    minPresence,
  ]);



  useEffect(() => {
    selectedZoneIdRef.current = selectedZoneId;
  }, [selectedZoneId]);

  useEffect(() => {
    selectedPointIndexRef.current = selectedPointIndex;
  }, [selectedPointIndex]);

  useEffect(() => {
    watchModeRef.current = watchMode;
  }, [watchMode]);

  useEffect(() => {
    let isMounted = true;

    async function waitForVision(maxWaitMs = 10000) {
      const start = Date.now();

      while (!window.vision) {
        if (Date.now() - start > maxWaitMs) {
          throw new Error("window.vision not loaded");
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return window.vision;
    }

    function isPointReliable(point) {
      if (!point) return false;

      const visibilityOk =
        (point.visibility ?? 1) >= settingsRef.current.minVisibility;
      const presenceOk =
        (point.presence ?? 1) >= settingsRef.current.minPresence;

      return visibilityOk && presenceOk;
    }

    function countReliablePoints(landmarks) {
      if (!landmarks) return 0;
      return landmarks.filter((p) => isPointReliable(p)).length;
    }

    function depthRadius(point) {
      if (!settingsRef.current.depthMode) return 5;
      const z = point.z ?? 0;
      const radius = 6 + -z * 18;
      return Math.max(3, Math.min(12, radius));
    }

    function depthAlpha(point) {
      if (!settingsRef.current.depthMode) return 1;
      const z = point.z ?? 0;
      const alpha = 0.7 + -z * 0.8;
      return Math.max(0.35, Math.min(1, alpha));
    }

    function drawPose(ctx, tracks, width, height) {
      if (!settingsRef.current.showSkeleton) return;
      if (!tracks.length) return;

      tracks.forEach((track, index) => {
        const landmarks = track.landmarks;
        const hue = (index * 110) % 360;

        for (const [start, end] of CONNECTIONS) {
          const a = landmarks[start];
          const b = landmarks[end];

          if (!isPointReliable(a) || !isPointReliable(b)) continue;

          const avgAlpha = (depthAlpha(a) + depthAlpha(b)) / 2;
          const lineWidth = settingsRef.current.depthMode
            ? (depthRadius(a) + depthRadius(b)) / 4
            : 3;

          ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${avgAlpha})`;
          ctx.lineWidth = lineWidth;
          ctx.beginPath();
          ctx.moveTo(a.x * width, a.y * height);
          ctx.lineTo(b.x * width, b.y * height);
          ctx.stroke();
        }

        landmarks.forEach((point) => {
          if (!isPointReliable(point)) return;

          const x = point.x * width;
          const y = point.y * height;
          const radius = depthRadius(point);
          const alpha = depthAlpha(point);

          ctx.fillStyle = `hsla(${hue}, 100%, 65%, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    }

    function drawBoundingBox(ctx, tracks, width, height) {
      if (!settingsRef.current.showBoundingBox) return;

      tracks.forEach((track, index) => {
        if (!track.bbox) return;

        const padding = 20;
        const hue = (index * 110) % 360;

        const minX = track.bbox.minX * width;
        const maxX = track.bbox.maxX * width;
        const minY = track.bbox.minY * height;
        const maxY = track.bbox.maxY * height;

        ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
        ctx.lineWidth = 3;
        ctx.strokeRect(
          minX - padding,
          minY - padding,
          maxX - minX + padding * 2,
          maxY - minY + padding * 2
        );

        ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
        ctx.font = "bold 15px Arial";
        ctx.fillText(`P${track.id}`, minX, Math.max(18, minY - 10));
      });
    }

    function drawYoloBoxes(ctx, detections, width, height) {
      if (!detections.length) return;
    
      ctx.save();
      ctx.strokeStyle = "#00ff00";
      ctx.fillStyle = "#00ff00";
      ctx.lineWidth = 2;
      ctx.font = "bold 14px Arial";
    
      detections.forEach((det, index) => {
        const videoW = videoRef.current.videoWidth;
        const videoH = videoRef.current.videoHeight;
        
        // normalize → gerçek video boyutuna çevir
        let x = det.x * videoW;
        let y = det.y * videoH;
        let w = det.w * videoW;
        let h = det.h * videoH;
        
        // mirror fix
        if (mirrorView) {
          x = videoW - x - w;
        }
        
        // canvas scale
        const scaleX = width / videoW;
        const scaleY = height / videoH;
        
        x *= scaleX;
        y *= scaleY;
        w *= scaleX;
        h *= scaleY;
    
        ctx.strokeRect(x, y, w, h);
        ctx.fillText(
          `Y${index + 1} ${(det.score * 100).toFixed(0)}%`,
          x,
          Math.max(16, y - 6)
        );
      });
    
      ctx.restore();
    }

    function drawZones(ctx, width, height) {
      if (!settingsRef.current.showZones) return;

      zonesRef.current.forEach((zone) => {
        if (!zone.points.length) return;

        const currentSelectedZoneId = selectedZoneIdRef.current;
        const currentSelectedPointIndex = selectedPointIndexRef.current;

        ctx.strokeStyle = zone.color;
        ctx.lineWidth = zone.id === currentSelectedZoneId ? 3 : 2;
        ctx.fillStyle =
          zone.id === currentSelectedZoneId ? zone.color + "22" : zone.color + "11";

        ctx.beginPath();
        ctx.moveTo(zone.points[0].x * width, zone.points[0].y * height);

        for (let i = 1; i < zone.points.length; i++) {
          ctx.lineTo(zone.points[i].x * width, zone.points[i].y * height);
        }

        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = zone.color;
        ctx.font = "16px Arial";
        ctx.fillText(
          zone.label,
          zone.points[0].x * width + 8,
          zone.points[0].y * height - 8
        );

        zone.points.forEach((point, index) => {
          const px = point.x * width;
          const py = point.y * height;

          ctx.beginPath();
          ctx.fillStyle =
            zone.id === currentSelectedZoneId && index === currentSelectedPointIndex
              ? "#ffffff"
              : zone.color;
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.strokeStyle = "#001b44";
          ctx.lineWidth = 2;
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.stroke();
        });
      });
    }

    function getPersonCenter(landmarks, width, height) {
      const reliable = landmarks.filter((p) => isPointReliable(p));
      if (reliable.length === 0) return null;

      const xs = reliable.map((p) => p.x * width);
      const ys = reliable.map((p) => p.y * height);

      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
    }

    function getZoneFromCenter(center, width, height) {
      if (!center) return "Outside defined zones";

      const pointNorm = {
        x: center.x / width,
        y: center.y / height,
      };

      for (const zone of zonesRef.current) {
        if (pointInPolygon(pointNorm, zone.points)) {
          return zone.label;
        }
      }

      return "Outside defined zones";
    }

    function isCenterInsideZone(center, zoneId, width, height) {
      if (!center) return false;

      const zone = zonesRef.current.find((z) => z.id === zoneId);
      if (!zone) return false;

      return pointInPolygon(
        { x: center.x / width, y: center.y / height },
        zone.points
      );
    }

    function getTorsoSize(landmarks, width, height) {
      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];
      const leftHip = landmarks[23];
      const rightHip = landmarks[24];

      if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;
      if (
        !isPointReliable(leftShoulder) ||
        !isPointReliable(rightShoulder) ||
        !isPointReliable(leftHip) ||
        !isPointReliable(rightHip)
      ) {
        return null;
      }

      const shoulderWidth = Math.abs((rightShoulder.x - leftShoulder.x) * width);
      const torsoHeight = Math.abs(
        (((leftHip.y + rightHip.y) / 2) -
          ((leftShoulder.y + rightShoulder.y) / 2)) *
          height
      );

      return {
        shoulderWidth,
        torsoHeight,
        area: shoulderWidth * torsoHeight,
      };
    }

    function getPostureStatus(landmarks) {
      const nose = landmarks[0];
      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];
      const leftHip = landmarks[23];
      const rightHip = landmarks[24];

      if (!nose || !leftShoulder || !rightShoulder || !leftHip || !rightHip) {
        return "Unknown posture";
      }

      if (
        !isPointReliable(nose) ||
        !isPointReliable(leftShoulder) ||
        !isPointReliable(rightShoulder) ||
        !isPointReliable(leftHip) ||
        !isPointReliable(rightHip)
      ) {
        return "Unknown posture";
      }

      const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
      const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;
      const hipCenterY = (leftHip.y + rightHip.y) / 2;

      const torsoHeight = hipCenterY - shoulderCenterY;
      if (torsoHeight <= 0) return "Unknown posture";

      const horizontalHeadOffset = Math.abs(nose.x - shoulderCenterX);
      const headDown = nose.y > shoulderCenterY - 0.1;

      if (horizontalHeadOffset > 0.08) {
        return "Body/Head turned";
      }

      if (headDown) {
        return "Leaning forward";
      }

      return "Upright posture";
    }

    function updateManningState(rawActualCount, stableActualCount) {
      const now = new Date();
      const mode = watchModeRef.current;
      const requiredCount = mode === "NIGHT" ? 2 : 1;

      setRawWatchZoneCountText(String(rawActualCount));
      setStableWatchZoneCountText(String(stableActualCount));
      setRequiredWatchCountText(String(requiredCount));

      const candidateStatus = getManningStatus(mode, stableActualCount);
      setManningCandidateText(candidateStatus);

      const current = manningStateRef.current;

      if (current.confirmedStatus === null) {
        manningStateRef.current = {
          candidateStatus,
          candidateFrames: MANNING_CONFIRM_FRAMES,
          confirmedStatus: candidateStatus,
          confirmedStartedAt: now,
          confirmedRequired: requiredCount,
          confirmedActual: stableActualCount,
          confirmedMode: mode,
        };
        setManningConfirmedText(candidateStatus);
        return;
      }

      if (
        current.candidateStatus === candidateStatus &&
        current.confirmedActual === stableActualCount &&
        current.confirmedMode === mode
      ) {
        if (current.confirmedStatus === candidateStatus) {
          setManningConfirmedText(current.confirmedStatus);
          return;
        }
      }

      if (current.confirmedStatus === candidateStatus) {
        manningStateRef.current = {
          ...current,
          candidateStatus,
          candidateFrames: 0,
          confirmedRequired: requiredCount,
          confirmedActual: stableActualCount,
          confirmedMode: mode,
        };
        setManningConfirmedText(candidateStatus);
        return;
      }

      if (current.candidateStatus !== candidateStatus) {
        manningStateRef.current = {
          ...current,
          candidateStatus,
          candidateFrames: 1,
        };
        setManningConfirmedText(current.confirmedStatus);
        return;
      }

      const nextFrames = current.candidateFrames + 1;

      if (nextFrames < MANNING_CONFIRM_FRAMES) {
        manningStateRef.current = {
          ...current,
          candidateFrames: nextFrames,
        };
        setManningConfirmedText(current.confirmedStatus);
        return;
      }

      const closedLog = {
        id: `${current.confirmedStartedAt?.getTime?.() || Date.now()}_${Math.random()}`,
        start: formatClock(current.confirmedStartedAt),
        end: formatClock(now),
        duration: formatDurationMs(now - current.confirmedStartedAt),
        mode: current.confirmedMode,
        required: current.confirmedRequired,
        actual: current.confirmedActual,
        status: current.confirmedStatus,
      };

      setManningLogs((prev) => [closedLog, ...prev].slice(0, 30));

      manningStateRef.current = {
        candidateStatus,
        candidateFrames: 0,
        confirmedStatus: candidateStatus,
        confirmedStartedAt: now,
        confirmedRequired: requiredCount,
        confirmedActual: stableActualCount,
        confirmedMode: mode,
      };

      setManningConfirmedText(candidateStatus);
    }

    function updateTracks(detections) {
      const frameIndex = frameIndexRef.current;
      const tracks = trackedPersonsRef.current.map((track) => ({
        ...track,
      }));
      const unmatchedTrackIndexes = new Set(tracks.map((_, index) => index));
      const unmatchedDetectionIndexes = new Set(
        detections.map((_, index) => index)
      );

      const candidatePairs = [];

      tracks.forEach((track, trackIndex) => {
        detections.forEach((det, detIndex) => {
          const dx = track.centerNorm.x - det.centerNorm.x;
          const dy = track.centerNorm.y - det.centerNorm.y;
          const dist = Math.hypot(dx, dy);

          if (dist <= TRACK_MATCH_DISTANCE) {
            candidatePairs.push({ trackIndex, detIndex, dist });
          }
        });
      });

      candidatePairs.sort((a, b) => a.dist - b.dist);

      candidatePairs.forEach(({ trackIndex, detIndex }) => {
        if (
          !unmatchedTrackIndexes.has(trackIndex) ||
          !unmatchedDetectionIndexes.has(detIndex)
        ) {
          return;
        }

        const track = tracks[trackIndex];
        const det = detections[detIndex];

        track.landmarks = det.landmarks;
        track.centerNorm = det.centerNorm;
        track.bbox = det.bbox;
        track.lastSeenFrame = frameIndex;
        track.missingFrames = 0;
        track.seenFrames += 1;
        track.isConfirmed = track.seenFrames >= TRACK_CONFIRM_FRAMES;

        unmatchedTrackIndexes.delete(trackIndex);
        unmatchedDetectionIndexes.delete(detIndex);
      });

      unmatchedDetectionIndexes.forEach((detIndex) => {
        const det = detections[detIndex];

        tracks.push({
          id: nextTrackIdRef.current++,
          landmarks: det.landmarks,
          centerNorm: det.centerNorm,
          bbox: det.bbox,
          lastSeenFrame: frameIndex,
          missingFrames: 0,
          seenFrames: 1,
          isConfirmed: false,
        });
      });

      unmatchedTrackIndexes.forEach((trackIndex) => {
        const track = tracks[trackIndex];
        track.missingFrames += 1;
      });

      const filtered = tracks.filter(
        (track) => track.missingFrames <= TRACK_MAX_MISSING_FRAMES
      );

      trackedPersonsRef.current = filtered;
      return filtered;
    }

    async function init() {
      try {
        setStatus("Loading MediaPipe...");

        const vision = await waitForVision();
        setStatus("Loading YOLO...");
        await loadYoloModel();
        setStatus("Loading MediaPipe...");

        const fileset = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        poseRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
          },
          runningMode: "VIDEO",
          numPoses: 4,
        });

        if (!isMounted) return;

        setStatus("Model ready");

        streamRef.current = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!videoRef.current) return;

        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();

        setStatus("Camera ready");
        loop();
      } catch (error) {
        console.error(error);
        setStatus(`Error: ${error.message}`);
      }
    }

    async function loop() {
            if (!isMounted) return;

      frameIndexRef.current += 1;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || !poseRef.current || video.readyState < 2) {
        animationRef.current = requestAnimationFrame(loop);
        return;
      }

      const ctx = canvas.getContext("2d");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const yoloDetections = await detectPeople(video);
setYoloCountText(String(yoloDetections.length));

      const result = poseRef.current.detectForVideo(video, performance.now());
      const allLandmarks = result.landmarks ?? [];

      const detections = allLandmarks
        .map((landmarks) => {
          const reliableCount = countReliablePoints(landmarks);
          if (reliableCount < 8) return null;

          const bbox = getBBoxFromLandmarks(landmarks, isPointReliable);
          if (!bbox) return null;

          return {
            landmarks,
            centerNorm: {
              x: (bbox.minX + bbox.maxX) / 2,
              y: (bbox.minY + bbox.maxY) / 2,
            },
            bbox,
            reliableCount,
          };
        })
        .filter(Boolean);

      const tracks = updateTracks(detections);
      const confirmedTracks = tracks.filter((track) => track.isConfirmed);

      const rawPeopleCount = detections.length;
      const trackedPeopleCount = confirmedTracks.length;

      pushRollingValue(rawPeopleHistoryRef, trackedPeopleCount);
      const stablePeopleCount = getModeValue(
        rawPeopleHistoryRef.current,
        trackedPeopleCount
      );

      setPersonCountText(`${trackedPeopleCount} tracked / raw ${rawPeopleCount}`);
      setRawPeopleCountText(String(rawPeopleCount));
      setStablePeopleCountText(String(stablePeopleCount));

      if (!confirmedTracks.length) {
        setPersonText("No confirmed person");
        setQualityText("No stable detection");
        setVisiblePointsText("0");
        setZoneText("Outside defined zones");
        setDistanceText("Distance unknown");
        setPostureText("Unknown posture");
        previousTorsoSizeRef.current = null;

        pushRollingValue(rawWatchHistoryRef, 0);
        const stableWatchCount = getModeValue(rawWatchHistoryRef.current, 0);
        updateManningState(0, stableWatchCount);

        drawZones(ctx, canvas.width, canvas.height);

        animationRef.current = requestAnimationFrame(loop);
        return;
      }

      let primaryTrack = null;

      const watchTracks = confirmedTracks.filter((track) =>
        isCenterInsideZone(
          {
            x: track.centerNorm.x * canvas.width,
            y: track.centerNorm.y * canvas.height,
          },
          WATCH_ZONE_ID,
          canvas.width,
          canvas.height
        )
      );

      if (watchTracks.length) {
        primaryTrack = watchTracks.sort(
          (a, b) => (b.bbox?.area || 0) - (a.bbox?.area || 0)
        )[0];
      } else {
        primaryTrack = confirmedTracks.sort(
          (a, b) => (b.bbox?.area || 0) - (a.bbox?.area || 0)
        )[0];
      }

      const landmarks = primaryTrack.landmarks;
      const reliablePointCount = countReliablePoints(landmarks);
      const torso = getTorsoSize(landmarks, canvas.width, canvas.height);
      const posture = getPostureStatus(landmarks);

      setPostureText(posture);

      if (torso) {
        const previous = previousTorsoSizeRef.current;

        if (previous) {
          const ratio = torso.area / previous.area;

          if (ratio > 1.12) {
            setDistanceText("Moving closer");
          } else if (ratio < 0.88) {
            setDistanceText("Moving away");
          } else {
            setDistanceText("Stable distance");
          }
        }

        previousTorsoSizeRef.current = torso;
      } else {
        setDistanceText("Distance unknown");
      }

      drawPose(ctx, confirmedTracks, canvas.width, canvas.height);
      drawBoundingBox(ctx, confirmedTracks, canvas.width, canvas.height);
      console.log("YOLO:", yoloDetections);
      drawYoloBoxes(ctx, yoloDetections, canvas.width, canvas.height);
      drawZones(ctx, canvas.width, canvas.height);

      const personCenter = {
        x: primaryTrack.centerNorm.x * canvas.width,
        y: primaryTrack.centerNorm.y * canvas.height,
      };

      const currentZone = getZoneFromCenter(
        personCenter,
        canvas.width,
        canvas.height
      );
      setZoneText(currentZone);

      const centers = confirmedTracks.map((track) => ({
        x: track.centerNorm.x * canvas.width,
        y: track.centerNorm.y * canvas.height,
      }));

      const rawWatchCount = confirmedTracks.filter((track) =>
        isCenterInsideZone(
          {
            x: track.centerNorm.x * canvas.width,
            y: track.centerNorm.y * canvas.height,
          },
          WATCH_ZONE_ID,
          canvas.width,
          canvas.height
        )
      ).length;

      pushRollingValue(rawWatchHistoryRef, rawWatchCount);
      const stableWatchCount = getModeValue(rawWatchHistoryRef.current, rawWatchCount);

      updateManningState(rawWatchCount, stableWatchCount);

      if (settingsRef.current.showCenterPoint) {
        centers.forEach((center, index) => {
          const hue = (index * 110) % 360;

          ctx.fillStyle = `hsl(${hue}, 100%, 85%)`;
          ctx.beginPath();
          ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      if (reliablePointCount >= 16) {
        setPersonText(`Primary person: P${primaryTrack.id}`);
        setQualityText("Strong detection");
      } else if (reliablePointCount >= 8) {
        setPersonText(`Primary person: P${primaryTrack.id}`);
        setQualityText("Weak detection");
      } else {
        setPersonText(`Primary person: P${primaryTrack.id}`);
        setQualityText("Too noisy");
      }

      setVisiblePointsText(String(reliablePointCount));

      animationRef.current = requestAnimationFrame(loop);
    }

    init();

    return () => {
      isMounted = false;

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  function getCanvasInfo() {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return { canvas, rect };
  }

  function getNormalizedMouse(event) {
    const info = getCanvasInfo();
    if (!info) return null;

    const { rect } = info;
    const rawX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const rawY = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    return {
      x: mirrorView ? 1 - rawX : rawX,
      y: rawY,
      xPx: event.clientX - rect.left,
      yPx: event.clientY - rect.top,
      widthPx: rect.width,
      heightPx: rect.height,
    };
  }

  function findNearestPoint(mouse) {
    let hit = null;
    let minDistance = Infinity;

    zones.forEach((zone) => {
      zone.points.forEach((point, index) => {
        const px = point.x * mouse.widthPx;
        const py = point.y * mouse.heightPx;
        const dist = Math.hypot(mouse.x * mouse.widthPx - px, mouse.yPx - py);

        if (dist < HANDLE_RADIUS && dist < minDistance) {
          minDistance = dist;
          hit = {
            zoneId: zone.id,
            pointIndex: index,
          };
        }
      });
    });

    return hit;
  }

  function findZoneUnderMouse(mouse) {
    for (let i = zones.length - 1; i >= 0; i--) {
      const zone = zones[i];
      if (pointInPolygon({ x: mouse.x, y: mouse.y }, zone.points)) {
        return zone.id;
      }
    }
    return null;
  }

  function addPointToNearestEdge(mouse) {
    const zone = zones.find((z) => z.id === selectedZoneId);
    if (!zone || zone.points.length < 2) return;

    let bestEdgeIndex = -1;
    let minDist = Infinity;

    for (let i = 0; i < zone.points.length; i++) {
      const a = zone.points[i];
      const b = zone.points[(i + 1) % zone.points.length];

      const dist = distanceToSegment(mouse.x, mouse.y, a.x, a.y, b.x, b.y);

      if (dist < minDist) {
        minDist = dist;
        bestEdgeIndex = i;
      }
    }

    if (bestEdgeIndex === -1) return;

    const nextZones = cloneZones(zones);
    const targetZone = nextZones.find((z) => z.id === selectedZoneId);
    if (!targetZone) return;

    targetZone.points.splice(bestEdgeIndex + 1, 0, { x: mouse.x, y: mouse.y });

    setZones(nextZones);
    setSelectedPointIndex(bestEdgeIndex + 1);
  }

  function handleCanvasMouseDown(event) {
    const mouse = getNormalizedMouse(event);
    if (!mouse) return;

    const nearestPoint = findNearestPoint(mouse);

    if (nearestPoint) {
      setSelectedZoneId(nearestPoint.zoneId);
      setSelectedPointIndex(nearestPoint.pointIndex);

      interactionRef.current = {
        draggingPoint: true,
        draggingZone: false,
        zoneId: nearestPoint.zoneId,
        pointIndex: nearestPoint.pointIndex,
        lastMouseNorm: { x: mouse.x, y: mouse.y },
      };
      return;
    }

    const zoneId = findZoneUnderMouse(mouse);

    if (zoneId) {
      setSelectedZoneId(zoneId);
      setSelectedPointIndex(null);

      if (addPointMode && zoneId === selectedZoneId) {
        addPointToNearestEdge(mouse);
        return;
      }

      interactionRef.current = {
        draggingPoint: false,
        draggingZone: true,
        zoneId,
        pointIndex: null,
        lastMouseNorm: { x: mouse.x, y: mouse.y },
      };
      return;
    }

    if (addPointMode) {
      addPointToNearestEdge(mouse);
      return;
    }

    setSelectedPointIndex(null);
  }

  function handleCanvasMouseMove(event) {
    const mouse = getNormalizedMouse(event);
    if (!mouse) return;

    const interaction = interactionRef.current;
    if (!interaction.zoneId) return;

    if (interaction.draggingPoint) {
      const nextZones = cloneZones(zones);
      const zone = nextZones.find((z) => z.id === interaction.zoneId);
      if (!zone) return;

      zone.points[interaction.pointIndex] = {
        x: mouse.x,
        y: mouse.y,
      };

      setZones(nextZones);
      return;
    }

    if (interaction.draggingZone && interaction.lastMouseNorm) {
      const dx = mouse.x - interaction.lastMouseNorm.x;
      const dy = mouse.y - interaction.lastMouseNorm.y;

      const nextZones = cloneZones(zones);
      const zone = nextZones.find((z) => z.id === interaction.zoneId);
      if (!zone) return;

      zone.points = zone.points.map((point) => ({
        x: clamp(point.x + dx, 0, 1),
        y: clamp(point.y + dy, 0, 1),
      }));

      interactionRef.current.lastMouseNorm = { x: mouse.x, y: mouse.y };
      setZones(nextZones);
    }
  }

  function handleCanvasMouseUp() {
    interactionRef.current = {
      draggingPoint: false,
      draggingZone: false,
      zoneId: null,
      pointIndex: null,
      lastMouseNorm: null,
    };
  }

  function handleDeleteSelectedPoint() {
    if (selectedPointIndex === null) return;

    const nextZones = cloneZones(zones);
    const zone = nextZones.find((z) => z.id === selectedZoneId);
    if (!zone || zone.points.length <= 3) return;

    zone.points.splice(selectedPointIndex, 1);
    setZones(nextZones);
    setSelectedPointIndex(null);
  }

  function handleDeletePointAt(index) {
    const nextZones = cloneZones(zones);
    const zone = nextZones.find((z) => z.id === selectedZoneId);
    if (!zone || zone.points.length <= 3) return;

    zone.points.splice(index, 1);
    setZones(nextZones);

    if (selectedPointIndex === index) {
      setSelectedPointIndex(null);
    } else if (selectedPointIndex !== null && selectedPointIndex > index) {
      setSelectedPointIndex(selectedPointIndex - 1);
    }
  }

  function handleAddPointRow() {
    const nextZones = cloneZones(zones);
    const zone = nextZones.find((z) => z.id === selectedZoneId);
    if (!zone) return;

    const last = zone.points[zone.points.length - 1];
    const fallback = last ? { x: last.x, y: last.y } : { x: 0.5, y: 0.5 };

    zone.points.push({
      x: clamp(fallback.x + 0.02, 0, 1),
      y: clamp(fallback.y + 0.02, 0, 1),
    });

    setZones(nextZones);
    setSelectedPointIndex(zone.points.length - 1);
  }

  function updatePointValue(index, axis, value) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return;

    const nextZones = cloneZones(zones);
    const zone = nextZones.find((z) => z.id === selectedZoneId);
    if (!zone || !zone.points[index]) return;

    zone.points[index][axis] = clamp(numeric, 0, 1);
    setZones(nextZones);
    setSelectedPointIndex(index);
  }

  function handleResetZones() {
    setZones(cloneZones(DEFAULT_ZONES));
    setSelectedZoneId(DEFAULT_ZONES[0].id);
    setSelectedPointIndex(null);
  }

  function handleAddZone() {
    const newId = `zone_${Date.now()}`;
    const newZone = {
      id: newId,
      label: `New Zone ${zones.length + 1}`,
      color: "#ff4d9d",
      points: [
        { x: 0.4, y: 0.4 },
        { x: 0.55, y: 0.4 },
        { x: 0.55, y: 0.55 },
        { x: 0.4, y: 0.55 },
      ],
    };

    setZones([...zones, newZone]);
    setSelectedZoneId(newId);
    setSelectedPointIndex(null);
  }

  function handleZoneLabelChange(value) {
    const nextZones = cloneZones(zones);
    const zone = nextZones.find((z) => z.id === selectedZoneId);
    if (!zone) return;

    zone.label = value;
    setZones(nextZones);
  }

  function handleSelectedZoneChange(zoneId) {
    setSelectedZoneId(zoneId);
    setSelectedPointIndex(null);
  }

  const selectedZone = zones.find((z) => z.id === selectedZoneId);
  const activeManningDuration =
    manningStateRef.current.confirmedStartedAt
      ? formatDurationMs(
          Date.now() - manningStateRef.current.confirmedStartedAt.getTime()
        )
      : "0s";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#03112b",
        color: "#fff",
        padding: 20,
      }}
    >
      <h1 style={{ marginTop: 0 }}>Bridge AI Demo</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "420px 1fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div
          style={{
            background: "#081a3a",
            borderRadius: 14,
            padding: 16,
            border: "1px solid #173462",
            maxHeight: "calc(100vh - 60px)",
            overflow: "auto",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Control Panel</h3>

          <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
            <label>
              <input
                type="checkbox"
                checked={showVideo}
                onChange={(e) => setShowVideo(e.target.checked)}
              />{" "}
              Show video
            </label>

            <label>
              <input
                type="checkbox"
                checked={showSkeleton}
                onChange={(e) => setShowSkeleton(e.target.checked)}
              />{" "}
              Show skeleton
            </label>

            <label>
              <input
                type="checkbox"
                checked={showBoundingBox}
                onChange={(e) => setShowBoundingBox(e.target.checked)}
              />{" "}
              Show bounding box
            </label>

            <label>
              <input
                type="checkbox"
                checked={showZones}
                onChange={(e) => setShowZones(e.target.checked)}
              />{" "}
              Show zones
            </label>

            <label>
              <input
                type="checkbox"
                checked={showCenterPoint}
                onChange={(e) => setShowCenterPoint(e.target.checked)}
              />{" "}
              Show center point
            </label>

            <label>
              <input
                type="checkbox"
                checked={depthMode}
                onChange={(e) => setDepthMode(e.target.checked)}
              />{" "}
              Depth mode
            </label>

            <label>
              <input
                type="checkbox"
                checked={mirrorView}
                onChange={(e) => setMirrorView(e.target.checked)}
              />{" "}
              Mirror view
            </label>

            <label>
              <input
                type="checkbox"
                checked={addPointMode}
                onChange={(e) => setAddPointMode(e.target.checked)}
              />{" "}
              Add point mode
            </label>
          </div>

          <h4 style={{ marginBottom: 8 }}>Watch Mode</h4>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginBottom: 18,
            }}
          >
            <button
              onClick={() => setWatchMode("DAY")}
              style={{
                ...buttonStyle(watchMode === "DAY" ? "#2563eb" : "#334155"),
              }}
            >
              Day Mode
            </button>

            <button
              onClick={() => setWatchMode("NIGHT")}
              style={{
                ...buttonStyle(watchMode === "NIGHT" ? "#7c3aed" : "#334155"),
              }}
            >
              Night Mode
            </button>
          </div>

          <h4 style={{ marginBottom: 8 }}>Detection thresholds</h4>

          <div style={{ marginBottom: 14 }}>
            <div>Min visibility: {minVisibility.toFixed(2)}</div>
            <input
              type="range"
              min="0.10"
              max="0.95"
              step="0.01"
              value={minVisibility}
              onChange={(e) => setMinVisibility(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <div>Min presence: {minPresence.toFixed(2)}</div>
            <input
              type="range"
              min="0.10"
              max="0.95"
              step="0.01"
              value={minPresence}
              onChange={(e) => setMinPresence(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <h4 style={{ marginBottom: 8 }}>Polygon Zones</h4>

          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 6 }}>Selected zone</div>
            <select
              value={selectedZoneId}
              onChange={(e) => handleSelectedZoneChange(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #35558c",
                background: "#0b2148",
                color: "#fff",
              }}
            >
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.label}
                </option>
              ))}
            </select>
          </div>

          {selectedZone && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 6 }}>Zone label</div>
              <input
                value={selectedZone.label}
                onChange={(e) => handleZoneLabelChange(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #35558c",
                  background: "#0b2148",
                  color: "#fff",
                }}
              />
            </div>
          )}

          <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
            <button onClick={handleAddZone} style={buttonStyle("#0f766e")}>
              Add New Zone
            </button>

            <button onClick={handleAddPointRow} style={buttonStyle("#2563eb")}>
              Add Point Row
            </button>

            <button
              onClick={handleDeleteSelectedPoint}
              disabled={selectedPointIndex === null}
              style={{
                ...buttonStyle(
                  selectedPointIndex === null ? "#475569" : "#b45309"
                ),
                cursor: selectedPointIndex === null ? "not-allowed" : "pointer",
              }}
            >
              Delete Selected Point
            </button>

            <button onClick={handleResetZones} style={buttonStyle("#1d4ed8")}>
              Reset Zones
            </button>
          </div>

          <div
            style={{
              marginBottom: 18,
              padding: 12,
              borderRadius: 10,
              background: "#0b2148",
              border: "1px solid #173462",
              lineHeight: 1.6,
              fontSize: 13,
            }}
          >
            <div><strong>Mouse controls</strong></div>
            <div>- Point üstüne bas: köşe taşı</div>
            <div>- Polygon içine bas: tüm zone taşı</div>
            <div>- Add point mode açıkken kenara tıkla: yeni nokta ekle</div>
            <div>- Mirror view açıksa mouse yönü otomatik düzeltilir</div>
          </div>

          <h4 style={{ marginBottom: 8 }}>Point Coordinates</h4>

          <div
            style={{
              overflowX: "auto",
              border: "1px solid #173462",
              borderRadius: 10,
              marginBottom: 18,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead style={{ background: "#0b2148" }}>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Model X</th>
                  <th style={thStyle}>Model Y</th>
                  <th style={thStyle}>View X</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedZone?.points.map((point, index) => (
                  <tr
                    key={index}
                    style={{
                      background:
                        selectedPointIndex === index ? "#13305f" : "transparent",
                    }}
                  >
                    <td style={tdStyle}>
                      <button
                        onClick={() => setSelectedPointIndex(index)}
                        style={{
                          background:
                            selectedPointIndex === index ? "#ffffff" : "#1e3a5f",
                          color:
                            selectedPointIndex === index ? "#000" : "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "4px 8px",
                          cursor: "pointer",
                        }}
                      >
                        {index + 1}
                      </button>
                    </td>

                    <td style={tdStyle}>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={point.x.toFixed(2)}
                        onChange={(e) =>
                          updatePointValue(index, "x", e.target.value)
                        }
                        style={inputStyle}
                      />
                    </td>

                    <td style={tdStyle}>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={point.y.toFixed(2)}
                        onChange={(e) =>
                          updatePointValue(index, "y", e.target.value)
                        }
                        style={inputStyle}
                      />
                    </td>

                    <td style={tdStyle}>
                      {(mirrorView ? 1 - point.x : point.x).toFixed(2)}
                    </td>

                    <td style={tdStyle}>
                      <button
                        onClick={() => handleDeletePointAt(index)}
                        disabled={(selectedZone?.points.length ?? 0) <= 3}
                        style={{
                          background:
                            (selectedZone?.points.length ?? 0) <= 3
                              ? "#475569"
                              : "#991b1b",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "6px 10px",
                          cursor:
                            (selectedZone?.points.length ?? 0) <= 3
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 style={{ marginBottom: 8 }}>Manning Log</h4>

          <div
            style={{
              overflowX: "auto",
              border: "1px solid #173462",
              borderRadius: 10,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead style={{ background: "#0b2148" }}>
                <tr>
                  <th style={thStyle}>Start</th>
                  <th style={thStyle}>End</th>
                  <th style={thStyle}>Dur.</th>
                  <th style={thStyle}>Mode</th>
                  <th style={thStyle}>Req</th>
                  <th style={thStyle}>Act</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {manningLogs.length === 0 ? (
                  <tr>
                    <td style={tdStyle} colSpan={7}>
                      Henüz log yok
                    </td>
                  </tr>
                ) : (
                  manningLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={tdStyle}>{log.start}</td>
                      <td style={tdStyle}>{log.end}</td>
                      <td style={tdStyle}>{log.duration}</td>
                      <td style={tdStyle}>{log.mode}</td>
                      <td style={tdStyle}>{log.required}</td>
                      <td style={tdStyle}>{log.actual}</td>
                      <td style={tdStyle}>{log.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div
            style={{
              background: "#081a3a",
              borderRadius: 14,
              padding: 16,
              border: "1px solid #173462",
              marginBottom: 16,
              lineHeight: 1.8,
            }}
          >
            <div>{status}</div>
            <div>{personText}</div>
            <div>{qualityText}</div>
            <div>Reliable points: {visiblePointsText}</div>
            <div>Persons detected: {personCountText}</div>
            <div>YOLO persons: {yoloCountText}</div>
            <div>Raw persons: {rawPeopleCountText}</div>
            <div>Stable persons: {stablePeopleCountText}</div>
            <div>Zone: {zoneText}</div>
            <div>Distance: {distanceText}</div>
            <div>Posture: {postureText}</div>
            <div>Mirror view: {mirrorView ? "ON" : "OFF"}</div>
            <div>Watch mode: {watchMode}</div>
            <div>Raw watch zone count: {rawWatchZoneCountText}</div>
            <div>Stable watch zone count: {stableWatchZoneCountText}</div>
            <div>Required watchkeepers: {requiredWatchCountText}</div>
            <div>Manning candidate: {manningCandidateText}</div>
            <div>Manning confirmed: {manningConfirmedText}</div>
            <div>Active confirmed duration: {activeManningDuration}</div>
            <div>
              Selected zone: {selectedZone ? selectedZone.label : "None"}
            </div>
            <div>
              Selected point:{" "}
              {selectedPointIndex !== null ? selectedPointIndex + 1 : "None"}
            </div>
          </div>

          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 980,
              borderRadius: 14,
              overflow: "hidden",
              background: "#06122b",
              border: "1px solid #173462",
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: "100%",
                display: "block",
                transform: mirrorView ? "scaleX(-1)" : "none",
                opacity: showVideo ? 1 : 0,
              }}
            />

            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "auto",
                transform: mirrorView ? "scaleX(-1)" : "none",
                cursor: "crosshair",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const thStyle = {
  padding: "10px 8px",
  borderBottom: "1px solid #173462",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "8px",
  borderBottom: "1px solid #173462",
  whiteSpace: "nowrap",
};

const inputStyle = {
  width: 72,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #35558c",
  background: "#0b2148",
  color: "#fff",
};