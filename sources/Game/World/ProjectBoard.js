import * as THREE from 'three/webgpu'
import { color, float, mix, texture, uniform } from 'three/tsl'
import gsap from 'gsap'
import { Game } from '../Game.js'
import { InteractivePoints } from '../InteractivePoints.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'
import { Props } from './Props.js'
import { ProjectViewer } from './ProjectViewer.js'
import { circleIntersectsPolygon } from '../utilities/maths.js'
import projectsData from '../../data/projects.js'
import boardConfig from '../../data/projectBoard.js'

// Landing'deki proje panosu: ProjectsArea'daki görüntüleme deneyimini (ProjectViewer) küçük bir panoda sunar.
// Etkileşimde sinematik kamera panoya döner; sol/sağ ile gezilir, "Aç" bağlantıya götürür, Esc/Kapat çıkar.
// Gösterilen liste sources/data/projectBoard.js > select ile seçilir.
export class ProjectBoard
{
    static WIDTH = 5.6
    static HEIGHT = 3.15
    static CENTER_Y = 2.75

    constructor()
    {
        this.game = Game.getInstance()
        this.config = boardConfig

        this.projects = this.getProjects()
        if(!this.projects.length)
            return

        this.images = new Map()
        this.setGroup()
        this.setMaterials()
        this.setFrame()
        this.setScreen()
        this.setTexts()
        this.setButtons()
        this.setPhysics()
        this.setViewer()
        this.setInteractivePoint()

        this.viewer.changeProject(0, ProjectViewer.DIRECTION_NEXT, false, true)

        this.game.ticker.events.on('tick', () => { this.update() }, 14)
    }

    getProjects()
    {
        if(this.config.select === 'featured')
            return projectsData.filter(project => project.featured)

        if(this.config.select === 'titles')
            return this.config.titles.map(title => projectsData.find(project => project.title === title)).filter(Boolean)

        return projectsData
    }

    // Panonun yerel (x sağ, y yukarı, z öne) noktasını dünyaya çevirir
    localToWorld(x, y, z)
    {
        return Props.localToWorld({ world: { x: this.config.world.x, z: this.config.world.z, facingDeg: this.config.world.facingDeg } }, x, z, y)
    }

    setGroup()
    {
        this.group = new THREE.Group()
        this.group.name = 'projectBoard'
        this.group.position.set(this.config.world.x, 0, this.config.world.z)
        this.group.rotation.y = Props.getRotationY({ world: this.config.world })
        this.game.scene.add(this.group)
    }

    setMaterials()
    {
        const make = (hex) => new MeshDefaultMaterial({ colorNode: color(hex), hasWater: false })
        this.materials = {
            wood: make('#c98a4b'),
            dark: make('#6b4426'),
            frame: make('#4a3020'),
        }
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
        const { WIDTH, HEIGHT, CENTER_Y } = ProjectBoard
        const halfWidth = WIDTH / 2

        // Çerçeve + direkler + başlık tahtası + bilgi tahtası
        this.addBox(this.materials.frame, WIDTH + 0.4, HEIGHT + 0.4, 0.16, 0, CENTER_Y, 0)
        this.addBox(this.materials.dark, 0.26, 4.7, 0.26, - halfWidth - 0.38, 2.35, - 0.06)
        this.addBox(this.materials.dark, 0.26, 4.7, 0.26, halfWidth + 0.38, 2.35, - 0.06)
        this.addBox(this.materials.dark, 3.4, 0.64, 0.2, 0, CENTER_Y + HEIGHT / 2 + 0.6, 0.02)
        this.addBox(this.materials.dark, WIDTH + 0.4, 0.8, 0.2, 0, CENTER_Y - HEIGHT / 2 - 0.55, 0.02)
    }

    // Yarı saydam metin dokusu çizilen düzlem
    createLabel(width, height, pixelsPerUnit, z, x, y, textColor)
    {
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * pixelsPerUnit)
        canvas.height = Math.round(height * pixelsPerUnit)

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
        mesh.position.set(x, y, z)
        this.group.add(mesh)

