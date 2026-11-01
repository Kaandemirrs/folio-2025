# Araç Değişimi Analizi: 1992 Mercedes-Benz W140 S320L (siyah)

**Kapsam:** Yalnızca analiz. Repo'da değişen tek dosya bu rapor. Branch: `araba` (`kimlik` branch'inden açıldı). Ölçümler `static/vehicle/*.glb` ve `resources/folio-2025.blend` dosyalarından, kod bulguları `sources/` içinden alındı.

**Doğrulanmayanlar:**
- Oyun tarayıcıda çalıştırılmadı. Fizik önerileri (Bölüm 6) hesaba ve koddan okunan formüllere dayanıyor, Rapier'da denenmedi.
- Referans görsel yok (Bölüm 7).
- Blender GUI'si hiç açılmadı; her şey komut satırından yapıldı.

---

## 1. Blender kurulumu

| Kontrol | Sonuç |
|---|---|
| `/Applications/Blender.app` | **Yok** (`/Applications` altında Blender yok) |
| `blender` komutu (`which`) | **Yok** |
| Spotlight (`org.blenderfoundation.blender`) | Sonuç yok |

**Ne yaptım:** Sistem Blender'ı olmadığı için Blender'ın Python modülü olan `bpy` 5.2.3 LTS'i, repo dışında bir sanal ortama kurdum. Sisteme bir şey kurmadım.

- Yol: `/private/tmp/claude-501/-Users-kaandemir-folio-2025/48e8230b-5577-42a3-94a1-0aea7e82d640/scratchpad/bpyenv/` (768 MB)
- Doğrulama: `bpy.app.version_string` → `5.2.3 LTS`, `bpy.app.background` → `True`. glTF içe ve dışa aktarma operatörleri var. Boş sahne açılıyor.
- `-b --python-expr` karşılığı: `bpyenv/bin/python -I script.py`. Resmi Blender kurulursa komut `Blender -b --python script.py` olur, betik aynı kalır.
- **Round-trip testi:** `default.glb` içe aktarıldı (24 obje, 18 mesh, 3.720 üçgen), bounding box Blender'da 2,992 × 1,887 × 1,324 çıktı (GLB analiziyle birebir aynı). Sonra GLB olarak geri dışa aktarıldı: 239.004 bayt (orijinal 237.616). Çıktıyı `gltf-transform inspect` okudu, `KHR_materials_emissive_strength` korunmuş.
- **Sürüm farkı:** Repo'daki GLB'ler Blender I/O v5.0.21 ile üretilmiş, `.blend` dosyası 5.0.x formatında (`bpy.data.version` = 5.0.118). bpy 5.2.3'ün exporter'ı v5.2.41. Aynı parametrelerle çalışıyor, ancak çıktı bayt bayt aynı olmayabilir.
- **Disk uyarısı:** Disk %98 dolu, yaklaşık 4,8 GB boş. Sanal ortam silinebilir; tekrar kurmak için `python3.13 -m venv .venv && .venv/bin/pip install bpy` yeterli (indirme yaklaşık 400 MB). Python 3.13 ile 5.2.3 wheel'i bulundu.
- **Önerim:** Üretimi bpy ile yap, model görsel kontrol için ayrıca resmi Blender kurmak istersen (GUI ile bakmak için) 5.0.x veya 5.2 LTS yeterli.

---

## 2. Mevcut araç GLB'leri

Üç varyant var. Sadece `default` ve `oldSchool` kodda kullanılıyor.

| Dosya | Kullanım | Boyut (ham / sıkıştırılmış) |
|---|---|---|
| `static/vehicle/default.glb` | `Game.js:136`, `Konami` ile geri dönüş | 237.616 / 34.824 bayt |
| `static/vehicle/oldSchool.glb` | `KonamiCode.js:54-57` (Konami kodu) | 175.396 / 15.316 bayt |
| `static/vehicle/defaultAntenna.glb` | **Kodda hiçbir yerde yok** (eski sürüm) | 79.076 / 49.388 bayt |

### 2.1 Koordinat sistemi

glTF Y-yukarı. Araç **+X yönüne gidiyor** (fizikte `forward = (1,0,0)`, `PhysicsVehicle.js:25`). +Z kenarı sol, −Z sağ taraf. Blender'da Z-yukarı olduğu için `.blend`'de ön `+X`, yükseklik `Z`, genişlik `Y`.

### 2.2 `default.glb` hiyerarşisi (Blender I/O v5.0.21)

İki kök düğüm var: `chassis.001` (y=0,907) ve `wheelContainer.001`. Mesh nesnelerinin çoğu 0,735 ölçekli (uygulanmamış), `T`/`R`/`S` yoksa varsayılan.

```text
chassis.001                       T=(0, 0.907, 0)
├─ backLights        T=(-0.553, 0.592, 0)  S=0.735   Cube.016    6 tri   emissiveOrangeRadialGradient
├─ blinkerLeft.001   T=(0.027, -0.018, -0.008) S=0.735 Plane.144 4 tri   emissiveOrangeRadialGradient
├─ blinkerRight.001                         S=0.735   Plane.145   4 tri   emissiveOrangeRadialGradient
├─ bodyPainted.001                          S=0.735   Cube.216    350 tri redGradient     UV0 + UV1
├─ cell1.001 (boş)   T=(0, 0.2, 0)
│  ├─ cellsCage.003  (Circle.019, palette, 82 tri)
│  └─ cellsEnergy.003 (Cylinder.075, emissivePurple, 18 tri)
├─ cell2.001, cell3.001 (aynı yapı)
├─ common                                   S=0.735   Plane.146   1.848 tri palette
├─ energy.001                               S=0.735   Plane.152   394 tri darkGray      UV0 + UV1
├─ headlights.001                           S=0.735   Cube.223    28 tri  emissiveOrangeRadialGradient
└─ stopLights.001    T=(-0.553, 0.592, 0)  S=0.735   Cube.225    2 tri   emissiveOrangeRadialGradient
wheelContainer.001                T=(0.872, -0.417, -0.699)
├─ wheelCylinder.001 (boş)
│  ├─ wheel.006       Plane.151  412 tri palette          (lastik + jant, yarıçap 0,432)
│  └─ wheelPainted    Plane.150  128 tri redGradient      (boyalı jant yüzü, z −0,27…−0,206)
├─ wheelGuard.001     Cylinder.073 206 tri palette
└─ wheelSuspension.002 T=(0.001, 0.477, 0) R=y−22.5° S=(1, 1.032, 1)  Cylinder.072 38 tri palette
```

