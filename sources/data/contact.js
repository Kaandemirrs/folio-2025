// İletişim bilgisi tek yerde. E-posta ikonları (ileride), konsol mesajı ve Ana Sayfa bunu kullanır.
export default {
    label: 'Bana ulaşın',          // zarfların altındaki levha
    interactLabel: 'E-posta gönder', // etkileşim etiketi

    // Direk üstünde zarf: dünya konumu (x, z) ve cephe yönü (+X'ten +Z'ye derece; 50 ≈ kamera tarafı). Üçüncü zarf (sosyal alan ikon halkası)
    // areas.glb içinde (sources/data/social.js, SocialArea.js); onun önüne ışınlayan "İletişim" haritası pini için respawn aşağıda.
    envelopes: [
        { id: 'landing', x: 41.5, z: 33.5, facingDeg: 50 },
        { id: 'projects', x: 30.0, z: 17.6, facingDeg: 50 },
    ],
    respawn: { x: 18.7, z: -16.1, rotation: Math.PI / 2 }, // sosyal alandaki zarfın (18.70 / -21.10, cephe +Z) önü
    email: 'kaandmr4331@hotmail.com',
    subject: 'Portfolyo üzerinden iletişim',
    get mailto() { return `mailto:${this.email}?subject=${encodeURIComponent(this.subject)}` },
}
