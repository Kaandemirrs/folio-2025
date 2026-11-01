import * as THREE from 'three/webgpu'
import { Game } from './Game.js'

export class KonamiCode
{
    constructor(once = false)
    {
        this.game = Game.getInstance()

        let index = 0
        this.activationCount = 0
        const sequence = [
            [ 'ArrowUp', 'KeyW' ],
            [ 'ArrowUp', 'KeyW' ],
            [ 'ArrowDown', 'KeyS' ],
            [ 'ArrowDown', 'KeyS' ],
            [ 'ArrowLeft', 'KeyA' ],
            [ 'ArrowRight', 'KeyD' ],
            [ 'ArrowLeft', 'KeyA' ],
            [ 'ArrowRight', 'KeyD' ],
            [ 'KeyB' ],
            [ 'KeyQ', 'KeyA' ],
        ]

        const callback = (event) =>
        {
            const sequenceItem = sequence[index]

            if(sequenceItem.indexOf(event.code) !== -1)
            {
                index++

                if(index === sequence.length)
                {
                    this.activate()

                    if(once)
                        document.removeEventListener('keydown', callback)

                    index = 0
                }
            }
            else
            {
                index = 0
            }
        }
        document.addEventListener('keydown', callback)
    }

    // Araç listesinde bir sonrakine geçer (w140 → dogan → oldSchool → w140 …)
    async activate()
    {
        const vehicles = this.game.vehicles
        const index = vehicles.items.findIndex(vehicle => vehicle.id === vehicles.currentId)
        const next = vehicles.items[(index + 1) % vehicles.items.length]

        if(!await vehicles.select(next.id))
            return

        if(this.game.world.confetti)
        {
            this.game.world.confetti.pop(this.game.player.position.clone())
            this.game.world.confetti.pop(this.game.player.position.clone().add(new THREE.Vector3(1, -1, 1.5)))
            this.game.world.confetti.pop(this.game.player.position.clone().add(new THREE.Vector3(1, -1, -1.5)))
        }

        this.activationCount++

        // Achievement
        this.game.achievements.setProgress('konami', 1)
    }
}
