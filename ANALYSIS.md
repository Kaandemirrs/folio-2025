# folio-2025 Analiz Raporu

**Yöntem:** Kod, `static/` içeriği ve GLB JSON başlıkları salt okunur incelendi. `.blend` dosyalarında yalnızca metin taraması yapıldı (`strings`), çünkü bu makinede Blender yok. Build, repo dışındaki bir kopyada çalıştırıldı.

**Doğrulanmayanlar:**
- Uygulama tarayıcıda açılmadı. **[çalıştırılmadı]** etiketli maddeler koddan okunan beklenen davranışlardır.
- Blender sahnesi açılmadı. Koleksiyon adları görüldü, ancak içerikleri ve export preset'leri incelenmedi.
- `.env` yok. Build de `.env` olmadan yapıldı.

---

## 1. Genel mimari

### `sources/` klasörleri

| Klasör | Görev |
|---|---|
| `sources/index.html` | Tüm DOM: menü, modallar, metinlerin çoğu, meta etiketleri |
| `sources/index.js` | Giriş noktası; konsol logu ve `new Game()` |
| `sources/threejs-override.js` | `THREE.Object3D.prototype.copy` override'ı |
| `sources/data/` | İçerik verisi: `projects`, `lab`, `social`, `achievements`, `countries`, `consoleLog` |
| `sources/style/` | Stylus stilleri, giriş `index.styl` (21 dosya) |
| `sources/Game/` | Motor sınıfları: `Game`, `View`, `Player`, `Audio`, `Server`, `Quality`, `Rendering` vb. |
| `sources/Game/World/` | Görsel dünya: çim, zemin, su, ağaç, hava efektleri, görsel araç |
| `sources/Game/World/Areas/` | Dünyadaki alanlar; `Area` temel sınıfı, `Areas` kayıt listesi |
| `sources/Game/Physics/` | Rapier sarmalayıcı, araç fiziği, wireframe |
| `sources/Game/Inputs/` | Klavye, gamepad, pointer, tekerlek, dokunmatik joystick, buton yönetimi |
| `sources/Game/Cycles/` | Gün ve yıl döngüleri |
| `sources/Game/Materials/`, `Geometries/`, `Passes/`, `utilities/` | Materyal, geometri, DOF pass'i, yardımcılar |
| `sources/Game/BlackFriday/` | Eski etkinlik kodu. Hiçbir yerden import edilmiyor |

**Kullanılmayan kod:**
- `Easter.js`, `BlackFriday/` ve `Monitoring.js` çalışmıyor (`Game.js:15` ve `:198` yorum satırı).
- `EasterArea` import ediliyor ama listede yok (`Areas.js:15`, `:24-38`).
- `playgroundVisual` ve `playgroundPhysical` yükleniyor (`Game.js:137-138`), ancak kodda başka kullanımları yok.

### Sınıf ağacı

Tümü `Game` singleton'ı üzerinden birbirine erişir (`Game.getInstance()`). Sıra `Game.js:78-200` ile aynıdır.

```text
Game
├─ Debug
├─ ResourcesLoader
├─ Quality
├─ Server
├─ Ticker
├─ Time
├─ DayCycles, YearCycles (extends Cycles)
├─ Inputs
│  └─ Keyboard, Gamepad, Pointer, Wheel, InteractiveButtons, Nipple
├─ Audio
├─ Notifications
├─ RayCursor
├─ Viewport
├─ Modals → Tabs
├─ Menu → Tabs
├─ Rendering (setRenderer, sonra setPostprocessing)
├─ Options, Respawns, View, Reveal, Noises, Weather, Wind, Tracks
├─ Lighting, Fog, Water, Materials, Objects, Explosions
├─ World
│  ├─ step(0): Grid, Intro
│  ├─ step(1): VisualVehicle → Trails
│  │           Floor, WaterSurface, Grass, WindLines, Confetti, Leaves,
│  │           RainLines, Lightnings, Fireballs, Snow, VisualTornado,
│  │           Bushes → Foliage, Trees ×3 → Foliage, Flowers,
│  │           Bricks, Fences, Benches, ExplosiveCrates, PoleLights, Lanterns,
│  │           Scenery → References
│  │           Areas → Area alt sınıfları → References, InstancedGroup, TextCanvas, InputFlag
│  └─ step(2): Whispers → Bubble, InputFlag   (Reveal.js:216 çağırır)
├─ Terrain, Physics, PhysicsWireframe, PhysicsVehicle, Zones, Player
├─ ClosingManager, InteractivePoints, KonamiCode, Achievements
└─ Tornado, Map, Title, Overlay, PreRenderer (statik)
```

### Tick döngüsü

**Tetikleyici:** `Rendering.js:68` içindeki `renderer.setAnimationLoop(...)` her karede `Ticker.update()` çağırır. `Ticker.js:65` de `tick` olayını yayar.

**Sıralama:** `Events.on(name, cb, order)` (`Events.js:8`). Küçük `order` önce çalışır, aynı `order` içinde kayıt sırası geçerlidir. Varsayılan değer 1'dir.

| Sıra | Dinleyiciler |
|---|---|
| 0 | `Inputs/Inputs.js:55`, `Time.js:19` |
| 1 | `Player.js:44` (pre-physics), `World/Scenery.js:39` |
| 2 | `Physics/PhysicsVehicle.js:77` (pre-physics) |
| 3 | `Physics/Physics.js:59` |
| 4 | `Objects.js:13`, `Physics/PhysicsWireframe.js:22` |
| 5 | `Physics/PhysicsVehicle.js:81` (post-physics) |
| 6 | `Player.js:49` (post-physics) |
| 7 | `View.js:66` |
| 8 | `Cycles/Cycles.js:59`, `Weather.js:128`, `World/Intro.js:20`, `World/VisualVehicle.js:34`, `Zones.js:13` |
| 9 | `InteractivePoints.js:40`, `Ligthing.js:43`, `Tornado.js:34`, `Tracks.js:38`, `Wind.js:45` |
| 10 | `Fog`, `Reveal`, `Terrain`, `Trails`, `World/Areas/Area.js:22`, `Benches`, `Bricks`, `ExplosiveCrates`, `Fences`, `Floor`, `Foliage`, `Grass`, `Lanterns`, `Leaves`, `Lightnings`, `RainLines`, `Snow`, `VisualTornado`, `WaterSurface`, `Whispers` |
| 13 | `InstancedGroup.js:19` |
| 14 | `Audio.js:20`, `Map.js:34`, `Notifications.js:22`, `Title.js:18` |
| 998 | `Rendering.js:27` |

