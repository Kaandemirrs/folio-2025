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

Adresin sonuna `#debug` ekleyip sayfayı yenile. `#stats`, `#inspector` ve `#skip` da kullanılabilir.

## Kredi

Bu proje, [Bruno Simon](https://bruno-simon.com)'ın MIT lisanslı açık kaynak projesi
[folio-2025](https://github.com/brunosimon/folio-2025) üzerine kurulmuştur. Dünya, fizik ve render altyapısı onun çalışmasıdır. Lisans için `license.md` dosyasına bak.
