import propsConfig from '../../scripts/props/props.config.json'

// "Müzik" alanı: horon tepen maymunlar (World/Horon.js). Konum, diziliş ve müzik yolu buradan değiştirilir.
export default {
    // Horon müziği: static/sounds/horon/horon.mp3 (telif kontrolü yapıldı, repoda). Geliştirmede vite.config.js aynı kaydı
    // resources/references/examples altındaki Zakara dosyası varsa oradan sunar. Başka kayıt için dosyayı değiştirmek ya da yolu burada vermek yeter;
    // production'da dosya bulunamazsa maymunlar sessizce dans eder.
    musicPath: 'sounds/horon/horon.mp3',
    musicName: 'Zakara Horon Havası (Karadeniz Horonu)',
    musicVolume: 0.7,
    lapRadius: 28, // "Horona katıl" başarımı: bu yarıçap içinde horon çalarken maymunların etrafında tam tur
    listenDistance: 40, // bu mesafeden sonra horon durur, playlist geri gelir
    playlistVolume: 0.2, // Audio.js playlist ses seviyesi

    // Dünya konumu (x, z) ve grubun baktığı yön: +X'ten +Z'ye derece. Sol üstteki orman adasında açıklık.
    // (props.config.json > monkey.world; harita pini ve ışınlanma noktası da oradan gelir)
    world: propsConfig.props.find(prop => prop.name === 'monkey').world,

    // Diziliş: 4 maymun yan yana, hafif yay (uçlar izleyiciye doğru), uçlar içe döner
    count: 4,
    spacing: 1.2,
    arcDepth: 0.2, // uç maymunun merkeze göre öne çıkışı: arcDepth * i²
    turnInwardDeg: 7,
    timeOffsets: [ 0, 0.1, 0.05, 0.14 ], // saniye, ≤ 0,15

    // Fizik (sabit kutu collider, maymun yerel koordinatı)
    collider: { half: [ 0.38, 0.95, 0.3 ], centerY: 0.95 },

    loadDistance: 90, // oyuncu bu mesafeye yaklaşınca model yüklenir (ilk yüklemede yok)
    visibleRadius: 6, // görünürlük testi yarıçapı

    // Sahne: zemine "HORON" tabelası ve fenerler (Lanterns.js'e eklenir). Tabela props.config.json > signs içinde.
    lanterns: [
        { x: -63.6, z: -42.5 },
        { x: -63.6, z: -51.5 },
    ],
}