`T=(0, 0.907, 0)` gibi değerlerin yanında, Blender'da (Z-yukarı) aynı düğümlerin konumu `(0, 0, 0.907)` olarak görünür.

### 2.3 Sayılar

| Ölçü | Değer |
|---|---|
| Mesh sayısı | 18 (hepsi tek primitive) |
| Benzersiz üçgen | **3.720** (şasi 2.936 + tekerlek konteyneri 784) |
| Benzersiz vertex | 5.874 |
| Çizilen üçgen (4 tekerlek klonu dahil) | **≈ 6.070** (2.936 + 4 × 784) |
| UV | Hepsinde `TEXCOORD_0`. `bodyPainted` ve `energy` ayrıca `TEXCOORD_1` taşıyor |
| Normal | Hepsinde var. Tangent, renk, animasyon, skin yok |
| Materyal | 5 (aşağıda) |
| Gömülü texture | 1 adet: `palette` PNG, 128×4 piksel, 362 bayt (sampler: Nearest) |
| Eklenti | `KHR_materials_emissive_strength` |

| Materyal | Tür | Değer |
|---|---|---|
| `palette` | Texture | `palette.png`, metalik 0 |
| `redGradient` | Düz renk | taban (1, 0.048, 0) doğrusal ≈ `#ff3c00`, metalik 0 |
| `emissiveOrangeRadialGradient` | Emissive | (1, 0.172, 0), güç 16,7 |
| `emissivePurpleRadialGradient` | Emissive | (0.476, 0.105, 1), güç 12 |
| `darkGray` | Düz renk | (0.174, 0.145, 0.103), roughness 0,5 |

### 2.4 Ölçüler

Şasi alt ağacı (şasi + gövde parçaları, tekerlekler hariç), glTF Y-yukarı:

| Eksen | Aralık | Ölçü |
|---|---|---:|
| **Uzunluk (X)** | −1,399 … +1,592 | **2,992** |
| **Genişlik (Z)** | −0,943 … +0,943 | **1,887** |
| **Yükseklik (Y)** | 0,303 … 1,627 (şasi yerel: −0,604 … +0,720) | **1,324** |

Tek tekerlek: yarıçap **0,432**, genişlik **0,54** (z ±0,27), dönüş ekseni yerel `z`.

Doğrulandı: Blender'a aktarınca aynı ölçüler çıktı.

### 2.5 `oldSchool.glb` (Konami varyantı)

- Blender I/O v5.0.21, 2.020 üçgen, 3 materyal (`palette`, `redGradient`, `emissiveOrangeRadialGradient`).
- Şasi: **3,259 × 1,896 × 1,492** (uzunluk × genişlik × yükseklik).
- Düğümler: `chassis` → `backLights.002`, `bodyBlack.002` (palette, 1.278 tri), `bodyPainted` (272 tri), `headlights.002`. Tek bir `wheelContainer` → `wheelCylinder` → `wheel` (454 tri, palette).
- Yok: `blinkerLeft/Right`, `stopLights`, `energy`, `cell*`, `antenna`, `wheelSuspension`, `wheelPainted`. Kod bunları isteğe bağlı sayıyor, bu yüzden çalışıyor.
- Bu, **minimum geçerli araç** için güvenilir bir örnek: `chassis` + `bodyPainted` + `wheelContainer/wheelCylinder` yeterli.

### 2.6 `defaultAntenna.glb` (kullanılmıyor)

Blender I/O v4.4.55, Draco, 4.812 tri, palette yok (renkler düz materyal), 9 materyal. Anten (`antenna`, `antennaHead`, `antennaHeadReference`) için eski bir sürüm. `setAntenna` kodu hâlâ var (`VisualVehicle.js:356-371`) ama yeni `default.glb` anten içermiyor.

---

## 3. `resources/folio-2025.blend` — `vehicle` koleksiyonu

Blender ile açıldı (`bpy.ops.wm.open_mainfile`); hiçbir şey kaydedilmedi.

### 3.1 Koleksiyonlar

| Koleksiyon | Obje | Not |
|---|---|---|
| `vehicle` (üst düzey, objesi yok) | 0 | 3 alt koleksiyon içeriyor |
| ├ `default.001` | 24 | **`default.glb`'nin kaynağı** |
| ├ `oldSchool` | 8 | `oldSchool.glb`'nin kaynağı |
| └ `antenna.001` | 9 | `defaultAntenna.glb`'nin anten kısmı |
| `vehicle.001` | 41 | `map` koleksiyonunun alt koleksiyonu. 4 tekerlekli bir **sunum / harita görseli montajı**, export kaynağı değil |

Blender'da konumlar Z-yukarı: örneğin `chassis` `(0, 0, 0.907)`, `wheelContainer` `(0.872, 0.699, −0.417)`.

### 3.2 `default.001` içeriği

- 24 obje: 6 boş (`chassis.001`, `wheelContainer.001`, `wheelCylinder.001`, `cell1/2/3.001`) + 18 mesh.
- **Modifier yok** (`Smooth by Angle` yalnızca anten kürelerinde; `Mirror` anten parçasında).
- Gövde mesh'lerinde **uygulanmamış 0,735 obje ölçeği** var. Export'ta `scale 0.735` olarak gitmiş.
- Her objede `booleans` ve `cycles` özel property'leri var (`export_extras` açık olduğundan GLB'ye `extras: {"booleans":{}}` olarak geçmiş).

### 3.3 Materyaller (5, vehicle koleksiyonlarının kullandığı)

