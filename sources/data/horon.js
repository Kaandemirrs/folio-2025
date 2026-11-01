import propsConfig from '../../scripts/props/props.config.json'

// "Müzik" alanı: horon tepen maymunlar (World/Horon.js). Konum, diziliş ve müzik yolu buradan değiştirilir.
export default {
    // Horon müziği. Telifli kayıt repoya girmez (.gitignore): geliştirmede vite.config.js bunu
    // resources/references/examples/ altındaki Zakara Horon Havası dosyasından (ya da HORON_MUSIC_FILE ortam değişkeninden)
    // '/horon-dev.mp3' adresinde sunar. Production'da 'sounds/horon/horon.mp3' aranır; dosya yoksa maymunlar sessizce dans eder.
    // Telifsiz kayıt bulunca: dosyayı static/sounds/horon/horon.mp3 olarak koy ya da production yolunu burada değiştir.
    musicPath: import.meta.env.DEV ? '/horon-dev.mp3' : 'sounds/horon/horon.mp3',
    musicName: 'Zakara Horon Havası (Karadeniz Horonu)',
    musicVolume: 0.7,
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
