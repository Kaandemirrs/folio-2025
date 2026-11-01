import * as THREE from 'three/webgpu'
import { Game } from './Game.js'
import propsConfig from '../../scripts/props/props.config.json'
import { Props } from './World/Props.js'

export class Respawns
{
    // GLB değişmeden filtrelenen respawn noktaları (alan adı, küçük harfle)
    static EXCLUDED = new Set([
        'lab', 'circuit', 'altar', 'cookie', 'toilet', 'timemachine', 'behindthescene', // kaldırılan alanlar
        'onlyfans', // kaldırılan OnlyFans şakası (sosyal alan)
        'test',
    ])

    constructor(defaultName = 'landing')
    {
        this.game = Game.getInstance()
        this.defaultName = defaultName

        this.setItems()
    }

    setItems()
    {
        this.items = new Map()

        for(const child of this.game.resources.respawnsReferencesModel.scene.children)
        {
            // Kaldırılan alanların (ve test noktasının) respawn'ları boş arsaya ışınlamasın
            if(Respawns.EXCLUDED.has(child.name.replace(/^respawn/i, '').toLowerCase()))
                continue

            child.rotation.reorder('YXZ')

            let name = child.name.replace(/^respawn(.+)$/i, '$1')

            name = name.charAt(0).toLowerCase() + name.slice(1)

            const item = {
                name: name,
                position: new THREE.Vector3(
                    child.position.x,
                    4,
                    child.position.z
                ),
                rotation: child.rotation.y
            }

            this.items.set(name, item)
        }

        // Prop'ların önünde doğma noktası (cephe yönü: dünya xz'de +X'ten +Z'ye açı)
        for(const prop of propsConfig.props)
        {
            if(!prop.respawn)
                continue

            const theta = (prop.world.facingDeg ?? 0) * Math.PI / 180
            let position = null

            if(prop.respawn.local)
            {
                position = Props.localToWorld(prop, prop.respawn.local.x, prop.respawn.local.z)
            }
            else
            {
                position = new THREE.Vector3(
                    prop.world.x + Math.cos(theta) * prop.respawn.distance,
                    0,
                    prop.world.z + Math.sin(theta) * prop.respawn.distance
                )
            }
            position.y = 4

            this.items.set(prop.name, {
                name: prop.name,
                position: position,
                rotation: Math.PI - theta // cepheye bakar
            })
        }
    }

    getByName(name)
    {
        return this.items.get(name)
    }

    getDefault()
    {
        return this.items.get(this.defaultName) ?? this.items.get('landing') // VITE_PLAYER_SPAWN kaldırılan bir alana işaret ediyorsa
    }

    getClosest(position)
    {
        let closestItem = null
        let closestDistance = Infinity

        this.items.forEach((item) =>
        {
            const distance = Math.hypot(item.position.x - position.x, item.position.z - position.z)

            if(distance < closestDistance)
            {
                closestDistance = distance
                closestItem = item
            }
        })

        return closestItem
    }
}