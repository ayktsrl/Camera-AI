# Program Veri Şeması

Kaynak spec: `agents/03-stratejist/outputs/2026-06-13_formcoach-program-mode-spec.md` (§3 + Ek-A).
Veri dosyası: `src/programs/default-program.js` — owner'ın hocasından gelen 4 günlük program, Ek-A'dan birebir.

## Hiyerarşi

```
Program > days[] > blocks[] > exercises[]
```

## Program

| Alan | Tip | Açıklama |
|---|---|---|
| `id` | string | Program kimliği (`owner-coach-2026-06`) |
| `name` | string | Görünen ad |
| `source` | string | Kaynak (`coach-pdf`) |
| `version` | number | Veri sürümü |
| `generalRules` | object | Gün bloklarına girmeyen genel kurallar (aşağıda) |
| `days` | Day[] | 4 antrenman günü |

### generalRules

| Alan | Açıklama |
|---|---|
| `cardio` | `{ trainingDayMin: 30, restDayMin: 40, hrBpm: [110, 130] }` — antrenman günü 30 dk / diğer günler 40 dk, 110–130 bpm. Player gün sonunda hatırlatır. |
| `plank` | `{ perWeek: 3, sets: 3, mode: "max", after: "cardio" }` — haftada 3 gün, kardiyo sonrası 3 set max. P0'da hatırlatma; süre takibi P2. |
| `defaultRestSec` | `[60, 90]` — straight bloklarda set arası dinlenme bandı (player 60 başlatır, kullanıcı uzatabilir). |
| `negativeTempoSec` | `[2, 3]` — her harekette negatif tempo. P0'da statik genel kural metni; tempo uyarısı P2 (precision zaman katmanına bağımlı). |
| `daysFlexible` | `true` — günler esnek, player gün dayatmaz. |

## Day

| Alan | Tip |
|---|---|
| `id` | `"day1"`…`"day4"` |
| `label` | `"Antrenman 1"`… |
| `suggestedDay` | `"Pazartesi"` vb. — öneri, zorlama değil |
| `blocks` | Block[] |

## Block

| Alan | Tip | Açıklama |
|---|---|---|
| `type` | `"warmup" \| "superset" \| "straight" \| "stretch" \| "cardio" \| "finisher"` | Akış tipini belirler. `finisher` straight gibi akar (plank bitiriş bloğu). |
| `label` | string | `"Isınma"`, `"Superset A"`… |
| `rounds` | number | Sadece superset — tur sayısı |
| `restBetweenExercisesSec` | number | Sadece superset — superset içi geçişte dinlenme (hep 0) |
| `restAfterRoundSec` | number | Sadece superset — tur sonu dinlenme (SS-A/C: 50, SS-B: 60) |
| `exercises` | Exercise[] | |

**Superset akışı:** A1→A2→A3 dinlenmesiz → tur sonu `restAfterRoundSec` → tur sayacı artar → A1'e döner. `rounds` kadar tekrarlanır.

## Exercise

| Alan | Tip | Açıklama |
|---|---|---|
| `id` | string | Gün içinde benzersiz (aynı hareket farklı günde sonek alır: `band-pull-apart-3`) |
| `name` | string | Görünen ad |
| `coachNote` | string \| null | **HAM hoca cümlesi — KELİMESİ KELİMESİNE.** Kısaltılamaz, değiştirilemez. Kurala çevrilen uyarılar ayrıca ruleSet'te yaşar; not silinmez. UI'da adın altında tırnak içinde, set başında bir kez sesli okunur. |
| `videoUrl` | string \| null | Doğrulanmış YouTube linki (spec §1 — 16/16 eşleşme). Plank finisher'da `null` (in-app çöp adam önizleme, dış link yok). |
| `embeddable` | boolean | oEmbed 401 dönenler `false` (`Tc-9yvl5Zt8`, `0RAzZhXnsww`). P0 player'da hepsi yeni sekmede açılır. |
| `sets` | number | Set sayısı (superset'te = `rounds`, tutarlılık için tekrarlanır) |
| `dose` | Dose | Aşağıda |
| `restSec` | [number, number] \| yok | Straight bloklarda `[60, 90]`; superset'te blok yönetir (alan yok/null) |
| `trackable` | boolean | Pose form analizi gerçekçi mi |
| `trackingPhase` | `"P0" \| "P1" \| "P2" \| null` | Hangi fazda pose moduna geçer. Player aktif faza göre pose/rehberli seçer — faz ilerleyince veri alanı tek satır değişir, kod değişmez. |
| `ruleSetRef` | string \| null | `src/exercises/` kayıt defteri anahtarı (`"squat"` vb.). Rehberlide null. |
| `untrackableReason` | string \| null | Rehberlide ZORUNLU tek cümle — "neden takip edilemez" (sınır dürüstlüğü, UI'da gösterilebilir). |

### Dose

```js
{ type: "reps", value: 12 }                 // 12 tekrar
{ type: "repRange", min: 8, max: 10 }       // 8–10 tekrar
{ type: "time", seconds: 45 }               // 45 sn
{ type: "timeRange", minSec: 30, maxSec: 40 } // 30–40 sn
{ type: "perSide", value: 12 }              // sağ-sol 12'şer
{ type: "hold" }                            // İZOMETRİK: "durabildiğin kadar" (plank)
{ type: "hold", minSec: 30 }                // izometrik + en az süre ipucu
```

**`hold` (izometrik):** Tekrar/geri-sayım YOK. Pozisyonu TUTMA hareketleri (plank).
Pose-takipli (`ruleSetRef: "plank"`) olduğunda `holdEngine` geçerli pozisyondaki
geçen SÜREYİ yukarı sayar, pozisyon bozulunca timer durur (geri gitmez). UI rep
yerine yukarı-sayan hold timer + form uyarısı gösterir; set bittiğinde "X sn tuttun".
`isIsometricDose(dose)` ile ayırt edilir — rep/time dozları etkilenmez.

## Dinlenme kuralları (iki seviyeli)

1. **Superset bloğu turu yönetir:** superset içi 0 sn, tur sonu `restAfterRoundSec` (SS-A/C 50 sn, SS-B 60 sn) — PDF'e birebir.
2. **Straight bloklar:** hareket başına `restSec: [60, 90]` — player 60 sn başlatır, kullanıcı uzatabilir.
3. Warmup/stretch hareketlerinde `restSec` yok → geri sayım yok, doğrudan sonraki adım.
4. Günün son setinden sonra dinlenme yok → gün özeti.

## Player tüketimi

Akış motoru: `src/lib/programPlayer.js` (saf modül, React'siz, vitest'li).
`isPoseTracked(exercise)` → `trackable && trackingPhase <= AKTİF_FAZ` (P0). UI ayrıca `ruleSetRef`'in
`src/exercises/index.js` kayıt defterinde var olduğunu doğrular — yoksa rehberliye düşer.
