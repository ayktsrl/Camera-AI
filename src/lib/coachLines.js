// Eyes-free sesli koçluk metinleri — SAF modül (React/tarayıcı bağımsız).
//
// Amaç: "hangi olayda ne söyleniyor" tek yerde toplanır ve test edilir. Owner spor
// salonunda ekrana BAKMADAN tüm seansı kulakla yürütür → kritik geçişlerin metni
// burada sabittir. Bileşenler bu üreticileri çağırır (string dağılımı yok).
//
// SINIR: pose/motor/threshold mantığına dokunmaz; yalnız metin üretir. tr-TR.

/** Rep-dozlu set bitti anonsu — "Set bitti, 10 tekrar. Aferin." */
export function setDoneReps(repCount) {
  const tail = repCount != null ? `, ${repCount} tekrar` : "";
  return `Set bitti${tail}. Aferin.`;
}

/** Süre-dozlu (aktivite) set bitti anonsu — süre dolunca. */
export function setDoneTimed() {
  return "Set bitti, süre doldu. Aferin.";
}

/** İzometrik (plank) set bitti anonsu — "Set bitti, 30 saniye tuttun. Aferin." */
export function setDoneHold(heldSeconds) {
  const tail = heldSeconds > 0 ? `, ${heldSeconds} saniye tuttun` : "";
  return `Set bitti${tail}. Aferin.`;
}

/** Seans sonu anonsu — "Antrenman bitti. 18 set tamamladın. Aferin." */
export function sessionDone(totalSets) {
  return `Antrenman bitti. ${totalSets} set tamamladın. Aferin.`;
}

// Kalan-tekrar kilometre taşı — salonda HER tekrarı saymak yerine hedefe yaklaşınca
// kalanı vurgular. Eyes-free için sayım toggle'ından BAĞIMSIZ söylenir.
export const REP_MILESTONE = {
  last: { speech: "Son tekrar", key: "rep-last" },
  threeLeft: { speech: "3 kaldı", key: "rep-3-left" },
};

/**
 * Bir tekrar olayında hangi kilometre taşı söylenmeli? (yoksa null)
 * @param {number} count o anki tekrar
 * @param {number|null} target hedef tekrar (null → rep-dozlu değil → sus)
 * @returns {{speech, key}|null}
 */
export function repMilestone(count, target) {
  if (target == null) return null;
  const remaining = target - count;
  if (remaining === 1) return REP_MILESTONE.last;
  if (remaining === 3 && target > 4) return REP_MILESTONE.threeLeft;
  return null;
}

// Form hatası uyarısının say() seçenekleri. Kritik hata (bel/diz güvenliği) öne
// çıkar: kısa cooldown + kuyruğu keser (interrupt). Major/minor mevcut desende.
const CRITICAL_FAULT_COOLDOWN_MS = 2500;

/**
 * Bir warning olayının coach.say seçeneklerini üretir.
 * @param {{rule:string, severity?:string}} event
 * @returns {{key:string, cooldownMs?:number, interrupt?:boolean}}
 */
export function warningSayOptions(event) {
  if (event.severity === "critical") {
    return { key: event.rule, cooldownMs: CRITICAL_FAULT_COOLDOWN_MS, interrupt: true };
  }
  return { key: event.rule };
}
