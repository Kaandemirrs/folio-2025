import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { VisualVehicle } from './VisualVehicle.js'

// Hareketsiz araç görseli (park yeri ve garaj vitrini için): şasi + dört tekerlek, boya araç varsayılanı.
// Sürülen araç (VisualVehicle) ile aynı model/dokulardan kendi kopyasını kullanır.
export class VehicleDisplay
{
    // Dinlenme konumunda (süspansiyonlu) şasi orijininin yerden yüksekliği, çarpıştırıcıların alt ucundan fazla olduğu için
    // görsel şasi fizik gövdesinin biraz üstünde durur; tekerlekler zemine tam değer.
    static getBodyHeight(vehicle)
    {
        return - Math.min(...vehicle.physics.colliders.map(collider => collider.position.y - collider.parameters[1]))
    }

    constructor(model, vehicle, { headlights = false } = {})
    {
        this.game = Game.getInstance()
        this.vehicle = vehicle
        this.model = model

        const chassis = model.getObjectByName('chassis')
        const wheelContainer = model.getObjectByName('wheelContainer')

        // Boya: araç varsayılanı (VisualVehicle boyaları sürüş başladıktan sonra hazır)
        const paint = VisualVehicle.paintChoices?.[vehicle.defaultPaint]
        const bodyPainted = chassis.getObjectByName('bodyPainted')

        this.game.materials.updateObject(chassis)
        this.game.materials.updateObject(wheelContainer)

        if(paint && bodyPainted)
            bodyPainted.material = paint

        // Tekerlekler: sürüşteki başlangıç dizilimi (0: +x +z sol, 1: +x -z, 2: -x +z, 3: -x -z)
        const offset = vehicle.physics.wheels.offset
        const wheelY = - (vehicle.physics.restHeight - vehicle.physics.wheels.radius)
        for(let i = 0; i < 4; i++)
        {
            const container = wheelContainer.clone(true)
            container.position.set(i < 2 ? offset.x : - offset.x, wheelY, i % 2 === 0 ? offset.z : - offset.z)

            if(i === 0 || i === 2)
                container.rotation.y = Math.PI

            chassis.add(container)
        }
        wheelContainer.removeFromParent()

        // Işıklar kapalı
        for(const name of [ 'blinkerLeft', 'blinkerRight', 'stopLights', 'backLights' ])
        {
            const part = chassis.getObjectByName(name)
            if(part)
                part.visible = false
        }

        if(!headlights)
        {
            const lights = chassis.getObjectByName('headlights')
            if(lights)
                lights.visible = false
        }

        chassis.traverse((child) =>
        {
            if(child.isMesh)
            {
                child.castShadow = true
                child.receiveShadow = true
                child.material.shadowSide = THREE.BackSide
            }
        })

        // Gövde (fizik) orijini ile görsel şasi arasındaki fark
        this.chassis = chassis
        this.chassis.rotation.reorder('YXZ')
        this.chassis.position.set(0, vehicle.physics.restHeight - VehicleDisplay.getBodyHeight(vehicle), 0)

        // Grup: fizik gövdesinin orijinini taşır
        this.group = new THREE.Group()
        this.group.add(this.chassis)
    }
}
