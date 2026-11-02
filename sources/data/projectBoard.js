// Landing'deki proje panosu (World/ProjectBoard.js). Konum ve görünüm buradan değiştirilir.
export default {
    // Gösterilecek projeler: 'all' (projects.js'teki tümü) | 'featured' (projects.js'te featured: true olanlar) | 'titles' (aşağıdaki liste)
    select: 'all',
    titles: [], // select: 'titles' ise projects.js'teki proje başlıkları, bu sırayla

    heading: 'Projeler',
    interactLabel: 'Proje panosu',

    // Dünya konumu (x, z) ve yüzün baktığı yön: +X'ten +Z'ye derece (50 ≈ kamera tarafı).
    // Eski yer (Kontroller zemin sanatı) 55.5 / 31 idi; varsayılan kamera açısında ekran-sağ vektörü (0.7071, -0.7071)
    // (scripts/projects/camera_right.mjs ile ölçüldü) olduğundan 3 birim çimlere doğru kaydırıldı: 55.5 + 2.12, 31 - 2.12.
    // (Sağdaki ağacın gövdesi 61.9 / 27.3: 3.5 birimde sağ direğe ≈1.1 birim kalıyordu, 3 birimde ≈1.6.)
    world: { x: 57.62, z: 28.88, facingDeg: 50 },
}
