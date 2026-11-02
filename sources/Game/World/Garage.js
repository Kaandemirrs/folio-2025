import * as THREE from 'three/webgpu'
import { color } from 'three/tsl'
import gsap from 'gsap'
import { Game } from '../Game.js'
import { InteractivePoints } from '../InteractivePoints.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'
import { Props } from './Props.js'
import { VehicleDisplay } from './VehicleDisplay.js'
import propsConfig from '../../../scripts/props/props.config.json'

// Bakkalın önündeki garaj: park yeri (sürülmeyen araç) + vitrin (dönen platform) + araç seçimi.
// Yapılandırma: scripts/props/props.config.json > bakkal.garage (bakkal yerel koordinatları)
export class Garage
{
    static STATE_CLOSED = 1
    static STATE_OPENING = 2
    static STATE_OPEN = 3
    static STATE_CLOSING = 4
    static STATE_SWITCHING = 5 // "Sür" basıldı: araç yükleniyor / perde iniyor. Girdiler kilitli, Esc yutulur

    constructor()
    {
        this.game = Game.getInstance()
        this.prop = propsConfig.props.find(prop => prop.garage)
        this.config = this.prop.garage
        this.state = Garage.STATE_CLOSED
        this.parkingLoadDistance = 70
        this.parkingResetDistance = 45

        this.setPositions()
        this.setParking()
        this.setShowcase()
        this.setInteractivePoint()
        this.setUi()
        this.setInputs()

        this.game.vehicles.events.on('change', () => { this.updateParking() })
        this.game.ticker.events.on('tick', () => { this.update() }, 14)
    }

    // Açık (OPENING/OPEN/SWITCHING): dışarıdan araç değişimi yapılmaz
    get isBusy()
    {
        return this.state !== Garage.STATE_CLOSED
    }

    // Esc'nin işlem yapmaması gereken geçiş durumları
    get isTransitioning()
    {
        return this.state === Garage.STATE_CLOSING || this.state === Garage.STATE_SWITCHING
    }

    toWorld(local, y = 0)
    {
        return Props.localToWorld(this.prop, local.x, local.z, y)
    }

