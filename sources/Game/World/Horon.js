import * as THREE from 'three/webgpu'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import gsap from 'gsap'
import { Game } from '../Game.js'
import { Props } from './Props.js'
import { circleIntersectsPolygon } from '../utilities/maths.js'
import propsConfig from '../../../scripts/props/props.config.json'
import horonConfig from '../../data/horon.js'

// "Müzik" alanı: horon tepen 4 maymun. İskeletli model (static/props/monkey.glb) oyuncu yaklaşınca yüklenir (ilk yüklemede yok).
// Performans: 4 maymunun geometrisi tek SkinnedMesh'te birleştirilir (88 kemik, tek çizim + tek gölge); her maymunun kendi
// AnimationMixer'ı küçük zaman ofsetiyle çalışır. Animasyon yalnızca alan görünürken ve (dans ya da geçiş sürerken) güncellenir;
// aksi halde maymunlar "bekleme" pozunda sabit durur. Düşük kalitede gölge yok, güncelleme 30 fps.
export class Horon
{
    constructor()
    {
        this.game = Game.getInstance()
        this.config = horonConfig
        this.propConfig = propsConfig.props.find(prop => prop.name === 'monkey')

        this.dancing = false
        this.loaded = false
        this.loading = false
        this.settled = true // dans yok ve bekleme pozu uygulandı
        this.updateAccumulator = 0

        this.setPlacements()
        this.setPhysics()

        this.game.ticker.events.on('tick', () => { this.update() }, 14)
    }

