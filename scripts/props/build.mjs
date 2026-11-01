/**
 * Prop üretim hattı: kaynak GLB → bpy (sadeleştir + tek atlas) → WebP doku → Draco.
 *
 *   npm run prop -- bakkal
 *
 * Gereksinim: bpy kurulu bir Python (pip install bpy). Yol: BPY_PYTHON ortam değişkeni
 * ya da .venv-bpy/bin/python. Ayarlar scripts/props/props.config.json içinde.
 * Çıktı: static/props/<ad>.glb (WebP dokulu) ve static/props/<ad>-compressed.glb (+ Draco),
 *        resources/references/props/<ad>/renders/ (önce/sonra) ve atlas.png.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const name = process.argv[2]
const config = JSON.parse(readFileSync(path.join(root, 'scripts/props/props.config.json'), 'utf8'))
const prop = config.props.find(p => p.name === name)
if(!prop)
{
    console.error(`"${name}" props.config.json içinde yok. Var olanlar: ${config.props.map(p => p.name).join(', ')}`)
    process.exit(1)
}

const python = process.env.BPY_PYTHON || path.join(root, '.venv-bpy/bin/python')
if(!existsSync(python))
{
    console.error(`bpy Python'u bulunamadı: ${python}\nBPY_PYTHON=/yol/python ile verin (python -m venv .venv-bpy && .venv-bpy/bin/pip install bpy).`)
    process.exit(1)
}

const run = (cmd, args) =>
{
    const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
    if(r.status !== 0)
    {
        console.error(`Başarısız: ${cmd} ${args.join(' ')}`)
        process.exit(r.status || 1)
    }
}
const size = (file) => (statSync(file).size / 1024).toFixed(0) + ' KiB'

const work = path.join(root, 'scripts/props/.work', name)
const renders = path.join(root, 'resources/references/props', name, 'renders')
const outDir = path.join(root, 'static/props')
mkdirSync(work, { recursive: true })
mkdirSync(renders, { recursive: true })
mkdirSync(outDir, { recursive: true })

const src = path.join(work, `${name}.src.glb`)
const atlas = path.join(root, 'resources/references/props', name, 'atlas.png')
const meta = path.join(work, 'meta.json')

// 1) bpy: sadeleştir + atlas + GLB
run(python, ['-I', 'scripts/props/build_prop.py', '--', '--prop', name, '--out', src, '--atlas', atlas, '--meta', meta])

// 2) Render (sonra)
run(python, ['-I', 'scripts/props/render_prop.py', '--', '--glb', src, '--out', renders, '--tag', 'after'])

// 3) WebP doku + Draco
const gt = path.join(root, 'node_modules/.bin/gltf-transform')
const plain = path.join(outDir, `${name}.glb`)
const compressed = path.join(outDir, `${name}-compressed.glb`)
run(gt, ['webp', src, plain, '--quality', String(prop.webpQuality ?? 88)])
run(gt, ['draco', plain, compressed, '--method', 'edgebreaker', '--quantization-volume', 'mesh',
    '--quantize-position', '12', '--quantize-normal', '6', '--quantize-texcoord', '10', '--quantize-color', '2', '--quantize-generic', '2'])

console.log(`\n${name}: ${size(plain)} (WebP) · ${size(compressed)} (WebP + Draco)`)
