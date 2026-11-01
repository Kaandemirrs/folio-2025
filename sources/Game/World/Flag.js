import * as THREE from 'three/webgpu'
import { cross, Fn, float, normalize, sin, smoothstep, texture, uniform, uv, vec2, vec3 } from 'three/tsl'
import { Game } from '../Game.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'
import { remapClamp } from '../utilities/maths.js'
import propsConfig from '../../../scripts/props/props.config.json'
import worldConfig from '../../../scripts/world/world.config.json'

// Landing'deki Türk bayrağı. Direk sabit (Props'taki gibi çarpıştırıcılı), bez rüzgâr gölgelendiricisiyle hareket eder:
// direğe yakın kenar sabit, serbest uç rüzgâr yönünde uzanır; rüzgâr zayıfken bez sarkar, güçlüyken yatay uzanıp dalgalanır.
// Bez ızgarasının UV'si (u: direkten uca, v: yukarıdan aşağı) konumu belirler; mesh'in kendi köşe konumları kullanılmaz.
// Varlık: scripts/world/build_flag.py → static/props/turkishFlag.glb (props.config.json > "turkishFlag", custom: "flag")
export class Flag
{
    static NAME = 'turkishFlag'

    constructor()
    {
        this.game = Game.getInstance()

        const prop = propsConfig.props.find(item => item.name === Flag.NAME)
        const cloth = worldConfig.flag.cloth
        this.model = this.game.resources[`prop_${Flag.NAME}`].scene
        this.position = new THREE.Vector3(prop.world.x, prop.world.y ?? 0, prop.world.z)

        this.setUniforms(cloth)
        this.setMaterial(cloth)
        this.setModel(prop)
        this.setPhysics(prop)

        this.game.ticker.events.on('tick', () => { this.update() }, 14)
    }

    setUniforms(cloth)
    {
        this.phase = uniform(0)
        this.amplitude = uniform(0.1)
        this.droop = uniform(0)
        this.width = cloth.width
        this.height = cloth.height
        this.pivot = new THREE.Vector3(cloth.pivot[0], cloth.pivot[1], 0)
    }

    setMaterial(cloth)
    {
        const wind = this.game.wind
        const pivot = vec3(this.pivot.x, this.pivot.y, 0)
        const up = vec3(0, 1, 0)

        // Bezin (u, v) noktası → direk yerelinde konum
        const surface = Fn(([ u, v ]) =>
        {
            const windDirection = vec3(wind.direction.x, 0, wind.direction.y)
            const cosPhi = this.droop.cos()
            const sinPhi = this.droop.sin()

            // a: direkten uca (sarkma payı kadar aşağı eğik), b: yukarıdan aşağı (a'ya dik)
            const a = windDirection.mul(cosPhi).sub(up.mul(sinPhi))
            const b = up.mul(cosPhi).add(windDirection.mul(sinPhi)).negate()
            const n = normalize(cross(a, b))

            const along = u.mul(cloth.width)
            const down = v.mul(cloth.height)

            // Serbest uca doğru büyüyen iki dalga + rüzgâr gürültüsüyle değişen şiddet
            const gust = wind.offsetNode(vec2(this.position.x + this.pivot.x, this.position.z).add(along.mul(0.3))).dot(windDirection.xz).mul(2.5).add(1).max(0.2)
            const grow = smoothstep(0, 0.35, u).mul(u.mul(0.6).add(0.4))
            const wave1 = sin(along.mul(7).sub(this.phase).add(down.mul(2.3)))
            const wave2 = sin(along.mul(11).sub(this.phase.mul(1.7)).add(down.mul(4.1)).add(1.2)).mul(0.4)
            const flutter = wave1.add(wave2).mul(this.amplitude).mul(gust).mul(grow)

            return pivot.add(a.mul(along)).add(b.mul(down)).add(n.mul(flutter))
        })

        const uvNode = uv()
        const position = surface(uvNode.x, uvNode.y)

        // Normal: yüzeyin türevlerinden
        const epsilon = float(0.01)
        const du = surface(uvNode.x.add(epsilon), uvNode.y).sub(position)
        const dv = surface(uvNode.x, uvNode.y.add(epsilon)).sub(position)
        const normal = normalize(cross(du, dv))

        const map = this.model.getObjectByName('cloth').material.map
        map.colorSpace = THREE.SRGBColorSpace

        this.material = new MeshDefaultMaterial({
            colorNode: texture(map).rgb,
            normalNode: normal,
            side: THREE.DoubleSide,
            hasWater: false,
        })
        // Köşe konumu ızgaranın kendi konumu değil, hesaplanan yüzey
        this.material.positionNode = position
    }

    setModel(prop)
    {
        // Direk: palette, oyunun ortak malzemesi
        const pole = this.model.getObjectByName('pole')
        const cloth = this.model.getObjectByName('cloth')

        this.game.materials.updateObject(pole)
        pole.castShadow = this.game.quality.pick(true, false)
        pole.receiveShadow = true

        cloth.material = this.material
        cloth.frustumCulled = false // köşeler gölgelendiricide taşınır, ızgara sınırı geçersiz
        cloth.castShadow = false
        cloth.receiveShadow = true

        this.group = new THREE.Group()
        this.group.name = Flag.NAME
        this.group.position.copy(this.position)
        this.group.add(this.model)
        this.game.scene.add(this.group)
    }

    setPhysics(prop)
    {
        const colliders = (prop.colliders ?? []).map(collider => ({
            shape: 'cuboid',
            parameters: collider.half,
            position: { x: collider.center[0], y: collider.center[1], z: collider.center[2] },
            category: 'object',
        }))

        this.game.objects.add(
            null,
            {
                type: 'fixed',
                position: this.position,
                rotation: new THREE.Quaternion(),
                friction: 0.25,
                restitution: 0.1,
                colliders: colliders,
            }
        )
    }

    update()
    {
        // Rüzgâr şiddeti 0.1 (sakin) … 1 (fırtına). Sakinde bez sarkar, güçlüyse yatay uzanır ve dalgalanır
        const strength = this.game.wind.strength.value
        const extension = remapClamp(strength, 0.05, 0.45, 0, 1)

        this.droop.value = (1 - extension * extension * (3 - 2 * extension)) * 1.15
        this.amplitude.value = 0.035 + strength * 0.2
        this.phase.value += this.game.ticker.deltaScaled * (2 + strength * 7)
    }
}
