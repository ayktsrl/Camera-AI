# FormCoach

Kamera üzerinden egzersiz formu analiz eden, tekrar sayan ve Türkçe sesli koçluk yapan AI fitness uygulaması. Tamamen tarayıcıda çalışır — görüntü hiçbir sunucuya gönderilmez, model ve wasm dosyaları self-host edildiği için ilk yüklemeden sonra offline çalışır.

v0.1 tek egzersiz içerir: **Squat**. Mimari, yeni egzersizlerin veri olarak tanımlanmasına hazırdır.

## Özellikler

- **Canlı poz takibi** — MediaPipe PoseLandmarker (lite model, self-host), çoklu kişi takibi (centroid eşleştirme + ID atama + confirm/missing frame debounce)
- **Aktif kullanıcı kilidi** — birden çok kişi görünürse en büyük bounding box'lı onaylanmış kişi kilitlenir; diğer iskeletler soluk çizilir, analiz yalnız aktif kullanıcı üzerinden yapılır
- **Tekrar sayma durum makinesi** — ayakta → iniş → dip → çıkış → ayakta döngüsü tamamlanınca +1; faz geçişlerinde confirm-frames debounce, yarım tekrar sayılmaz
- **Form analizi** — diz açısı (kalça-diz-ayak bileği) ve gövde eğimi (omuz-kalça hattının dikeyle açısı); yetersiz derinlikte "Biraz daha derine in", aşırı eğimde "Sırtını dik tut"
- **Türkçe sesli koçluk** — Web Speech API; her tekrarda sayı söylenir, form uyarıları seslendirilir (uyarı başına 4 sn cooldown), tekrarlar arası süre uzayınca motivasyon
- **Set özeti** — toplam / temiz / hatalı tekrar

## Kurulum

```bash
npm install
npm run dev      # geliştirme (http://localhost:5173)
npm run build    # production build → dist/
npm run preview  # build'i lokal sun
npm run lint     # eslint
```

Gereksinim: Node 18+, webcam'li bir cihaz ve kamera izni. Ses için tarayıcıda Türkçe TTS sesi önerilir (macOS/iOS Safari ve Chrome'da hazır gelir).

## Kullanım

1. Uygulamayı açın, kamera iznini verin.
2. Kameranın karşısına tüm vücudunuz (kalça-diz-ayak bileği) görünecek şekilde geçin.
3. **Başlat**'a basın ve squat yapmaya başlayın. Sayaç sahnenin üzerinde büyür; faz göstergesi panelde ilerler.
4. **Seti bitir** ile set özetini görün. Sağ alttaki düğmeyle sesi açıp kapatabilirsiniz.

## Mimari

```
src/
  App.jsx                  UI kabuğu (sahne + panel)
  hooks/
    usePoseTracking.js     webcam + PoseLandmarker + takip + aktif kullanıcı kilidi + çizim
    useRepCounter.js       repEngine'i React'e bağlar (faz, sayaç, uyarı)
  lib/
    angles.js              eklem açısı / dikey eğim yardımcıları
    repEngine.js           saf tekrar sayma durum makinesi (React'siz, test edilebilir)
    speech.js              Türkçe sesli koç (cooldown'lu)
    tracking.js            çoklu kişi takibi (updateTracks) + selectActiveTrack
    drawing.js             iskelet + bounding box çizimi (aktif/soluk)
    pose.js                landmark sabitleri, güvenilirlik, bbox
    vision_bundle.mjs      vendored MediaPipe tasks-vision
  exercises/
    index.js               egzersiz kayıt defteri
    squat.js               squat tanımı (eşikler + kurallar + metrik fonksiyonu)
public/
  mediapipe/wasm/          self-host wasm
  models/pose_landmarker_lite.task
```

### Yeni egzersiz eklemek

1. `src/exercises/squat.js`'i şablon alarak yeni bir tanım dosyası yazın: faz eşikleri, `attemptBelow`, form kuralları ve landmark'lardan metrik üreten saf `computeMetrics`.
2. Dosyayı `src/exercises/index.js`'teki `EXERCISES` listesine ekleyin. UI seçimi ve motor otomatik beslenir.

## Bilinen sınırlamalar (v0.1)

- Açı hesapları 2D'dir (normalize ekran koordinatları); kameraya tam yandan veya 45° açıyla durmak en iyi sonucu verir.
- Gövde eğimi eşiği sabittir (45°); kişiselleştirme yoktur.
- Tek webcam; arka/ön kamera seçimi ve harici kamera konfigürasyonu yoktur.
- Sesli koçluk tarayıcının TTS ses setine bağlıdır; Türkçe ses yoksa varsayılan sesle okunur.