| Ad | Node yapısı | Not |
|---|---|---|
| `palette` | Principled + `Image Texture` (`//palette.png`, Closest, sRGB) | 224 kullanıcı (tüm sahne); **texture node mute DEĞİL** |
| `redGradient` | Principled (taban 1, 0.048, 0) | 9 kullanıcı |
| `emissiveOrangeRadialGradient` | Emission (1, 0.172, 0), güç 16,7 | 35 kullanıcı |
| `emissivePurpleRadialGradient` | Emission (0.476, 0.105, 1), güç 12 | 16 kullanıcı |
| `darkGray` | Principled (0.174, 0.145, 0.103), rough 0,5 | 4 kullanıcı |

- Tüm materyallerde `yp` property'si var: **Ucupaint** eklentisinin metadata'sı. Dosya Ucupaint olmadan açıldığında zararsız.
- **Palette node:** `readme.md`'deki "palette texture node'unu mute edin" kuralı bu dosyada şu an **uygulanmamış** (mute=False). Sonuç: `default.glb` palette'i gömülü PNG olarak taşıyor (362 bayt). Oyun için fark etmiyor çünkü oyun materyali ad üzerinden yeniden kuruyor (Bölüm 5).

### 3.4 Export ayarları ve preset'ler

- **Repo'da preset dosyası yok** (`bpy.utils.preset_paths('operator/export_scene.gltf')` boş). "İlgili export preset'leri" readme'de Bruno'nun kendi Blender kurulumundaki kullanıcı preset'lerine işaret ediyor.
- Koleksiyonlarda **collection exporter yok**.
- `Scene['glTF2ExportSettings']` (son kullanılan ayarlar) araç export'u için güvenilir değil: `export_materials=NONE`, `export_normals=False`, `export_texcoords=False` (muhtemelen bir fizik mesh'inin son export'u).
- **GLB'den çıkarılan araç ayarları:**
  - Biçim GLB, `export_yup=True`, `export_apply=True` (modifier'lar uygulanmış)
  - Normal + UV0 (+UV1) açık, tangent ve vertex color kapalı
  - Materyal export'u açık, emissive güç uzantısı yazılmış
  - Kamera, ışık, animasyon, skin kapalı
  - **Sıkıştırma kapalı** (Draco/meshopt yok). Sıkıştırma sonradan yapılıyor
  - `export_extras` açık (`extras.booleans`)
- `readme.md` kuralları: palette node mute, ilgili preset, sıkıştırma kapalı; sıkıştırma `npm run compress` ile.

---

## 4. Kod tarafı: araçtan GLB'den ne bekleniyor

### 4.1 Yükleme

- `Game.js:136`: `vehicle/default${compressedModelSuffix}.glb` (`VITE_COMPRESSED=1` iken `default-compressed.glb`).
- `World.js:55`: `new VisualVehicle(this.game.resources.vehicle.scene)`.
- **`KonamiCode.js:54-57`:** `['vehicle/oldSchool.glb', 'vehicle/default.glb']` dizisini dönüşümlü yüklüyor (sıkıştırılmamış yollar). **W140 `default.glb`'nin yerini alırsa Konami ikinci tetiklemede Bruno'nun arabasına döner.** Dosya listesi güncellenmeli.

### 4.2 Aranan düğüm adları (`VisualVehicle.js`)

Ad arama `^(ad)` ile, büyük/küçük harf duyarsız, **önek eşleşmesi**. Birden fazla eşleşme olursa `traverse` sırasındaki **son** düğüm kazanıyor (`:79-102`). Örnek: `bodyPainted.001` eşleşir; ama `bodyPaintedTrim` gibi ikinci bir ad aynı anahtara yazılıp ilkini ezer.

| Ad (önek) | Ne için | Eksik olursa | Satır |
|---|---|---|---|
| `chassis` | Ana grup. Sahneye eklenir, fizikten konum/dönüş alır; tekerlekler buna eklenir | **Çöker** (`rotation.reorder` çağrısı) | `:105-107`, `:423-424` |
| `bodyPainted` | Boyanan gövde. Ödül boyası bu mesh'in materyalini değiştirir | **Çöker** (`this.parts.bodyPainted.material`, `paints.changeTo`) | `:231`, `:241` |
| `wheelContainer` | Tekerlek şablonu; 4 kez `clone(true)` yapılır | **Çöker** | `:126`, `:267` |
| `wheelCylinder` (wheelContainer altında) | Dönen tekerlek. Konumu (0,0,0)'a sıfırlanır, `rotation.z` dönüş için | **Çöker** (`wheel.cylinder.position`) | `:274-281`, `:441-444` |
| `wheelSuspension` (opsiyonel) | Amortisör çubuğu; `scale.y` yay boyuna göre ayarlanır | Sorun yok (`if(visualWheel.suspension)`) | `:272`, `:460-464` |
| `wheelPainted` (opsiyonel) | Boyalı jant yüzü; ödül boyasını alır | Sorun yok | `:276`, `:233-237` |
| `blinkerLeft`, `blinkerRight` | Sinyal. Varsayılan gizli, yön tuşunda 0,8 sn aralıkla yanıp söner | İkisi de yoksa sinyal yok. **Biri varsa diğeri de olmalı**, yoksa çöker | `:110-115`, `:293-348` |
| `stopLights` | Fren sırasında görünür | Sorun yok | `:118-119`, `:488-502` |
| `backLights` | Frende turuncu emissive, geri vitesteyse beyaz (`vec3(2.2)`) | Sorun yok | `:122-123`, `:350-354`, `:493-517` |
| `energy` + `cell1`, `cell2`, `cell3` | Turbo animasyonu: hücreler 0,2 → 0 aşağı iner, `energy` mor emissive'e geçer | `energy` yoksa sorun yok; **`energy` var ama `cell1-3` yoksa çöker** (`parts.cell1.position`) | `:401-410`, `:532-537` |
| `antenna` + kökte `antennaHead` (ilk çocuğu eksen) + `antennaHeadReference` | Anten hedefe döner | `antenna` yoksa atlanır | `:356-371`, `:474-485` |
| `headlights` | Kodda **aranmıyor**, sadece GLB'de bulunuyor ve hep görünür | — | — |

Ek kurallar:
- **Yön:** `+X` ileri. Tekerlek sırası fizikte `[(+x,+z), (+x,−z), (−x,+z), (−x,−z)]`. 0 ve 1 ön (direksiyon `setWheelSteering(0/1)`, `PhysicsVehicle.js:333-337`).
- **Tekerlek ayna mantığı:** Şablon −Z (sağ) tarafı için kurulu. `+Z` tarafındaki tekerlekler (i=0, 2) `rotation.y = π` ile çevrilir (`:283-284`, `:446-450`). Yani dış yüzü (jant yüzü) **−Z'ye bakmalı**; asimetrik jant tasarımı bu yüzden doğru yöne bakar.
- **Konum her karede ezilir:** Konteynerin `x`, `y`, `z`'si fizik tekerleğinden alınır (`:456-458`). GLB'deki konteyner konumu sadece şablon; önemli olan konteyner **orijininin tekerlek merkezi (hub)** olması ve çocukların ona göre kurulması.
- **Gölge:** Tüm mesh'ler gölge atar ve alır, `shadowSide = BackSide` (`:88-90`).

### 4.3 Kodda sabit yazılı, GLB'den gelmeyenler

| Ne | Değer | Yer | Sonuç |
|---|---|---|---|
| Turbo (boost) egzoz izi noktaları | şasi yerelinde `(−1.28, 0.1, ±0.55)` | `VisualVehicle.js:379`, `:386` | Yeni arabanın arka ucu ve egzozuyla elle eşlenmeli |
| Ana yer izi kalınlığı | `new Track(1.5, 'g')` | `:251` | Gövde altındaki çim ezilmesi; 1,5 yeni genişlik için de uygun |
| Tekerlek izi kalınlığı | `new Track(0.5, 'r')` ×4 | `:287` | Yeni tekerlek genişliğine (≈0,30) yaklaştırılabilir |
| Tekerlek dönüş hızı | `forwardSpeed / radius × 0.006` | `:429` | `radius` fizik değerinden okunuyor |
| Direksiyon açısı | `steeringAmplitude = 0.5` | `PhysicsVehicle.js:14` | |
| Yay görseli | `container.y = min(base.y − suspensionLength, −0.5)` | `:452-454` | Tekerlek merkezi şasi merkezinin en fazla 0,5 altına iner |
| Amortisör ölçeği | `suspension.scale.y = |container.y| − 0.5` | `:462-463` | Mesh yüksekliği 0,968 ve ofseti 0,477 varsayıyor |

**`Trails.js` ve `Tracks.js`** GLB'den düğüm aramaz. `Trails` iki turbo şeridi (`VisualVehicle.js:376-391` oluşturuyor); iz noktaları yukarıdaki sabit referans nesneleri. `Tracks` bir render target'a iz çiziyor (512 px, 40 birim alan, `Tracks.js:11-12`); araç boyutuna bağımlılığı yalnızca `Track` kalınlıkları.

### 4.4 Fizik ↔ görsel eşleşmesi (`PhysicsVehicle.js`)

| Fizik | Değer | Satır | Görsel karşılığı |
|---|---|---|---|
| Ana şasi collider | yarı boyut `[1.3, 0.4, 0.85]`, konum `(0, −0.1, 0)`, kütle 2,5, ağırlık merkezi `(0, −0.5, 0)` | `:96` | Kutu: 2,6 × 0,8 × 1,7, y −0,5…+0,3 |
| Üst collider (kabin) | `[0.5, 0.15, 0.65]`, `(0, 0.4, 0)`, kütle 0 | `:97` | y +0,25…+0,55 |
| Tampon collider (`bumper`) | `[1.5, 0.5, 0.9]`, `(0.1, −0.2, 0)` | `:98` | 3,0 × 1,0 × 1,8; x −1,4…+1,6 (**gövde x −1,399…+1,592 ile örtüşüyor**) |
| Tekerlek ofseti | `x ±0.90`, `z ±0.75`, `y 0` | `:141` | Ön/arka ±0,90 (dingil mesafesi **1,8**), iz genişliği 1,5 |
| Tekerlek yarıçapı | 0,4 | `:142` | Görsel 0,432 (**+0,032 fark**, lastik hafif yere gömülür) |
| Süspansiyon dinlenme boyu | low/mid/high **0,88 / 1,23 / 1,63** | `:31-35` | |
| Süspansiyon sertliği | 20 / 30 / 40 | `:36-40` | |
| Tekerlek ayarları | `frictionSlip 0.9`, `maxSuspensionForce 150`, `maxSuspensionTravel 2`, `sideFrictionStiffness 3`, `compression 10`, `relaxation 2.7`, `stiffness 25` | `:145-151` | |
| Motor | `engineForceAmplitude 300`, `topSpeed 5`, `topSpeedBoost 40`, boost çarpanı 2 | `:15-18` | |
| Gövde sürtünmesi | 0,4 | `:93` | |

**Orantı tespiti:** Şasi **uzunluğu** (2,99) ≈ tampon collider (3,0), dingil mesafesi/uzunluk = 0,60. Gerçek W140'ta bu oran 3,14/5,21 = **0,603**. Yani oyun arabasının uzunluk ve tekerlek yerleşimi tesadüfen W140'a çok uygun. Asıl fark **genişlik ve yükseklikte**.

---

## 5. Materyal, renk ve ışık

### 5.1 Materyaller ad üzerinden yeniden kuruluyor

`Materials.updateObject()` (`Materials.js:289-298`) araç mesh'lerinin materyalini **adıyla** değiştirir (`getFromName`):

| GLB'deki ad | Oyunda ne olur |
|---|---|
| `palette` | `MeshDefaultMaterial` + `paletteTexture` (`Materials.js:31-37`); GLB'deki gömülü PNG kullanılmaz |
| `redGradient` | `createGradient('redGradient', '#ff3a3a', '#721551')`, UV0.v'ye göre karışım (`:26-33`) |
| `emissiveOrangeRadialGradient` | `#ff8641 → #ff3e00`, güç 1,7, normalize (`:23`) |
| `emissivePurpleRadialGradient` | `#454bbc → #ff2eb4` |
| `emissiveBlueRadialGradient`, `emissiveGreenRadialGradient`, `emissiveWhiteRadialGradient` | Hazır, araçta kullanılabilir |
| Diğer ad (örn. `darkGray`) | GLB'deki Lambert/Standard materyalin rengi/texture'ı `MeshDefaultMaterial`'a çevrilir (`createFromMaterial`, `:262-300`) |

**Önemli kural:** Ad listede varsa GLB'deki rengin **hiçbir önemi yok**. Palette dışında düz renk istenen bir parça için ya palette hücresi ya da yeni bir materyal adı kullanılmalı (yeni ad gelirse `MeshDefaultMaterial` GLB'deki renkle oluşturuluyor, yani `darkGray` gibi çalışır).

