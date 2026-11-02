// Metin sürümü sayfası: sources/hakkimda/index.html (statik, JS'siz) + web görselleri (static/hakkimda/*.webp).
// İçerik oyundakiyle AYNI kaynaktan gelir: sources/data/projects.js, contact.js, social.js; Ana Sayfa metni ve kariyer bilgisi aşağıda
// (sources/index.html Ana Sayfa sekmesiyle birebir). Çalıştır: node scripts/seo/build_about.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const load = async (file) => (await import(pathToFileURL(path.join(root, file)).href)).default
const projects = await load('sources/data/projects.js')
const contact = await load('sources/data/contact.js')
const social = (await load('sources/data/social.js')).filter(link => link.url)

const SITE = 'https://kaandemirdev.com'
const TITLE = 'Kaan Demir — Hakkımda, Projeler ve Kariyer | Full Stack & Mobil Geliştirici'
const DESCRIPTION = 'Kaan Demir: Full Stack ve mobil geliştirici, SaaS mühendisi. Flutter, React, Supabase ve AWS ile geliştirdiği 6 proje, kariyer yolculuğu ve iletişim bilgileri — interaktif 3D portfolyonun metin sürümü.'
const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Ana Sayfa sekmesi metni (sources/index.html > home-content ile aynı)
const about = [
    'Merhaba, ben Kaan. iOS, Android ve web için uçtan uca ürün geliştiriyorum. App Store\'da yayında uygulamalarım var, Harvard Innovation Labs bünyesinde SaaS arayüzleri tasarladım ve Upwork üzerinden ABD, Avusturya, Almanya ve Nepal\'deki müşterilere $12.000\'ı aşan freelance proje teslim ettim.',
    'Flutter, Kotlin Multiplatform, React, Firebase ve AWS ile çalışıyor, arayüzlerimi Figma\'da tasarlıyorum. 2026\'da Beykent Üniversitesi Yazılım Mühendisliği bölümünden mezun oluyorum; mobil, SaaS ve full-stack odaklı pozisyonlara açığım.',
]
// Kariyer görselinin (static/career/kariyer.webp) metin hâli
const career = [
    { title: 'Kozlu Anadolu Lisesi', detail: 'Lise Mezunu', period: '2020' },
    { title: 'Beykent Üniversitesi', detail: 'Üniversite Mezunu', period: '2026' },
    { title: 'Freelance Geliştirici', detail: '1+ Yıl Deneyim', period: '2024 – Günümüz' },
]
const technologies = [ 'Flutter', 'Kotlin Multiplatform', 'React', 'Next.js', 'Firebase', 'Supabase', 'AWS', 'Figma', 'SaaS', 'UI/UX' ]

// Proje görselleri: işlenmiş 960×540 PNG → WebP
const names = { 'Beykent Üniversitesi': 'beykent-1', 'Loyalty SaaS': 'loyalty-1', 'Mobil Uygulamalar': 'mobil-1', 'Yinego': 'yinego-1', 'getcvportfolio': 'getcvportfolio-1', 'EvimAI': 'evimai-1' }
for(const project of projects)
{
    const name = names[project.title]
    await sharp(path.join(root, `resources/references/projeler/processed/${name}.png`)).webp({ quality: 78 }).toFile(path.join(root, `static/hakkimda/${name}.webp`))
    project.web = `/hakkimda/${name}.webp`
}
fs.copyFileSync(path.join(root, 'static/career/kariyer.webp'), path.join(root, 'static/hakkimda/kariyer.webp'))

