// Çoklu kişi takibi — centroid eşleştirme + ID atama + confirm/missing frame mantığı.
// Bridge AI updateTracks çekirdeğinden ayıklandı; tek kamera için sadeleştirildi.

export const TRACK_MATCH_DISTANCE = 0.12; // normalize mesafe
export const TRACK_MAX_MISSING_FRAMES = 18;
export const TRACK_CONFIRM_FRAMES = 3;

// Aktif kullanıcı kilidi: kilitli track listeden tamamen düşerse
// bu kadar frame bekleyip yeniden seçim yapılır.
export const ACTIVE_RELOCK_WAIT_FRAMES = 24;

export function createTrackerState() {
  return {
    tracks: [],
    nextTrackId: 1,
    frameIndex: 0,
    activeTrackId: null,
    activeLostFrames: 0,
  };
}

/**
 * Tespitleri mevcut track'lerle eşleştirir; yeni track açar, kayıpları sayar.
 * @param {object} state createTrackerState() çıktısı (yerinde güncellenir)
 * @param {Array<{landmarks, worldLandmarks, centerNorm, bbox}>} detections
 * @returns {Array} güncel track listesi
 */
export function updateTracks(state, detections) {
  state.frameIndex += 1;
  const frameIndex = state.frameIndex;
  const tracks = state.tracks.map((track) => ({ ...track }));

  const unmatchedTrackIndexes = new Set(tracks.map((_, index) => index));
  const unmatchedDetectionIndexes = new Set(detections.map((_, index) => index));

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
    track.worldLandmarks = det.worldLandmarks ?? null;
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
      id: state.nextTrackId++,
      landmarks: det.landmarks,
      worldLandmarks: det.worldLandmarks ?? null,
      centerNorm: det.centerNorm,
      bbox: det.bbox,
      lastSeenFrame: frameIndex,
      missingFrames: 0,
      seenFrames: 1,
      isConfirmed: false,
    });
  });

  unmatchedTrackIndexes.forEach((trackIndex) => {
    tracks[trackIndex].missingFrames += 1;
  });

  state.tracks = tracks.filter(
    (track) => track.missingFrames <= TRACK_MAX_MISSING_FRAMES
  );

  return state.tracks;
}

/**
 * Aktif kullanıcı kilidi (v1):
 * - Kilit yoksa onaylanmış track'ler arasından en büyük bounding box'lı seçilir.
 * - Kilitli track listede kaldığı sürece kilit korunur (kısa kayıplar dahil).
 * - Track tamamen düşerse ACTIVE_RELOCK_WAIT_FRAMES beklenir, sonra yeniden seçim.
 * @returns {object|null} aktif track
 */
export function selectActiveTrack(state) {
  const confirmed = state.tracks.filter((t) => t.isConfirmed);

  if (state.activeTrackId != null) {
    const current = state.tracks.find((t) => t.id === state.activeTrackId);
    if (current) {
      state.activeLostFrames = 0;
      return current;
    }

    state.activeLostFrames += 1;
    if (state.activeLostFrames <= ACTIVE_RELOCK_WAIT_FRAMES) {
      return null; // bekleme penceresi — hemen başkasına atlama
    }

    state.activeTrackId = null;
    state.activeLostFrames = 0;
  }

  if (!confirmed.length) return null;

  const largest = confirmed.reduce((best, t) =>
    (t.bbox?.area || 0) > (best.bbox?.area || 0) ? t : best
  );

  state.activeTrackId = largest.id;
  return largest;
}
