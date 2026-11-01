import * as THREE from 'three/webgpu'
import { color, Fn, instancedBufferAttribute, instanceIndex, sin, texture, uniform, uv, vec2, vec4 } from 'three/tsl'
import { Game } from '../Game.js'
import { InstancedGroup } from '../InstancedGroup.js'
import { InteractivePoints } from '../InteractivePoints.js'
import { Props } from './Props.js'
import { circleIntersectsPolygon } from '../utilities/maths.js'
import propsConfig from '../../../scripts/props/props.config.json'

// Müzik kutuları: tek GLB (static/props/jukebox.glb) bir kez yüklenir, tüm yerleşimler (props.config.json > jukebox.placements)
// tek InstancedGroup ile çizilir. Her yerleşimde sabit çarpıştırıcı, "Şarkıyı değiştir" etkileşim noktası ve nota parçacıkları var.
// Çalan şarkının adı Audio.js'teki playlist.next() bildiriminden görünür.
export class Jukeboxes
{
    constructor()
    {
        this.game = Game.getInstance()

        this.config = propsConfig.props.find(prop => prop.custom === 'jukebox')
        this.model = this.game.resources[Props.getResourceName(this.config)].scene

        this.setInstances()
        this.setPhysics()
        this.setNotes()
        this.setInteractivePoints()

        this.game.ticker.events.on('tick', () => { this.update() }, 14)
    }