const person = {
    '@type': 'Person',
    '@id': `${SITE}/#kaan-demir`,
    name: 'Kaan Demir',
    jobTitle: 'Full Stack & Mobil Geliştirici',
    url: `${SITE}/`,
    image: `${SITE}/intro/portrait.webp`,
    email: `mailto:${contact.email}`,
    nationality: { '@type': 'Country', name: 'Türkiye' },
    address: { '@type': 'PostalAddress', addressCountry: 'TR' },
    alumniOf: { '@type': 'CollegeOrUniversity', name: 'Beykent Üniversitesi' },
    knowsAbout: [ 'Flutter', 'Kotlin Multiplatform', 'React', 'Firebase', 'Supabase', 'AWS', 'Figma', 'SaaS', 'UI/UX' ],
    sameAs: social.map(link => link.url),
}
const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
        person,
        { '@type': 'WebSite', '@id': `${SITE}/#website`, name: 'Kaan Demir', url: `${SITE}/`, inLanguage: 'tr', publisher: { '@id': `${SITE}/#kaan-demir` } },
        {
            '@type': 'ProfilePage', '@id': `${SITE}/hakkimda/#page`, url: `${SITE}/hakkimda/`, name: TITLE, inLanguage: 'tr', mainEntity: { '@id': `${SITE}/#kaan-demir` },
        },
        {
            '@type': 'ItemList', name: 'Projeler', itemListElement: projects.map((project, i) => ({
                '@type': 'ListItem', position: i + 1,
                item: { '@type': 'CreativeWork', name: project.title, description: project.description, image: `${SITE}${project.web}`, creator: { '@id': `${SITE}/#kaan-demir` }, inLanguage: 'tr', ...(project.url ? { url: project.url } : {}) },
            })),
        },
    ],
}

