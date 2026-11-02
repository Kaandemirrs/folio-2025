# Son kontrol (branch `son-kontrol`)

Domain: https://kaandemirdev.com — ölçümler yerelde (macOS, headless Chrome, production build); canlı sitede ayrıca denenmedi.

## 1) Kalıntı taraması

**Silinenler**
- `static/sounds/musics/`: Baguira.mp3, Sudo.mp3 (Bruno'nun, çalma listesinde yoktu; 12 MB), Boy.mp3, Bruno'ya ait CC0 `license.md`. `static/sounds/stoneSlides/` (kariyer zaman çizelgesi sesleri).
- Kullanılmayan dokular/yazı tipleri: `overlayPattern(Original)`, `interactivePointsKeyIconB/Circle`, `Pally-Variable.*`, tüm `.eot` dosyaları, `map-night.*` (oyun hep gündüz; `Map.js` artık yalnız gündüz haritasını yükler).
- `areas.glb`: kaldırılan alanların (lab, cookie, altar, toilet, circuit, behindTheScene, timeMachine) düğümleri ve dokuları. Areas.js bunları kurmuyordu ama dosyada duruyor, indiriliyor ve ayrıştırılıyordu. Sıkıştırılmış dosya **617 KB → 312 KB**, ≈38 bin üçgen daha az.
- Bağımlılıklar: `vite-plugin-node-polyfills`, `@vitejs/plugin-basic-ssl`. Eski horon dev ara katmanı (`vite.config.js`), `whisperFlame` sıkıştırma kuralları, `measure_rest_height.mjs` (yerine `measure_vehicles.mjs`).
- Nunito 900 ağırlığı (kullanılmıyordu).

**Bilerek kalanlar (meşru kredi/lisans):** `license.md` MIT telif satırı, readme kredisi, Sahne Arkası'ndaki Bruno/folio-2025 kredisi, konsol mesajındaki kredi satırı, araç/model atıfları. Kod yorumlarındaki "Bruno'nun … yerine" notları (iç dokümantasyon).

**İngilizce kullanıcı metni:** taramada yalnızca gamepad tuş adı "Start" kaldı (düğmenin gerçek adı).

**Raporlanıp dokunulmayanlar**
- `@gltf-transform/cli` hiçbir dosyada doğrudan import edilmiyor, ama `core/extensions/functions` paketleri (patch/build betikleri) ve `compress.js` ona bağlı; kaldırılmadı.
- `Game.js` `behindTheScene/stars.ktx` hâlâ araç görselinde kullanılıyor (kalmalı).
- **Eski yarış pisti hâlâ dünyada.** Harita görselini dünyadan render edince pist (ve çevresi) görünüyor: pist `scenery`/zemin dokusunun parçası, sürülebilir. Yeni harita bu yüzden pisti gösteriyor; pisti haritadan çıkarmak değil, dünyadan kaldırmak ayrı bir iş (terrain + scenery).
- `ANALYSIS.md`, `PERFORMANCE.md`, `VEHICLE_SPEC.md` önceki işlerin dokümanı; güncellenmedi.

**Harita:** `static/ui/map/map-day.png|webp` güncel dünyadan yeniden render edildi (`scripts/map/render_map.mjs`; kameranın görebildiği her şey çizilsin diye zemin/su büyütülür, 1024×1024, eşleme `Map.js worldToMap`: u = x/192+0.5, v = z/192+0.5). Çim kılları uzaktan koyu kaldığı için çim ve asfalt `terrain.png` maskesiyle renk düzeltmesinden geçirildi. Pinler (Başarımlar, Bowling, Kariyer, Başlangıç, Projeler, Sosyal, İletişim, Bakkal, Müzik) doğru alanlara düşüyor: `resources/references/son-kontrol/screens/map_pins.png`.

**Kullanıcı kararı bekliyor**
1. `projects.js`: 6 projenin hepsinde `url: null` (TODO). Link yazılana kadar AÇ düğmesi/adres gizli.
2. Sahne Arkası'nda "NazlıcanıM" için sanatçı adı ve kaynak/lisans TODO'su; müziklerin genel hak notu (`index.html`). Çalma listesindeki parçaların telif durumu sizde.
3. Horon müziği artık repoda ve production'da (`static/sounds/horon/horon.mp3`, 8 MB); telif kontrolünü siz yaptığınızı bildirmiştiniz.
4. Eski yarış pistinin dünyadan kaldırılıp kaldırılmayacağı.
5. E-posta zarfının (bu tur önceki işlerde yapıldı) konumları ve haritadaki "İletişim" pini ofseti elle doğrulanmadı.

## 2) Kalite
- Varsayılan kalite **her cihazda düşük** (`Quality.js`). Ayarlar'dan "Yüksek" seçilince `localStorage('quality')` içinde saklanır (try/catch); kayıt varsa o kullanılır. `isMobile` tespiti duruyor ama kaliteyi belirlemiyor (başka yerde kullanılmıyordu).
- Ayarlar'da kalite düğmesinin altında not: "Yüksek: daha güçlü cihazlar için".

## 3) Performans

Not: masaüstü GPU'sunda kare süresi 16,67 ms'de (vsync) takılı, bu yüzden güvenilir sayılar iş yükü sayılarıdır (çizim çağrısı, üçgen). Telefon profili yalnızca 390×844 @3x emülasyonu; gerçek telefon değil.

**Yükleme (tıklanabilir olana kadar):** 104 istek, **5.196 KB** (önceki rapor: 4.924 KB'a kadar inmişti; araya eklenen proje görselleri, harita, zarf, kariyer görseli vb. yüzünden +0,27 MB; `areas.glb` küçülmesi bunun bir kısmını geri aldı). Tıklanabilir olma süresi (yerel, önbelleksiz): WebGPU masaüstü 1,5 s (düşük) / 1,8 s (yüksek); telefon 1,4 / 1,6 s; WebGL 5,3–9,6 s (shader derleme).

**Draw call / üçgen (WebGPU, 4 alanın ortalaması aralığı):**

| Profil | Kalite | Landing | Projeler | Bakkal | Horon |
|---|---|---|---|---|---|
| Masaüstü 1920×1080 | düşük | 146 dc / 348k | 192 / 348k | 130 / 355k | 80 / 335k |
| Masaüstü 1920×1080 | yüksek | 242 / 448k | 237 / 416k | 179 / 440k | 92 / 412k |
| Telefon 390×844 | düşük | 160 / 352k | 179 / 348k | 124 / 354k | 80 / 336k |
| Telefon 390×844 | yüksek | 213 / 426k | 238 / 418k | 178 / 441k | 90 / 413k |

WebGL zorlanmış koşuda (adrese `#webgl`; aynı sayılar ±1 dc) tüm alanlar hatasız çalıştı. Tam tablo: `resources/references/son-kontrol/final_perf.json`.

**Önceki ölçümle (PERFORMANCE.md) karşılaştırma:** masaüstü düşük 198 dc / 355k → landing'de 146 dc / 348k; telefon düşük 143 / 348k → 160 / 352k (landing; yeni zarf/pano/tabelalar eklendi). Üçgen düzeyinde gerileme yok; yüksek kalite 204 dc / 415k → 242 / 448k (landing; yeni zarf, tabela, pano, 4 maymun). Bu artış kasıtlı eklenen içeriğin bedeli; düşük kalite (artık varsayılan) önceki düzeyde.

**Bellek (sızıntı) — bulundu ve düzeltildi:** garaj geçişi (araç seçimi) her seferinde **+5 geometri, +5 texture** bırakıyordu. Neden: `Tracks.remove()` eski aracın zemin izlerini yalnızca listeden çıkarıyor, çizim sahnesinden kaldırmıyor/dispose etmiyordu. Düzeltildi. Sonra: kalite değişimi, garaj gir-çık, alan gezintisi, araç seçimi 3 tur üst üste → geometri/texture sayısı sabit (180/62, `final_perf.json > leak`).

**Konsol:** production build'de 8 koşuda (WebGPU/WebGL × masaüstü/telefon × düşük/yüksek) hata ve uyarı yok.

**Başlıklar (`static/_headers`, Workers statik varlıklar `dist/` kökündeki dosyayı destekler):** `/assets/*` 1 yıl immutable; `.glb/.ktx` 1 gün + stale-while-revalidate; ses/görsel 7 gün; HTML `max-age=0, must-revalidate`; `.wasm` `application/wasm`; `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. **CSP eklenmedi** (WebGPU/wasm/Google Fonts ile çalıştığı canlıda doğrulanmadan sertleştirme riskli); eklenecekse yalnızca report-only başlıkla denenmeli. Başlıkların Cloudflare'de etkin olduğunu canlıda doğrulayın (`curl -I`).

**Font:** preconnect vardı, `display=block` → `swap`, Nunito 900 çıkarıldı.

## 4) SEO
- `index.html`: Türkçe `<html lang>`, başlık "Kaan Demir | Full Stack & Mobil Geliştirici, SaaS Mühendisi", description, canonical, robots, theme-color, OG (mutlak görsel URL'si, 1200×630, alt), Twitter kartı, JSON-LD (`Person` + `WebSite`), sr-only `h1` + özet (oyundaki Ana Sayfa metniyle aynı), `<noscript>`, giriş ekranı köşesinde ve Ana Sayfa sekmesinde "Metin sürümü / CV".
- Paylaşım görseli: oyundan gerçek ekran görüntüsü (landing, yüksek kalite), 271 KB PNG (`resources/references/son-kontrol/screens/share-image.png`).
- `/hakkimda/`: statik, JS'siz, 15,8 KB (gzip 4,2 KB), veri `projects.js`/`contact.js`/`social.js`'ten üretilir (`scripts/seo/build_about.mjs`); Person + WebSite + ProfilePage + ItemList JSON-LD (geçerli JSON, zorunlu alanlar dolu; Google Rich Results aracıyla canlıda ayrıca doğrulayın). Çok sayfalı Vite build.
- `robots.txt`, `sitemap.xml` (/ ve /hakkimda/), favicon seti (portreden), manifest (ad, kısa ad, tema rengi).
- **Kariyer metni (görselden okundu, onay gerek):** Kozlu Anadolu Lisesi — Lise Mezunu — 2020; Beykent Üniversitesi — Üniversite Mezunu — 2026; Freelance Geliştirici — 1+ Yıl Deneyim — 2024 – Günümüz. Ana Sayfa metni "2026'da mezun oluyorum" diyor, görsel "Üniversite Mezunu" diyor; tutarlılığı siz karar verin. Teknolojiler listesindeki "Next.js" yalnızca Beykent proje görselinden geldi.
- 404/SPA: `wrangler.jsonc` `single-page-application`; `/hakkimda/` gerçek dosya olduğu için kendi sayfasını verir, bilinmeyen yollar ana sayfaya döner (SPA davranışı). Canlıda doğrulayın.

**Lighthouse (yerel `vite preview`, Lighthouse 13.6):**

| Sayfa | Cihaz | Performans | Erişilebilirlik | En iyi uygulamalar | SEO |
|---|---|---|---|---|---|
| `/hakkimda/` | mobil | 98 | 100 | 100 | 100 |
| `/hakkimda/` | masaüstü | 100 | 100 | 100 | 100 |
| `/` | mobil | 37 | 100 | 100 | 100 |
| `/` | masaüstü | 60 | 100 | 100 | 100 |

`/` performansı düşük çünkü sayfa 3 MB JS + 1,6 MB wasm + ağır 3D sahne yüklüyor (Lighthouse'un yavaş mobil simülasyonu); beklenen. İlk koşuda `/` SEO 92 / erişilebilirlik 84'tü: menü ve harita düğmelerinde ad, harita ikonunda alt yoktu; düzeltildi. Ham raporlar: `resources/references/son-kontrol/lighthouse/`.

## 5) Son doğrulama
- `npm run build` hatasız; **dist 67 MB → 42 MB**. En büyük dosyalar: horon.mp3 8,0 MB, Kullenen-Ask 6,6, Cimilli-Ibo 6,0, NazlicanIM 5,4 (müzikler), main JS 3,1, Rapier wasm 1,6.
- Müzik üst üste çalma hatası düzeltildi (ayrı commit): `playlist.suspend/resume` kimliksiz `play()` ile yeni örnek açıyordu; çalan örnek kimliği saklanır (hızlı horon başlat/durdur: 3 örnek → 1).

### Elle test listesi (masaüstü + telefon)
1. Giriş: "TIKLA/DOKUN VE BAŞLA" etiketine tıklama/dokunma, ses düğmesi
2. Sürüş, her alan (landing, projeler, bakkal, kariyer, sosyal, bowling, başarımlar, horon)
3. Garaj: araç seçimi, Esc, hızlı gir-çık, yavaş ağda seçim
4. Horon başlat/durdur ve müzik: aynı şarkının iki kez çalmadığı (sekme değiştirip dönünce de)
5. Jukebox şarkı değiştirme; ses düğmesi (harita altında)
6. Tabelalar, proje panosu, Projeler alanı (açıklama paneli), kariyer panosu + modal (pinch-zoom)
7. Zarflar: kopyalama + bildirim + mail uygulamasının açılması
8. Menü (Ana Sayfa "Metin sürümü / CV" bağlantısı), harita pinleri (özellikle İletişim ve Müzik)
9. Ayarlar: kalite düğmesi, tercihin yenilemeden sonra hatırlanması
10. `/hakkimda/` masaüstü + telefon; link önizlemesi (Slack/WhatsApp/X paylaşım doğrulayıcıları; canlı URL ile)
11. Canlıda: `curl -I` ile `_headers` etkisi, rastgele yol davranışı, `sitemap.xml`
