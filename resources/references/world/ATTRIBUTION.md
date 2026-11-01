# Dünya varlıkları — atıf ve lisans

## Harfler (KAAN DEMİR)
Kaynak klasörü: `resources/references/examples/letter/` (hepsi Sketchfab, GLB `asset.extras.license` = CC-BY-4.0).

| Harf | Model | Yazar | Üçgen (kaynak) | Durum |
|---|---|---|---|---|
| D | D Letter | andre.arancibia | 2264 | kullanıldı (sadeleştirildi) |
| E | E Letter | andre.arancibia | 2828 | kullanıldı (sadeleştirildi) |
| M | M Letter | andre.arancibia | 1876 | kullanıldı (sadeleştirildi) |
| R | R Letter | andre.arancibia | 3650 | kullanıldı (sadeleştirildi) |
| İ | I Letter (küçük "i": gövde + nokta) | andre.arancibia | 1288 | gövde cap yüksekliğine uzatıldı, nokta üste taşındı |
| K | K (lex.brinn) | lex.brinn | 1344 | **kullanılmadı**: serif font, diğer harflerle uyumsuz; yerine prosedürel K |
| A | Letter A (CruxVelox) | CruxVelox | 44 | **kullanılmadı**: çok ince çizgili; yerine prosedürel A |
| N | N (HHN_UnityLab) | HHN_UnityLab | 520 | **kullanılmadı**: yuvarlak uçlu; yerine prosedürel N |

K, A, N `scripts/world/build_letters.py` içinde aynı çizgi kalınlığında üretilir (kaynak model kullanılmadığı için atıf gerekmez).
Oyunda atıf: Sahne Arkası > "Harf modelleri".

## Türk bayrağı
- Model: "Turkish Flag" — oguxhax1929 (https://sketchfab.com/oguxhax1929), Sketchfab
- Kaynak: https://sketchfab.com/3d-models/turkish-flag-b5cd913d6ed54bcc922d088113a7bb14
- Lisans: CC BY 4.0 (GLB `asset.extras.license` = "CC-BY-4.0")
- Kaynak model: 244.732 üçgen, animasyon/skin yok, 3 malzeme (metal, gold, indir), bez donmuş bir poz ve 2:1'e gerilmiş doku.
- Kullanılan: direk ve altın top (sadeleştirildi: 261 üçgen). Bez ve doku kaynaktan alınmadı: bez 28×18 ızgara (1.008 üçgen) + resmî oranlı (2:3, #E30A17) vektör doku; hareket rüzgâr gölgelendiricisinde.
- Oyunda atıf: Sahne Arkası > "Prop modelleri" (props.config.json `turkishFlag.attribution`).