Readme'deki liste (`readme.md`) bununla büyük ölçüde uyumlu, ancak 999'daki `Monitoring` kapalı ve `Scenery` listede yok.

### Kod boyutu

`sources/` toplamı **33.088 satır** (126 JS, 21 Stylus, 1 HTML).

| # | Dosya | Satır |
|---|---|---:|
| 1 | `sources/Game/World/Areas/CircuitArea.js` | 1690 |
| 2 | `sources/Game/World/Areas/ProjectsArea.js` | 1555 |
| 3 | `sources/Game/World/Areas/LabArea.js` | 1458 |
| 4 | `sources/index.html` | 890 |
| 5 | `sources/Game/View.js` | 788 |
| 6 | `sources/Game/Audio.js` | 769 |
| 7 | `sources/Game/Player.js` | 676 |
| 8 | `sources/Game/InteractivePoints.js` | 663 |
| 9 | `sources/Game/World/Areas/BowlingArea.js` | 644 |
| 10 | `sources/Game/Achievements.js` | 630 |

---

## 2. İçerik nerede

**Özet:** Veri tek bir config dosyasında değil, üç yere dağılmış durumda:
1. `sources/data/*.js`: yapılandırılmış veri
2. `sources/index.html` ve sınıfların içi: sabit metinler
3. Görseller ve GLB'ler: metnin piksel veya mesh olarak gömülü olduğu yerler

### Metin ve veri haritası

| İçerik | Yer | Nasıl tanımlı |
|---|---|---|
| Projeler | `sources/data/projects.js` | 8 aktif kayıt, 1 yorum satırı (`:21-38`). Alanlar: `title`, `titleSmall`, `url`, `attributes.{role,at,with}`, `distinctions`, `images` |
| Lab | `sources/data/lab.js` | 13 kayıt. Alanlar: `title`, `url`, `image`, `imageMini` |
| Sosyal linkler | `sources/data/social.js:2-9` | `name`, `url` veya `modal`, `align`. Kullanım: `SocialArea.js:39-57` |
| Hakkımda | `sources/index.html:227-231` | Sabit HTML |
| Kariyer metinleri | `static/career/*.png` ve `.ktx` (6 adet) | **Metin görselin içinde.** `Game.js:166-171` ile yüklenir |
| Kariyer zaman çizelgesi | `areas.glb`, `career/refLine*` userData | `size`, `hasEnd`, `color`, `texture`. Başlangıç yılı kodda: `CareerArea.js:158` (2008) |
| Discord modalı | `sources/index.html:819-860` | Linkler `:838`, `:851` |
| Devre sonu modalı | `sources/index.html:745-816` | Sabit HTML |
| Behind the scene | `sources/index.html:682-731` | Kişisel ifadeler ve kaynak linkleri |
| Menü, kontroller, seçenekler | `sources/index.html:102-733` | Sabit HTML |
| Başarımlar | `sources/data/achievements.js` | 38 kayıt; başlık ve açıklama |
| Harita etiketleri | `sources/Game/Map.js:43-56` | Kod içinde |
| 3D etkileşim etiketleri | Alan sınıfları | `'Projects'`, `'Lab'`, `'Map'`, `'Controls'`, `'Res(e)t'`, `'OnlyFans'` (`SocialArea.js:176`), `'Accept cookie'`, `'Start race!'`, `'Change song'` vb. |
| Sunucu ve seçenek metinleri | `Options.js:76-103`, `Server.js:63-90` | Kod içinde |
| Müzik bildirimi | `Audio.js:220` | Dosya adını gösterir (`Audio.js:150-163`) |
| Whisper varsayılan metni | `Whispers.js:343`, `index.html:213` | `Your message here` |
| Varsayılan bayrak | `index.html:646`, `:771` | `ui/flags/fr.webp` |
| Sekme başlığı | `sources/Game/Title.js:88` | `'Bruno' + ...` |
| Konsol çıktısı | `sources/data/consoleLog.js` | ASCII `BRUNO'S PORTFOLIO` ve kişisel linkler (`:24-32`, `:58-72`) |
| Harici link | `TimeMachineArea.js:27` | `https://2019.bruno-simon.com` |
| SEO ve paylaşım | `sources/index.html:6-24`, `:36` | Başlık, açıklama, OG ve Twitter |
| Favicon, manifest | `static/favicons/` | Görsel ve `site.webmanifest` |
| Analytics | `sources/index.html:45`, `:51` | Bkz. Bölüm 5 |
| Giriş ekranı metni | `static/intro/*Label.png` ve `.ktx` | Metin görselde (`Intro.js:153`) |

### 3D sahneye gömülü içerikler

`static/areas/areas.glb` içindeki gömülü görseller: `palette`, `stylized-map`, `blackboardLabels`, `projectsCarpet`, `projectsLabels`, `labCarpet`, `cookieBanner`, `bowlingLabelStrike`, `circuitLogoWebgl`, `circuitLogoWebgpu`, `circuitBrand`, `circuitAirDancerFace`, `circuitLogoThreejs`.

Aynı adlı kaynak PNG'ler `resources/textures/` altında bulunur.

Blender gerektiren diğer kişisel öğeler:
- **Landing:** 10 fiziksel harf (`refLettersPhysicalDynamic.*`)
- **Social:** Marka objeleri (`xPhysicalDynamic`, `youtubePhysicalDynamic` vb.), `refStatuePhysicalDynamic` ve `sudo`, `boy`, `baguira` objeleri
- **Proje alanı:** `refDistinctions` altında `awwwards`, `fwa`, `cssda` (`ProjectsArea.js:1047-1049`)

`social.js` listesinden link silmek, GLB'deki fiziksel ikonları silmez. Etkileşim noktaları ikonlardan bağımsız olarak yarım daireye dizilir (`SocialArea.js:41-45`).

### Görseller