    // Maymunların dünya konumu ve dönüşü (hafif yay, uçlar içe döner)
    setPlacements()
    {
        const { world, count, spacing, arcDepth, turnInwardDeg } = this.config
        const facing = THREE.MathUtils.degToRad(world.facingDeg)
        const direction = new THREE.Vector2(Math.cos(facing), Math.sin(facing)) // izleyiciye doğru
        const line = new THREE.Vector2(-direction.y, direction.x) // maymunların dizildiği doğru

        this.center = new THREE.Vector3(world.x, 0, world.z)
        this.placements = []
        for(let i = 0; i < count; i++)
        {
            const offset = i - (count - 1) / 2
            const position = new THREE.Vector3(
                world.x + line.x * offset * spacing + direction.x * arcDepth * offset * offset,
                0,
                world.z + line.y * offset * spacing + direction.y * arcDepth * offset * offset
            )

            // Uçlar merkeze doğru döner (offset > 0 olan, çizgi yönünde ilerlediği için ters işaretle)
            const facingDeg = world.facingDeg - Math.sign(offset) * turnInwardDeg * Math.min(1, Math.abs(offset) / ((count - 1) / 2))
            const rotationY = Props.getRotationY({ world: { facingDeg } })

            this.placements.push({
                position,
                rotationY,
                quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY),
                timeOffset: this.config.timeOffsets[i % this.config.timeOffsets.length],
            })
        }
    }

    setPhysics()
    {
        const { half, centerY } = this.config.collider
        for(const placement of this.placements)
        {
            this.game.objects.add(
                null,
                {
                    type: 'fixed',
                    position: placement.position,
                    rotation: placement.quaternion,
                    friction: 0.25,
                    restitution: 0.1,
                    colliders: [ { shape: 'cuboid', parameters: half, position: { x: 0, y: centerY, z: 0 }, category: 'object' } ],
                    onCollision: (force, position) =>
                    {
                        this.game.audio.groups.get('hitDefault')?.playRandomNext(force, position)
                    },
                }
            )
        }
    }

    // Yaklaşınca modeli yükle (ilk yüklemeye girmez)
    load()
    {
        if(this.loaded || this.loading)
            return

        this.loading = true
        const loader = this.game.resourcesLoader.getLoader('gltf')
        loader.load(`props/${this.propConfig.name}.glb`, (gltf) =>
        {
            this.loading = false
            this.loaded = true // hata olsa bile yeniden denenmez
            try { this.setMonkeys(gltf) } catch(error) { console.error('HORON', error.stack) }
        })
    }

    setMonkeys(gltf)
    {
        const source = gltf.scene
        let sourceMesh = null
        source.traverse((child) => { if(child.isSkinnedMesh) sourceMesh = child })
        this.clip = gltf.animations[0]
        this.idleTime = (sourceMesh.userData.idleTime ?? sourceMesh.parent?.userData.idleTime) ?? 0

        // Bekleme pozu: animasyonun tek karesi
        const frame = Math.round(this.idleTime * 30)
        this.idleClip = THREE.AnimationUtils.subclip(this.clip, 'idle', frame, frame + 2, 30)

        this.game.materials.updateObject(sourceMesh)
        const material = sourceMesh.material

        // Her maymun: kendi kemik hiyerarşisi (yerleşim dönüşüyle), geometri dünya uzayına pişirilir
        const geometries = []
        const bones = []
        this.monkeys = []
        this.group = new THREE.Group()
        this.group.name = 'horon'

        this.placements.forEach((placement, index) =>
        {
            const instance = cloneSkinned(source)
            const holder = new THREE.Group()
            holder.position.copy(placement.position)
            holder.quaternion.copy(placement.quaternion)
            holder.add(instance)
            this.group.add(holder)
            holder.updateMatrixWorld(true)

            let instanceMesh = null
            instance.traverse((child) => { if(child.isSkinnedMesh) instanceMesh = child })
            const geometry = instanceMesh.geometry.clone()
            geometry.applyMatrix4(holder.matrixWorld)

            // skinIndex: birleşik iskelette bu maymunun kemikleri index * kemik sayısı kadar kaymış
            const skinIndex = geometry.attributes.skinIndex
            const offset = index * instanceMesh.skeleton.bones.length
            for(let i = 0; i < skinIndex.count; i++)
                for(let k = 0; k < 4; k++)
                    skinIndex.setComponent(i, k, skinIndex.getComponent(i, k) + offset)

            geometries.push(geometry)
            bones.push(...instanceMesh.skeleton.bones)
            instanceMesh.removeFromParent() // yalnızca kemikler kalır

            const mixer = new THREE.AnimationMixer(instance)
            const dance = mixer.clipAction(this.clip)
            dance.setLoop(THREE.LoopRepeat)
            dance.time = placement.timeOffset
            dance.play()
            dance.setEffectiveWeight(0)

            const idle = mixer.clipAction(this.idleClip)
            idle.setLoop(THREE.LoopRepeat)
            idle.play()
            idle.setEffectiveWeight(1)

            this.monkeys.push({ mixer, dance, idle, placement })
        })

        // Birleşik SkinnedMesh
        const merged = mergeGeometries(geometries, false)
        this.skeleton = new THREE.Skeleton(bones) // ters bağlama matrisleri şu anki (bağlama) pozdan hesaplanır
        this.mesh = new THREE.SkinnedMesh(merged, material)
        this.mesh.name = 'horonMonkeys'
        this.mesh.frustumCulled = false // görünürlük update()'te
        this.mesh.castShadow = this.game.quality.pick(true, false)
        this.mesh.receiveShadow = true
        this.group.add(this.mesh)
        this.mesh.bind(this.skeleton, new THREE.Matrix4())

        this.group.visible = false
        this.game.scene.add(this.group)

        this.settled = false // ilk karede bekleme pozunu uygula
    }

    // Dansı başlat/durdur (müzik Horon etkileşiminde yönetilir)
    setDancing(active)
    {
        if(this.dancing === active)
            return

        this.dancing = active
        this.settled = false

        if(!this.monkeys)
            return

        for(const monkey of this.monkeys)
        {
            if(active)
            {
                monkey.dance.enabled = true
                monkey.dance.crossFadeFrom(monkey.idle, 0.6, false)
            }
            else
            {
                monkey.idle.enabled = true
                monkey.idle.crossFadeFrom(monkey.dance, 0.8, false)
            }
        }
        this.transitionUntil = this.game.ticker.elapsed + 1
    }

    update()
    {
        const player = this.game.physicalVehicle.position
        const distance = Math.hypot(player.x - this.center.x, player.z - this.center.z)

        // Yaklaşınca yükle
        if(!this.loaded)
        {
            if(distance < this.config.loadDistance)
                this.load()
            return
        }

        // Görünürlük
        const quad = this.game.view.optimalArea.quad2
        const polygon = [ quad[0].offseted, quad[1].offseted, quad[2].offseted, quad[3].offseted ]
        const visible = circleIntersectsPolygon({ x: this.center.x, y: this.center.z }, this.config.visibleRadius, polygon)
        this.group.visible = visible

        if(!visible)
            return

        // Güncelleme gerekli mi: dans sürerken ya da geçiş/ilk poz uygulanırken
        const transitioning = this.game.ticker.elapsed < (this.transitionUntil ?? 0)
        if(this.settled && !this.dancing && !transitioning)
            return

        // Düşük kalitede 30 fps
        let delta = this.game.ticker.deltaScaled
        if(this.game.quality.level !== 0)
        {
            this.updateAccumulator += delta
            if(this.updateAccumulator < 1 / 30)
                return
            delta = this.updateAccumulator
            this.updateAccumulator = 0
        }

        for(const monkey of this.monkeys)
            monkey.mixer.update(delta)

        if(!this.dancing && !transitioning)
            this.settled = true
    }
}
