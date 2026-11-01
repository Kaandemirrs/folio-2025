# Performans ve boyut raporu

Branch: `budama`. Ölçümler `scripts/perf/measure.mjs` ile yapıldı: production build, headless Chrome 156 (WebGPU, macOS GPU), landing spawn'ında hareketsiz araç, açık hava, gün ortası. Sayılar `renderer.info`'dan okunur (projenin `#stats` paneliyle aynı kaynak) ve gölge geçişini de içerir.

**Sınırlar:** Ölçüm masaüstü GPU'sunda yapıldı. Kare süresi 16,67 ms'de (vsync) takıldığı için gerçek telefon FPS'i hakkında bilgi vermez; burada güvenilir olan şey iş yükü sayılarıdır (çizim çağrısı, üçgen, piksel). Gerçek telefon testi için aşağıdaki "Telefonda ölçüm" bölümüne bak.

## 1. Çizim iş yükü (önce → sonra)

| Profil / kalite | Çizim çağrısı | Üçgen | Geometri / texture | Piksel oranı · canvas | Çim bıçağı |
|---|---|---|---|---|---|
| Masaüstü 1280×720 — **high** | 202 → 204 | 415.297 → 415.417 | 233 / 73 (aynı) | 1 · 1280×720 (aynı) | 78.400 (aynı) |
| Masaüstü 1280×720 — **low** | 202 → **198** | 415.356 → **355.668** (−%14) | 233 / 73 (aynı) | 1 · 1280×720 | 78.400 → **25.600** (−%67) |
| Telefon 390×844 @3x — **otomatik (UA = low)** | 146 → **143** | 407.521 → **347.893** (−%15) | 92 → 94 / 34 → 33 | **2 → 1,5** · 780×1688 → **585×1266** (−%44 piksel) | 78.400 → **25.600** |
| Telefon — high (elle) | 146 → 143 | 407.462 → 406.778 | 92 / 37 | 2 · 780×1688 | 78.400 |

Önceki durumda high ve low arasında neredeyse **hiç fark yoktu** (aynı üçgen, aynı çözünürlük). Fark artık çim, piksel oranı ve parçacıklarda.