        return { canvas, context: canvas.getContext('2d'), texture: labelTexture, mesh, material, textColor }
    }

    setScreen()
    {
        const { WIDTH, HEIGHT, CENTER_Y } = ProjectBoard

        this.screen = {}
        this.screen.loadMix = uniform(0)
        this.screen.geometry = new THREE.PlaneGeometry(WIDTH, HEIGHT)

        // KTX dokuları üstten başlar: V ters çevrilir
        const uv = this.screen.geometry.attributes.uv
        for(let i = 0; i < uv.count; i++)
            uv.setY(i, 1 - uv.getY(i))

        this.screen.placeholder = new MeshDefaultMaterial({ colorNode: color('#2b2b33'), hasWater: false, hasLightBounce: false })
        this.screen.mesh = new THREE.Mesh(this.screen.geometry, this.screen.placeholder)
        this.screen.mesh.position.set(0, CENTER_Y, 0.09)
        this.screen.mesh.receiveShadow = true
        this.group.add(this.screen.mesh)
    }

    // Görseli (KTX) ilk kullanımda yükler; hazır olunca ekrana bağlar
    getImageMaterial(key, onReady)
    {
        let item = this.images.get(key)
        if(item)
        {
            if(item.material)
                onReady(item.material)
            else
                item.waiting.push(onReady)
            return
        }

        item = { material: null, waiting: [ onReady ] }
        this.images.set(key, item)

        const loader = this.game.resourcesLoader.getLoader('textureKtx')
        loader.load(`projects/images/${key}`, (loadedTexture) =>
        {
            loadedTexture.minFilter = THREE.LinearFilter
            loadedTexture.magFilter = THREE.LinearFilter
            loadedTexture.generateMipmaps = false

            item.material = new MeshDefaultMaterial({
                colorNode: mix(color('#2b2b33'), texture(loadedTexture).rgb, this.screen.loadMix),
                hasWater: false,
                hasLightBounce: false,
            })
            for(const callback of item.waiting)
                callback(item.material)
            item.waiting.length = 0
        })
    }

    setTexts()
    {
        const { WIDTH, HEIGHT, CENTER_Y } = ProjectBoard
        const font = (size) => `700 ${size}px "Amatic SC", sans-serif`

        // Başlık: "Projeler"
        this.heading = this.createLabel(3.2, 0.52, 200, 0.13, 0, CENTER_Y + HEIGHT / 2 + 0.6)
        this.drawText(this.heading, [ { text: this.config.heading.toLocaleUpperCase('tr-TR'), size: 0.9, color: '#fff3dc' } ], font)

        // Proje adı + rol/birlikte
        this.info = this.createLabel(WIDTH + 0.1, 0.7, 200, 0.13, 0, CENTER_Y - HEIGHT / 2 - 0.55)

        // Yazı fontu geç yüklenirse yeniden çiz
        document.fonts?.load('700 64px "Amatic SC"').then(() =>
        {
            this.drawText(this.heading, [ { text: this.config.heading.toLocaleUpperCase('tr-TR'), size: 0.9, color: '#fff3dc' } ], font)
            this.drawInfo()
        })
    }

    // lines: [{ text, size (yüksekliğe oran), color }]; sığacak şekilde küçültülür
    drawText(label, lines, font)
    {
        const { canvas, context } = label
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.textAlign = 'center'
        context.textBaseline = 'middle'

        const total = lines.reduce((sum, line) => sum + line.size, 0)
        let y = (canvas.height - total * canvas.height * 0.95) / 2
        for(const line of lines)
        {
            let size = canvas.height * 0.95 * line.size
            context.font = font(size)
            const width = context.measureText(line.text).width
            if(width > canvas.width * 0.94)
                size *= canvas.width * 0.94 / width

            context.font = font(size)
            context.fillStyle = line.color
            context.fillText(line.text, canvas.width / 2, y + canvas.height * 0.95 * line.size / 2)
            y += canvas.height * 0.95 * line.size
        }
        label.texture.needsUpdate = true
    }

    drawInfo()
    {
        const project = this.viewer?.navigation.current
        if(!project)
            return

        const attributes = []
        const names = { role: 'Rol', at: 'Kurum', with: 'Nerede' } // Projeler alanındaki etiketlerle aynı
        for(const [ key, value ] of Object.entries(project.attributes ?? {}))
            attributes.push(`${names[key] ?? key}: ${[].concat(value).join(', ')}`)

        this.drawText(
            this.info,
            [
                { text: project.title, size: 0.6, color: '#fff3dc' },
                ...(attributes.length ? [ { text: attributes.join('  ·  '), size: 0.36, color: '#f1c98f' } ] : []),
            ],
            (size) => `700 ${size}px "Amatic SC", sans-serif`
        )
    }

    setButtons()
    {
        const { WIDTH, CENTER_Y, HEIGHT } = ProjectBoard
        const font = (size) => `700 ${size}px "Amatic SC", sans-serif`

        this.buttons = {}
        const definitions = [
            { name: 'previous', text: '‹', x: - WIDTH / 2 + 0.45, y: CENTER_Y, width: 0.6, height: 0.6, onClick: () => this.viewer.previous() },
            { name: 'next', text: '›', x: WIDTH / 2 - 0.45, y: CENTER_Y, width: 0.6, height: 0.6, onClick: () => this.viewer.next() },
            { name: 'open', text: 'AÇ ↵', x: WIDTH / 2 - 0.95, y: CENTER_Y - HEIGHT / 2 + 0.38, width: 1.3, height: 0.5, onClick: () => this.viewer.openUrl() },
        ]

        for(const definition of definitions)
        {
            const label = this.createLabel(definition.width, definition.height, 160, 0.14, definition.x, definition.y)

            // Koyu yuvarlak zemin + metin
            const { context, canvas } = label
            const radius = Math.min(canvas.width, canvas.height) * 0.45
            context.fillStyle = 'rgba(30, 18, 10, 0.72)'
            context.beginPath()
            context.roundRect(canvas.width * 0.04, canvas.height * 0.06, canvas.width * 0.92, canvas.height * 0.88, radius)
            context.fill()
            context.fillStyle = '#fff3dc'
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            context.font = font(canvas.height * 0.85)
            context.fillText(definition.text, canvas.width / 2, canvas.height * 0.5 + canvas.height * 0.04)
            label.texture.needsUpdate = true

            label.mesh.visible = true
            this.group.updateMatrixWorld(true)

            const button = { label, scaleTween: null }
            button.intersect = this.game.rayCursor.addIntersect({
                active: false,
                shape: label.mesh,
                onClick: definition.onClick,
                onEnter: () => { gsap.to(label.mesh.scale, { x: 1.12, y: 1.12, duration: 0.2, overwrite: true }) },
                onLeave: () => { gsap.to(label.mesh.scale, { x: 1, y: 1, duration: 0.2, overwrite: true }) },
            })
            this.buttons[definition.name] = button
        }
    }

    setPhysics()
    {
        const { WIDTH } = ProjectBoard
        const halfWidth = WIDTH / 2
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
                    // Direkler ve pano gövdesi
                    { shape: 'cuboid', parameters: [ 0.13, 2.35, 0.13 ], position: { x: - halfWidth - 0.38, y: 2.35, z: - 0.06 }, category: 'object' },
                    { shape: 'cuboid', parameters: [ 0.13, 2.35, 0.13 ], position: { x: halfWidth + 0.38, y: 2.35, z: - 0.06 }, category: 'object' },
                    { shape: 'cuboid', parameters: [ halfWidth + 0.2, 2.2, 0.1 ], position: { x: 0, y: 3.0, z: 0 }, category: 'object' },
                    { shape: 'cuboid', parameters: [ halfWidth + 0.2, 0.4, 0.1 ], position: { x: 0, y: 0.62, z: 0.02 }, category: 'object' },
                ],
                onCollision: (force, position) =>
                {
                    this.game.audio.groups.get('hitDefault')?.playRandomNext(force, position)
                },
            }
        )

        // Görüş alanı testi için sınırlayıcı daire (xz)
        this.center = { x: this.config.world.x, y: this.config.world.z }
        this.radius = halfWidth + 3
    }

    setViewer()
    {
        // Sinematik: panonun önünden, hafif yukarıdan. Hedef biraz aşağıda tutulur: pano ekranın üstüne yaslanır,
        // alttaki açıklama paneli (DOM, ProjectViewer) proje adı levhasını kapatmaz. Sağdaki ağaçtan uzak durmak için kamera hafif solda.
        this.cinematic = {}
        this.cinematic.target = this.localToWorld(0, ProjectBoard.CENTER_Y - 0.55, 0)
        this.cinematic.position = this.localToWorld(-4.6, 9.4, 15.5)

        this.viewer = new ProjectViewer({
            projects: this.projects,
            getCinematic: () => this.cinematic,
            hooks: {
                onOpen: () =>
                {
                    for(const button of Object.values(this.buttons))
                        button.intersect.active = true

                    this.updateOpenButton()
                },
                onClose: () =>
                {
                    for(const button of Object.values(this.buttons))
                        button.intersect.active = false
                },
                onProjectChange: () =>
                {
                    this.drawInfo()
                    this.updateOpenButton()
                },
                onImageChange: () =>
                {
                    const key = this.viewer.navigation.current.images[this.viewer.imageIndex]
                    this.screen.loadMix.value = 0
                    this.getImageMaterial(key, (material) =>
                    {
                        // Aradan başka görsele geçildiyse atla
                        if(this.viewer.navigation.current.images[this.viewer.imageIndex] !== key)
                            return

                        this.screen.mesh.material = material
                        gsap.to(this.screen.loadMix, { value: 1, duration: 0.6, overwrite: true })
                    })
                },
            }
        })
    }

    // Bağlantısı olmayan projede (url: null) "AÇ" düğmesi gizlenir ve tıklanmaz
    updateOpenButton()
    {
        const button = this.buttons?.open
        if(!button || !this.viewer)
            return

        const hasUrl = this.viewer.hasUrl
        button.label.mesh.visible = hasUrl
        button.intersect.active = hasUrl && this.viewer.isActive
    }

    setInteractivePoint()
    {
        // Panonun önünde, hafif solda
        const position = this.localToWorld(-1.8, 1.3, 4.2)

        this.interactivePoint = this.game.interactivePoints.create(
            position,
            this.config.interactLabel,
            InteractivePoints.ALIGN_RIGHT,
            InteractivePoints.STATE_CONCEALED,
            () =>
            {
                this.viewer.open()
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

    update()
    {
        // Açıkken görünür kalır; kapalıyken görüş alanı dışında gizlenir
        const quad = this.game.view.optimalArea.quad2
        const polygon = [ quad[0].offseted, quad[1].offseted, quad[2].offseted, quad[3].offseted ]
        this.group.visible = this.viewer.isActive || circleIntersectsPolygon(this.center, this.radius, polygon)
    }
}