### 5.2 Boya (siyah araç için kritik)

- `bodyPainted` ve `wheelPainted` materyali **GLB'den gelmez**: `VisualVehicle.setPaints()` ödül sistemine göre değiştirir (`:129-247`, `paints.changeTo` `:224-238`, başlangıç `:241`).
- 6 boya var: `red` (varsayılan, `redGradient`), `orange` (`#ff940d→#af0071`), `white` (`#ffffff→#b5b5b5`), `black` (`#626262→#262526`), `flames` (kırmızının kopyası + voronoi alevi, **UV1** kullanır), `abyssal` (yıldızlı, fresnel; `behindTheSceneStarsTexture`).
- Ödüller `Achievements.js:171-243`: eşik `round(i / (adet−1) × toplamBaşarım)`. Şu an başarım sayısı 25, 6 ödül → 0, 5, 10, 15, 20, 25 başarımda açılır; `black` 4. ödül (15 başarım).
- **Sonuç:** Siyah W140'ı varsayılan yapmak için kodda değişiklik gerekecek: ya `red` boyayı siyah tonuna çevirmek ya da varsayılan ödülü `black`'e almak (`index.html`'deki `data-default` düğmesi). Bu analizde değiştirmedim.
- `bodyPainted` mesh'i **iki UV seti** taşımalı:
  - **UV0.v** gradyan için: ölçüm: `v ≈ −0,74·y` (korelasyon −0,997); yani üstte `v=0` (renk A), altta `v≈1` (renk B). Blender UV'sinde V = yükseklik oranı (alt 0, üst 1) kurulmalı, exporter v'yi çevirir.
  - **UV1** alevler için: yan projeksiyon (u uzunluk/yan eksen, v yükseklik, 0,09…1).

### 5.3 Gece/gündüz

- `MeshDefaultMaterial` (`MeshDefaultMaterial.js:54-135`): renk × `lighting.colorUniform × intensityUniform` (gün döngüsü presetleri `DayCycles.js`), "core shadow" (normal·ışık yönü), düşen gölge, alttan **zemin rengi yansıması** (light bounce), sis, su rengi, intro "reveal" efekti.
- Gölge rengi `baseColor × shadowColor` (örn. şafakta `#db004f`). **Saf siyah gövde gölgede de siyah kalır; çok az yön bilgisi verir.** Oyunda speküler yok; siyah araç düz bir silüet gibi görünür.
- **Öneri:** "Siyah" için çok koyu **gri gradyan** (örn. üst `#3a3a42` → alt `#0e0e10`) kullan. Gerçek `#000000` yerine bunu seç; ayrıca ayrı parçaları (cam, ızgara, tampon, jant) palette'in açık hücreleriyle (`#c8c2c1`, `#575a5e`) ayır.

### 5.4 Farlar ve ışıklar

- **Farlar geceye bağlı değil.** `headlights` hep görünür, `emissiveOrangeRadialGradient` kullanır: `MeshBasicNodeMaterial`, **sis ve ışıktan bağımsız**, çıkış renk × 1,7 (`Materials.js:139-160`). Kodda `headlights` aranmıyor, gece kontrolü yok (`grep`).
- Bloom eşiği 1 (`Rendering.js:83`): parlak emissive bloom ile glow yapıyor; geceleri karşı karanlığa karşı daha belirgin görünür.
- Fren: `stopLights` görünür, `backLights` turuncu emissive'e geçer. Geri vites: `backLights` beyaz `vec3(2.2)` (`:353`, `:507-511`).
- W140'ın farları beyaz olmalı: ad olarak `emissiveWhiteRadialGradient` kullanmak yeterli (materyal zaten tanımlı, `Materials.js:27`); kod değişmez.
- Kırmızı fren lambası için hazır emissive yok (turuncu-kırmızı var); gerekirse `createEmissiveGradient('emissiveRedRadialGradient', ...)` eklenir (küçük kod değişikliği).

### 5.5 Palette (`static/palette.png` = `resources/palette.png`, 128×4 px)

Her hücre 4 px genişliğinde, 4 satır aynı; **24 renk kullanılıyor**, son 8 hücre boş (siyah). UV'ler hücre ortasına noktalanıyor: `u = (hücre×4 + 2) / 128`. Renkler (hücre sırasıyla):

`0 #7c7691`, `1 #ebd1a3`, `2 #574e37`, `3 #3dbbe7`, `4 #c8c2c1`, `5 #4a413c`, `6 #575a5e`, `7 #eec3af`, `8 #e4a90c`, `9 #91ad78`, `10 #e49a78`, `11 #988165`, `12 #abae2b`, `13 #a49876`, `14 #b36d45`, `15 #e56202`, `16 #ec3f1c`, `17 #fde6e1`, `18 #f8a658`, `19 #c30e3a`, `20 #c366ef`, `21 #ed719f`, `22 #1e0603`, `23 #fff2e8`.

W140 için işe yarar olanlar: `22 #1e0603` (lastik/siyah), `5 #4a413c`, `2 #574e37`, `6 #575a5e` (koyu gri plastik/trim), `4 #c8c2c1` (krom/jant), `3 #3dbbe7` (cam), `0 #7c7691` (gri-mavi cam alternatifi), `23 #fff2e8` (beyaz), `16/19` (kırmızı).
`default.glb`'de `common` yalnızca hücre 2, 5, 6'yı; tekerlek 2 ve 6'yı kullanıyor.
Yeni renk gerekiyorsa son 8 boş hücreye eklenebilir; bu **tüm dünyayı etkileyen** `palette.png`/`.ktx` değişikliği olur, ayrı karar gerektirir.

---

## 6. Hedef ölçüler: W140 vs mevcut oyun aracı

Hedef: uzunluk 5,21 m, genişlik 1,89 m, yükseklik 1,49 m, dingil mesafesi 3,14 m.

| | Gerçek W140 | Oyun şimdi | Oran (W/U, H/U, DM/U) |
|---|---:|---:|---|
| Uzunluk (U) | 5,21 | **2,99** | — |
| Genişlik | 1,89 | **1,89** | gerçek 0,36, oyun **0,63** |
| Yükseklik | 1,49 | **1,32** | gerçek 0,29, oyun **0,44** |
| Dingil mesafesi | 3,14 | **1,80** | gerçek 0,603, oyun **0,60** |
| Tekerlek yarıçapı | ≈0,34 (tahmin) | **0,40 fizik / 0,432 görsel** | gerçek 0,065, oyun **0,14** |
| Tekerlek merkezleri arası iz | ≈1,6 (tahmin) | **1,5** | |

Oyun arabası kısa ve çok geniş, "oyuncak" oranında. W140 uzun ve nispeten dar.

### 6.1 Seçenekler

**A) Gerçek oran, uzunluğa göre ölçek 0,574 (2,99 / 5,21):** U 2,99 · G 1,09 · Y 0,86 · DM 1,80 · tekerlek r ≈ 0,20.
- Sorun: Fizikteki iz (1,5) ve tekerlek r (0,4) görsele göre çok büyük. Tekerlekler gövdenin 0,2 m dışında durur, collider'lar araçtan geniş kalır. Fizik baştan kurulmalı; tekerlekler küçük kalır.

