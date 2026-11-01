// Landing'deki proje panosu (World/ProjectBoard.js). Konum ve görünüm buradan değiştirilir.
export default {
    // Gösterilecek projeler: 'all' (projects.js'teki tümü) | 'featured' (projects.js'te featured: true olanlar) | 'titles' (aşağıdaki liste)
    select: 'all',
    titles: [], // select: 'titles' ise projects.js'teki proje başlıkları, bu sırayla

    heading: 'Projeler',
    interactLabel: 'Proje panosu',

    // Dünya konumu (x, z) ve yüzün baktığı yön: +X'ten +Z'ye derece (50 ≈ kamera tarafı). Eski Kontroller zemin sanatının yeri.
    world: { x: 55.5, z: 31, facingDeg: 50 },
}