| Klasör | Format | Boyut (örneklenen) | Adet | Toplam |
|---|---|---|---|---:|
| `static/projects/images/` | PNG + KTX2 çifti | 960×540 | 31 çift | 14 MB |
| `static/lab/images/` | PNG + KTX2 çifti | 960×540; `-mini` 240×136 | 28 çift | 8,3 MB |

**Önemli:** Veri dosyaları `.ktx` adını belirtir ve kod `textureKtx` yükleyicisini sabit kullanır (`ProjectsArea.js:482`, `LabArea.js:457-470`). `VITE_COMPRESSED` bunu değiştirmez. Yani yeni görsel eklemek için `toktx` gerekir (Bölüm 4).

### Değiştirilecek dosyalar

**Yalnızca metin ve görsel (Blender'sız):**
1. `sources/data/projects.js`, `lab.js`, `social.js`, `achievements.js`, `consoleLog.js`
2. `sources/index.html`: `:6-24`, `:36`, `:45-51`, `:227-231`, `:646`, `:682-731`, `:771`, `:819-860`
3. `sources/Game/Title.js:88`
4. `sources/Game/World/Areas/TimeMachineArea.js:27`
5. `sources/Game/Map.js:43-56` (alan adları değişirse)
6. `sources/Game/Audio.js:150-163` (müzik değişirse)
7. `static/projects/images/`, `static/lab/images/`
8. `static/career/*.png` ve `.ktx`
9. `static/favicons/`, `static/social/share-image.png`
10. `static/ui/previews/`, `static/ui/map/` (görseller değişirse)
11. `package.json`, `readme.md` (ad ve açıklama; `license.md` için Bölüm 8)

**Blender gerektirenler:**
- `resources/folio-2025.blend` → `static/areas/areas.glb`: harfler, heykel, ikonlar, etiket dokuları, kariyer satır sayısı
- Kariyer satırı eklenecekse ayrıca `Game.js:166-171` (yeni texture kaydı)

---

## 3. Dünya / Harita

### Alan tanımı

`Areas.js:24-38` içindeki `[ad, sınıf]` listesi, `areas.glb` kök düğümleriyle `child.name.startsWith(name)` üzerinden eşleşir (`Areas.js:41-47`). `Area` temel sınıfı alt düğümleri otomatik olarak görsel ve fizik objesine çevirir (`Area.js:32-70`). `ref*` adlı düğümler referans olarak okunur. `refZoneBounding` giriş/çıkış olayını, `refZoneFrustum` görünürlük testini belirler (`Area.js:72-176`).

Yeni bir alan için **Blender tarafı ile kod tarafının ad üzerinden eşleşmesi** gerekir.

Blender kaynağı olarak `resources/folio-2025.blend` (16 MB) kullanılıyor. `areas` ve aşağıdaki alanların koleksiyon adları dosyada görüldü; koleksiyon hiyerarşisi doğrulanmadı.

| Alan | Sınıf (`sources/Game/World/Areas/`) | Satır | GLB konumu (x, z) | İçerik | Sunucu |
|---|---|---:|---|---|---|
| `landing` | `LandingArea.js` | 272 | 49, 39 | Harfler, kiosk, kontroller, ateş, reset. Varsayılan spawn | Hayır |
| `projects` | `ProjectsArea.js` | 1555 | 36, 13 | Proje galerisi, örs/fırın | Hayır |
| `lab` | `LabArea.js` | 1458 | 13, 18 | Lab galerisi, kazan | Hayır |
| `career` | `CareerArea.js` | 375 | 26, −1 | Kariyer çizelgesi | Hayır |
| `social` | `SocialArea.js` | 317 | 29, −22 | Linkler, hayranlar, heykel, OnlyFans şakası | Hayır |
| `cookie` | `CookieArea.js` | 528 | 12, 35 | Çerez şakası | Sayaç için |
| `altar` | `AltarArea.js` | 516 | 75, −28 | Fedakârlık ve kıyamet sayacı | Evet |
| `toilet` | `ToiletArea.js` | 54 | 67, 67 | Kabin | Hayır |
| `bowling` | `BowlingArea.js` | 644 | 2, 69 | Bowling, jukebox | Hayır |
| `circuit` | `CircuitArea.js` | 1690 | −18, 7 | Yarış, skor tablosu | Skor için |
| `behindTheScene` | `BehindTheSceneArea.js` | 167 | 53, −12 | Portal, menü açar | Hayır |
| `achievements` | `AchievementsArea.js` | 348 | 71, 10 | Başarım sütunu, şelale | Hayır |
| `timeMachine` | `TimeMachineArea.js` | 117 | −55, −67 | Eski siteye link, TV | Hayır |

`areas.glb` kökünde ayrıca `cuboid.082-086` düğümleri var. Hiçbir alanla eşleşmedikleri için oluşturulmuyorlar.

### Alanı tamamen kaldırmak

**A. Kod tarafı (hızlı):**
1. `Areas.js`: listeden çıkarın. Objeler `Area` içinde oluşturulduğu için görsel ve fizik de oluşmaz **[çalıştırılmadı]**.
2. `sources/data/achievements.js`: alanın başarımlarını silin ve `:16` satırındaki `13` değerini azaltın. Aksi halde `Traveler` başarımı tamamlanamaz. Her alan bunu `setProgress('areas', '<ad>')` ile artırıyor.
3. `Map.js:43-56`: konumu silin.
4. `static/ui/map/map-day` ve `map-night`: harita görseli eski alanı göstermeye devam eder.
5. Alana özel menü: `circuit` için `index.html:154-160`, `:206-208`, `:578-625`, `:745-816` ve `sources/style/circuit*.styl`.
6. `Game.js:166-173`: alanın artık kullanılmayan texture kayıtlarını silin (kariyer, TV).

**Güvenli olan bağımlılıklar:** `Game.reset()` (`Game.js:234-250`), `Audio.js:472-495`, `Menu.js:61` ve `ClosingManager.js:30-51`, `:95-97` alan varlığını kontrol ediyor. Ancak `Menu.js:5` ve `ClosingManager.js` sınıfları import ettiği için dosyaları silmeden önce importları da kaldırın.

**Kaldırmamanız önerilen alan:** `landing`. Varsayılan spawn ve kontrol akışı ona bağlı.

**B. Blender tarafı (tam temizlik):** Kod tarafı yalnızca objeleri kaldırır. Şunlar dünyada kalır:
- Terrain şekli (`static/terrain/terrain.glb`, `terrain.png`)
- Yollar ve köprüler (`static/scenery/scenery.glb`)
- Referans dosyalarından gelen ağaç, çalı, çiçek, çit, bank, tuğla, sandık, lamba ve fener konumları
- Fırtına yolu (`tornadoPathReferences`)
- Spawn noktası (`respawnsReferences.glb`; alanlar için 18 kayıt, `respawnTest` dahil)

Bunları değiştirmek için `.blend` düzenlenip GLB'ler yeniden export edilmeli.

### Haritayı küçültmek

Mümkün, ancak kod ayarı tek başına yetmez. Asıl değişiklik Blender ve terrain verisindedir.

| Ayar | Yer | Not |
|---|---|---|
| Terrain boyutu | `Terrain.js:12-13` | `subdivision = 128`, `size = 192` |
| Terrain UV ölçeği | `Terrain.js:90` | `position / subdivision / 1.5 + 0.5`. Sabit 1.5, `192/128` oranıdır |
| Terrain verisi | `static/terrain/terrain.png`, `.ktx`; `terrain.glb` | Kaynak: `resources/terrain.psd`, `resources/textures/terrainData.png` |
| Fiziksel zemin | `Floor.js:20`, `:120+` | `terrain.glb` geometrisinden yükseklik okunur; satır sayısı vertex sayısından türetilir |
| Harita sınırı davranışı | `Floor.js:176-207` | Terrain sınırı dışında `bedRock` oyuncuyu takip eder |
| Harita koordinatları | `Map.js:154-164` | `terrain.size` kullanır |
| Görsel zemin boyutu | `Floor.js:35` | **Kameraya bağlı**: `optimalArea.radius * 2 + 1`. Dünyayı küçültmek bunu değiştirmez |
| Çim alanı | `Grass.js:12-15` | **Kameraya bağlı**, araçla birlikte hareket eder |
| Kamera mesafesi | `View.js:339` | `min: 15, max: 30`. Zemin, çim ve gölge alanını doğrudan etkiler |

---

## 4. Asset pipeline

### `resources/` (149 MB, build'e girmez)

| Yol | İçerik |
|---|---|
| `folio-2025.blend`, `.blend1` | Ana sahne ve yedek |
| `models/bruno-sudo.blend`, `bruno.glb`, `sudo.glb` | Karakter modelleri |
| `textures/` | Ham dokular: `career/`, proje panoları, `terrain*.exr`, `terrainData.png`, `stylized-map.psd`, `noises.psd`, `references/` (referans görselleri) |
| `terrain.psd`, `stars.psd`, `slabs.sbs`, `palette.png` | Kaynak dosyalar |
| `sounds/` | GarageBand projeleri ve önizleme mp4'leri |
| `renders/` | Render görselleri |
| `references-inspiration.pur` | Referans panosu |

### Script'ler

`scripts/` altında tek betik var: `compress.js`. Çalıştırma: `npm run compress` → `node scripts/compress.js static/`.

| Aşama | Girdi | Çıktı | Komut |
|---|---|---|---|
| Modeller (`:9-64`) | `*.glb` (`-compressed` hariç) | `*-compressed.glb` | `gltf-transform etc1s`, sonra `draco` |
| Texture (`:70-125`) | `*.png`, `*.jpg` (`ui`, `favicons`, `social` hariç) | `*.ktx` | `toktx`, yola göre preset (`:81-97`) |
| UI (`:131-146`) | `ui/**/*.png`, `*.jpg` | `*.webp` | `sharp`, kalite 80 |

**Blender'dan yeni GLB export edince:**
1. Readme kuralları: palette texture node'unu mute edin, ilgili export preset'ini kullanın, sıkıştırma açmayın.
2. Dosyayı `static/<klasör>/<ad>.glb` olarak kaydedin.
3. `npm run compress` çalıştırın. Betik klasör yolunu argüman olarak aldığı için tek klasör de işlenebilir: `PATH="$PWD/node_modules/.bin:$PATH" node scripts/compress.js static/vehicle/` **[çalıştırılmadı]**.
4. `.env` içinde `VITE_COMPRESSED=1` olmalı. Boşsa `-compressed` dosyalar kullanılmaz (`Game.js:97-100`).

**Dikkat:**
- `toktx` (KTX-Software) npm paketi değil, ayrıca kurulmalı. Bu makinede yok. `gltf-transform` ise `@gltf-transform/cli` ile gelir ve `npm run` altında bulunur. Blender da kurulu değil.
- Betik her çalıştırmada tüm dosyaları yeniden işler ve süreçleri aynı anda başlatır (`spawn`, sıra beklemez). Toplu çalıştırmada makine zorlanabilir ve mevcut `.ktx` dosyalarının hepsi yeniden yazılır, bu yüzden `git diff` büyür.
- Draco adımı `etc1s` çıktısının üzerine aynı dosyaya yazar (`:27-28`). `etc1s` adımının çıkış kodu kontrol edilmez.

### Araç

**Model:** `static/vehicle/default.glb` ve `default-compressed.glb` (`Game.js:136`), görsel sınıf `World/VisualVehicle.js`. Klasörde `defaultAntenna` ve `oldSchool` varyantları da var. Blender'da `vehicle` koleksiyonu mevcut.

**Fizik:** `sources/Game/Physics/PhysicsVehicle.js`

| Parametre | Satır | Değer |
|---|---:|---|
| Direksiyon açısı (`steeringAmplitude`) | 14 | 0.5 |
| Motor gücü (`engineForceAmplitude`) | 15 | 300 |
| Boost çarpanı (`boostMultiplier`) | 16 | 2 (formül: `1 + boost * 2`, `:462`) |
| Üst hız / boost'lu üst hız | 17-18 | 5 / 40 |
| Fren (`brakeAmplitude`), rölanti, geri | 19-21 | 35 / 0.06 / 0.4 |
| Süspansiyon yüksekliği (low/mid/high) | 31-35 | 0.88 / 1.23 / 1.63 |
| Süspansiyon sertliği (low/mid/high) | 36-40 | 20 / 30 / 40 |
| Kütle (ana collider), ağırlık merkezi | 96 | 2.5, `y: -0.5` |
| Şasi sürtünmesi | 93 | 0.4 |
| Tekerlek ofseti, yarıçap | 141-142 | `0.90, 0, 0.75`, 0.4 |
| Tutuş, yanal sertlik | 145, 148 | 0.9, 3 |
| Süspansiyon kuvveti, hareket mesafesi | 146-147 | 150, 2 |
| Sıkışma, gevşeme | 149-150 | 10, 2.7 |
| Zıplama | 404-419 | `flip.jump`, `applyImpulse` |

Debug paneli aralıkları değerlerle uyumsuz: `engineForceAmplitude` için `max: 20` (`:51`), `topSpeedBoost` için `max: 20` (`:54`). Paneli kullanınca değerler bu aralığa sıkışabilir. Oyuncu girdileri `Player.js:525-611` içinde okunuyor.

### Ses

| Tür | Yer | Format | Yükleme |
|---|---|---|---|
| Müzik | `static/sounds/musics/` | 3 MP3 (18,9 MB) + 3 WAV (136 MB) | `Audio.js:150-163`, `preload: false` |
| Efektler | `static/sounds/*/` | 85 MP3 | `game.audio.register({ path, ... })`, varsayılan `preload: true` (`Audio.js:75-81`) |

Tüm sesler Howler ile çalınıyor. Audio, açılışın 1. adımında başlatılır (`Reveal.js:152`, `Audio.js:26-42`). WAV dosyalarına kodda referans yok.

**Müziği değiştirmek için:**
1. Yeni MP3'leri `static/sounds/musics/` altına koyun.
2. `Audio.js:150-163` listesini güncelleyin. `name` alanı bildirimde görünür.
3. `.env` içinde `VITE_MUSIC=1` olmalı (`Audio.js:251`).
4. `index.html:713-718` kredilerini ve `consoleLog.js:69-72` satırlarını düzeltin.
5. Kullanılmayan WAV ve MP3'leri silin (Bölüm 7).

Bowling alanındaki jukebox `playlist.next()` çağırır (`BowlingArea.js:482-491`), ek ayar gerekmez. Parça seçimi saate bağlı başlar (`Audio.js:164`).

---

## 5. Sunucu / dış bağımlılıklar

### Ağ çağrıları

| Tür | Sonuç |
|---|---|
| `fetch`, `XMLHttpRequest`, `EventSource`, `sendBeacon` | Uygulama kodunda **yok**. Three.js yükleyicileri yalnızca yerel asset'leri ister |
| `WebSocket` | **Tek yer:** `sources/Game/Server.js:44`, msgpack kodlu. `VITE_SERVER_URL` boşsa hiç açılmaz (`:28`). Bağlantı `Reveal.js:222` içinde başlar, kopunca 2 saniyede bir yeniden dener (`:34-38`) |
| Google Fonts | `sources/index.html:26-28` |
| Google Tag Manager | `sources/index.html:45` |

Sunucu kodu repoda yok (`index.html:710` bunu belirtiyor).

### Sunucu kullanan özellikler

| Özellik | Mesajlar | Kod | Sunucusuz davranış **[çalıştırılmadı]** |
|---|---|---|---|
| Whisper | `whispersInsert`, `whispersDelete`, `init` | `Whispers.js:240-262`, `:306-318` | Gönderilemez, görünmez; menüde "Server currently offline" |
| Circuit skor tablosu | `circuitInsert`, `circuitUpdate`, `init` | `CircuitArea.js:1287-1291`, `:1469-1498` | Yarış çalışır; tablo `OFFLINE`, skor kaydı yok, bitiş modalı açılmaz (`:1606`) |
| Çerez sayacı | `cookiesInsert`, `cookiesUpdate`, `init` | `CookieArea.js:411-450` | Çerez kabul etme çalışır, sayaç başlatılmaz |
| Altar ve kıyamet | `cataclysmInsert`, `cataclysmUpdate`, `init` | `AltarArea.js:423-443` | Sayaç `...` gösterir, ilerleme yok |
| Fırtına | `cataclysmUpdate`, `init` | `Tornado.js:121-140` | Sunucu tetiklemediği için başlamaz |
| Seçenekler göstergesi | bağlantı olayları | `Options.js:84-117` | `Offline`, ipucu "Should be back soon" |

**Sunucu gerektirmeyenler:** Başarımlar `localStorage`'da tutulur (`Achievements.js:64-69`). Oyun süresi, mesafe, ses tercihi ve bayrak da yereldir. Çerez sayısı `document.cookie`'dedir (`CookieArea.js:260-265`). İstatistik için ayrı bir sunucu çağrısı yok; yalnızca Google Analytics var.

**Elde edilemeyen başarımlar:**
- `whisper`: `achievements.js:58`, `Whispers.js:322`
- `circuitLeaderboard`: `achievements.js:137`, `CircuitArea.js:1299`
- `cataclysm`: `achievements.js:173`, `Tornado.js:241`

`Achievements.js:184` ödül eşiklerini toplam başarım sayısından hesapladığı için bu üçü yüzde yüz tamamlamayı engeller.

### `.env.example` değişkenleri

| Değişken | Kullanım | Görev |
|---|---|---|
| `VITE_SERVER_URL` | `Server.js:28`, `:44` | WebSocket adresi |
| `VITE_ANALYTICS_TAG` | `index.html:51` | `gtag('config', ...)` kimliği |
| `VITE_GAME_PUBLIC` | `index.js:10` | `window.game` olarak dışa açar |
| `VITE_COMPRESSED` | `Game.js:97` | `-compressed.glb` ve `.ktx` kullanımı |
| `VITE_DAY_CYCLE_PROGRESS` | `DayCycles.js:15` | Gün saatini sabitler |
| `VITE_YEAR_CYCLE_PROGRESS` | `YearCycles.js:8` | Mevsimi sabitler |
| `VITE_WHISPERS_COUNT` | `Whispers.js:16` | Whisper alev sayısı (varsayılan 30) |
| `VITE_MUSIC` | `Audio.js:251` | Müziği başlatır |
| `VITE_LOG` | `index.js:5` | Konsol ASCII logu |
| `VITE_PLAYER_SPAWN` | `Game.js:111` | Başlangıç spawn adı, boşsa `landing` |

**Dikkat:**
- Değerler metin olarak gelir. Kontroller yalnızca doluluğa bakar, yani `VITE_MUSIC=0` veya `VITE_COMPRESSED=0` da **açık** sayılır. Kapatmak için boş bırakın.
- `.env` yoksa `parseInt(undefined)` sonucu `NaN` olur (`Whispers.js:16`). Readme `.env` oluşturmayı zorunlu tutuyor; atlamayın **[çalıştırılmadı]**.
- `.env*` git'e girmez (`.gitignore`). Değişkenler build sırasında okunduğu için hosting panelinde de tanımlanmalıdır.

### Bruno'ya ait kalıntılar

`sources/index.html:45` **`G-JMSN30BQ5J` kimliğini sabit yüklüyor.** `VITE_ANALYTICS_TAG` boş olsa bile script yüklenir. Ayrıca `:12`, `:17`, `:21`, `:24` satırlarındaki paylaşım adresleri `bruno-simon.com` gösterir. Yayından önce değiştirin.

### Sunucusuz çalıştırmanın en temiz yolu

**1. Asgari:** `VITE_SERVER_URL` boş bırakılır. Oyun çalışır, bağlantı denenmez. Ancak `Server` çevrimdışı görünür ve kullanıcıya uyarılar gösterilir.

**2. Önerilen:** Ek olarak sunucu arayüzünü kaldırın:
- `index.html:163-169`, `:211-214`, `:628-679`: whisper menüsü
- `index.html:297-307` ve `Options.js:80-116`: sunucu satırı
- `index.html:586-598`, `:758-760`: skor ve çevrimdışı uyarıları (`.offline-element`, `general.styl:386`)
- `World.js:84`: `new Whispers()` satırı kaldırılır. `Reveal.js:216` içindeki `step(2)` çağrısı kalabilir. Dışarıdan tek kullanım `ClosingManager.js:26-27`; `:26` `?.` ile korunuyor
- `Areas.js`: `altar` alanı çıkarılır
- `achievements.js`: yukarıdaki üç başarım silinir
- Controls listesindeki `T` satırı `index.html:375-378`

`Server.send()` bağlantı yoksa `false` döner (`Server.js:118-119`), bu yüzden `Server` sınıfının kendisi kalabilir.

**3. Kendi sunucunuz:** Yazılabilir, ama protokol yalnızca koddaki mesaj türlerinden anlaşılıyor. Bir portfolyo için öncelikli değil.

---

## 6. Performans ve kalite

### Tespit ve geçiş

- **Mobil tespiti:** `Quality.js:12`, user-agent regex'i. Mobilde `level = 1` (low), diğerlerinde `0` (high).
- **Otomatik FPS düşürme yok.** Kullanıcı menüden değiştirir (`Options.js:25-40`).
- **Olay:** `changeLevel()` → `quality.events` `change` (`Quality.js:40-47`).
- **Renderer:** `WebGPURenderer`, `forceWebGL: false` (`Rendering.js:40-45`). WebGL arka ucuna düşerse seçeneklerde uyarı gösterilir (`Options.js:66-77`).

### Low quality'de değişenler

| Özellik | High | Low | Yer | Çalışma anında değişir mi |
|---|---|---|---|---|
| Gölge haritası | 2048 | 512 | `Ligthing.js:23`, `:170` | Evet |
| Gölge yarıçapı | 3 | 2 | `Ligthing.js:28` | Hayır |
| Bloom mip | 5 | 2 | `Rendering.js:82` | Hayır |
| DOF | Açık | Kapalı | `Rendering.js:90-101` | Evet |
| Su bulanıklığı | Açık | Kapalı | `WaterSurface.js:329-344` | Evet |
| Pre-render | WebGPU'da açık | Kapalı | `Game.js:203` | Hayır |
| Kamera açısı (`phi`) | 0.31π | 0.27π | `View.js:335` | Hayır |
| Hızla uzaklaşma | Açık | Kapalı | `View.js:699` | Evet |
| Optimal alan yarıçapı | Azaltılmış | Tam | `View.js:222` | Hayır |
| Araç fizik adımı | `min(1/60, ort.)` | Sabit `1/60` | `PhysicsVehicle.js:511` | Evet |
| Giriş etiketi konumu | Farklı | Farklı | `Intro.js:29` | Hayır |

**Not:** Çim sayısı, parçacıklar ve pixel ratio kaliteye bağlı değil. Mobil performans için ilk bakılacak yer bunlar.

### Ayar listesi

| Ayar | Değer | Yer |
|---|---|---|
| Pixel ratio üst sınırı | 2 | `Viewport.js:24` |
| Antialias | `pixelRatio < 2` | `Rendering.js:44` |
| Gölge | açık | `Rendering.js:51`, `Ligthing.js:23-28` |
| Bloom | threshold 1, strength 0.25, smoothWidth 1 | `Rendering.js:81-85` |
| DOF (`cheapDOF`) | start 0.2, end 0.5, repeats 25, amount 0.003 | `Passes/cheapDOF.js:18-24` |
| Çim | 280×280 = 78.400 | `Grass.js:12-15` |
| Yağmur | 2^11 = 2048 | `RainLines.js:13` |
| Kar | 256×256 ızgara | `Snow.js:16` |
| Yaprak | 2^7 – 2^11 (mevsime bağlı) | `Leaves.js:17-18` |
| Konfeti | 500 | `Confetti.js:24` |
| Şimşek parçacığı | 32 + 128 | `Lightnings.js:138`, `:323` |
| Araç izi | 512 render target, 128 bölüm | `Tracks.js:11`, `:100` |
| Boost izi | 32 bölüm | `Trails.js:38` |
| Whisper | `VITE_WHISPERS_COUNT` | `Whispers.js:16` |
| Kamera mesafesi | 15–30 | `View.js:339` |
| Zemin hücresi | 1.5 | `Floor.js:37` |
| Maksimum delta, zaman ölçeği | 1/30, 2 | `Ticker.js:14-15` |
| Gün döngüsü | 240 sn | `DayCycles.js:16` |
| Alan görünürlük testi | `refZoneFrustum` | `Area.js:104-176` |
| Fizik çözücü | Yorum satırında (`Physics.js:47-57`) | `Physics.js:242` zaman adımı |

### Debug

**URL hash ile açılır:** `https://site/#debug` (`Debug.js:11`).

| Hash | Etki | Yer |
|---|---|---|
| `#debug` | Tweakpane; `H` paneli gizler | `Debug.js:11-23` |
| `#stats` | Draw call, üçgen, geometri, texture (panel de açıksa görünür) | `Rendering.js:135-162` |
| `#inspector` | Three.js Inspector | `Rendering.js:62` |
| `#skip` | Açılışı 4 kat hızlandırır, ses ekranını atlar | `Reveal.js:48`, `:100` |

`H` aynı zamanda korna tuşudur (`Player.js:238`). `#debug` yalnızca bir hash olduğundan **production'da da erişilebilir** ve `debug` başarımını verir (`Game.js:212-215`).

**Panel klasörleri:** Time, Quality, Rendering (bloom, blur, stats), View (Magnet, Zoom, Spherical, Roll, Speed lines), Lighting, Fog, Wind, Weather, Day/Year Cycles, Water, Water surface (Ripples, Ice, Splashes, shore, blur), Terrain Data, Floor, Grass, Materials, Physics ve Vehicle, Trails, Tornado, Reveal, Overlay, Zones, Interactive Areas, Grid, Road, Trees, Bushes, Pole lights, Rain, Snow, Lightnings, Fireballs, Confetti, Wind lines, Career, Social, Projects, Lab, Bowling, Circuit, Altar, Behind the scene.

---

## 7. Build ve deploy

### Komutlar

| Komut | İş |
|---|---|
| `npm install --force` | Readme bu şekilde öneriyor; `--force`suz kurulum denenmedi. Bu analizde peer dependency uyarısı alındı |
| `npm run dev` | `vite --mode development` |
| `npm run build` | `vite build --mode production` → `dist/` |
| `npm run preview` | Build önizlemesi |

### `vite.config.js`

- `root: 'sources/'`, `publicDir: '../static/'`, `outDir: '../dist'`, `envDir: '../'`
- `base: './'`: göreli yollar
- `server.host: true`, `open: true`
- Eklentiler: `wasm()` ve `topLevelAwait()` (Rapier için), `restart` (`static/**` değişince sunucu yeniden başlar), `nodePolyfills()`
- `basicSsl()` yorum satırı (`:31`). WebGPU güvenli bağlam ister, bu yüzden telefondan LAN üzerinden test için gerekebilir **[çalıştırılmadı]**
- Portu belirtilmemiş. Readme `localhost:1234` diyor, ancak config'te böyle bir ayar yok; Vite varsayılanı kullanılır

### Build ölçümü (gerçek)

Node ile repo dışındaki kopyada, `.env` olmadan çalıştırıldı. Build başarılı oldu, süre 14,55 sn.

| Çıktı | Boyut | Gzip |
|---|---:|---:|
| `dist/` toplam (963 dosya) | **202 MB** | |
| `assets/index-*.js` | 4,86 MB | 1,03 MB |
| `assets/rapier_wasm3d_bg-*.wasm` | 1,70 MB | 0,63 MB |
| `assets/rapier-*.js` | 230 KB | 35 KB |
| `index.html` | 59 KB | 8 KB |
| `assets/index-*.css` | 40 KB | 7 KB |

Uyarılar: Vite'ın 500 KB'lık chunk uyarısı, `vm-browserify` içinde `eval`, CSS'te çalışma anına bırakılan göreli yollar.

### En büyük asset'ler

| Dosya | Boyut |
|---|---:|
| `sounds/musics/Boy.wav` | 46,9 MB |
| `sounds/musics/Baguira.wav` | 44,6 MB |
| `sounds/musics/Sudo.wav` | 44,4 MB |
| `sounds/musics/Boy.mp3` | 6,5 MB |
| `sounds/musics/Baguira.mp3` | 6,2 MB |
| `sounds/musics/Sudo.mp3` | 6,2 MB |
| `areas/areas.glb` (sıkıştırılmamış; sıkıştırılmış 639 KB) | 3,3 MB |
| `ui/map/map-day.png` | 1,7 MB |
| `ui/map/map-night.png` | 1,5 MB |

**Tür dağılımı (`static/`):** WAV 130 MB, PNG 29 MB, MP3 21 MB, ham GLB 5 MB, KTX 3,3 MB, sıkıştırılmış GLB 1,1 MB.

**WAV'lar çıkarıldığında `dist/` yaklaşık 72 MB olur.** `VITE_COMPRESSED=1` iken ham GLB'ler ve KTX karşılığı olan PNG'ler de tarayıcıdan istenmez, ancak `publicDir` hepsini `dist/` içine kopyalar. `draco_encoder.js` (iki kopya, her biri yaklaşık 0,9 MB) için de kodda kullanım görülmedi.

### Hosting şartları

| Konu | Durum | Dayanak |
|---|---|---|
| COOP/COEP header | **Gerekmiyor** | Kodda `SharedArrayBuffer` ve `crossOriginIsolated` yok |
| WASM | Rapier, Basis, Draco | `.wasm` dosyaları `application/wasm` ile sunulmalı; yaygın statik hostlar bunu yapar |
| HTTPS | Gerekli | WebGPU güvenli bağlam ister. Vercel ve Cloudflare varsayılan olarak sağlar |
| Env değişkenleri | Host panelinde | `VITE_*` build sırasında gömülür |
| Build ayarları | `npm run build`, çıktı `dist` | Vercel/Cloudflare'de `npm install --force` olarak ayarlayın |
| Alt yol | Kısmen sorunlu | `base: './'` göreli, ancak `index.html:32-42` mutlak `/...` yolları kullanıyor. Kök domain sorunsuz, alt klasörde favicon ve preload bozulur |
| Preload | Sabit | `index.html:39-42` her zaman `-compressed` ve `.ktx` ister. `VITE_COMPRESSED` boşken bu istekler boşa gider |
| Cache | Elle | `Game.js:102` `?cb=1`. `static/` dosyaları hash almaz, bu yüzden asset değiştirince `cb` artırın |
| Dış bağlantılar | Google Fonts, GTM | CSP eklerseniz izin verin |

**Platform sınırları:**

- **Cloudflare Pages:** [Tek dosya için 25 MiB, ücretsiz planda 20.000 dosya](https://developers.cloudflare.com/pages/platform/limits/). 44-47 MB'lık WAV'lar bu sınırı **aşıyor**. WAV'lar kaldırılmadan deploy başarısız olur. 963 dosya sınır içinde.
- **Vercel:** [Doküman CLI ile Hobby için 100 MB, Pro için 1 GB kaynak sınırı veriyor](https://vercel.com/docs/limits). Öte yandan [bir changelog notu CLI sınırlarının kaldırıldığını söylüyor](https://vercel.com/changelog/cli-deployment-limits-removed). Bu çelişki çözülemedi, deneyerek görmek gerekir. `resources/` dahil yükleme büyük olur, `.vercelignore` ile dışarıda bırakın. WAV'sız 72 MB'lık çıktı daha güvenlidir.

**Repo boyutu:** `.git` 786 MB, `resources/` 149 MB. Fork ve CI klonlamaları buna göre yavaş olabilir. Git kaynaklı deploy'da sığ klon kullanın.

---

## 8. Lisans

| Kapsam | Şart | Kaynak |
|---|---|---|
| Repo geneli | **MIT**, © 2025 Bruno Simon | `license.md` |
| Müzikler | **CC0 1.0** (Kounine) | `static/sounds/musics/license.md`, `sources/index.html:715-717` |
| Blender dosyaları | Site metni "Even the Blender files are there" diyerek MIT cümlesine bağlıyor | `sources/index.html:709` |
| Modeller, texture'lar | Ayrı dosya yok, kök MIT dışında özel şart görülmedi | `license.md` |
| Ses efektleri | **Ayrı lisans dosyası yok.** Dosya adları üçüncü taraf kütüphaneleri düşündürüyor (`Robotic_Lifeforms_2_-_...`, `24074 small bird tweet...`), köken kodda belirtilmemiş | `static/sounds/`, `Player.js:59` |
| Pally yazı tipi | `static/fonts/` içinde lisans dosyası yok | `static/fonts/`, `sources/style/fonts.styl` |
| Readme | Lisans şartı içermiyor; kurulum, oyun döngüsü ve Blender notları var | `readme.md` |

**Zorunlu olan (MIT metni):** Yazılımın kopyalarında veya önemli kısımlarında telif bildirimi ve izin metni korunmalı. `license.md` dosyasını silmeyin. Kendi telif satırınızı ekleyebilirsiniz, Bruno'nunkini kaldırmayın. Müzikler için CC0 atıf zorunluluğu getirmez.

**Lisans dosyasından çıkmayan ama kontrol etmeniz gerekenler (hukuki değerlendirme değildir):**
- MIT, bir kişinin adı, kimliği veya portfolyosu için açık bir izin metni içermiyor. Bruno'nun adını, linklerini, kariyerini ve proje görsellerini kaldırmak, kişisel portfolyo için zaten gerekli.
- Proje görselleri üçüncü taraf markaları ve müşteri işlerini içeriyor (`static/projects/images/`). Kendi içeriğinizle değiştirin.
- Ses efektleri ve Pally yazı tipinin ticari veya yeniden dağıtım şartları repodan doğrulanamıyor. Ticari kullanım düşünüyorsanız kaynağını araştırın veya değiştirin.
- `threejs`, WebGL ve WebGPU logoları `circuit` dokularında (`areas.glb`) kullanılıyor.

---

## 9. Önerilen sıra

1. **Fork'u temizleyin:** `.env` oluşturun, `index.html:45` analytics kimliğini kaldırın, kullanılmayan WAV'ları silin. Bu, Bruno'nun analitiğine veri gitmesini engeller ve deploy önündeki en büyük engeli kaldırır.
2. **İlk deploy'u yapın:** Değişmemiş oyunu Cloudflare veya Vercel'e atın. Bundan sonraki her adımda sorunun kaynağı daha kolay bulunur.
3. **`toktx` kurun:** `npm run compress`'i tek klasörde deneyin. Tüm görsel değişiklikleri buna bağlı.
4. **Kimlik metinlerini değiştirin:** `index.html`, `Title.js`, `consoleLog.js`, `social.js`, favicon ve paylaşım görseli. Risk düşük, etki yüksek.
5. **Projeler ve lab:** Görselleri 960×540 (mini 240×136) hazırlayıp `projects.js` ve `lab.js`'yi güncelleyin. Sadece bir proje ile başlayıp test edin.
6. **Sunucu özelliklerini kapatın:** `VITE_SERVER_URL` boş kalsın; whisper arayüzü, altar ve üç başarımı kaldırın. Bu, "Server offline" uyarılarını ortadan kaldırır.
7. **İstemediğiniz alanları kod tarafından kaldırın:** `Areas.js`, `achievements.js`, `Map.js`. Önce `toilet` veya `timeMachine` gibi küçük bir alanla başlayın, sonra `circuit` gibi büyük olanlara geçin.
8. **Müzik ve kariyer görselleri:** `Audio.js:150-163` ve `static/career/*`. Kariyer satırı sayısı değişmeyecekse Blender gerekmez.
9. **Araç hissi:** `#debug` ile deneyip değerleri `PhysicsVehicle.js:14-40` içine yazın. Panel aralığı uyarısını unutmayın.
10. **Blender işleri (en son):** Landing harfleri, heykel, sosyal ikonlar, etiket dokuları, araç modeli. En yüksek çaba burada; Blender kurulumu ve yeniden export gerekir.
11. **Harita küçültme (opsiyonel):** Terrain, referans dosyaları, `Terrain.js` sabitleri, harita görseli ve spawn noktaları birlikte değişir. Gerçekten gerekmedikçe yapmayın; kaldırılan alanların yerini ağaç veya dekorla doldurmak daha ucuz.
12. **Performans turu:** Gerçek bir telefonda çim, parçacık ve kamera ayarlarını deneyin, gerekiyorsa `Quality` seviyesine bağlayın.
