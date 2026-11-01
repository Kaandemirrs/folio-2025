import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { circleIntersectsPolygon } from '../utilities/maths.js'
import propsConfig from '../../../scripts/props/props.config.json'

// props.config.json içindeki her prop için: GLB'yi yerleştirir, sabit çarpıştırıcıları ekler,
// görüş alanı dışındayken gizler. Yeni prop = yapılandırmaya satır + `npm run prop -- <ad>`.
export class Props
{
    static getResourceName(prop)
    {
        return `prop_${prop.name}`
    }

    // Cephe yönü (dünya xz'de +X'ten +Z'ye derece) → grubun Y dönüşü (model cephesi +Z'dedir)
    static getRotationY(prop)
    {
        return Math.PI * 0.5 - THREE.MathUtils.degToRad(prop.world.facingDeg ?? 0)
    }

    // Prop'un yerel (x sağ, z dışarı) koordinatını dünya koordinatına çevirir
    static localToWorld(prop, x, z, y = 0)
    {
        const rotationY = Props.getRotationY(prop)
        const cos = Math.cos(rotationY)
        const sin = Math.sin(rotationY)

        return new THREE.Vector3(
            prop.world.x + x * cos + z * sin,
            (prop.world.y ?? 0) + y,
            prop.world.z - x * sin + z * cos
        )
    }

    constructor()
    {
        this.game = Game.getInstance()
        this.items = []

        // custom: kendi sınıfı olan proplar (örn. bayrak, World/Flag.js); burada yerleştirilmez
        for(const prop of propsConfig.props)
        {
            if(!prop.custom)
                this.items.push(this.add(prop))
        }

        this.game.ticker.events.on('tick', () => { this.update() }, 14)
        this.setCredits()
    }

    add(prop)
    {
        const model = this.game.resources[Props.getResourceName(prop)].scene
        const rotationY = Props.getRotationY(prop)
        const position = new THREE.Vector3(prop.world.x, prop.world.y ?? 0, prop.world.z)
        const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY)

        // Malzemeler (gündüz/gece, sis, gölge) ve gölge
        this.game.materials.updateObject(model)
        const castShadow = this.game.quality.pick(true, false)
        model.traverse((child) =>
        {
            if(child.isMesh)
            {
                child.castShadow = castShadow
                child.receiveShadow = true
            }
        })

        const group = new THREE.Group()
        group.name = prop.name
        group.position.copy(position)
        group.quaternion.copy(quaternion)
        group.add(model)
        this.game.scene.add(group)

        // Sabit çarpıştırıcılar (yerel koordinatlar, grupla birlikte döner)
        const colliders = (prop.colliders ?? []).map(collider => ({
            shape: 'cuboid',
            parameters: collider.half,
            position: { x: collider.center[0], y: collider.center[1], z: collider.center[2] },
            category: 'object',
        }))
        if(colliders.length)
        {
            this.game.objects.add(
                null,
                {
                    type: 'fixed',
                    position: position,
                    rotation: quaternion,
                    friction: 0.25,
                    restitution: 0.1,
                    colliders: colliders,
                }
            )
        }

        // Görüş alanı testi için sınırlayıcı daire (xz)
        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        return {
            prop,
            group,
            center: { x: position.x, y: position.z },
            radius: Math.hypot(size.x, size.z) * 0.5 + 1,
        }
    }

    update()
    {
        const quad = this.game.view.optimalArea.quad2
        const polygon = [ quad[0].offseted, quad[1].offseted, quad[2].offseted, quad[3].offseted ]

        for(const item of this.items)
            item.group.visible = circleIntersectsPolygon(item.center, item.radius, polygon)
    }

    // Sahne Arkası > "Prop modelleri" listesine atıf satırlarını ekler
    setCredits()
    {
        const list = this.game.domElement.querySelector('.js-prop-credits')
        if(!list)
            return

        for(const prop of propsConfig.props)
        {
            const a = prop.attribution
            if(!a)
                continue

            const li = document.createElement('li')
            const link = (href, text) => `<a href="${href}" target="_blank" rel="noreferrer">${text}</a>`
            li.innerHTML = `${link(a.sourceUrl, `'${a.title}'`)} — ${link(a.authorUrl, a.author)}, ${link(a.licenseUrl, a.license)}${a.changes ? `; ${a.changes}.` : '.'}`
            list.append(li)
        }
    }
}
