import * as THREE from 'three/webgpu'
import { color, texture } from 'three/tsl'
import gsap from 'gsap'
import { Game } from '../Game.js'
import { InteractivePoints } from '../InteractivePoints.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'
import { Props } from './Props.js'
import { circleIntersectsPolygon } from '../utilities/maths.js'
import { COLORS } from '../../../scripts/envelope/envelope_geometry.mjs'
import contact from '../../data/contact.js'

// İletişim zarfları. Üç yer: sosyal alan ikon halkası (areas.glb içinde, SocialArea.js bağlar), landing ilk ekran ve projeler girişi
// (bu sınıf: ahşap direk üstünde zarf + "Bana ulaşın" levhası + "E-posta gönder" etkileşimi). Konumlar sources/data/contact.js > envelopes.
// Zarf modeli kendi modelimiz: static/props/envelope.glb (scripts/envelope/).
export class Envelopes
{
    // Etkileşim: adresi panoya kopyala + bildirim + mailto aç
    static contact()
    {
        const game = Game.getInstance()

        const notify = () =>
        {
            game.notifications.show(`E-posta adresi kopyalandı: ${contact.email}`, '', 4)
        }

        const copy = navigator.clipboard?.writeText
            ? navigator.clipboard.writeText(contact.email)
            : Promise.reject(new Error('Pano API yok'))

        copy.then(notify, () =>
        {
            // Pano izni yoksa eski yöntem
            const input = document.createElement('textarea')
            input.value = contact.email
            input.style.position = 'fixed'
            input.style.opacity = '0'
            document.body.append(input)
            input.select()
            try { document.execCommand('copy') } catch(error) {}
            input.remove()
            notify()
        })

        window.location.href = contact.mailto
    }

    // "Bana ulaşın" yazısı (kameraya dönük düzlem). Amatic SC, yarı saydam koyu zemin
    static createLabel(width = 2.3, height = 0.6)
    {
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * 200)
        canvas.height = Math.round(height * 200)
        const context = canvas.getContext('2d')

        const labelTexture = new THREE.CanvasTexture(canvas)
        labelTexture.colorSpace = THREE.SRGBColorSpace
        labelTexture.anisotropy = 4

        const draw = () =>
        {
            context.clearRect(0, 0, canvas.width, canvas.height)
            context.fillStyle = 'rgba(30, 18, 10, 0.72)'
            context.beginPath()
            context.roundRect(canvas.width * 0.02, canvas.height * 0.06, canvas.width * 0.96, canvas.height * 0.88, canvas.height * 0.3)
            context.fill()
            context.fillStyle = '#fff3dc'
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            context.font = `700 ${canvas.height * 0.62}px "Amatic SC", sans-serif`
            context.fillText(contact.label.toLocaleUpperCase('tr-TR'), canvas.width / 2, canvas.height * 0.56)
            labelTexture.needsUpdate = true
        }
        draw()
        document.fonts?.load('700 64px "Amatic SC"').then(draw)

        const material = new MeshDefaultMaterial({
            colorNode: texture(labelTexture).rgb,
            alphaNode: texture(labelTexture).a,
            transparent: true,
            depthWrite: false,
            hasWater: false,
            hasLightBounce: false,
        })
        material.polygonOffset = true
        material.polygonOffsetFactor = -2
        material.polygonOffsetUnits = -2

        return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
    }

    // Zarf modelini yükler (tek kez) ve her çağrıda yeni bir grup döner
    static loadModel()
    {
        const game = Game.getInstance()
        if(!Envelopes.modelPromise)
        {
            Envelopes.modelPromise = game.resourcesLoader.load([ [ 'envelopeModel', 'props/envelope.glb', 'gltf' ] ]).then((resources) =>
            {
                const scene = resources.envelopeModel.scene
                scene.traverse((child) =>
                {
                    if(child.isMesh)
                        child.material = new MeshDefaultMaterial({ colorNode: color(COLORS[child.name].hex), hasWater: false })
                })
                return scene
            })
        }
        return Envelopes.modelPromise
    }

    constructor()
    {
        this.game = Game.getInstance()
        this.items = []

        for(const placement of contact.envelopes)
            this.items.push(this.createItem(placement))

        this.game.ticker.events.on('tick', () => { this.update() }, 14)
    }

    createItem(placement)
    {
        const item = { placement, bobbing: null, envelope: null }

        item.group = new THREE.Group()
        item.group.name = `envelope_${placement.id}`
        item.group.position.set(placement.x, 0, placement.z)
        item.group.rotation.y = Props.getRotationY({ world: placement })
        this.game.scene.add(item.group)

        // Direk
        const wood = new MeshDefaultMaterial({ colorNode: color('#6b4426'), hasWater: false })
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.2), wood)
        post.position.y = 0.75
        post.castShadow = this.game.quality.pick(true, false)
        post.receiveShadow = true
        item.group.add(post)

        // Levha: "Bana ulaşın"
        item.label = Envelopes.createLabel()
        item.label.position.set(0, 0.95, 0.16)
        item.group.add(item.label)

        // Zarf (yüklenince): direğin üstünde, hafif süzülür
        item.holder = new THREE.Group()
        item.holder.position.y = 2.45
        item.holder.scale.setScalar(1.3)
        item.group.add(item.holder)
        Envelopes.loadModel().then((model) =>
        {
            item.envelope = model.clone(true)
            item.envelope.traverse((child) => { if(child.isMesh) { child.castShadow = this.game.quality.pick(true, false); child.receiveShadow = true } })
            item.holder.add(item.envelope)
        })

        // Fizik: direk sabit
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.group.rotation.y)
        this.game.objects.add(
            null,
            {
                type: 'fixed',
                position: item.group.position,
                rotation: rotation,
                friction: 0.25,
                restitution: 0.1,
                colliders: [ { shape: 'cuboid', parameters: [ 0.12, 0.75, 0.12 ], position: { x: 0, y: 0.75, z: 0 }, category: 'object' } ],
                onCollision: (force, position) => { this.game.audio.groups.get('hitDefault')?.playRandomNext(force, position) },
            }
        )

        // Etkileşim noktası: direğin önünde
        const position = Props.localToWorld({ world: placement }, 0, 2.6, 1.2)
        item.interactivePoint = this.game.interactivePoints.create(
            position,
            contact.interactLabel,
            InteractivePoints.ALIGN_RIGHT,
            InteractivePoints.STATE_CONCEALED,
            () => { Envelopes.contact() },
            () => { this.game.inputs.interactiveButtons.addItems(['interact']) },
            () => { this.game.inputs.interactiveButtons.removeItems(['interact']) },
            () => { this.game.inputs.interactiveButtons.removeItems(['interact']) }
        )

        item.center = { x: placement.x, y: placement.z }
        return item
    }

    update()
    {
        const quad = this.game.view.optimalArea.quad2
        const polygon = [ quad[0].offseted, quad[1].offseted, quad[2].offseted, quad[3].offseted ]
        const time = this.game.ticker.elapsedScaled

        for(const item of this.items)
        {
            item.group.visible = circleIntersectsPolygon(item.center, 4, polygon)
            if(!item.group.visible || !item.envelope)
                continue

            // Hafif süzülme + yavaş sallanma
            item.holder.position.y = 2.45 + Math.sin(time * 1.6 + item.center.x) * 0.06
            item.holder.rotation.y = Math.sin(time * 0.8 + item.center.y) * 0.18
        }
    }
}