**B) Stilize "oyuncak" oran (önerilen):** Dingil mesafesi/uzunluk oranını (0,60) koru, genişliği ve yüksekliği oyun diline göre kabarıt.

| Boyut | Öneri | Gerekçe |
|---|---:|---|
| Ölçek (uzunluk) | **×0,62** → U **3,23** | `oldSchool` şasi 3,26 uzunluğunda; oyun için doğal aralık (2,99–3,26) |
| Genişlik | **1,45** (gerçek ×0,62 = 1,17; +%24 stilize) | Oran 0,45; fizik kutusu 1,8 → daralır; devrilmeyi azaltır |
| Yükseklik | **1,00** (gerçek ×0,62 = 0,92; +%8) | Cam çizgisi okunur kalır |
| Dingil mesafesi | **1,95** (3,14 × 0,62) | Gerçek orana sadık |
| Tekerlek merkezleri arası iz | **1,16** (z ±0,58) | Dış kenar gövdeyle hizalı; DM/iz = 1,68 |
| Tekerlek yarıçapı | **0,32 fizik / 0,35 görsel** (orijinal +0,032 farkı korunur) | Gerçek ×0,62 ≈ 0,21'in 1,5 katı, oyuncak ölçeği |
| Tekerlek genişliği | **≈0,30** | Orijinal 0,54 yarıçapa göre geniş; W140 225 mm |

