import * as THREE from 'three/webgpu'
import { color, texture } from 'three/tsl'
import gsap from 'gsap'
import { Game } from '../Game.js'
import { InteractivePoints } from '../InteractivePoints.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'
import { Inputs } from '../Inputs/Inputs.js'
import { Props } from './Props.js'
import careerConfig from '../../data/career.js'

// Kariyer alanındaki pano: üstte "KARİYER" başlığı, içinde yalnızca kariyer görseli (oranı korunur).
// "Kariyeri incele": sinematik kamera panoya yaklaşır, Esc/Kapat ile döner. Dokunmatik ya da dar ekranda
// (CareerBoard.useModal) görsel tam ekran modalde açılır (pinch-zoom, çift dokunuş, tekerlek, sürükleme). Önceki/sonraki yok.
export class CareerBoard
{
    static STATE_CLOSED = 1
    static STATE_OPENING = 2
    static STATE_OPEN = 3
    static STATE_CLOSING = 4

    static WIDTH = 6.4

    constructor()
    {
        this.game = Game.getInstance()
        this.config = careerConfig
        this.state = CareerBoard.STATE_CLOSED
        this.modalOpen = false

        // Pano oranı görselden: genişlik sabit, yükseklik orana göre
        this.width = CareerBoard.WIDTH
        this.height = this.width * this.config.image.height / this.config.image.width
        this.centerY = 0.9 + this.height / 2 + 0.55

        this.setGroup()
        this.setMaterials()
        this.setFrame()
        this.setScreen()
        this.setHeading()
        this.setPhysics()
        this.setCinematic()
        this.setInteractivePoint()
        this.setModal()
        this.setInputs()

        this.game.ticker.events.on('tick', () => { this.update() }, 14)
    }

    get isActive()
    {
        return this.state === CareerBoard.STATE_OPEN || this.state === CareerBoard.STATE_OPENING
    }

    get useModal()
    {
        return this.game.inputs.mode === Inputs.MODE_TOUCH || window.innerWidth <= this.config.modalMaxWidth
    }

    localToWorld(x, y, z)
    {
        return Props.localToWorld({ world: this.config.world }, x, z, y)
    }

    setGroup()
    {
        this.group = new THREE.Group()
        this.group.name = 'careerBoard'
        this.group.position.set(this.config.world.x, 0, this.config.world.z)
        this.group.rotation.y = Props.getRotationY({ world: this.config.world })
        this.game.scene.add(this.group)
    }

    setMaterials()
    {
        const make = (hex) => new MeshDefaultMaterial({ colorNode: color(hex), hasWater: false })
        this.materials = { dark: make('#6b4426'), frame: make('#4a3020') }
    }

    addBox(material, width, height, depth, x, y, z)
    {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
        mesh.position.set(x, y, z)
        mesh.castShadow = this.game.quality.pick(true, false)
        mesh.receiveShadow = true
        this.group.add(mesh)
        return mesh
    }

    setFrame()
    {
        const halfWidth = this.width / 2
        const top = this.centerY + this.height / 2

        this.addBox(this.materials.frame, this.width + 0.4, this.height + 0.4, 0.16, 0, this.centerY, 0)
        this.addBox(this.materials.dark, 0.26, top + 0.9, 0.26, - halfWidth - 0.38, (top + 0.9) / 2, - 0.06)
        this.addBox(this.materials.dark, 0.26, top + 0.9, 0.26, halfWidth + 0.38, (top + 0.9) / 2, - 0.06)
        this.addBox(this.materials.dark, 3.4, 0.64, 0.2, 0, top + 0.6, 0.02)
    }

    setScreen()
    {
        this.screen = {}
        this.screen.geometry = new THREE.PlaneGeometry(this.width, this.height)

        this.screen.mesh = new THREE.Mesh(this.screen.geometry, new MeshDefaultMaterial({ colorNode: color('#2b2b33'), hasWater: false, hasLightBounce: false }))
        this.screen.mesh.position.set(0, this.centerY, 0.09)
        this.screen.mesh.receiveShadow = true
        this.group.add(this.screen.mesh)

        // Görsel (WebP; metin içerdiği için yüksek çözünürlük, mip + anisotropy ile uzaktan da okunur). Işıklandırmasız: renkler olduğu gibi
        this.game.resourcesLoader.getLoader('texture').load(this.config.image.path, (loadedTexture) =>
        {
            loadedTexture.colorSpace = THREE.SRGBColorSpace
            loadedTexture.anisotropy = 8
            this.screen.texture = loadedTexture

            const material = new THREE.MeshBasicNodeMaterial()
            material.colorNode = texture(loadedTexture).rgb
            this.screen.mesh.material = material
        })
    }

    // Yarı saydam metin dokusu düzlemi (ProjectBoard ile aynı yöntem)
    setHeading()
    {
        const width = 3.2
        const height = 0.52
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * 200)
        canvas.height = Math.round(height * 200)
        const context = canvas.getContext('2d')

