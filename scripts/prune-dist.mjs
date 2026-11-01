// Build sonrası dist/ içinden çalışma anında istenmeyen dosyaları siler (yalnızca VITE_COMPRESSED=1 iken).
// - texture kaynak PNG'leri (yanında .ktx veya .webp karşılığı varsa) — oyun ktx/webp ister
// - sıkıştırılmamış .glb'ler (yanında -compressed.glb varsa)
// Çalıştırma: `npm run build` sonrası otomatik (postbuild), elle: node scripts/prune-dist.mjs
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

if(!process.env.VITE_COMPRESSED)
{
    console.log('[prune-dist] VITE_COMPRESSED boş: ham dosyalar kullanılıyor olabilir, budama atlandı.')
    process.exit(0)
}

// KonamiCode.js bu dosyaları sıkıştırmasız yükler
const KEEP_RAW_GLB = new Set([])

let removed = 0, bytes = 0
const walk = (dir) =>
{
    for(const entry of fs.readdirSync(dir, { withFileTypes: true }))
    {
        const full = path.join(dir, entry.name)
        if(entry.isDirectory()) { walk(full); continue }
        const rel = path.relative(dist, full).split(path.sep).join('/')
        const base = full.replace(/\.[^.]+$/, '')
        let drop = false
        if(rel.endsWith('.png') && (fs.existsSync(base + '.ktx') || fs.existsSync(base + '.webp'))) drop = true
        if(rel.endsWith('.glb') && !rel.endsWith('-compressed.glb') && !KEEP_RAW_GLB.has(rel) && fs.existsSync(full.replace(/\.glb$/, '-compressed.glb'))) drop = true
        if(drop)
        {
            bytes += fs.statSync(full).size
            fs.rmSync(full)
            removed++
        }
    }
}
walk(dist)
console.log(`[prune-dist] ${removed} dosya silindi (${(bytes / 1024 / 1024).toFixed(1)} MB)`)
