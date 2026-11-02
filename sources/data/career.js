// Kariyer alanındaki pano (World/CareerBoard.js): içinde yalnızca kariyer görseli. Bruno'nun zaman çizelgesinin yerini alır.
export default {
    heading: 'Kariyer',
    interactLabel: 'Kariyeri incele',

    // Görsel (static/career/kariyer.webp, 1672×941) ve oranı: pano boyu buna göre ayarlanır
    image: { path: 'career/kariyer.webp', width: 1672, height: 941 },
    imageAlt: 'Kariyer yolculuğum: Kozlu Anadolu Lisesi (2020), Beykent Üniversitesi (2026), Freelance Geliştirici (2024 – Günümüz)',

    // Dünya konumu (x, z) ve yüzün baktığı yön (+X'ten +Z'ye derece; 50 ≈ kamera tarafı).
    // Alan merkezi 25.84 / -0.90; Beykent tabelası (24.5 / 2.5) ile çakışmasın diye biraz doğuya/kuzeye alındı.
    world: { x: 28.2, z: -3.2, facingDeg: 50 },

    // Bu genişliğin (CSS px) altında ya da dokunmatik modda görsel, pano yerine tam ekran modalde açılır
    modalMaxWidth: 760,
}
