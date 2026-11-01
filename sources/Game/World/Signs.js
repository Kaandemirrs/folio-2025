import * as THREE from 'three/webgpu'
import { texture } from 'three/tsl'
import { Game } from '../Game.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'
import { Props } from './Props.js'
import { circleIntersectsPolygon } from '../utilities/maths.js'
import propsConfig from '../../../scripts/props/props.config.json'

// Tabelalar: tek GLB (static/props/signs.glb, dört varyant) + her tahtaya çalışma anında canvas'tan çizilen yazı.
// Tüm yerleşimler props.config.json > signs.placements içinde. Dinamik fizik, uyuyarak başlar; oyuncu
// resetDistance'tan fazla uzaklaşınca devrilmiş/itilmiş tabela yerine döner (Garage.js park mantığıyla aynı).
// Yön gösteren tabelalarda 'target' (respawn adı) verilirse sağ/sol ok ve dönüş otomatik hesaplanır.
export class Signs
{
    constructor()
    {
        this.game = Game.getInstance()

        this.config = propsConfig.props.find(prop => prop.custom === 'signs')
        this.model = this.game.resources[Props.getResourceName(this.config)].scene

        this.setAtlas()
        this.setMaterial()
        this.setItems()
        this.drawAtlas()

        // Yazı fontu geç yüklenirse yeniden çiz
        document.fonts?.load('700 64px "Amatic SC"').then(() => this.drawAtlas())

        this.game.ticker.events.on('tick', () => { this.update() }, 14)
    }

    // Yerleşimin varyantı ve dönüşü. Hedef verilmişse ok yönü hedeften hesaplanır.
    resolve(placement)
    {
        let variant = placement.variant ?? 'signDouble'
        let facingDeg = placement.facingDeg ?? 45

        if(placement.target)
        {
            const target = this.game.respawns.getByName(placement.target)
            if(!target)
                throw new Error(`Tabela "${placement.id}": "${placement.target}" adlı hedef yok`)

            const dx = target.position.x - placement.x
            const dz = target.position.z - placement.z
            const length = Math.hypot(dx, dz)
            const x = dx / length
            const z = dz / length

            // Sağ ok: yerel +x hedefe bakar, yüz normali (-z, x); sol ok: (z, -x).
            // Kamera tarafı (+X,+Z) olduğundan yazı kameraya dönük olan seçilir.
            const right = x - z >= 0
            variant = right ? 'signRight' : 'signLeft'
            const normal = right ? { x: -z, y: x } : { x: z, y: -x }
            facingDeg = Math.atan2(normal.y, normal.x) * 180 / Math.PI

            // Yazı kameraya yeterince dönük olsun: yüz, kamera yönüne (45°) en fazla cameraTiltDeg kadar çevrilir
            const diff = ((45 - facingDeg + 540) % 360) - 180
            facingDeg += Math.sign(diff) * Math.min(Math.abs(diff), this.config.cameraTiltDeg ?? 0)
        }

        return { variant, facingDeg }
    }

    setMaterial()
    {
        this.textMaterial = new MeshDefaultMaterial({
            colorNode: texture(this.atlas.texture).rgb,
            alphaNode: texture(this.atlas.texture).a,
            transparent: true,
            depthWrite: false,
            hasWater: false,
            hasLightBounce: false,
        })
        this.textMaterial.polygonOffset = true
        this.textMaterial.polygonOffsetFactor = -2
        this.textMaterial.polygonOffsetUnits = -2
    }

    setAtlas()
    {
        const width = 1024
        const cellWidth = 512

        // Tahtalar: raf yerleşimi; hücre yüksekliği tahtanın en-boy oranından.
        // Hedefe bağlı (ok) tabelalar tek tahtalıdır, bu yüzden hedef konumu çözülmeden de sayılabilir.
        this.boards = []
        let x = 0
        let y = 0
        let rowHeight = 0
        for(const placement of this.config.placements)
        {
            const variant = placement.target ? 'signRight' : (placement.variant ?? 'signDouble')
            this.config.variants[variant].boards.forEach((board, index) =>
            {
                const cellHeight = Math.ceil(cellWidth * board.h / board.w)
                if(x + cellWidth > width)
                {
                    x = 0
                    y += rowHeight
                    rowHeight = 0
                }
                const entry = placement.texts?.[index] ?? ''
                this.boards.push({ placement, index, board, x, y, w: cellWidth, h: cellHeight, text: typeof entry === 'string' ? entry : entry.text, target: typeof entry === 'string' ? null : entry.target })
                x += cellWidth
                rowHeight = Math.max(rowHeight, cellHeight)
            })
        }

        const height = THREE.MathUtils.ceilPowerOfTwo(Math.max(256, y + rowHeight))

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const atlasTexture = new THREE.CanvasTexture(canvas)
        atlasTexture.colorSpace = THREE.SRGBColorSpace
        atlasTexture.anisotropy = 4

        this.atlas = { canvas, texture: atlasTexture, width, height }
    }

