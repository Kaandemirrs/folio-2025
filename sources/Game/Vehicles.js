import { Game } from './Game.js'
import { Events } from './Events.js'
import { VisualVehicle } from './World/VisualVehicle.js'
import vehiclesData, { defaultVehicleId, vehiclesById } from '../data/vehicles.js'

const STORAGE_KEY = 'vehicle'

// Araç kaydı + çalışma anında araç değiştirme (fizik profili + görsel model).
// GLB'ler ihtiyaç olunca yüklenir; ilk yükleme yalnızca kayıtlı/varsayılan aracı içerir.
export class Vehicles
{
    // Kayıtlı seçimi okur (Game.js kaynak listesini kurmadan önce çağırır)
    static getSavedId()
    {
        try
        {
            const id = localStorage.getItem(STORAGE_KEY)
            if(id && vehiclesById.has(id))
                return id
        }
        catch(error) {}

        return defaultVehicleId
    }

    static getFilePath(vehicle)
    {
        const suffix = import.meta.env.VITE_COMPRESSED ? '-compressed' : ''
        return `${vehicle.file}${suffix}.glb?cb=1`
    }

    constructor(initialId)
    {
        this.game = Game.getInstance()
        this.events = new Events()
        this.items = vehiclesData
        this.byId = vehiclesById
        this.currentId = initialId
        this.switching = false
        this.loadings = new Map() // id → devam eden / biten yükleme (aynı GLB'yi aynı anda iki kez indirmemek için)
    }

    get current()
    {
        return this.byId.get(this.currentId)
    }

    // Aracın saf (hiç değiştirilmemiş) glTF sahnesi; her kullanım kendi kopyasını alır
    // Eşzamanlı çağrılar (önden yükleme + seçim + park yeri) tek istekte birleşir; başarısız yükleme sonraki denemeye engel olmaz
    load(id)
    {
        let promise = this.loadings.get(id)
        if(promise)
            return promise

        const vehicle = this.byId.get(id)
        promise = this.game.resourcesLoader.load([
            [ `vehicle_${id}`, Vehicles.getFilePath(vehicle), 'gltf' ],
        ]).then(resources => resources[`vehicle_${id}`].scene)

        promise.catch(() => { this.loadings.delete(id) })
        this.loadings.set(id, promise)

        return promise
    }

    // Henüz yüklenmemiş araçları arka planda yükler (garaj açılırken: seçimde bekleme olmasın). Hata sessizdir; seçimde yeniden denenir
    preload()
    {
        for(const vehicle of this.items)
            this.load(vehicle.id).catch((error) => { console.warn('Vehicles > önden yükleme başarısız:', vehicle.id, error) })
    }

    // Çizim için bağımsız kopya (geometri ve doku paylaşılır)
    async createModel(id)
    {
        return (await this.load(id)).clone(true)
    }

    save()
    {
        try { localStorage.setItem(STORAGE_KEY, this.currentId) } catch(error) {}
    }

    // Sürülen aracı değiştirir. Konum/yön korunur, araç yerinde durdurulur.
    async select(id, { save = true } = {})
    {
        const vehicle = this.byId.get(id)
        if(!vehicle || this.switching)
            return false

        if(id === this.currentId)
            return true

        this.switching = true

        try
        {
            const model = await this.createModel(id)
            const previousId = this.currentId

            // Fizik
            this.game.physicalVehicle.setVehicle(vehicle)

            // Görsel (eskisi tamamen temizlenir)
            this.game.world.visualVehicle.destroy()
            this.game.world.visualVehicle = new VisualVehicle(model, vehicle)

            this.currentId = id
            if(save)
                this.save()

            this.events.trigger('change', [ vehicle, this.byId.get(previousId) ])
        }
        finally
        {
            this.switching = false
        }

        return true
    }
}