Uzunluk ekseni `X`: gövde x −1,62…+1,62 (simetrik, tekerlekler ±0,975). Orijinal gövde x −1,40…+1,59 (hafif öne kaymış); W140 için ön sarkma (0,96 m) arka sarkmadan (1,11 m) kısa, yani simetrik de kabul edilebilir.

### 6.2 Fizikte değişmesi gerekenler (B seçeneği, taslak — oyun içinde `#debug` ile ayarlanmalı)

| Değişken | Şimdi | Öneri |
|---|---|---|
| `wheels.settings.offset` (`PhysicsVehicle.js:141`) | `{x 0.90, y 0, z 0.75}` | `{x 0.975, y 0, z 0.58}` |
| `wheels.settings.radius` (`:142`) | 0,4 | 0,32 |
| Ana collider (`:96`) | `[1.3, 0.4, 0.85]` | `[1.45, 0.32, 0.68]`, kütle ve ağırlık merkezi aynı |
| Üst collider (`:97`) | `[0.5, 0.15, 0.65]`, y 0,4 | `[0.62, 0.17, 0.55]`, y 0,38 |
| Tampon collider (`:98`) | `[1.5, 0.5, 0.9]`, `(0.1, −0.2, 0)` | `[1.62, 0.42, 0.73]`, `(0, −0.15, 0)` |
| `suspensionsHeights` (`:31-35`) | 0,88 / 1,23 / 1,63 | yaklaşık ×0,83: **0,73 / 1,02 / 1,35** (tekerlek küçüldüğü için) |
| `suspensionsStiffness` | 20 / 30 / 40 | aynı kalabilir |
| Boost izi noktaları (`VisualVehicle.js:379`, `:386`) | `(−1.28, 0.1, ±0.55)` | arka tampon altı: yaklaşık `(−1.62, −0.3, ±0.45)` |
| `Track` kalınlıkları (`:287`) | 0,5 | ≈0,35 |

Notlar:
- Direksiyon dönüş yarıçapı ≈ `DM / tan(δ)` = 1,95 / tan(0,5) ≈ 3,6 (şimdi 1,8 / tan(0,5) ≈ 3,3). Yani benzer; `steeringAmplitude` değişmeyebilir.
- Tekerlek merkezi yüksekliği şasi merkezinin `suspensionLength` altında (en fazla −0,5 görsel limit `:454`). Gövde alt kenarı şasi yerelinde yaklaşık −0,55 olmalı; hidrolik "low" konumda yerden yaklaşık 0,16–0,3 boşluk oluşmalı. **Doğrulanmadı;** oyunda `#debug > Physics > Vehicle` panelinden ayarlanır, sonra değerler dosyaya yazılır.
- Debug panelindeki `engineForceAmplitude` ve `topSpeedBoost` aralığı `max: 20` (`:51`, `:54`), kodda 300 ve 40; panel değeri bu aralığa kırpabilir. Ayar yaparken dikkat.
- Fizik kütlesi sabit (2,5); hacim küçülünce yoğunluk artar, sorun beklenmiyor.

### 6.3 Ölçek uygulaması

