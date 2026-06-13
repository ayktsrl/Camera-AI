// Çoklu kişi takibi — centroid eşleştirme + ID atama + confirm/missing frame mantığı.
// Bridge AI updateTracks çekirdeğinden ayıklandı; tek kamera için sadeleştirildi.

export const TRACK_MATCH_DISTANCE = 0.12; // normalize mesafe
export const TRACK_MAX_MISSING_FRAMES = 18;
export const TRACK_CONFIRM_FRAMES = 3;

// Aktif kullanıcı kilidi: kilitli track listeden tamamen düşerse
// bu kadar frame bekleyip proximity re-acquire denenir.
export const ACTIVE_RELOCK_WAIT_FRAMES = 24;

// --- KULLANICI KİLİDİ (registration) eşikleri ---
// Salonda birden çok kişi olur. "En büyük bbox aktif kullanıcı" yanlış kişiye
// atlayabilir → açık KAYIT adımı: kullanıcı ekrana gelir (merkez + en büyük),
// ~1.5 sn STABİL kalınca o track KİLİTLENİR. Sonra SADECE o track motora beslenir
// ve çizilir. Frame-tabanlı (FPS'ten bağımsız, node smoke-test edilebilir).
export const REGISTER_STABLE_FRAMES = 45; // ~1.5 sn @30fps — aday stabil → kilit
export const REGISTER_CENTER_MAX_DX = 0.3; // aday merkez X, kadraj ortasına yakın (orta ~%60 bant)
export const RELOCK_PROXIMITY_MAX = 0.2; // re-acquire: son bilinen merkeze max normalize mesafe

export function createTrackerState() {
  return {
    tracks: [],
    nextTrackId: 1,
    frameIndex: 0,
    // Kilit durum makinesi: idle → registering → locked
    lockPhase: "idle",
    activeTrackId: null,
    activeLostFrames: 0,
    registerCandidateId: null,
    registerSinceFrame: 0,
    lastActiveCenter: null, // kilitli track son bilinen merkezi (proximity re-acquire)
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

/** Merkeze yakınlık (X ekseni) — kayıt aday filtresi. */
function isCentered(track) {
  return Math.abs((track.centerNorm?.x ?? 0.5) - 0.5) <= REGISTER_CENTER_MAX_DX;
}

/**
 * Kullanıcı kilidi durum makinesi. Saf — React/kamera yok, node'da test edilebilir.
 *
 * idle:        Kimse kilitli değil. Onaylanmış + merkezdeki en büyük track ADAY
 *              yapılır (registering'e geçer). Tek kişi varsa merkez filtresi gevşer
 *              (nerede olursa olsun aday → şeffaf hızlı kilit). active YOK (null).
 * registering: Aday hâlâ uygunsa REGISTER_STABLE_FRAMES boyunca bekle → KİLİT.
 *              Aday düşerse/bantan çıkarsa idle'a dön (sayaç sıfırlanır).
 * locked:      SADECE kilitli track active'dir (başkası büyük olsa da atlanmaz).
 *              Kilitli düşerse ACTIVE_RELOCK_WAIT_FRAMES bekle → proximity re-acquire
 *              (son bilinen merkeze EN YAKIN track; yakında yoksa idle → yeniden kayıt).
 *
 * @returns {object|null} aktif (kilitli) track — kilit yoksa null
 */
export function selectActiveTrack(state) {
  const confirmed = state.tracks.filter((t) => t.isConfirmed);
  const frameIndex = state.frameIndex;

  // --- locked ---
  if (state.lockPhase === "locked") {
    const current = state.tracks.find((t) => t.id === state.activeTrackId);
    if (current) {
      state.activeLostFrames = 0;
      state.lastActiveCenter = current.centerNorm;
      return current;
    }

    state.activeLostFrames += 1;

    // Proximity re-acquire — son bilinen merkeze YAKIN bir track varsa (büyüğe
    // DEĞİL) HEMEN ona yeniden kilitlen. Kilitli kişi aynı yere dönmüştür; bekleme
    // penceresini sadece "uygun aday yok" durumunda harca (yanlış/uzak kişiye atlama).
    const center = state.lastActiveCenter;
    let nearest = null;
    let nearestDist = Infinity;
    if (center) {
      confirmed.forEach((t) => {
        const dx = (t.centerNorm?.x ?? 0) - center.x;
        const dy = (t.centerNorm?.y ?? 0) - center.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= RELOCK_PROXIMITY_MAX && dist < nearestDist) {
          nearest = t;
          nearestDist = dist;
        }
      });
    }

    if (nearest) {
      state.activeTrackId = nearest.id;
      state.activeLostFrames = 0;
      state.lastActiveCenter = nearest.centerNorm;
      return nearest;
    }

    // Yakında uygun track yok. Bekleme penceresi sürdükçe null döner (activity-gate
    // duraklatır). Pencere dolunca yanlış kişiye atlamamak için yeniden kayıt iste.
    if (state.activeLostFrames <= ACTIVE_RELOCK_WAIT_FRAMES) {
      return null;
    }
    resetLock(state);
    return null;
  }

  if (!confirmed.length) {
    state.lockPhase = "idle";
    state.registerCandidateId = null;
    return null;
  }

  // Tek kişi fast-path: merkez filtresi gevşer (tek aday → kilit şeffaf/hızlı).
  const singlePerson = confirmed.length === 1;
  const eligible = singlePerson ? confirmed : confirmed.filter(isCentered);

  // --- registering ---
  if (state.lockPhase === "registering") {
    const candidate = eligible.find((t) => t.id === state.registerCandidateId);
    if (!candidate) {
      // Aday düştü/banttan çıktı → yeniden aday seç (idle mantığına düş).
      state.lockPhase = "idle";
      state.registerCandidateId = null;
    } else if (frameIndex - state.registerSinceFrame >= REGISTER_STABLE_FRAMES) {
      state.lockPhase = "locked";
      state.activeTrackId = candidate.id;
      state.activeLostFrames = 0;
      state.lastActiveCenter = candidate.centerNorm;
      state.registerCandidateId = null;
      return candidate;
    } else {
      return null; // kayıt sürüyor — henüz active yok
    }
  }

  // --- idle → aday seç ---
  if (!eligible.length) {
    state.registerCandidateId = null;
    return null; // ortada/uygun kimse yok — "Ekrana gel"
  }

  const candidate = eligible.reduce((best, t) =>
    (t.bbox?.area || 0) > (best.bbox?.area || 0) ? t : best
  );
  state.lockPhase = "registering";
  state.registerCandidateId = candidate.id;
  state.registerSinceFrame = frameIndex;
  return null; // kayıt başladı — henüz active yok
}

/**
 * Kilidi sıfırla / yeniden tanıt — track listesi/ID'ler korunur (kamera resetlenmez),
 * yalnız kilit durum makinesi idle'a döner → bir sonraki frame'de yeni kayıt başlar.
 */
export function resetLock(state) {
  state.lockPhase = "idle";
  state.activeTrackId = null;
  state.activeLostFrames = 0;
  state.registerCandidateId = null;
  state.registerSinceFrame = 0;
  state.lastActiveCenter = null;
}