    drawAtlas()
    {
        const { canvas, texture: atlasTexture } = this.atlas
        const context = canvas.getContext('2d')
        context.clearRect(0, 0, canvas.width, canvas.height)

        let seed = 7
        const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
        const font = (size) => `700 ${size}px "Amatic SC", sans-serif`

        for(const item of this.boards)
        {
            let text = item.text
            if(this.config.uppercase)
                text = text.toLocaleUpperCase('tr-TR')

            // Ok: hedef verilmişse tahtanın solunda/sağında el çizimi ok (yön, tabelanın yerel +x eksenine göre)
            const arrow = this.getArrowSide(item)
            const arrowWidth = arrow ? item.h * 0.95 : 0
            const textWidth = item.w - arrowWidth
            const textCenter = item.x + item.w / 2 + (arrow === 'right' ? -arrowWidth / 2 : arrow === 'left' ? arrowWidth / 2 : 0)

            // Sığacak kadar küçült (Amatic büyük harf yüksekliği ≈ 0,68 em); çok küçülürse iki satıra böl
            const padding = 0.94
            const fit = (lines) =>
            {
                let size = item.h * 1.3 / (1 + (lines.length - 1) * 1.1)
                context.font = font(size)
                const widest = Math.max(...lines.map(line => context.measureText(line).width))
                if(widest > textWidth * padding)
                    size *= textWidth * padding / widest
                return size
            }

            let lines = [ text ]
            let size = fit(lines)
            const words = text.split(' ')
            if(words.length > 1 && size < item.h * 0.8)
            {
                // En dengeli bölme noktası
                let best = null
                context.font = font(100)
                for(let i = 1; i < words.length; i++)
                {
                    const candidate = [ words.slice(0, i).join(' '), words.slice(i).join(' ') ]
                    const diff = Math.abs(context.measureText(candidate[0]).width - context.measureText(candidate[1]).width)
                    if(!best || diff < best.diff)
                        best = { lines: candidate, diff }
                }
                const twoLines = fit(best.lines)
                if(twoLines > size)
                {
                    lines = best.lines
                    size = twoLines
                }
            }

            context.save()
            context.beginPath()
            context.rect(item.x, item.y, item.w, item.h)
            context.clip()
            context.font = font(size)
            context.textAlign = 'center'
            context.textBaseline = 'alphabetic'

            const capHeight = size * 0.68
            const lineHeight = size * 0.8
            const blockHeight = capHeight + (lines.length - 1) * lineHeight
            const startY = item.y + item.h / 2 - blockHeight / 2 + capHeight
            lines.forEach((line, index) =>
            {
                const lineY = startY + index * lineHeight

                // Oyma hissi: alt-sağda ince açık kenar, üstte koyu boya (Amatic ince olduğundan kontur ile kalınlaştırılır)
                context.lineJoin = 'round'
                context.lineWidth = size * 0.055
                context.strokeStyle = 'rgba(255, 226, 176, 0.35)'
                context.strokeText(line, textCenter + size * 0.012, lineY + size * 0.016)
                context.strokeStyle = this.config.textColor
                context.fillStyle = this.config.textColor
                context.strokeText(line, textCenter, lineY)
                context.fillText(line, textCenter, lineY)
            })

            if(arrow)
                this.drawArrow(context, item, arrow)

            // Boya aşınması: ince lekeler
            context.globalCompositeOperation = 'destination-out'
            for(let i = 0; i < 70; i++)
            {
                context.globalAlpha = 0.25 + random() * 0.4
                context.fillRect(item.x + random() * item.w, item.y + random() * item.h, 1 + random() * 3, 1 + random() * 2)
            }
            context.restore()
        }

        atlasTexture.needsUpdate = true
    }

    // Hedefli tahtada okun yönü: hedefe doğru vektörün tabelanın yerel +x eksenindeki izdüşümü
    getArrowSide(item)
    {
        if(!item.target)
            return null

        const target = this.game.respawns.getByName(item.target)
        if(!target)
            throw new Error(`Tabela "${item.placement.id}": "${item.target}" adlı hedef yok`)

        const { facingDeg } = this.resolve(item.placement)
        const rotationY = Props.getRotationY({ world: { facingDeg } })
        const dx = target.position.x - item.placement.x
        const dz = target.position.z - item.placement.z
        return dx * Math.cos(rotationY) - dz * Math.sin(rotationY) >= 0 ? 'right' : 'left'
    }