**Üçgen dağılımı (sahnede görünür mesh'ler, ≈265 bin; ölçüm gölge geçişini de sayar):** çim 78.400 (%30), dört ağaç türünün yaprak kartları ≈88.000 (156 + 144 + 130 + 120 örnek, hepsi gölge atıyor), kalan dekor ve araç. Çim dışında en büyük kalem yaprak kartlarının gölgeye girmesi; bu bu işte değiştirilmedi (açık karar, aşağıda).

Hava durumu etkisi: yağmur/kar/yaprak ölçüm sırasında kapalı (açık hava zorlandı). Kar yağarken `Snow.js` ek ≈131 bin üçgen çizer (256² ızgara), low'da 160² (≈51 bin).

## 2. Yükleme ve dist boyutu

| | Önce | Sonra |
|---|---:|---:|
| `dist/` (Faz 1 sonu, 4 yeni MP3'ten önce) | 59 MB | — |
| `dist/` (W140 + 4 yeni MP3 sonrası) | **82 MB** | — |
| `dist/` şimdi | 79 MB (silinen dosyalar sonrası) | **56 MB** |
| Başlamadan önce indirilen (tıklama ekranına kadar) | 6.195 KB | **4.924 KB** (−1,3 MB) |
| Başladıktan sonra 6 sn içinde | 7.903 KB (müzik 6,8 MB + efektler) | 9.183 KB (ertelenen 1,3 MB buraya kaydı) |
| JS paketi | 4,65 MB (başta) → 3,29 MB (node-polyfills + gereksiz paketler gidince) | **3,12 MB** (Tweakpane production'da girmiyor) |

**59 → 82 MB'ın nedeni:** `static/sounds/musics/` altına eklenen 4 MP3 (23,8 MB; 192 kbps, 44,1 kHz stereo). Eski üç parça (`Sudo`, `Boy`, `Baguira`; 18,0 MB, 320 kbps) çalma listesinde olmadığı hâlde dist'te duruyor. Müzik şimdi dist'in 44 MB'ı.

**Müzik (dosyalara dokunulmadı; karar bekliyor):**

| Dosya | Boyut | Süre | Bitrate | 160 kbps | 128 kbps |
|---|---:|---:|---:|---:|---:|
| Kullenen-Ask-1986 | 6.809 KB | 289 sn | 192 kbps | 5.651 KB | 4.521 KB |
| Sevda-Yuklu-Kervanlar | 5.893 KB | 250 sn | 192 kbps | 4.882 KB | 3.906 KB |
| Cimilli-Ibo-Oyna | 6.110 KB | 259 sn | 192 kbps | 5.055 KB | 4.045 KB |
| NazlicanIM | 5.552 KB | 234 sn | 192 kbps | 4.565 KB | 3.652 KB |
| **Toplam (4 parça)** | **23,8 MB** | | | **19,7 MB (−4,1)** | **15,7 MB (−8,1)** |
| Sudo / Boy / Baguira (çalma listesinde yok) | 18,0 MB | | 320 kbps | silinirse **−18,0 MB** | |

Hiçbiri 192 kbps'in üstünde değil, bu yüzden dönüştürme zorunlu değil; 128 kbps stereo mobil için yeterli ve ilk tıklamadaki 6,8 MB'lık müzik indirmesini 4,5 MB'a indirir. Kapak resmi (≈0,2 MB toplam) dosyalarda gömülü.

**dist budama (`scripts/prune-dist.mjs`, `npm run build` sonrası otomatik):** `VITE_COMPRESSED=1` iken `.ktx`/`.webp` karşılığı olan kaynak PNG'leri ve `-compressed.glb` karşılığı olan ham GLB'leri siler (Konami'nin ham yüklediği `oldSchool.glb` / `w140.glb` hariç): 97 dosya, 22,9 MB. `VITE_COMPRESSED` boşsa hiçbir şey silmez. Harita görselleri zaten `map-day.webp` / `map-night.webp` (106 KB) olarak yükleniyor; 1,6 MB'lık PNG'ler hiç istenmiyordu, yalnızca dist'i şişiriyordu.

**İlk yükleme (tıklama ekranına kadar, 4,9 MB):** JS/wasm 2,4 MB (Rapier wasm 1,66 MB, JS 0,67 MB), `areas-compressed.glb` 0,62 MB, Basis transcoder 0,52 MB, terrain 0,34 MB, Draco 0,29 MB, diğer GLB/KTX ve ses efektlerinin ilk grubu. Müzik `preload: false` (`Audio.js`); ilk parça tıklamadan sonra indirilir.

## 3. Değişen ayarlar ve yerleri

| Ayar | High | Low (mobil) | Yer | Kalite değişince |
|---|---|---|---|---|
| Çim bıçağı | 280² = 78.400 | **160² = 25.600**; bıçak genişliği ×1,75, boyu ×1,32 | `World/Grass.js` (`bladeScaleFor`, `applyQuality`) | **Anında** (geometri yeniden kurulur) |
| Piksel oranı üst sınırı | 2 | **1,5** | `Viewport.js` (`pixelRatioMax`) | **Anında** |
| Yağmur çizgisi | 2.048 | **1.024** | `World/RainLines.js` (drawRange) | **Anında** |
| Yaprak sayısı | mevsime göre 128–2.048 | **yarısı** | `World/Leaves.js` (`mesh.count`) | **Anında** |
| Antialias | piksel oranı < 2 ise açık | **kapalı** | `Rendering.js` (`setRenderer`) | **Sayfa yenilemesi** |
| Konfeti havuzu | 500 | **250** | `World/Confetti.js` | Sayfa yenilemesi |
| Şimşek parçacığı | 32 + 128 | **16 + 64** | `World/Lightnings.js` | Sayfa yenilemesi |
| Kar ızgarası | 256² | **160²** (daha az, daha büyük tane) | `World/Snow.js` | Sayfa yenilemesi |
| Gölge haritası / yarıçap | 2048 / 3 | 512 / 2 | `Ligthing.js` (**zaten bağlıydı**, yarıçap yenileme ister) | Harita anında |
| Bloom mip | 5 | 2 | `Rendering.js` (**zaten bağlıydı**) | Yenileme |
| DOF, su bulanıklığı | açık | kapalı | `Rendering.js`, `WaterSurface.js` (**zaten bağlıydı**) | Anında |

Çalışma anında değişmeyenler (antialias, konfeti, şimşek, kar), yalnızca oyun düşük kalitede **başlarsa** düşük değerle kurulur. Telefon zaten low başlar. Masaüstünde Ayarlar'dan high → low yapınca bu dördü eski değerinde kalır.

`Quality.pick(yüksek, düşük)` yardımcı fonksiyonu eklendi (`Quality.js`).

**Mobil tespiti (`Quality.detectMobile`)**, yeni kurallar: user-agent (Mobi/Android/iPhone/iPad/iPod) **veya** iPadOS (`navigator.platform === 'MacIntel'` + çoklu dokunma) **veya** dokunmatik birincil girdi (`pointer: coarse` + `hover: none`) ile kısa ekran kenarı ≤ 820 px. Dört senaryoyla sınandı: masaüstü → high; iPadOS → low; masaüstü UA + dokunmatik + 800×1280 → low; dokunmatik Windows dizüstü 1920×1080 → high.

## 4. Diğer değişiklikler (bu branch)

- Respawn: kaldırılan 7 alanın, OnlyFans ve test noktasının respawn'ları filtrelendi (`Respawns.js`, GLB değişmedi).
- Silinenler: `static/vehicle/default*.glb`, `defaultAntenna*.glb`, `static/christmas/`, `static/draco/gltf/`, 22 kullanılmayan ses efekti (0,9 MB).
- Bağımlılıklar: `msgpack-lite`, `stats-gl`, `uuid`, `emoji-regex`, `vite-plugin-restart`, `vite-plugin-node-polyfills`, `@gltf-transform/core|extensions|functions` kaldırıldı; `ktx-parse`, `opentype.js`, `puppeteer-core` eklendi. `.npmrc` (legacy-peer-deps) artık gereksiz: lock'suz temiz kurulum çatışmasız geçti. **Uyarı:** lock'suz kurulum `@swc/core` 1.16'yı çekip `vite-plugin-top-level-await` ile build'i kırıyor; mevcut lock (swc 1.13.5) korunmalı.
- `#debug`, `#stats`, `#inspector`, `#skip` yalnızca `npm run dev` veya `VITE_DEBUG=1` ile çalışır; "debug" başarımı silindi (başarım sayısı 24).
- Intro etiketleri Türkçe (`scripts/intro/make_intro_labels.mjs`).

## 5. Telefonda ölçüm (gerçek cihaz)

1. Build'i HTTPS ile servis et (WebGPU güvenli bağlam ister): Cloudflare önizlemesi veya `npm run build && npx vite preview --host` ile aynı Wi-Fi'da. LAN üzerinden HTTP'de WebGPU çalışmaz; `vite.config.js` içindeki `basicSsl()` satırını açarak test edebilirsin.
2. Build'de `VITE_DEBUG=1 VITE_GAME_PUBLIC=1` tanımlı olmalı (geçici bir test build'i; yayına bunu koyma).
3. iPhone: Safari → Ayarlar → Gelişmiş → Web Denetçisi, Mac Safari → Geliştir menüsünden telefonu seç. Android: Chrome → `chrome://inspect`.
4. Konsolda: `game.quality.level` (telefonda 1 olmalı), `game.rendering.renderer.info.render` (`drawCalls`, `triangles`), `game.rendering.renderer.getPixelRatio()` (1,5).
5. FPS için adres çubuğuna `#stats` eklemek yalnızca çizim sayılarını gösterir; kare süresi için Safari/Chrome performans kaydı al (10 sn sür, kaydı durdur, ortalama kare süresine bak).
6. Aynı ölçümü Ayarlar'dan Kalite = Yüksek ve Düşük için tekrarla.

## 6. Açık kararlar

1. **Müzik:** 128 kbps'e (−8 MB) veya 160 kbps'e (−4 MB) çevirelim mi? Eski `Sudo`/`Boy`/`Baguira` (−18 MB) silinsin mi?
2. **Yaprak kartlarının gölgesi:** Low'da ağaç yapraklarının gölge atmasını kapatmak ≈88 bin üçgeni (gölge geçişinde) kaldırır ama ağaç gölgeleri sadeleşir. Görsel kalite kararı, uygulanmadı.
3. **İlk müzik indirmesi:** Tıklamadan sonra 6,8 MB'lık ilk parça iniyor. İlk parçayı 3–5 sn geciktirmek veya düşük bitrate kullanmak mobil veride fark eder.
4. **Kare süresi:** Gerçek telefonda FPS ölçülmedi; low değerleri (çim 160², piksel 1,5) cihaz denemesine göre ayarlanabilir.