    setPositions()
    {
        const rotationY = Props.getRotationY(this.prop)
        const showcase = this.config.showcase

        this.positions = {}
        this.positions.interact = this.toWorld(this.config.interact, 1.2)
        this.positions.parking = this.toWorld(this.config.parking)
        this.positions.showcase = this.toWorld(showcase)
        this.positions.camera = this.toWorld({ x: showcase.x + showcase.camera.x, z: showcase.z + showcase.camera.z }, showcase.camera.y)
        this.positions.target = this.toWorld({ x: showcase.x + (showcase.targetX ?? 0), z: showcase.z }, showcase.targetY)
        this.rotationY = rotationY
        this.parkingQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY + THREE.MathUtils.degToRad(this.config.parking.yawDeg ?? 0))
    }

    /**
     * Park yeri
     */
    setParking()
    {
        this.parking = { vehicleId: null, object: null, loading: false, far: true }
    }

    // Sürülmeyen araç: Doğan sürülmüyorsa Doğan, Doğan sürülüyorsa W140
    getParkedVehicle()
    {
        const vehicles = this.game.vehicles
        const id = vehicles.currentId === 'dogan' ? 'w140' : 'dogan'
        return vehicles.byId.get(id)
    }

    async updateParking()
    {
        const vehicle = this.getParkedVehicle()

        if(this.parking.vehicleId === vehicle.id)
            return

        // Yükleme sürerken gelen değişiklik kaybolmasın: bitince yeniden bakılır
        if(this.parking.loading)
        {
            this.parking.pending = true
            return
        }

        // Uzakta ve henüz hiç kurulmadıysa yükleme yaklaşınca yapılır
        if(this.parking.object === null && this.parking.far)
            return

        await this.createParked(vehicle)

        if(this.parking.pending)
        {
            this.parking.pending = false
            await this.updateParking()
        }
    }

    async createParked(vehicle)
    {
        this.parking.loading = true

        let model
        try
        {
            model = await this.game.vehicles.createModel(vehicle.id)
        }
        catch(error)
        {
            // Yükleme başarısız: bayrak takılı kalmasın, sonraki araç değişiminde/yaklaşmada yeniden denenir
            console.warn('Garage > park yeri aracı yüklenemedi:', vehicle.id, error)
            this.parking.loading = false
            return
        }

        // Önceki park eden aracı kaldır
        if(this.parking.object)
        {
            this.game.objects.remove(this.parking.object)
            this.parking.object = null
        }

        const display = new VehicleDisplay(model, vehicle)
        const position = this.positions.parking.clone()
        position.y = VehicleDisplay.getBodyHeight(vehicle) + 0.02

        this.parking.object = this.game.objects.add(
            {
                model: display.group,
                updateMaterials: false,
                castShadow: false,
                receiveShadow: false,
                parent: this.game.scene,
            },
            {
                type: 'dynamic',
                position: position,
                rotation: this.parkingQuaternion,
                friction: 0.4,
                sleeping: true,
                colliders: vehicle.physics.colliders,
                waterGravityMultiplier: 0,
                onCollision: (force, position) =>
                {
                    this.game.audio.groups.get('hitDefault')?.playRandomNext(force, position)
                },
            }
        )
        this.parking.vehicleId = vehicle.id
        this.parking.loading = false
    }

    updateParkingDistance()
    {
        const player = this.game.physicalVehicle.position
        const distance = Math.hypot(player.x - this.positions.parking.x, player.z - this.positions.parking.z)

        // Yaklaşınca yükle
        if(this.parking.far && distance < this.parkingLoadDistance)
        {
            this.parking.far = false

            if(this.parking.vehicleId !== this.getParkedVehicle().id)
                this.updateParking()
        }

        // Uzaklaşıp geri gelince yerine sıfırla
        if(!this.parking.far && distance > this.parkingResetDistance)
        {
            this.parking.far = true
            this.parking.resetNeeded = true
        }

        if(this.parking.resetNeeded && distance < this.parkingResetDistance - 10 && this.parking.object)
        {
            this.parking.resetNeeded = false
            this.parking.far = false

            const body = this.parking.object.physical.body
            const translation = body.translation()
            const initial = this.parking.object.physical.initialState.position
            if(Math.hypot(translation.x - initial.x, translation.z - initial.z) > 0.2 || Math.abs(translation.y - initial.y) > 0.2 || body.rotation().x ** 2 + body.rotation().z ** 2 > 0.0004)
                this.game.objects.resetObject(this.parking.object)
        }
    }

    /**
     * Vitrin
     */
    setShowcase()
    {
        this.showcase = {}
        this.showcase.group = new THREE.Group()
        this.showcase.group.position.copy(this.positions.showcase)
        this.showcase.group.visible = false
        this.showcase.group.scale.setScalar(0.001)
        this.game.scene.add(this.showcase.group)

        // Platform
        const radius = this.config.showcase.radius
        const material = new MeshDefaultMaterial({ colorNode: color('#e9d9bd') })
        const platform = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.12, 40), material)
        platform.position.y = 0.06
        platform.receiveShadow = true
        platform.castShadow = true
        this.showcase.group.add(platform)

        const ringMaterial = new MeshDefaultMaterial({ colorNode: color('#8a1030') })
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.06, 6, 48), ringMaterial)
        ring.rotation.x = Math.PI * 0.5
        ring.position.y = 0.12
        this.showcase.group.add(ring)

        // Dönen araç
        this.showcase.turntable = new THREE.Group()
        this.showcase.turntable.position.y = 0.12
        this.showcase.group.add(this.showcase.turntable)

        this.showcase.current = null
        this.showcase.loadToken = 0
    }

    async setCandidate(index, direction = 1)
    {
        const vehicles = this.game.vehicles.items
        this.candidate = ((index % vehicles.length) + vehicles.length) % vehicles.length
        const vehicle = vehicles[this.candidate]
        const token = ++this.showcase.loadToken

        this.updateUi(vehicle, direction)

        let model
        try
        {
            model = await this.game.vehicles.createModel(vehicle.id)
        }
        catch(error)
        {
            // Yükleme başarısız: vitrin eski araçla kalır, kullanıcı başka araca geçebilir / tekrar deneyebilir
            console.warn('Garage > vitrin aracı yüklenemedi:', vehicle.id, error)
            if(token === this.showcase.loadToken)
                this.game.notifications.show('Araç yüklenemedi. Bağlantını kontrol edip tekrar dene.', 'warning', 3)
            return
        }

        if(token !== this.showcase.loadToken)
            return

        // Eskisini kaldır, yenisini kaydırarak getir
        const old = this.showcase.current
        if(old)
        {
            gsap.to(old.group.position, { x: - direction * 2.5, duration: 0.35, ease: 'power2.in', overwrite: true, onComplete: () => { old.group.removeFromParent() } })
        }

        const display = new VehicleDisplay(model, vehicle, { headlights: false })
        display.chassis.position.y = vehicle.physics.restHeight // şasi orijini dinlenme yüksekliğinde: tekerlekler platforma değer
        display.group.position.x = direction * 2.5
        this.showcase.turntable.add(display.group)
        this.showcase.current = display

        gsap.to(display.group.position, { x: 0, duration: 0.6, delay: old ? 0.25 : 0, ease: 'back.out(1.4)', overwrite: true })
    }

    /**
     * Etkileşim noktası
     */
    setInteractivePoint()
    {
        this.interactivePoint = this.game.interactivePoints.create(
            this.positions.interact,
            this.config.label,
            InteractivePoints.ALIGN_RIGHT,
            InteractivePoints.STATE_CONCEALED,
            () => { this.open() },
            () => { this.game.inputs.interactiveButtons.addItems([ 'interact' ]) },
            () => { this.game.inputs.interactiveButtons.removeItems([ 'interact' ]) },
            () => { this.game.inputs.interactiveButtons.removeItems([ 'interact' ]) }
        )
    }

    /**
     * Arayüz (HTML)
     */
    setUi()
    {
        this.ui = {}
        this.ui.element = this.game.domElement.querySelector('.js-garage')
        this.ui.name = this.ui.element.querySelector('.js-garage-name')
        this.ui.year = this.ui.element.querySelector('.js-garage-year')
        this.ui.description = this.ui.element.querySelector('.js-garage-description')
        this.ui.counter = this.ui.element.querySelector('.js-garage-counter')
        this.ui.current = this.ui.element.querySelector('.js-garage-current')
        this.ui.bars = {}
        for(const name of [ 'speed', 'weight', 'grip', 'boost' ])
            this.ui.bars[name] = this.ui.element.querySelector(`.js-garage-bar-${name}`)

        this.ui.element.querySelector('.js-garage-previous').addEventListener('click', () => { this.previous() })
        this.ui.element.querySelector('.js-garage-next').addEventListener('click', () => { this.next() })
        this.ui.element.querySelector('.js-garage-select').addEventListener('click', () => { this.select() })
        this.ui.element.querySelector('.js-garage-close').addEventListener('click', () => { this.close() })
    }

    updateUi(vehicle, direction)
    {
        this.ui.name.textContent = vehicle.name
        this.ui.year.textContent = vehicle.year
        this.ui.description.textContent = vehicle.description
        this.ui.counter.textContent = `${this.candidate + 1} / ${this.game.vehicles.items.length}`
        this.ui.current.classList.toggle('is-visible', vehicle.id === this.game.vehicles.currentId)

        for(const name in this.ui.bars)
            this.ui.bars[name].style.transform = `scaleX(${vehicle.stats[name]})`
    }

    /**
     * Girdiler
     */
    setInputs()
    {
        const isOpen = () => this.state === Garage.STATE_OPEN

        this.game.inputs.events.on('left', (action) => { if(action.active) this.previous() })
        this.game.inputs.events.on('right', (action) => { if(action.active) this.next() })
        this.game.inputs.events.on('forward', (action) => { if(action.active && !action.activeKeys.has('Gamepad.r2')) this.previous() })
        this.game.inputs.events.on('backward', (action) => { if(action.active && !action.activeKeys.has('Gamepad.l2')) this.next() })

        // Enter / E / F (bırakınca): seç. Açılırken basılı kalan tuş yanlışlıkla seçmesin diye yalnızca OPEN durumunda
        this.game.inputs.events.on('interact', (action) =>
        {
            if(!action.active && isOpen())
                this.select()
        })

        const buttons = this.game.inputs.interactiveButtons.events
        buttons.on('previous', () => { this.previous() })
        buttons.on('next', () => { this.next() })
        buttons.on('select', () => { if(isOpen()) this.select() })
        buttons.on('close', () => { if(isOpen()) this.close() })
    }

    previous()
    {
        if(this.state === Garage.STATE_OPEN)
            this.setCandidate(this.candidate - 1, -1)
    }

    next()
    {
        if(this.state === Garage.STATE_OPEN)
            this.setCandidate(this.candidate + 1, 1)
    }

    /**
     * Açma / kapama
     */
    open()
    {
        if(this.state !== Garage.STATE_CLOSED)
            return

        this.state = Garage.STATE_OPENING
        this.stateTransition?.kill()
        this.stateTransition = gsap.delayedCall(1.5, () =>
        {
            this.state = Garage.STATE_OPEN
            this.stateTransition = null
        })

        // Girdi filtreleri
        this.game.inputs.filters.delete('wandering')
        this.game.inputs.filters.add('cinematic')

        // Kamera
        this.game.view.cinematic.start(this.positions.camera, this.positions.target)

        // Etkileşim noktaları
        this.game.interactivePoints.temporaryHide()

        // Oyuncunun aracı: fizik durur, görsel gizlenir
        this.game.physicalVehicle.deactivate()
        this.game.world.visualVehicle.parts.chassis.visible = false

        // Vitrin
        this.showcase.group.visible = true
        gsap.to(this.showcase.group.scale, { x: 1, y: 1, z: 1, duration: 1, ease: 'back.out(1.6)', overwrite: true })

        // Arayüz
        this.ui.element.classList.add('is-visible')

        // Dokunmatik düğmeler
        this.game.inputs.interactiveButtons.clearItems()
        this.game.inputs.interactiveButtons.addItems([ 'previous', 'next', 'select', 'close' ])

        const index = this.game.vehicles.items.findIndex(vehicle => vehicle.id === this.game.vehicles.currentId)
        this.setCandidate(index)

        // Diğer araçlar arka planda yüklenir: seçimde bekleme olmasın
        this.game.vehicles.preload()

        // Ses
        this.game.audio.groups.get('click')?.play(true)
    }

    // Ortak kapanış: kamera/girdi/vitrin geri alınır
    finish()
    {
        this.state = Garage.STATE_CLOSING
        this.stateTransition?.kill()
        this.stateTransition = gsap.delayedCall(1.5, () =>
        {
            this.state = Garage.STATE_CLOSED
            this.stateTransition = null
        })

        this.game.inputs.filters.delete('cinematic')
        this.game.inputs.filters.add('wandering')

        this.game.view.cinematic.end()
        gsap.delayedCall(1, () => { this.game.interactivePoints.recover() })

        this.game.physicalVehicle.activate()
        this.game.world.visualVehicle.parts.chassis.visible = true

        this.ui.element.classList.remove('is-visible')
        this.showcase.loadToken++
        gsap.to(this.showcase.group.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.6, ease: 'power2.in', overwrite: true, onComplete: () =>
        {
            this.showcase.group.visible = false

            if(this.showcase.current)
            {
                this.showcase.current.group.removeFromParent()
                this.showcase.current = null
            }
        } })

        this.game.inputs.interactiveButtons.clearItems()
    }

    close()
    {
        if(this.state !== Garage.STATE_OPEN && this.state !== Garage.STATE_OPENING)
            return

        this.finish()
        this.game.audio.groups.get('click')?.play(false)
    }

    async select()
    {
        if(this.state !== Garage.STATE_OPEN)
            return

        const vehicle = this.game.vehicles.items[this.candidate]

        // Aynı araç seçildiyse sadece çık
        if(vehicle.id === this.game.vehicles.currentId)
        {
            this.close()
            return
        }

        // OPEN → SWITCHING: araç yüklenirken girdiler kilitli, Esc yutulur. Yükleme başarısız olursa OPEN'a dönülür (eskiden CLOSING'de sonsuza dek kalıyordu)
        this.state = Garage.STATE_SWITCHING
        this.ui.element.classList.add('is-busy')

        let switched = false
        try
        {
            switched = await this.game.vehicles.select(vehicle.id)
        }
        catch(error)
        {
            console.warn('Garage > araç seçilemedi:', vehicle.id, error)
        }

        if(!switched)
        {
            this.state = Garage.STATE_OPEN
            this.ui.element.classList.remove('is-busy')
            this.game.notifications.show('Araç yüklenemedi. Bağlantını kontrol edip tekrar dene.', 'warning', 3)
            return
        }

        // Yeni araçla vitrin önünde başla (perde inerken yeniden doğ)
        this.game.player.respawn(this.prop.name, () =>
        {
            this.ui.element.classList.remove('is-busy')
            this.state = Garage.STATE_OPEN
            this.finish()
        })

        this.game.audio.groups.get('click')?.play(true)
    }

    update()
    {
        // Vitrindeki araç döner
        if(this.showcase.group.visible && this.showcase.current)
            this.showcase.turntable.rotation.y += this.game.ticker.deltaScaled * 0.5

        this.updateParkingDistance()
    }
}