const attr = { role: 'Rol', at: 'Kurum', with: 'Nerede' } // oyundaki etiketlerle aynı
const projectHtml = projects.map(project => `
        <article class="project">
            <img src="${project.web}" width="960" height="540" loading="lazy" alt="${esc(project.title)} proje görseli">
            <h3>${esc(project.title)}</h3>
            <dl>${Object.entries(project.attributes).map(([ key, value ]) => `<div><dt>${attr[key]}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
            <p>${esc(project.description)}</p>
            <ul class="tags">${project.highlights.map(item => `<li>${esc(item)}</li>`).join('')}</ul>${project.url ? `\n            <p><a href="${esc(project.url)}" rel="noopener">Projeyi aç</a></p>` : ''}
        </article>`).join('\n')

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(TITLE)}</title>
    <meta name="description" content="${esc(DESCRIPTION)}">
    <meta name="robots" content="index,follow">
    <meta name="theme-color" content="#2a1b3d">
    <link rel="canonical" href="${SITE}/hakkimda/">
    <meta property="og:type" content="profile">
    <meta property="og:site_name" content="Kaan Demir">
    <meta property="og:locale" content="tr_TR">
    <meta property="og:url" content="${SITE}/hakkimda/">
    <meta property="og:title" content="${esc(TITLE)}">
    <meta property="og:description" content="${esc(DESCRIPTION)}">
    <meta property="og:image" content="${SITE}/social/share-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Kaan Demir portfolyosu: KAAN DEMİR yazısı, siyah W140 ve Türk bayrağı">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(TITLE)}">
    <meta name="twitter:description" content="${esc(DESCRIPTION)}">
    <meta name="twitter:image" content="${SITE}/social/share-image.png">
    <link rel="icon" type="image/png" href="/favicons/favicon-96x96.png" sizes="96x96">
    <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg">
    <link rel="shortcut icon" href="/favicons/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png">
    <link rel="manifest" href="/favicons/site.webmanifest">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Amatic+SC:wght@700&family=Nunito:wght@400;700&display=swap" rel="stylesheet">
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <style>
        :root { --bg: #1d1721; --card: #2a1b3d; --text: #f6ebe0; --muted: #cdb9c9; --accent: #ff9a4d; --accent2: #c365ef; }
        * { box-sizing: border-box; }
        body { margin: 0; background: radial-gradient(ellipse at top, #46123b, var(--bg) 60%); color: var(--text); font: 400 18px/1.65 Nunito, system-ui, sans-serif; }
        a { color: var(--accent); }
        a:focus-visible { outline: 3px solid var(--accent2); outline-offset: 2px; }
        .wrap { max-width: 880px; margin: 0 auto; padding: 24px 20px 64px; }
        nav { display: flex; flex-wrap: wrap; gap: 8px 20px; padding: 8px 0 24px; }
        h1, h2, h3 { font-family: "Amatic SC", Nunito, sans-serif; font-weight: 700; letter-spacing: .02em; line-height: 1.05; margin: 0; }
        h1 { font-size: clamp(56px, 12vw, 96px); }
        h2 { font-size: clamp(40px, 8vw, 56px); margin: 56px 0 16px; color: var(--accent); }
        h3 { font-size: 36px; margin: 12px 0 4px; }
        .role { font-size: 22px; font-weight: 700; color: var(--muted); margin: 4px 0 20px; }
        .project { background: var(--card); border-radius: 16px; padding: 16px; margin: 0 0 24px; }
        .project img { width: 100%; height: auto; border-radius: 10px; display: block; }
        dl { margin: 0 0 8px; } dl div { display: flex; gap: 8px; } dt { color: var(--muted); min-width: 64px; } dd { margin: 0; font-weight: 700; }
        .tags { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
        .tags li { border: 1px solid var(--accent); border-radius: 999px; padding: 2px 12px; font-size: 15px; }
        .career li { margin: 0 0 12px; } .career strong { display: block; }
        .back { display: inline-block; margin-top: 40px; padding: 12px 22px; border-radius: 999px; background: linear-gradient(135deg, #c21515, #46123b); color: #fff; text-decoration: none; font-weight: 700; }
        footer { margin-top: 48px; color: var(--muted); font-size: 14px; }
    </style>
</head>
<body>
<div class="wrap">
    <nav aria-label="Sayfa menüsü">
        <a href="/">3D portfolyoya dön</a><a href="#projeler">Projeler</a><a href="#kariyer">Kariyer</a><a href="#teknolojiler">Teknolojiler</a><a href="#iletisim">İletişim</a>
    </nav>
    <header>
        <h1>Kaan Demir</h1>
        <p class="role">Full Stack &amp; SaaS Mühendisi</p>
    </header>
    <main>
        <section aria-labelledby="hakkimda">
            <h2 id="hakkimda">Hakkımda</h2>
${about.map(text => `            <p>${esc(text)}</p>`).join('\n')}
        </section>
        <section aria-labelledby="projeler">
            <h2 id="projeler">Projeler</h2>${projectHtml}
        </section>
        <section aria-labelledby="kariyer">
            <h2 id="kariyer">Kariyer</h2>
            <img src="/hakkimda/kariyer.webp" width="1672" height="941" loading="lazy" style="width:100%;height:auto;border-radius:12px" alt="Kariyer yolculuğum: Kozlu Anadolu Lisesi (2020), Beykent Üniversitesi (2026), Freelance Geliştirici (2024 – Günümüz)">
            <ol class="career">
${career.map(item => `                <li><strong>${esc(item.title)}</strong>${esc(item.detail)} · ${esc(item.period)}</li>`).join('\n')}
            </ol>
        </section>
        <section aria-labelledby="teknolojiler">
            <h2 id="teknolojiler">Teknolojiler</h2>
            <ul class="tags">${technologies.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
        </section>
        <section aria-labelledby="iletisim">
            <h2 id="iletisim">İletişim</h2>
            <p>E-posta: <a href="${esc(contact.mailto)}">${esc(contact.email)}</a></p>
            <ul>${social.map(link => `<li><a href="${esc(link.url)}" rel="noopener me">${esc(link.name)}</a></li>`).join('')}</ul>
            <a class="back" href="/">3D portfolyoya dön</a>
        </section>
    </main>
    <footer>© Kaan Demir</footer>
</div>
</body>
</html>
`
fs.writeFileSync(path.join(root, 'sources/hakkimda/index.html'), html)

const today = new Date().toISOString().slice(0, 10)
fs.writeFileSync(path.join(root, 'static/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>
    <url><loc>${SITE}/hakkimda/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
</urlset>
`)
fs.writeFileSync(path.join(root, 'static/robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)
console.log('hakkimda/index.html, sitemap.xml, robots.txt yazıldı;', projects.length, 'proje')
