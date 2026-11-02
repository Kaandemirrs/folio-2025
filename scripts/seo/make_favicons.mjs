// Favicon seti: portreden (static/intro/portrait.webp, 512×512 yuvarlak çıkartma) türetilir.  node scripts/seo/make_favicons.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.join(root, 'static/favicons')
const source = path.join(root, 'static/intro/portrait.webp')
const BG = '#2a1b3d' // sitenin koyu mor tonu

const square = async (size, padding, background) =>
{
    const inner = Math.round(size * (1 - padding * 2))
    const portrait = await sharp(source).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    return sharp({ create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([ { input: portrait, gravity: 'center' } ]).png().toBuffer()
}

fs.writeFileSync(path.join(out, 'favicon-96x96.png'), await square(96, 0.02))
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), await square(180, 0.1, BG))
fs.writeFileSync(path.join(out, 'web-app-manifest-192x192.png'), await square(192, 0.1, BG))
fs.writeFileSync(path.join(out, 'web-app-manifest-512x512.png'), await square(512, 0.1, BG))

// ICO: 48×48 PNG gömülü tek görüntü
const png48 = await square(48, 0.02)
const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4)
header.writeUInt8(48, 6); header.writeUInt8(48, 7); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12)
header.writeUInt32LE(png48.length, 14); header.writeUInt32LE(22, 18)
fs.writeFileSync(path.join(out, 'favicon.ico'), Buffer.concat([ header, png48 ]))

// SVG: portre gömülü
const png64 = await square(64, 0.02)
fs.writeFileSync(path.join(out, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${png64.toString('base64')}"/></svg>\n`)

fs.writeFileSync(path.join(out, 'site.webmanifest'), JSON.stringify({
    name: 'Kaan Demir',
    short_name: 'Kaan Demir',
    description: 'Kaan Demir — Full Stack & Mobil Geliştirici. Arabayla gezilen interaktif 3D portfolyo.',
    lang: 'tr',
    start_url: '/',
    icons: [
        { src: '/favicons/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/favicons/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/favicons/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    theme_color: BG,
    background_color: BG,
    display: 'standalone',
}, null, 2) + '\n')
console.log('favicon seti yazıldı')