    // Yerleşimin dünya dönüşü: grup Y dönüşü = π/2 − facing (Props ile aynı kural)
    getTransform(placement)
    {
        const rotationY = Props.getRotationY({ world: { facingDeg: placement.facingDeg } })
        const scale = placement.scale ?? 1
        return {
            position: new THREE.Vector3(placement.x, 0, placement.z),
            rotationY,
            scale,
            quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY),
        }
    }

    // Model yerelindeki (x, y, z) noktayı yerleşimin dünyasına çevirir
    localToWorld(placement, x, y, z)
    {
        const transform = this.getTransform(placement)
        return new THREE.Vector3(x, y, z).multiplyScalar(transform.scale).applyQuaternion(transform.quaternion).add(transform.position)
    }

    setInstances()
    {
        const base = this.model.clone()
        this.game.materials.updateObject(base)

        const castShadow = this.game.quality.pick(true, false)
        base.traverse((child) =>
        {
            if(child.isMesh)
            {
                child.castShadow = castShadow
                child.receiveShadow = true
            }
        })

        this.references = []
        for(const placement of this.config.placements)
        {
            const transform = this.getTransform(placement)
            const reference = new THREE.Object3D()
            reference.position.copy(transform.position)
            reference.quaternion.copy(transform.quaternion)
            reference.scale.setScalar(transform.scale)
            reference.needsUpdate = true
            this.references.push(reference)
        }

        // Sabit: matrisler görüş alanına göre update()'te yazılır (autoUpdate kapalı); görünmeyenler çizilmez
        this.instancedGroup = new InstancedGroup(this.references, base, false)
        this.visibleKey = null
        for(const mesh of this.instancedGroup.meshes)
            mesh.instance.frustumCulled = false
    }

    setPhysics()
    {
        for(const placement of this.config.placements)
        {
            const transform = this.getTransform(placement)

            this.game.objects.add(
                null,
                {
                    type: 'fixed',
                    position: transform.position,
                    rotation: transform.quaternion,
                    friction: 0.25,
                    restitution: 0.1,
                    colliders: this.config.colliders.map(collider => ({
                        shape: 'cuboid',
                        parameters: collider.half.map(value => value * transform.scale),
                        position: { x: collider.center[0] * transform.scale, y: collider.center[1] * transform.scale, z: collider.center[2] * transform.scale },
                        category: 'object',
                    })),
                    onCollision: (force, position) =>
                    {
                        this.game.audio.groups.get('hitDefault').playRandomNext(force, position)
                    }
                }
            )
        }
    }

    setNotes()
    {
        const count = 8

        // Notalar > Başlangıç konumları
        const positionsArray = new Float32Array(count * 3)
        for(let i = 0; i < count; i++)
        {
            const i3 = i * 3
            positionsArray[i3 + 0] = (Math.random() - 0.5) * 1
            positionsArray[i3 + 1] = (Math.random() - 0.5) * 1
            positionsArray[i3 + 2] = (Math.random() - 0.5) * 1
        }

        const positionAttribute = new THREE.InstancedBufferAttribute(positionsArray, 3)

        // Notalar > Malzeme (tüm müzik kutuları ortak)
        const progress = this.game.ticker.elapsedScaledUniform.mul(0.2).add(instanceIndex.toFloat().div(count)).fract().toVarying()
        const notesColor = uniform(color('#ff994d'))
        const notesStrength = uniform(3.5)

        const outputNode = Fn(() =>
        {
            const baseUv = vec2(uv().x, uv().y.oneMinus())
            const noteMask = texture(this.game.resources.jukeboxMusicNotes, baseUv).r
            return vec4(notesColor.mul(notesStrength), noteMask)
        })()

        const positionNode = Fn(() =>
        {
            const newPosition = instancedBufferAttribute(positionAttribute).toVar()

            newPosition.z.addAssign(progress.oneMinus().pow(3).oneMinus())
            newPosition.y.addAssign(progress)
            return newPosition
        })()

        const rotationNode = Fn(() =>
        {
            return sin(this.game.ticker.elapsedScaledUniform.mul(4).add(instanceIndex.toFloat())).add(1).mul(0.5).pow(2).oneMinus()
        })()

        const scaleNode = Fn(() =>
        {
            return progress.sub(0.5).abs().mul(2).oneMinus().mul(3).min(1)
        })()

        const material = new THREE.PointsNodeMaterial({
            outputNode: outputNode,
            positionNode: positionNode,
            rotationNode: rotationNode,
            scaleNode: scaleNode,
            size: 1.5, // piksel birimi
            sizeAttenuation: true,
            alphaToCoverage: true,
        })

        this.notes = []
        for(const placement of this.config.placements)
        {
            const sprite = new THREE.Sprite(material)
            sprite.count = count
            sprite.frustumCulled = false
            sprite.position.copy(this.localToWorld(placement, 0, this.config.notes.y, this.config.notes.z))
            this.game.scene.add(sprite)
            this.notes.push({ sprite, placement })
        }

        // Debug
        if(this.game.debug.active)
        {
            const debugPanel = this.game.debug.panel.addFolder({ title: '🎵 Jukeboxes', expanded: false })
            this.game.debug.addThreeColorBinding(debugPanel, notesColor.value, 'notesColor')
            debugPanel.addBinding(notesStrength, 'value', { label: 'notesStrength', min: 0, max: 10, step: 0.001 })
        }
    }

    setInteractivePoints()
    {
        for(const placement of this.config.placements)
        {
            this.game.interactivePoints.create(
                this.localToWorld(placement, 0, this.config.interact.y / (placement.scale ?? 1), this.config.interact.z),
                'Şarkıyı değiştir',
                InteractivePoints.ALIGN_LEFT,
                InteractivePoints.STATE_CONCEALED,
                () =>
                {
                    if(this.game.audio.mute.active)
                        this.game.audio.mute.deactivate()

                    this.game.audio.playlist.next()
                },
                () =>
                {
                    this.game.inputs.interactiveButtons.addItems(['interact'])
                },
                () =>
                {
                    this.game.inputs.interactiveButtons.removeItems(['interact'])
                },
                () =>
                {
                    this.game.inputs.interactiveButtons.removeItems(['interact'])
                }
            )
        }
    }

    // Yalnızca görüş alanındaki müzik kutuları çizilir (instance sayısı değişir) ve nota çıkarır
    update()
    {
        const quad = this.game.view.optimalArea.quad2
        const polygon = [ quad[0].offseted, quad[1].offseted, quad[2].offseted, quad[3].offseted ]

        const visible = []
        this.config.placements.forEach((placement, index) =>
        {
            const isVisible = circleIntersectsPolygon({ x: placement.x, y: placement.z }, 3, polygon)
            this.notes[index].sprite.visible = isVisible && this.game.reveal.step >= 1 // giriş ekranındaki portre/yazılarla çakışmasın
            if(isVisible)
                visible.push(index)
        })

        const key = visible.join(',')
        if(key === this.visibleKey)
            return

        this.visibleKey = key
        for(const mesh of this.instancedGroup.meshes)
        {
            visible.forEach((index, i) =>
            {
                const reference = this.references[index]
                reference.updateMatrixWorld()
                mesh.instance.setMatrixAt(i, mesh.localMatrix.clone().premultiply(reference.matrixWorld))
            })
            mesh.instance.count = visible.length
            mesh.instance.visible = visible.length > 0
            mesh.instance.instanceMatrix.needsUpdate = true
        }
    }
}
