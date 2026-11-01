/**
 * Araç üretim hattı: plaka dokusu → bpy (GLB) → render → Draco.
 *   BPY_PYTHON=/yol/python npm run vehicle -- dogan
 * Ayarlar scripts/vehicle/vehicles.config.json içinde. Çıktı: static/vehicle/<id>.glb ve <id>-compressed.glb
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const config = JSON.parse(readFileSync(path.join(root, 'scripts/vehicle/vehicles.config.json'), 'utf8'))
const id = process.argv[2]
const cfg = config.vehicles[id]
if(!cfg)
{
    console.error(`"${id}" yok. Var olanlar: ${Object.keys(config.vehicles).join(', ')}`)
    process.exit(1)
}
const python = process.env.BPY_PYTHON || path.join(root, '.venv-bpy/bin/python')
if(!existsSync(python))
{
    console.error(`bpy Python'u bulunamadı: ${python}\nBPY_PYTHON=/yol/python ile verin.`)
    process.exit(1)
}
const run = (cmd, args) =>
{
    const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
    if(r.status !== 0) { console.error(`Başarısız: ${cmd} ${args.join(' ')}`); process.exit(r.status || 1) }
}

mkdirSync(path.join(root, cfg.renders), { recursive: true })
run('node', ['scripts/vehicle/make_plate.mjs', id])
run(python, ['-I', 'scripts/vehicle/build_vehicle.py', '--', '--vehicle', id])
run(python, ['-I', 'scripts/vehicle/render_w140.py', '--', '--glb', cfg.out, '--out', cfg.renders, '--tag', `after_${id}`])

const out = path.join(root, cfg.out)
const compressed = out.replace(/\.glb$/, '-compressed.glb')
run(path.join(root, 'node_modules/.bin/gltf-transform'), ['draco', out, compressed, '--method', 'edgebreaker', '--quantization-volume', 'mesh',
    '--quantize-position', '12', '--quantize-normal', '6', '--quantize-texcoord', '6', '--quantize-color', '2', '--quantize-generic', '2'])
const kib = f => (statSync(f).size / 1024).toFixed(0) + ' KiB'
console.log(`\n${id}: ${kib(out)} · ${kib(compressed)} (Draco)`)
