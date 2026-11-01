# Kaan Demir — Interaktif 3D Portfolyo

Arabayla gezilen, Three.js (WebGPU / TSL) ve Rapier ile yapılmış kişisel portfolyo sitem.

## Çalıştırma

[Node.js](https://nodejs.org/en/download/) kurulu olmalı.

```bash
# .env dosyasını oluştur
cp .env.example .env

# Bağımlılıkları kur
npm install --force

# Geliştirme sunucusu
npm run dev

# Üretim derlemesi (dist/ klasörüne)
npm run build
```

`.env` içinde en azından `VITE_COMPRESSED=1` ve `VITE_MUSIC=1` olmalı. Bir değişkeni kapatmak için `0` yazma, boş bırak.

## Hata ayıklama

Geliştirme sunucusunda (`npm run dev`) adresin sonuna `#debug` ekleyip sayfayı yenile; `#stats`, `#inspector` ve `#skip` da kullanılabilir. Bu araçlar production build'de kapalıdır; açmak için build sırasında `VITE_DEBUG=1` tanımla.

## Kredi

Bu proje, [Bruno Simon](https://bruno-simon.com)'ın MIT lisanslı açık kaynak projesi
[folio-2025](https://github.com/brunosimon/folio-2025) üzerine kurulmuştur. Dünya, fizik ve render altyapısı onun çalışmasıdır. Lisans için `license.md` dosyasına bak.

Araç modeli: ['Mercedes S-Class'](https://sketchfab.com/3d-models/mercedes-s-class-581e6ce2ba48448a96dc3512d9385bc2) — dmas ([sketchfab.com/dmastero](https://sketchfab.com/dmastero)), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), Sketchfab; sadeleştirildi, yeniden boyandı ve oyuna uyarlandı.

## Araç modelini yeniden üretmek

```bash
# 1) Plaka dokusu (sharp)
node scripts/vehicle/make_plate.mjs
# 2) Palette (W140 renkleri, PNG + KTX2)
node scripts/vehicle/make_palette.mjs
# 3) Modeli üret (Blender'ın bpy modülü; resmi Blender ile: Blender -b --python ...)
python -I scripts/vehicle/build_w140.py -- --out static/vehicle/w140.glb
# 4) Draco ile sıkıştır
npx gltf-transform draco static/vehicle/w140.glb static/vehicle/w140-compressed.glb --method edgebreaker --quantization-volume mesh --quantize-position 12 --quantize-normal 6 --quantize-texcoord 6 --quantize-color 2 --quantize-generic 2
# 5) Doğrula
node scripts/vehicle/validate_vehicle.js static/vehicle/w140.glb static/vehicle/w140-compressed.glb
```
