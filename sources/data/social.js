// slot: sahnedeki 3D ikon halkasındaki sıra. Halka yarım çember; açı = π · (slot + 0.5) / bağlantı sayısı.
// E-posta ikonunun areas.glb düğümü: scripts/world/world.config.json > social.nodes.
// Aynı sıralama areas.glb yamasında da kullanılır (scripts/world/patch_areas.mjs).
export default [
    { name: 'X', url: 'https://x.com/KaaanFE', align: 'right', slot: 0 },
    { name: 'GitHub', url: 'https://github.com/Kaandemirrs', align: 'right', slot: 1 },
    { name: 'LinkedIn', url: 'https://www.linkedin.com/in/kaandev/', align: 'left', slot: 2 },
    // Zarf: tıklayınca bağlantı açılmaz; adres panoya kopyalanır ve mailto açılır (World/Envelopes.js > contact). 3D ikon kendi zarf modelimiz.
    { name: 'E-posta gönder', action: 'contact', align: 'left', slot: 3 },
]
