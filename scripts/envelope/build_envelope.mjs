// static/props/envelope.glb: kendi zarf modelimiz (scripts/envelope/envelope_geometry.mjs). Dört malzeme (body/flap/trim/seal), baseColor = palet renkleri.
//   node scripts/envelope/build_envelope.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { buildEnvelope, COLORS, countTriangles } from './envelope_geometry.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const parts = buildEnvelope()

const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('envelope')
const group = doc.createNode('envelope')
scene.addChild(group)

const hex = (value) => [ 1, 3, 5 ].map(i => Math.pow(parseInt(value.slice(i, i + 2), 16) / 255, 2.2)).concat(1) // sRGB → doğrusal

for(const [ name, mesh ] of Object.entries(parts))
{
    const material = doc.createMaterial(name).setBaseColorFactor(hex(COLORS[name].hex)).setRoughnessFactor(0.85).setMetallicFactor(0)
    const primitive = doc.createPrimitive()
        .setMaterial(material)
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(mesh.positions)).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(mesh.normals)).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(mesh.indices)).setBuffer(buffer))
    group.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)))
}

await new NodeIO().write(path.join(root, 'static/props/envelope.glb'), doc)
console.log('static/props/envelope.glb yazıldı:', countTriangles(parts), 'üçgen')
