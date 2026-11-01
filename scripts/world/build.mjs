/**
 * Dünya üretim hattı: bpy ile harfler (ve sonraki adımların varlıkları) → areas.glb yaması.
 *
 *   BPY_PYTHON=/yol/python npm run world
 *
 * Her zaman resources/original/ altındaki temiz kaynaktan çalışır.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const python = process.env.BPY_PYTHON || path.join(root, '.venv-bpy/bin/python')
if(!existsSync(python))
{
    console.error(`bpy Python'u bulunamadı: ${python}\nBPY_PYTHON=/yol/python ile verin.`)
    process.exit(1)
}

const run = (cmd, args) =>
{
    const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
    if(r.status !== 0)
        process.exit(r.status || 1)
}

const work = path.join(root, 'scripts/world/.work')
mkdirSync(work, { recursive: true })

run(python, [ '-I', 'scripts/world/build_letters.py', '--', '--out', `${work}/letters.glb`, '--meta', `${work}/letters.json`, '--sheet', 'resources/references/world/renders/letters_sheet.png' ])
run('node', [ 'scripts/world/patch_areas.mjs' ])

// Türk bayrağı: doku → bpy (direk + bez) → WebP → Draco
const gt = path.join(root, 'node_modules/.bin/gltf-transform')
run('node', [ 'scripts/world/make_flag_texture.mjs' ])
run(python, [ '-I', 'scripts/world/build_flag.py', '--', '--out', `${work}/turkishFlag.src.glb` ])
run(gt, [ 'webp', `${work}/turkishFlag.src.glb`, 'static/props/turkishFlag.glb', '--quality', '90' ])
run(gt, [ 'draco', 'static/props/turkishFlag.glb', 'static/props/turkishFlag-compressed.glb', '--method', 'edgebreaker', '--quantization-volume', 'mesh', '--quantize-position', '12', '--quantize-normal', '6', '--quantize-texcoord', '10', '--quantize-color', '2', '--quantize-generic', '2' ])