Blender'da ölçek birimi = oyun birimi (1 BU = 1 birim). Mesh'leri **uygulanmış ölçekle (1,1,1)** üret; orijinaldeki gibi 0,735 obje ölçeği bırakma. Üretim betiği gerçek metre cinsinden tasarlayıp tek bir `S = 0.62` ile çarpabilir.

---

## 7. Referans görseller

`resources/references/w140/` **yok**, `resources/references/` klasörü de yok. `resources/` ve `static/` altında `w140` içeren hiçbir yol bulunmadı. Mevcut `resources/textures/references/` Bruno'nun sosyal ikon referansları (bluesky, discord, twitch, x, youtube, onlyfans), araçla ilgisi yok.

**İstenen referanslar** (kendi arabandan çekilmesi en iyisi):
1. Tam yan profil (mümkün olduğunca düz, uzak çekim)
2. Tam ön ve tam arka
3. Üstten, 3/4 ön ve 3/4 arka
4. Ön far, ızgara + yıldız, arka stop lambası yakın çekim
5. Jant ve lastik yan görünüm

Görseller PNG/JPG olarak bu klasöre konursa okuyup oranları ve çizgileri buradan çıkarabilirim.

---

## 8. Önerilen üretim planı

### 8.1 Genel yaklaşım

- Araç **düşük poligonlu, düz renkli, palette tabanlı** olmalı; bevel ve ince detay yerine okunur siluet. Referans: mevcut araç (3.720 üçgen) ve `oldSchool` (2.020).
- **Betik tabanlı:** `scripts/vehicle/build_w140.py` (yeni klasör; mevcut `scripts/` altında yalnızca `compress.js` var). Çıktı `static/vehicle/w140.glb`.
- Çalıştırma: `bpyenv/bin/python -I scripts/vehicle/build_w140.py -- --out static/vehicle/w140.glb` (resmi Blender kurulursa `Blender -b --python scripts/vehicle/build_w140.py -- --out ...`).
- **Dosya adı:** `default.glb` üzerine yazmak yerine `w140.glb`. Kod değişikliği (sonraki aşama): `Game.js:136` yolu ve `KonamiCode.js:54-57` listesi.
- Her çalıştırmada sıfırdan sahne kur (tekrarlanabilir). Betik ayrı bir `.blend` yazmasın; isterseniz `resources/models/w140.blend` olarak ayrıca kaydedilebilir (`resources/` değiştirilmemesi istenmişti, bu yüzden kararı sana bırakıyorum).

### 8.2 Parça parça kurgu

| # | Parça | Obje adı | Materyal | Bütçe (tri) |
|---|---|---|---|---:|
| 1 | Şasi boş nesnesi (orijin = şasi merkezi) | `chassis` | — | — |
| 2 | Boyalı gövde kabuğu (kaporta, kapılar, bagaj, çamurluklar) | `bodyPainted` | `redGradient` | 700–900 |
| 3 | Boyasız parçalar: cam, ızgara, tamponlar, plastik yan koruma, ayna, kapı kolu, egzoz | `common` | `palette` | 600–900 |
| 4 | Farlar | `headlights` | `emissiveWhiteRadialGradient` | 20–40 |
| 5 | Stop lambası çubuğu | `stopLights` | `emissiveOrangeRadialGradient` | 4–10 |
| 6 | Geri vites/fren lambası | `backLights` | `emissiveOrangeRadialGradient` | 6–20 |
| 7 | Sinyaller | `blinkerLeft`, `blinkerRight` | `emissiveOrangeRadialGradient` | 4+4 |
| 8 | Tekerlek konteyneri (orijin = hub) | `wheelContainer` (+ boş `wheelCylinder`) | — | — |
| 9 | Lastik + jant (−Z yüzü dışa) | `wheel` (`wheelCylinder` altında) | `palette` | 250–400 |

**Bilerek yok:** `energy`, `cell1-3` (turbo hücreleri; kod isteğe bağlı sayıyor, sadece turbo animasyonu görünmez), `antenna`, `wheelSuspension` (gövde altında görünmez), `wheelPainted` (jant gümüş, boyanmasın), `wheelGuard`.

**Ayrı obje olması gerekenler** (kodun materyal veya görünürlük değiştirdiği): `bodyPainted`, `headlights` (materyal), `stopLights`, `backLights`, `blinkerLeft/Right` (görünürlük aç/kapa), `wheelContainer` → `wheelCylinder` → `wheel` (dönüş ve klonlama). Diğer tüm boyasız yüzeyler tek `common` mesh'inde birleşir (çizim sayısını düşük tutar).

**Adlandırma kuralları (Bölüm 4.2):**
- Önek eşleşmesi nedeniyle `chassis`, `bodyPainted`, `wheelContainer`, `blinker*`, `stopLights`, `backLights`, `energy`, `cell`, `antenna` ile başlayan **başka** ad kullanma.
- Blender'da otomatik eklenen `.001` sonekleri sorun değil.
- Aynı zamanda tüm nesnelerde hiyerarşi: `chassis` kökte, parçalar çocuk (orijinaldeki gibi iki kök: `chassis`, `wheelContainer`).

### 8.3 Palette uyumu

- Tüm "palette" yüzeylerinin her yüzü için UV'yi bir palette hücre merkezine nokta olarak ver: `u = (hücre×4 + 2) / 128`, `v = 0,5`. Her yüz tek renk olur; texture ince detay taşımaz. (Orijinalde `common` sadece 3 hücre kullanıyor.)
- Renk eşlemesi (Bölüm 5.5): lastik `22`, trim/plastik `5`/`6`, krom/jant `4`, cam `3` veya `0`, beyaz detay `23`.
- `bodyPainted`: `UVMap` (V = yükseklik oranı, alt 0 → üst 1) ve `UVMap.001` (yan projeksiyon, alevler için). UV adlarını Blender'da `UVMap` ve `UVMap.001` bırak (sıra önemli: ilk UV0).
- Yeni palette rengi gerekirse boş hücrelere ekle (`palette.png` hem `resources/` hem `static/` içinde ve `.ktx` yeniden üretilmeli). Bu tüm dünyayı etkileyen ayrı bir karar.

### 8.4 Modelleme yöntemi

