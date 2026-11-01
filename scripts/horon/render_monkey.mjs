// Maymun modelini önce (kaynak) / sonra (static/props/monkey.glb) birkaç animasyon karesinde renderlar.
//   node scripts/horon/render_monkey.mjs <çıktı-klasörü>
// Kendi küçük HTTP sunucusu ve three (node_modules) ile çalışır; oyun gerekmez.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = process.argv[2] || '.'
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.html': 'text/html' }

const html = `<!doctype html><html><body style="margin:0;background:#cfd8dc">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setSize(1200, 400)
document.body.append(renderer.domElement)
const scene = new THREE.Scene()
scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 2.2))
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(2, 4, 5); scene.add(sun)
const camera = new THREE.PerspectiveCamera(25, 3, 0.1, 100)
camera.position.set(0, 1.1, 9); camera.lookAt(0, 0.95, 0)
const loader = new GLTFLoader()
const load = (url) => new Promise(r => loader.load(url, r))
const before = await load('/resources/references/examples/simio_monkey_dancing.glb')
const after = await load('/static/props/monkey.glb')
const beforeScale = 1.9 / 174.9
const group = (gltf, x, scale) => { const o = gltf.scene; o.scale.setScalar(scale); o.position.x = x; scene.add(o); const mixer = new THREE.AnimationMixer(o); const action = mixer.clipAction(gltf.animations[0]); action.play(); return { mixer, o } }
const a = group(before, -1.6, beforeScale)
const b = group(after, 1.6, 1)
window.renderAt = (t, idle) => {
  a.mixer.setTime(t); b.mixer.setTime(idle ? window.idleTime : t)
  renderer.render(scene, camera)
  return renderer.domElement.toDataURL('image/png')
}
window.idleTime = after.scene.getObjectByName('monkey')?.userData.idleTime ?? 0
window.ready = true
</script></body></html>`

const server = http.createServer((req, res) =>
{
    if(req.url === '/') { res.setHeader('content-type', 'text/html'); res.end(html); return }
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]))
    if(!file.startsWith(root) || !fs.existsSync(file)) { res.statusCode = 404; res.end(); return }
    res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
}).listen(4188)

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage()
page.on('pageerror', e => console.log('hata', e.message)); page.on('console', m => console.log('konsol', m.text().slice(0, 200))); page.on('requestfailed', r => console.log('istek', r.url()))
await page.setViewport({ width: 1200, height: 400 })
await page.goto('http://127.0.0.1:4188/')
await page.waitForFunction('window.ready === true', { timeout: 60000 })
const frames = [ [ 'f0', 0, false ], [ 'f1', 3.1, false ], [ 'f2', 6.6, false ], [ 'f3', 10.2, false ], [ 'idle', 0, true ] ]
for(const [ name, t, idle ] of frames)
{
    const data = await page.evaluate((t, idle) => window.renderAt(t, idle), t, idle)
    fs.writeFileSync(path.join(out, `monkey_${name}.png`), Buffer.from(data.split(',')[1], 'base64'))
}
await browser.close()
server.close()