    // El çizimi ok: hafif dalgalı gövde + iki kanat
    drawArrow(context, item, side)
    {
        const direction = side === 'right' ? 1 : -1
        const size = item.h * 0.8
        const centerX = item.x + (side === 'right' ? item.w - item.h * 0.5 : item.h * 0.5)
        const centerY = item.y + item.h / 2
        const tipX = centerX + direction * size * 0.5
        const tailX = centerX - direction * size * 0.5

        context.save()
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.lineWidth = size * 0.13
        context.strokeStyle = this.config.textColor
        context.beginPath()
        context.moveTo(tailX, centerY + size * 0.03)
        context.quadraticCurveTo(centerX, centerY - size * 0.06, tipX, centerY)
        context.moveTo(tipX - direction * size * 0.28, centerY - size * 0.26)
        context.lineTo(tipX, centerY)
        context.lineTo(tipX - direction * size * 0.3, centerY + size * 0.24)
        context.stroke()
        context.restore()
    }

    getBoardGeometry(item)
    {
        const geometry = new THREE.PlaneGeometry(item.board.w, item.board.h)
        const uv = geometry.attributes.uv
        const u0 = item.x / this.atlas.width
        const u1 = (item.x + item.w) / this.atlas.width
        const v0 = 1 - (item.y + item.h) / this.atlas.height
        const v1 = 1 - item.y / this.atlas.height
        for(let i = 0; i < uv.count; i++)
            uv.setXY(i, uv.getX(i) < 0.5 ? u0 : u1, uv.getY(i) < 0.5 ? v0 : v1)
        return geometry
    }

    setItems()
    {
        this.items = []
        const castShadow = this.game.quality.pick(true, false)

        for(const placement of this.config.placements)
        {
            const { variant, facingDeg } = this.resolve(placement)
            const variantConfig = this.config.variants[variant]

            // Model + yazı düzlemleri
            const group = new THREE.Group()
            group.name = `sign_${placement.id}`

            const mesh = this.model.getObjectByName(variant).clone()
            this.game.materials.updateObject(mesh)
            mesh.traverse((child) =>
            {
                if(child.isMesh)
                {
                    child.castShadow = castShadow
                    child.receiveShadow = true
                }
            })
            group.add(mesh)

            variantConfig.boards.forEach((board, index) =>
            {
                const item = this.boards.find(item => item.placement === placement && item.index === index)
                const plane = new THREE.Mesh(this.getBoardGeometry(item), this.textMaterial)
                plane.position.set(board.x, board.y, 0.084 + 0.003)
                plane.receiveShadow = true
                group.add(plane)
            })

            // Fizik
            const rotationY = Props.getRotationY({ world: { facingDeg } })
            const position = new THREE.Vector3(placement.x, 0, placement.z)
            const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY)

            const object = this.game.objects.add(
                {
                    model: group,
                    updateMaterials: false,
                    castShadow: false,
                    receiveShadow: false,
                    parent: this.game.scene,
                },
                {
                    type: 'dynamic',
                    position: position,
                    rotation: quaternion,
                    sleeping: true,
                    mass: this.config.mass,
                    friction: 0.4,
                    restitution: 0.1,
                    colliders: variantConfig.colliders.map(collider => ({
                        shape: 'cuboid',
                        parameters: collider.half,
                        position: { x: collider.center[0], y: collider.center[1], z: collider.center[2] },
                        category: 'object',
                    })),
                    onCollision: (force, collisionPosition) =>
                    {
                        this.game.audio.groups.get('hitDefault')?.playRandomNext(force, collisionPosition)
                    },
                }
            )

            this.items.push({ placement, variant, group, object, radius: 3 })
        }
    }

    update()
    {
        const view = this.game.view.optimalArea.quad2
        const polygon = [ view[0].offseted, view[1].offseted, view[2].offseted, view[3].offseted ]
        const player = this.game.physicalVehicle.position

        for(const item of this.items)
        {
            const body = item.object.physical.body
            const translation = body.translation()

            item.group.visible = circleIntersectsPolygon({ x: translation.x, y: translation.z }, item.radius, polygon)

            // Oyuncu uzaklaşınca (görünmezken) yerine dön
            const initial = item.object.physical.initialState.position
            if(Math.hypot(player.x - initial.x, player.z - initial.z) > this.config.resetDistance)
            {
                const rotation = body.rotation()
                const moved = Math.hypot(translation.x - initial.x, translation.z - initial.z) > 0.15 || Math.abs(translation.y - initial.y) > 0.15 || rotation.x ** 2 + rotation.z ** 2 > 0.0004
                if(moved)
                    this.game.objects.resetObject(item.object)
            }
        }
    }
}
