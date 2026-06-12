// Pose landmark sabitleri ve temel yardımcılar (MediaPipe PoseLandmarker, 33 nokta).

export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};

// İskelet çizimi için bağlantı çiftleri.
export const CONNECTIONS = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.LEFT_ANKLE, LM.LEFT_FOOT_INDEX],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  [LM.RIGHT_ANKLE, LM.RIGHT_FOOT_INDEX],
];

export const DEFAULT_MIN_VISIBILITY = 0.55;
export const DEFAULT_MIN_PRESENCE = 0.55;

export function isPointReliable(
  point,
  minVisibility = DEFAULT_MIN_VISIBILITY,
  minPresence = DEFAULT_MIN_PRESENCE
) {
  if (!point) return false;
  const visibilityOk = (point.visibility ?? 1) >= minVisibility;
  const presenceOk = (point.presence ?? 1) >= minPresence;
  return visibilityOk && presenceOk;
}

export function countReliablePoints(landmarks) {
  if (!landmarks) return 0;
  return landmarks.filter((p) => isPointReliable(p)).length;
}

export function getBBoxFromLandmarks(landmarks, reliable = isPointReliable) {
  const xs = [];
  const ys = [];

  landmarks.forEach((p) => {
    if (!reliable(p)) return;
    xs.push(p.x);
    ys.push(p.y);
  });

  if (!xs.length || !ys.length) return null;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    area: (maxX - minX) * (maxY - minY),
  };
}
