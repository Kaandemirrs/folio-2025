import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(process.argv[2])
const root = doc.getRoot()
for(const name of process.argv.slice(3))
{
    const node = root.listNodes().find(n => n.getName() === name)
    if(!node) { console.log('yok', name); continue }
    const mesh = node.getMesh()
    console.log(name, 'T', node.getTranslation().map(x=>+x.toFixed(3)), 'R', node.getRotation().map(x=>+x.toFixed(4)), 'S', node.getScale().map(x=>+x.toFixed(3)), JSON.stringify(node.getExtras()))
    if(mesh) for(const p of mesh.listPrimitives())
    {
        const uv = p.getAttribute('TEXCOORD_0'); const pos = p.getAttribute('POSITION')
        let mn=[9,9], mx=[-9,-9]
        for(let i=0;i<uv.getCount();i++){const e=uv.getElement(i,[]);for(let k=0;k<2;k++){mn[k]=Math.min(mn[k],e[k]);mx[k]=Math.max(mx[k],e[k])}}
        console.log('  verts', pos.getCount(), 'tris', p.getIndices().getCount()/3, 'uv', mn.map(x=>+x.toFixed(4)), mx.map(x=>+x.toFixed(4)))
        // distinct uv list
        const set=new Set();for(let i=0;i<uv.getCount();i++){const e=uv.getElement(i,[]);set.add(e.map(x=>x.toFixed(4)).join(','))}
        console.log('  distinct uv', [...set].slice(0,12))
    }
    for(const c of node.listChildren()) console.log('  child', c.getName(), c.getTranslation(), c.getScale(), JSON.stringify(c.getExtras()))
}