1. **Yan profil poligonu:** referans yan görünümden (x,y) noktaları (ön tampon, kaput, ön cam, tavan, arka cam, bagaj, arka tampon, alt çizgi).
2. **Kesit halkaları:** 6–8 enine kesit (yuvarlatılmış dikdörtgen; yukarı doğru daralan "tumblehome"); `bmesh.ops.bridge_loops` ile bağla.
3. **Tekerlek yuvaları:** çamurluk kemerlerini boolean yerine kesit halkalarında delik olarak kur (düşük tri).
4. **Parçalara ayırma:** yüzleri materyal/obje grubuna ata (kaporta ↔ cam ↔ trim).
5. **Sert kenarlar:** `Smooth by Angle` (≈ 35–40°) veya `shade_auto_smooth`; flat/düz gölgeleme ile oyunun stiline uy.
6. **Simetri:** sol yarıyı kur, `Mirror` + uygula.

### 8.5 Üçgen bütçesi

| Kalem | Orijinal | W140 hedef |
|---|---:|---:|
| Şasi alt ağacı | 2.936 | **≤ 2.400** |
| Tekerlek konteyneri (×4 çizilir) | 784 | **≤ 450** (→ 1.800) |
| **Benzersiz toplam** | **3.720** | **≤ 2.900** |
| **Çizilen toplam** | **≈ 6.070** | **≤ 4.200** |
| Draco'lu dosya | 34,8 KB | **≤ 60 KB** |

Tüm mesh'ler gölge geçişinde de çizildiği için bütçe 2 ile çarpılmış etki yapar.

### 8.6 Export ayarları (bpy 5.2 ile test edildi; yukarıdaki round-trip bu parametrelerle çalıştı)

```python
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_yup=True,
    export_apply=True,            # modifier'lar uygulansın
    export_materials='EXPORT',
    export_normals=True,
    export_texcoords=True,
    export_extras=False,          # custom property gerekmez
    export_cameras=False, export_lights=False, export_animations=False,
    export_draco_mesh_compression_enable=False,   # sıkıştırma sonra
    use_selection=True,           # yalnızca araç objeleri seçili
)
```

- **Ölçek uygulanmış**, rotasyon sıfır, orijin kuralları (şasi merkezi, hub) betikte garanti edilir.
- **Palette için:** `palette` materyalinde Image Texture node'unu **ekleme** (veya mute et). Böylece GLB'ye 362 baytlık gereksiz PNG gömülmez. Oyun `palette` adını zaten kendi texture'ıyla değiştiriyor (Bölüm 5.1).
- Oyunda kullanılacak materyal adları: `palette`, `redGradient`, `emissiveWhiteRadialGradient`, `emissiveOrangeRadialGradient`.
- Dışa aktarılan dosyayı **doğrula** (betik sonunda): zorunlu düğümlerin varlığı, `TEXCOORD_1`'in `bodyPainted`'de olması, üçgen bütçesi, bounding box. (Bu analizde kullandığım `dump.py` bu doğrulamanın temelini oluşturabilir.)

### 8.7 Sıkıştırma

- `VITE_COMPRESSED=1` iken oyun `*-compressed.glb` yüklüyor (`Game.js:97-104`, `:136`). Yani **hem ham hem sıkıştırılmış dosya** repoya girmeli. Konami ham dosyayı yüklüyor.
- Önerilen komut (yalnız Draco; texture yok): 
  ```bash
  npx gltf-transform draco static/vehicle/w140.glb static/vehicle/w140-compressed.glb \
    --method edgebreaker --quantization-volume mesh \
    --quantize-position 12 --quantize-normal 6 --quantize-texcoord 6 \
    --quantize-color 2 --quantize-generic 2
  ```
  Bu komutu `default.glb`'nin round-trip kopyasında denedim: 239 KB → **34 KB**, hatasız.
- `npm run compress` (`scripts/compress.js`) önce `gltf-transform etc1s` çalıştırıyor; bu `toktx` (KTX-Software) gerektiriyor. **Bu makinede `toktx` yok**, `etc1s` komutu "toktx not found" hatası verdi. Ayrıca betik `static/` içindeki tüm GLB ve PNG'leri yeniden işler. Bu yüzden araç için yukarıdaki tek dosyalık Draco komutu daha güvenli.
- Quantize edilen texcoord 6 bit: palette UV'leri 32 hücre için yeterli. **Bunu test et:** sıkıştırma sonrası `bodyPainted` gradyan UV'si (UV0.v) 64 kademeye indiği için hafif bantlaşma olabilir; orijinal modelde de aynı ayar kullanılıyor.

### 8.8 Aşamalar

1. **Doğrulayıcı betik:** GLB'de zorunlu düğümleri/UV'leri/bütçeyi kontrol eder (oyunu açmadan).
2. **Blockout:** `build_w140.py` ile siluet + 4 tekerlek + ışıklar; `gltf-transform inspect` ve gerçek bounding box.
3. **Oyuna bağla (kod, ayrı commit):** `Game.js` yolu, `KonamiCode.js` listesi, `PhysicsVehicle.js` değerleri (Bölüm 6.2), boost noktaları, boya (siyah varsayılan).
4. **Oyunda ayar:** `#debug` ile süspansiyon/ofset oturtma; değerleri koda yaz.
5. **Detay:** far/stop şekilleri, ızgara, jant, aynalar; üçgen bütçesini koru.
6. **Sıkıştırma ve yayın:** Draco, `-compressed.glb`, `npm run build`, boyut kontrolü.

---

## 9. Kısa riskler

- **Siyah renk düz görünür** (Bölüm 5.3). Gradyanlı koyu gri ve açık palette detayları şart.
- **Boya sistemi** ödüllere bağlı; "siyah varsayılan" kodda yapılacak (Bölüm 5.2).
- **Konami** eski araca/Bruno'nun arabasına geri dönebilir (Bölüm 4.1).
- **Önek eşleşmesi:** `parts` anahtarında son eşleşen düğüm kazanıyor; ad çakışması sessiz hata.
- **Fizik değerleri doğrulanmadı;** oyunda ayarlanmalı.
- **Referans görsel yok;** oran ve detay için gerekli.
