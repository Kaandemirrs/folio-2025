import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { atan, float, Fn, PI, PI2, positionGeometry, texture, uniform, uv, vec2, vec3, vec4 } from 'three/tsl'
import gsap from 'gsap'
import { Inputs } from '../Inputs/Inputs.js'
import { lerp } from '../utilities/maths.js'

export class Intro
{
    static ZOOM_RATIO = 0.05 // Reveal'in adım 0'daki son zoom oranı (0 = oyun başlangıç zoom'u)

    constructor()
    {
        this.game = Game.getInstance()

        const respawn = this.game.respawns.getDefault()
        this.center = respawn.position.clone()

        this.setCircle()
        this.setLabel()
        this.setExtras()
        this.layout()

        this.game.viewport.events.on('change', this.onViewportChange = () => { this.layout() })

        this.update = this.update.bind(this)
        this.game.ticker.events.on('tick', this.update, 8)
    }

    setLabel()
    {
        // Konum, dönüş ve ölçek layout() içinde ekran oranına göre verilir
        this.label = new THREE.Group()
        this.label.position.copy(this.center)
        this.label.userData.appear = 0
        this.label.userData.layoutScale = 1
        this.label.scale.setScalar(0.0001)
        this.game.scene.add(this.label)
    }

    /**
     * Portre çıkartması, hoş geldin yazısı ve "bu benim" notu. "TIKLA VE BAŞLA" etiketiyle aynı yöntem: sahnede dokulu düzlemler
     * (yazılar R8 maske + eşik, portre WebP). Konum ekran oranına göre `layout()` içinde, ada merkezindeki kameraya dik düzlemde
     * NDC koordinatlarıyla hesaplanır (View'in ratioOverflow mantığıyla aynı kamera yarıçapı).
     * Dokular: scripts/intro/make_intro_extras.mjs (98,5 texel / dünya birimi).
     */
    setExtras()
    {
        const PPU = 98.5
        this.extras = { items: {} }

        const makeItem = (name, width, height) =>
        {
            const group = new THREE.Group()
            group.scale.setScalar(0.0001)
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false }))
            mesh.renderOrder = 100 // yer düzlemine ve ağaçlara gömülmesin
            mesh.visible = false
            group.add(mesh)
            this.game.scene.add(group)

            const item = { name, group, mesh, width, height, appear: 0, layoutScale: 1 }
            this.extras.items[name] = item
            return item
        }

        const loadMask = (item, url) =>
        {
            this.game.resourcesLoader.getLoader('textureKtx').load(url, (loadedTexture) =>
            {
                item.texture = loadedTexture
                item.mesh.material.outputNode = Fn(() =>
                {
                    texture(loadedTexture, vec2(uv().x, uv().y.oneMinus())).r.lessThan(0.5).discard()
                    return vec4(1)
                })()
                item.mesh.material.needsUpdate = true
                item.mesh.visible = true
            })
        }

        // Yazılar
        const title = makeItem('title', 768 / PPU, 192 / PPU)
        const subtitle = makeItem('subtitle', 640 / PPU, 192 / PPU)
        const note = makeItem('note', 320 / PPU, 128 / PPU)
        loadMask(title, 'intro/titleLabel.ktx')
        loadMask(subtitle, 'intro/subtitleLabel.ktx')
        loadMask(note, 'intro/noteLabel.ktx')

        // Portre çıkartması (renkli, şeffaf kenarlı WebP)
        const portrait = makeItem('portrait', 512 / PPU, 512 / PPU)
        this.game.resourcesLoader.getLoader('texture').load('intro/portrait.webp', (loadedTexture) =>
        {
            loadedTexture.colorSpace = THREE.SRGBColorSpace
            loadedTexture.minFilter = THREE.LinearFilter
            loadedTexture.generateMipmaps = false
            portrait.texture = loadedTexture
            portrait.mesh.material.outputNode = Fn(() =>
            {
                const sample = texture(loadedTexture, uv())
                sample.a.lessThan(0.5).discard()
                return vec4(sample.rgb, 1)
            })()
            portrait.mesh.material.needsUpdate = true
            portrait.mesh.visible = true
        })
    }

    layout()
    {
        const view = this.game.view
        const aspect = this.game.viewport.width / this.game.viewport.height
        const overflow = Math.max(1, view.idealRatio / aspect) - 1

        // Kamera: Reveal'in son durumu (zoom oranı 0.3), View ile aynı yarıçap formülü
        const radius = lerp(view.spherical.radius.edges.min, view.spherical.radius.edges.max + overflow * view.spherical.radius.nonIdealRatioOffset, 1 - Intro.ZOOM_RATIO)
        const offset = new THREE.Vector3().setFromSphericalCoords(radius, view.spherical.phi, view.spherical.theta)
        const matrix = new THREE.Matrix4().lookAt(offset, new THREE.Vector3(), new THREE.Vector3(0, 1, 0))
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix)
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion)
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion)

        const halfHeight = radius * Math.tan(THREE.MathUtils.degToRad(view.camera.fov) / 2)
        const halfWidth = halfHeight * aspect

        // NDC → ada merkezinden geçen, kameraya dik düzlemde dünya konumu
        const place = (object, nx, ny) =>
        {
            object.position.set(this.center.x, 0, this.center.z).add(this.focusShift ?? new THREE.Vector3()).addScaledVector(right, nx * halfWidth).addScaledVector(up, ny * halfHeight)
        }

        // Ada (yarıçap 3.5) ekranda: yatay ±ix, dikey ±iy (NDC); ağaç tepesi adanın merkezinden ≈ 6 birim yukarıda (en üstteki dallar başlıkla örtüşebilir)
        const islandX = 3.5 / halfWidth
        const islandY = 3.5 * Math.cos(view.spherical.phi) / halfHeight
        const crown = 6.0 / halfHeight
        const gap = 0.05

        // Yazı bloğu: büyük başlık + iki satır (görünür içerik ≈ 5.9 × 3.0 birim, ölçek 1'de)
        const items = this.extras.items
        const BLOCK = { width: 5.9, height: 3.0 }
        const wide = aspect >= 1.15

        let blockScale = Math.min((2 * halfWidth * 0.94) / BLOCK.width, 1.15)
        let shift
        for(;;)
        {
            // Ada kadrajda aşağı iner ki ağaç tepesi başlığın altında kalsın
            const blockHeight = BLOCK.height * blockScale / halfHeight
            shift = Math.max(0, crown + blockHeight + 0.04 - 0.97 + 0.03)
            if(shift <= 0.40 || blockScale <= 0.35)
                break
            blockScale *= 0.93
        }
        const islandCenterY = -shift
        const blockCenterY = 0.97 - (BLOCK.height * blockScale / 2) / halfHeight

        // Odak kayması: adayı ekranda `shift` kadar aşağı almak için zemin üzerinde kameradan uzağa
        const away = new THREE.Vector3(-Math.sin(view.spherical.theta), 0, -Math.cos(view.spherical.theta))
        this.focusShift = away.multiplyScalar(shift * halfHeight / Math.cos(view.spherical.phi))
        if(this.focusShifted)
            view.focusPoint.offset.copy(this.focusShift)

        const tilt = THREE.MathUtils.degToRad(-6)
        const face = (item, extraRoll = 0) =>
        {
            item.group.quaternion.copy(quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), extraRoll))
        }

        // Başlık ve alt başlık
        place(items.title.group, 0, blockCenterY + (0.95 * blockScale) / halfHeight)
        items.title.layoutScale = blockScale
        face(items.title)
        place(items.subtitle.group, 0, blockCenterY - (0.85 * blockScale) / halfHeight)
        items.subtitle.layoutScale = blockScale
        face(items.subtitle)

        // Portre + not
        let portraitCenter, portraitSize
        if(wide)
        {
            // Adanın solundaki boşluk
            const zoneWidth = (-islandX - gap + 0.97) * halfWidth
            portraitSize = Math.min(zoneWidth * 0.95, 4.2)
            portraitCenter = [ (-0.97 - islandX - gap) / 2, islandCenterY + 0.05 ]
        }
        else
        {
            // Dar/dikey: adanın altı
            portraitSize = Math.min((2 * halfWidth * 0.45), (0.97 + islandCenterY - islandY - gap) * halfHeight * 0.75, 4.4)
            portraitCenter = [ -0.5, islandCenterY - islandY - gap - (portraitSize / 2) / halfHeight - 0.04 ]
        }
        items.portrait.layoutScale = portraitSize / items.portrait.width
        place(items.portrait.group, portraitCenter[0], portraitCenter[1])
        face(items.portrait, tilt)

        // "bu benim": portrenin sağ altı, ok portreyi gösterir
        const noteScale = Math.min(1.0, portraitSize / 4.2)
        items.note.layoutScale = noteScale
        place(items.note.group,
            portraitCenter[0] + ((portraitSize * 0.62) / halfWidth),
            portraitCenter[1] - ((portraitSize * 0.5 + 0.55 * noteScale) / halfHeight))
        face(items.note, tilt)

        // "TIKLA VE BAŞLA" etiketi: geniş ekranda adanın sağ üstü, dar/dikeyde adanın sağ altı
        const labelScale = Math.min(1, (wide ? (1 - islandX - gap) : 0.9) * halfWidth / 2.9)
        this.label.userData.layoutScale = labelScale
        if(wide)
            place(this.label, islandX + gap + (0.97 - islandX - gap) / 2, islandCenterY + 0.30)
        else
            place(this.label, 0.46, portraitCenter[1])
        this.label.quaternion.copy(quaternion)

        // Ses düğmesi çarpışma alanı etiketle birlikte taşınır
        if(this.soundButton && this.soundButton.intersect)
            {
                this.soundButton.intersect.shape.center.copy(this.label.position).addScaledVector(right, 0.38 * labelScale).addScaledVector(up, -1 * labelScale)
                this.soundButton.intersect.shape.radius = 0.5 * labelScale
            }

        this.applyScales()
    }

    // Giriş: ada kadrajda aşağı kayar / oyun başlarken geri döner
    shiftFocus(duration)
    {
        this.focusShifted = true
        gsap.to(this.game.view.focusPoint.offset, { x: this.focusShift.x, z: this.focusShift.z, duration, ease: 'power1.inOut', overwrite: true })
    }

    releaseFocus(duration)
    {
        this.focusShifted = false
        gsap.to(this.game.view.focusPoint.offset, { x: 0, z: 0, duration, ease: 'power1.inOut', overwrite: true })
    }

    applyScales()
    {
        for(const item of Object.values(this.extras.items))
            item.group.scale.setScalar(Math.max(0.0001, item.layoutScale * item.appear))
        this.label.scale.setScalar(Math.max(0.0001, (this.label.userData.layoutScale ?? 1) * (this.label.userData.appear ?? 0)))
    }

    setCircle()
    {
        this.circle = {}
        
        const radius = 3.5
        const thickness = 0.04
        this.circle.progress = 0
        this.circle.smoothedProgress = uniform(0)

        // Geometry
        const geometry = new THREE.RingGeometry(radius - thickness, radius, 128, 1)

        // Material
        const material = new THREE.MeshBasicNodeMaterial()
        material.outputNode = Fn(() =>
        {
            const angle = atan(positionGeometry.y, positionGeometry.x)
            const angleProgress = angle.div(PI2).add(0.5).oneMinus()

            this.circle.smoothedProgress.lessThan(angleProgress).discard()

            return vec4(this.game.reveal.color.mul(this.game.reveal.intensity), 1)
        })()

        // Mesh
        const mesh = new THREE.Mesh(geometry, material)
        
        mesh.position.copy(this.center)
        mesh.position.y = 0.001
        mesh.rotation.x = - Math.PI * 0.5
        mesh.rotation.z = Math.PI * 0.5
        
        this.game.scene.add(mesh)

        this.circle.mesh = mesh

        // Hide
        this.circle.hide = (callback = null) =>
        {
            const dummy = { scale: 1 }
            const speedMultiplier = this.game.debug.active ? 4 : 1
            gsap.to(
                dummy,
                {
                    scale: 0,
                    duration: 1.5 / speedMultiplier,
                    // ease: 'back.in(1.7)',
                    ease: 'power4.in',
                    overwrite: true,
                    onUpdate: () =>
                    {
                        mesh.scale.setScalar(dummy.scale)
                    },
                    onComplete: () =>
                    {
                        if(typeof callback === 'function')
                            callback()

                        mesh.removeFromParent()
                    }
                }
            )
        }
    }

    setText()
    {
        this.text = {}

        // Geometry
        const scale = 1.3
        const geometry = new THREE.PlaneGeometry(2 * scale, 1 * scale)

        // Texture
        this.text.textures = new Map()
        this.text.updateTexture = async () =>
        {
            // Define name
            let name = 'mouseKeyboard'
            
            if(this.game.inputs.mode === Inputs.MODE_GAMEPAD)
            {
                if(this.game.inputs.gamepad.type === 'xbox')
                {
                    name = 'gamepadXbox'
                }
                else
                {
                    name = 'gamepadPlaystation'
                }
            }
            else if(this.game.inputs.mode === Inputs.MODE_TOUCH)
            {
                name = 'touch'
            }

            // Load, set and save texture
            let cachedTexture = this.text.textures.get(name)
            if(!cachedTexture)
            {
                const loader = this.game.resourcesLoader.getLoader('textureKtx')
                
                const resourcePath = `intro/${name}Label.ktx`
                loader.load(
                    resourcePath,
                    (loadedTexture) =>
                    {
                        this.text.textures.set(name, loadedTexture)

                        // Update material and mesh
                        material.outputNode = Fn(() =>
                        {
                            texture(loadedTexture, vec2(uv().x, uv().y.oneMinus())).r.lessThan(0.5).discard()
                            return vec4(1)
                        })()
                        material.needsUpdate = true
                        mesh.visible = true
                    }
                )
            }
            else
            {
                // Update material and mesh
                material.outputNode = Fn(() =>
                {
                    texture(cachedTexture, vec2(uv().x, uv().y.oneMinus())).r.lessThan(0.5).discard()
                    return vec4(1)
                })()
                material.needsUpdate = true
            }

        }

        this.text.updateTexture()

        // Material
        const material = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthTest: false, // etiket yer düzleminin altında kalabilir (layout kameraya dik düzlemde)
            depthWrite: false
        })

        this.game.inputs.gamepad.events.on('typeChange', this.text.updateTexture)
        this.game.inputs.events.on('modeChange', this.text.updateTexture)

        const mesh = new THREE.Mesh(geometry, material)
        mesh.visible = false
        mesh.renderOrder = 100

        this.label.add(mesh)

        this.text.mesh = mesh
    }

    setSoundButton()
    {
        this.soundButton = {}

        // Texture
        const texture = this.game.resources.soundTexture
        
        if(this.game.audio.mute.active)
            texture.offset.x = 0.5

        // Geometry
        const scale = 0.5
        const geometry = new THREE.PlaneGeometry(50 / 38 * scale, 1 * scale)

        // Material
        const intensity = uniform(1)
        const material = new THREE.MeshBasicNodeMaterial({
            alphaTest: 0.5,
            alphaMap: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            outputNode: vec4(vec3(1).mul(intensity), 1)
        })

        // Mesh
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.x = 0.38
        mesh.position.y = - 1
        mesh.renderOrder = 100
        this.label.add(mesh)

        // Intersect
        const position = this.label.position.clone()
        position.x += 0.38
        position.y += - 1

        this.soundButton.intersect = this.game.rayCursor.addIntersect({
            active: true,
            shape: new THREE.Sphere(position, 0.5),
            onClick: () =>
            {
                this.game.audio.mute.toggle()
            },
            onEnter: () =>
            {
                gsap.to(intensity, { value: 1.5, duration: 0.3, overwrite: true })
            },
            onLeave: () =>
            {
                gsap.to(intensity, { value: 1, duration: 0.3, overwrite: true })
            }
        })

        this.game.audio.events.on('muteChange', (active) =>
        {
            texture.offset.x = active ? 0.5 : 0
        })

        this.soundButton.mesh = mesh
    }

    showLabel()
    {
        const speedMultiplier = this.game.debug.active ? 4 : 1
        const reveal = (target, key, delay) =>
        {
            gsap.to(
                target,
                {
                    [key]: 1,
                    duration: 2 / speedMultiplier,
                    delay: delay / speedMultiplier,
                    ease: 'elastic.out(0.5)',
                    overwrite: true,
                    onUpdate: () => { this.applyScales() }
                }
            )
        }

        // Etiket (eskisi gibi 1 sn sonra), yazılar ve portre sırayla
        reveal(this.label.userData, 'appear', 1)
        reveal(this.extras.items.title, 'appear', 0.2)
        reveal(this.extras.items.subtitle, 'appear', 0.5)
        reveal(this.extras.items.portrait, 'appear', 0.8)
        reveal(this.extras.items.note, 'appear', 1.3)
    }

    hideLabel()
    {
        const speedMultiplier = this.game.debug.active ? 4 : 1
        const targets = [ this.label.userData, ...Object.values(this.extras.items) ]
        for(const target of targets)
        {
            gsap.to(
                target,
                {
                    appear: 0,
                    duration: 0.3 / speedMultiplier,
                    ease: 'power2.in',
                    overwrite: true,
                    onUpdate: () => { this.applyScales() },
                    onComplete: () =>
                    {
                        if(target === this.label.userData)
                        {
                            this.text.mesh.removeFromParent()
                            this.soundButton.mesh.removeFromParent()
                            this.game.rayCursor.removeIntersect(this.soundButton.intersect)
                        }
                    }
                }
            )
        }
    }

    updateProgress(progress)
    {
        this.circle.progress = progress
    }

    update()
    {
        this.circle.smoothedProgress.value += (this.circle.progress - this.circle.smoothedProgress.value) * this.game.ticker.delta * 10
    }

    destroy()
    {
        this.label.removeFromParent()
        this.game.viewport.events.off('change', this.onViewportChange)

        for(const item of Object.values(this.extras.items))
        {
            item.group.removeFromParent()
            item.mesh.geometry.dispose()
            item.mesh.material.dispose()
            item.texture?.dispose()
        }

        // Geometries
        this.circle.mesh.geometry.dispose()
        this.soundButton.mesh.geometry.dispose()
        this.text.mesh.geometry.dispose()

        // Materials
        this.circle.mesh.material.dispose()
        this.soundButton.mesh.material.dispose()
        this.text.mesh.material.dispose()

        // Textures
        this.game.resources.soundTexture.dispose()

        this.text.textures.forEach((value, key) =>
        {
            value.dispose()
        })
        
        // Events
        this.game.ticker.events.off('tick', this.update)
        this.game.inputs.gamepad.events.off('typeChange', this.text.updateTexture)
        this.game.inputs.events.off('modeChange', this.text.updateTexture)
    }
}