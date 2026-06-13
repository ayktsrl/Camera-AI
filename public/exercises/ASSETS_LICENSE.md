# Egzersiz Önizleme Fotoğrafları — Lisans

Bu klasördeki tüm `*.jpg` görselleri **free-exercise-db** veri setinden alınmıştır.

- **Kaynak repo:** https://github.com/yuhonas/free-exercise-db
- **Lisans:** The Unlicense (kamu malı / public domain)
- **Kullanım:** Ticari + ticari olmayan, atıf zorunluluğu olmadan serbest. Kopyalama,
  değiştirme, dağıtma ve bundle etme serbesttir.

## Bundle Politikası

Görseller offline kullanım için repoya gömülüdür (dış link / CDN / runtime fetch YOK).
Her hareket klasöründe iki kare bulunur:

- `start.jpg` — hareketin başlangıç pozu (kaynak repodaki `0.jpg`)
- `end.jpg`   — hareketin bitiş pozu (kaynak repodaki `1.jpg`)

## Klasör → Kaynak Hareket Eşlemesi

| Yerel klasör (`public/exercises/<id>/`) | free-exercise-db klasörü        |
|-----------------------------------------|---------------------------------|
| `squat`                                 | `Bodyweight_Squat`              |
| `pushup`                                | `Pushups`                       |
| `shoulderPress`                         | `Dumbbell_Shoulder_Press`       |
| `lateralRaise`                          | `Side_Lateral_Raise`            |
| `hammerCurl`                            | `Hammer_Curls`                  |
| `plank`                                 | `Plank`                         |
| `jumpingJack`                           | `Star_Jump`                     |
| `lunge`                                 | `Bodyweight_Walking_Lunge`      |
| `kneeRaise`                             | `Step-up_with_Knee_Raise`       |
| `glute-bridge`                          | `Single_Leg_Glute_Bridge`       |
| `mountain-climber`                      | `Mountain_Climbers`             |
| `leg-raise`                             | `Flat_Bench_Lying_Leg_Raise`    |
| `dips`                                  | `Bench_Dips`                    |
| `inverted-row`                          | `Inverted_Row`                  |
| `calf-raise`                            | `Standing_Calf_Raises`          |
| `arm-circles`                           | `Arm_Circles`                   |
| `lunge` (yenilendi 2026-06-13)          | `Split_Squats`                  |
| `kneeRaise` (yenilendi 2026-06-13)      | `Fast_Skipping`                 |
| `high-knees` (yeni 2026-06-13)          | `Single-Cone_Sprint_Drill`      |
| `hollow-hold` (yeni 2026-06-13)         | `Scissor_Kick`                  |
| `leg-swings` (yeni 2026-06-13)          | `Front_Leg_Raises`              |

## Foto-Boşluk Doldurma — 2026-06-13

Eksik/placeholder'a düşen ve owner'ın "zayıf/dağınık" dediği hareketlere bundle'lı,
telif-temiz gerçek görsel eklendi. Kaynak yine **free-exercise-db (The Unlicense)** —
mevcut setle aynı stüdyo/foto stili (görsel tutarlılık korundu). Dış link YOK.

| Yerel klasör  | İşlem      | free-exercise-db kaynağı   | Not (doğruluk) |
|---------------|------------|----------------------------|----------------|
| `lunge`       | yenilendi  | `Split_Squats`             | Dağınık makine arka planlı eski görsel → temiz mat/pencere yan profil split-squat/lunge. |
| `kneeRaise`   | yenilendi  | `Fast_Skipping`            | Karanlık/dağınık eski görsel → temiz yan profil, diz kalça hizasına kalkmış (standing knee raise). |
| `high-knees`  | yeni       | `Single-Cone_Sprint_Drill` | Eskiden kneeRaise fotosunu ödünç alıyordu → artık KENDİ dinamik koşu-diz görseli (ID ezme ile ruleSetRef'ten bağımsız çözülür). |
| `hollow-hold` | yeni       | `Scissor_Kick`             | Sırtüstü, bacaklar yerden, bel sabit core-hold pozu — hollow hold'un en yakın db karşılığı. |
| `leg-swings`  | yeni       | `Front_Leg_Raises`         | Ayakta, sandalyeye tutunarak bacağı öne-arkaya salla — leg swing hareketinin doğrudan karşılığı. |

> **pike-pushup geri alındı (2026-06-13):** İlk eklenen `Handstand_Push-Ups` görseli
> yanlış hareketti — ayaklar yerde / kalça yukarı ters-V olan zemin pike push-up DEĞİL,
> tam ters durarak yapılan handstand push-up. Yanıltıcı olduğu için klasör silindi ve
> eşleme kaldırıldı; pike-pushup artık nötr placeholder gösterir. Doğru zemin-pike
> görseli bulunduğunda yeniden eklenecek.

Bundle politikası: yeni görseller de offline, repoya gömülü (runtime fetch YOK).
Tüm görseller 850x567 px, JPEG, her biri ~38-56 KB.

Tüm görseller ~850x567 px, JPEG, toplam ~1.6 MB.

## Unlicense Tam Metni

This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or distribute this
software, either in source code form or as a compiled binary, for any purpose,
commercial or non-commercial, and by any means.

For more information, please refer to <https://unlicense.org>