        const labelTexture = new THREE.CanvasTexture(canvas)
        labelTexture.colorSpace = THREE.SRGBColorSpace
        labelTexture.anisotropy = 4

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

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
        mesh.position.set(0, this.centerY + this.height / 2 + 0.6, 0.13)
        this.group.add(mesh)

        const draw = () =>
        {
            context.clearRect(0, 0, canvas.width, canvas.height)
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            context.fillStyle = '#fff3dc'
            context.font = `700 ${canvas.height * 0.72}px "Amatic SC", sans-serif`
            context.fillText(this.config.heading.toLocaleUpperCase('tr-TR'), canvas.width / 2, canvas.height * 0.56) // Türkçe İ noktası kesilmesin
            labelTexture.needsUpdate = true
        }
        draw()
        document.fonts?.load('700 64px "Amatic SC"').then(draw) // font geç yüklenirse yeniden çiz
    }

    setPhysics()
    {
        const halfWidth = this.width / 2
        const top = this.centerY + this.height / 2
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y)

        this.game.objects.add(
            null,
            {
                type: 'fixed',
                position: this.group.position,
                rotation: rotation,
                friction: 0.25,
                restitution: 0.1,
                colliders: [
                    { shape: 'cuboid', parameters: [ 0.13, (top + 0.9) / 2, 0.13 ], position: { x: - halfWidth - 0.38, y: (top + 0.9) / 2, z: - 0.06 }, category: 'object' },
                    { shape: 'cuboid', parameters: [ 0.13, (top + 0.9) / 2, 0.13 ], position: { x: halfWidth + 0.38, y: (top + 0.9) / 2, z: - 0.06 }, category: 'object' },
                    { shape: 'cuboid', parameters: [ halfWidth + 0.2, this.height / 2 + 0.2, 0.1 ], position: { x: 0, y: this.centerY, z: 0 }, category: 'object' },
                ],
                onCollision: (force, position) =>
                {
                    this.game.audio.groups.get('hitDefault')?.playRandomNext(force, position)
                },
            }
        )
    }

    setCinematic()
    {
        // Panonun önünden, hafif yukarıdan (görselin tamamı ve başlık kadraja sığacak mesafe)
        this.cinematic = {}
        this.cinematic.target = this.localToWorld(0, this.centerY - 0.2, 0)
        this.cinematic.position = this.localToWorld(-1.6, this.centerY + 4.2, 16.5)
    }

    setInteractivePoint()
    {
        this.interactivePoint = this.game.interactivePoints.create(
            this.localToWorld(-1.8, 1.3, 4.2),
            this.config.interactLabel,
            InteractivePoints.ALIGN_RIGHT,
            InteractivePoints.STATE_CONCEALED,
            () => { this.open() },
            () => { this.game.inputs.interactiveButtons.addItems(['interact']) },
            () => { this.game.inputs.interactiveButtons.removeItems(['interact']) },
            () => { this.game.inputs.interactiveButtons.removeItems(['interact']) }
        )
    }

    /**
     * Modal (HTML): tam ekran görsel. Pinch/tekerlek ile yakınlaştırma, sürükleyerek kaydırma, çift dokunuş/tık ile yakınlaştır-sıfırla.
     */
    setModal()
    {
        this.modal = {}
        this.modal.element = this.game.domElement.querySelector('.js-career-modal')
        this.modal.image = this.modal.element.querySelector('.js-career-image')
        this.modal.image.src = this.config.image.path
        this.modal.image.alt = this.config.imageAlt
        this.modal.view = { scale: 1, x: 0, y: 0 }
        this.modal.pointers = new Map()
        this.modal.gesture = null
        this.modal.lastTap = 0

        const view = this.modal.view
        const apply = () =>
        {
            // Sınırlar: yakınlaştırılmış görsel ekrandan taşabilir ama tamamen dışarı kaçmaz
            const stage = this.modal.element.getBoundingClientRect()
            const maxX = Math.max(0, (this.modal.image.clientWidth * view.scale - stage.width) / 2)
            const maxY = Math.max(0, (this.modal.image.clientHeight * view.scale - stage.height) / 2)
            view.x = THREE.MathUtils.clamp(view.x, - maxX, maxX)
            view.y = THREE.MathUtils.clamp(view.y, - maxY, maxY)
            this.modal.image.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
        }
        this.modal.apply = apply
        this.modal.reset = () => { view.scale = 1; view.x = 0; view.y = 0; apply() }

        const zoomAt = (factor, clientX, clientY) =>
        {
            const stage = this.modal.element.getBoundingClientRect()
            const px = clientX - stage.left - stage.width / 2
            const py = clientY - stage.top - stage.height / 2
            const next = THREE.MathUtils.clamp(view.scale * factor, 1, 5)
            const ratio = next / view.scale
            view.x = px - (px - view.x) * ratio
            view.y = py - (py - view.y) * ratio
            view.scale = next
            apply()
        }

        const element = this.modal.element
        element.addEventListener('pointerdown', (event) =>
        {
            if(event.target.closest('.js-career-close'))
                return

            try { element.setPointerCapture?.(event.pointerId) } catch(error) {}
            this.modal.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

            if(this.modal.pointers.size === 2)
            {
                const [ a, b ] = [ ...this.modal.pointers.values() ]
                this.modal.gesture = { distance: Math.hypot(a.x - b.x, a.y - b.y) }
            }

            // Çift dokunuş / çift tık: yakınlaştır ↔ sıfırla
            const now = performance.now()
            if(this.modal.pointers.size === 1 && now - this.modal.lastTap < 320)
            {
                if(view.scale > 1.05)
                    this.modal.reset()
                else
                    zoomAt(2.5, event.clientX, event.clientY)
            }
            this.modal.lastTap = now
        })

        element.addEventListener('pointermove', (event) =>
        {
            const previous = this.modal.pointers.get(event.pointerId)
            if(!previous)
                return

            const current = { x: event.clientX, y: event.clientY }

            if(this.modal.pointers.size === 2 && this.modal.gesture)
            {
                this.modal.pointers.set(event.pointerId, current)
                const [ a, b ] = [ ...this.modal.pointers.values() ]
                const distance = Math.hypot(a.x - b.x, a.y - b.y)
                zoomAt(distance / this.modal.gesture.distance, (a.x + b.x) / 2, (a.y + b.y) / 2)
                this.modal.gesture.distance = distance
            }
            else if(this.modal.pointers.size === 1 && view.scale > 1)
            {
                view.x += current.x - previous.x
                view.y += current.y - previous.y
                apply()
            }

            this.modal.pointers.set(event.pointerId, current)
        })

        const release = (event) =>
        {
            this.modal.pointers.delete(event.pointerId)
            if(this.modal.pointers.size < 2)
                this.modal.gesture = null
        }
        element.addEventListener('pointerup', release)
        element.addEventListener('pointercancel', release)

        element.addEventListener('wheel', (event) =>
        {
            event.preventDefault()
            zoomAt(Math.exp(- event.deltaY * 0.0015), event.clientX, event.clientY)
        }, { passive: false })

        element.querySelector('.js-career-close').addEventListener('click', () => { this.close() })
        window.addEventListener('resize', () => { if(this.modalOpen) this.modal.reset() })
    }

    setInputs()
    {
        const buttons = this.game.inputs.interactiveButtons.events
        buttons.on('close', () =>
        {
            if(this.state === CareerBoard.STATE_OPEN)
                this.close()
        })
    }

    open()
    {
        if(this.state !== CareerBoard.STATE_CLOSED)
            return

        this.state = CareerBoard.STATE_OPENING
        this.stateTransition?.kill()
        this.stateTransition = gsap.delayedCall(this.useModal ? 0.3 : 1.5, () =>
        {
            this.state = CareerBoard.STATE_OPEN
            this.stateTransition = null
        })

        this.game.inputs.filters.delete('wandering')
        this.game.inputs.filters.add('cinematic')
        this.game.interactivePoints.temporaryHide()
        this.game.physicalVehicle.deactivate()

        if(this.useModal)
        {
            this.modalOpen = true
            this.modal.element.hidden = false
            this.modal.reset()
        }
        else
        {
            this.game.view.cinematic.start(this.cinematic.position, this.cinematic.target)
            this.game.inputs.interactiveButtons.clearItems()
            this.game.inputs.interactiveButtons.addItems(['close'])
        }

        this.game.audio.groups.get('click')?.play(true)
    }

    close()
    {
        if(this.state !== CareerBoard.STATE_OPEN && this.state !== CareerBoard.STATE_OPENING)
            return

        this.state = CareerBoard.STATE_CLOSING
        this.stateTransition?.kill()
        this.stateTransition = gsap.delayedCall(this.modalOpen ? 0.3 : 1.5, () =>
        {
            this.state = CareerBoard.STATE_CLOSED
            this.stateTransition = null
        })

        this.game.inputs.filters.delete('cinematic')
        this.game.inputs.filters.add('wandering')

        if(this.modalOpen)
        {
            this.modalOpen = false
            this.modal.element.hidden = true
        }
        else
        {
            this.game.view.cinematic.end()
        }

        gsap.delayedCall(this.state === CareerBoard.STATE_CLOSING ? 1 : 0, () => { this.game.interactivePoints.recover() })
        this.game.physicalVehicle.activate()
        this.game.inputs.interactiveButtons.clearItems()
        this.game.audio.groups.get('click')?.play(false)
    }

    // Esc / çıkış geçişte de yutulur (menü açılmasın)
    get isTransitioning()
    {
        return this.state === CareerBoard.STATE_CLOSING
    }

    update()
    {
        // Pano yalnızca yakındayken çizilir (alan dışında gizli)
        const player = this.game.physicalVehicle.position
        const distance = Math.hypot(player.x - this.config.world.x, player.z - this.config.world.z)
        this.group.visible = this.isActive || distance < 60
    }
}
