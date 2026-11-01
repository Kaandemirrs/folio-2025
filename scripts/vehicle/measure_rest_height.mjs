// Aracın dinlenme yüksekliğini Rapier ile ölçer (PhysicsVehicle.js değerleriyle aynı kurulum).
// build_w140.py içindeki REST_HEIGHT bu ölçümden gelir (şasi orijininin yerden yüksekliği = süspansiyon boyu + yarıçap).
//   node --experimental-wasm-modules --import ./scripts/vehicle/rapier_register.mjs scripts/vehicle/measure_rest_height.mjs
import RAPIER from '../../node_modules/@dimforge/rapier3d/rapier.js'

const OLD = {
    offset: { x: 0.9, y: 0, z: 0.75 }, radius: 0.4,
    heights: { low: 0.88, mid: 1.23, high: 1.63 }, stiff: { low: 20, mid: 30, high: 40 },
    colliders: [
        { h: [1.3, 0.4, 0.85], p: [0, -0.1, 0], mass: 2.5, com: [0, -0.5, 0] },
        { h: [0.5, 0.15, 0.65], p: [0, 0.4, 0], mass: 0 },
        { h: [1.5, 0.5, 0.9], p: [0.1, -0.2, 0], mass: 0, bumper: true },
    ],
}
const W140 = {
    offset: { x: 0.975, y: 0, z: 0.58 }, radius: 0.27,
    heights: { low: 0.60, mid: 0.83, high: 1.10 }, stiff: { low: 20, mid: 30, high: 40 },
    colliders: [
        { h: [1.45, 0.28, 0.66], p: [-0.09, -0.30, 0], mass: 2.5, com: [0.09, Number(process.env.COM_Y ?? -0.11), 0] }, // COM_Y ortam değişkeni ile denenebilir
        { h: [0.8, 0.14, 0.55], p: [-0.45, 0.14, 0], mass: 0 },
        { h: [1.62, 0.27, 0.72], p: [-0.09, -0.30, 0], mass: 0, bumper: true },
    ],
}

function simulate(cfg, state = 'low', steps = 240)
{
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    world.timestep = 2 / 60 // Ticker.scale = 2
    const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(500, 1, 500).setTranslation(0, -1, 0).setFriction(0.25).setRestitution(0).setCollisionGroups((1 << 16) | 1), floor)
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, 0).setCanSleep(false).setLinearDamping(0.1).setAngularDamping(0.1))
    for(const c of cfg.colliders)
    {
        let d = RAPIER.ColliderDesc.cuboid(...c.h).setTranslation(...c.p).setDensity(0.1)
        d = c.com ? d.setMassProperties(c.mass, { x: c.com[0], y: c.com[1], z: c.com[2] }, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0, w: 1 }) : d.setMass(c.mass)
        d = d.setFriction(0.4).setRestitution(0.15).setCollisionGroups(c.bumper ? ((4 << 16) | 2) : (((1 | 2) << 16) | (1 | 4)))
        world.createCollider(d, body)
    }
    const ctl = world.createVehicleController(body)
    const o = cfg.offset
    const pos = [[o.x, o.y, o.z], [o.x, o.y, -o.z], [-o.x, o.y, o.z], [-o.x, o.y, -o.z]]
    for(let i = 0; i < 4; i++)
    {
        ctl.addWheel({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, 1, 1)
        ctl.setWheelDirectionCs(i, { x: 0, y: -1, z: 0 }); ctl.setWheelAxleCs(i, { x: 0, y: 0, z: 1 }); ctl.setWheelRadius(i, cfg.radius)
        ctl.setWheelChassisConnectionPointCs(i, { x: pos[i][0], y: pos[i][1], z: pos[i][2] })
        ctl.setWheelFrictionSlip(i, 0.9); ctl.setWheelMaxSuspensionForce(i, 150); ctl.setWheelMaxSuspensionTravel(i, 2)
        ctl.setWheelSideFrictionStiffness(i, 3); ctl.setWheelSuspensionCompression(i, 10); ctl.setWheelSuspensionRelaxation(i, 2.7)
    }
    const brake = 0.06 * 35 * (2 / 60) // rölanti freni
    for(let s = 0; s < steps; s++)
    {
        for(let i = 0; i < 4; i++)
        {
            ctl.setWheelBrake(i, brake); ctl.setWheelEngineForce(i, 0)
            ctl.setWheelSuspensionRestLength(i, cfg.heights[state]); ctl.setWheelSuspensionStiffness(i, cfg.stiff[state])
        }
        ctl.updateVehicle(1 / 60)
        world.step()
    }
    return { orijinYuksekligi: +body.translation().y.toFixed(3), suspansiyonBoyu: +ctl.wheelSuspensionLength(0).toFixed(3), temas: [0, 1, 2, 3].every(i => ctl.wheelIsInContact(i)) }
}

for(const [name, cfg] of [['ESKİ ', OLD], ['W140 ', W140]])
    for(const state of ['low', 'mid', 'high'])
        console.log(name, state.padEnd(4), JSON.stringify(simulate(cfg, state)))

// --- Sürüş testi: tam gaz (ve turbo) sonrası sert direksiyonda eğilme (tilt) ve hız ---
function drive(cfg, boost)
{
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    world.timestep = 2 / 60
    const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(500, 1, 500).setTranslation(0, -1, 0).setFriction(0.25).setRestitution(0).setCollisionGroups((1 << 16) | 1), floor)
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, 0).setCanSleep(false).setLinearDamping(0.1).setAngularDamping(0.1))
    for(const c of cfg.colliders)
    {
        let d = RAPIER.ColliderDesc.cuboid(...c.h).setTranslation(...c.p).setDensity(0.1)
        d = c.com ? d.setMassProperties(c.mass, { x: c.com[0], y: c.com[1], z: c.com[2] }, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0, w: 1 }) : d.setMass(c.mass)
        d = d.setFriction(0.4).setRestitution(0.15).setCollisionGroups(c.bumper ? ((4 << 16) | 2) : (((1 | 2) << 16) | (1 | 4)))
        world.createCollider(d, body)
    }
    const ctl = world.createVehicleController(body)
    const o = cfg.offset
    const pos = [[o.x, o.y, o.z], [o.x, o.y, -o.z], [-o.x, o.y, o.z], [-o.x, o.y, -o.z]]
    for(let i = 0; i < 4; i++)
    {
        ctl.addWheel({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, 1, 1)
        ctl.setWheelDirectionCs(i, { x: 0, y: -1, z: 0 }); ctl.setWheelAxleCs(i, { x: 0, y: 0, z: 1 }); ctl.setWheelRadius(i, cfg.radius)
        ctl.setWheelChassisConnectionPointCs(i, { x: pos[i][0], y: pos[i][1], z: pos[i][2] })
        ctl.setWheelFrictionSlip(i, 0.9); ctl.setWheelMaxSuspensionForce(i, 150); ctl.setWheelMaxSuspensionTravel(i, 2)
        ctl.setWheelSideFrictionStiffness(i, 3); ctl.setWheelSuspensionCompression(i, 10); ctl.setWheelSuspensionRelaxation(i, 2.7)
    }
    const dt = 2 / 60
    let maxTilt = 0, speed = 0, airborne = 0
    const total = 120 + 90
    for(let s = 0; s < total; s++)
    {
        const steer = s >= 120 ? 0.5 : 0
        const v = body.linvel()
        speed = Math.hypot(v.x, v.y, v.z)
        const top = boost ? 40 : 5
        const overflow = Math.max(0, speed - top)
        const force = (1 + boost * 2) * 300 / (1 + overflow) * dt
        for(let i = 0; i < 4; i++)
        {
            ctl.setWheelEngineForce(i, force); ctl.setWheelBrake(i, 0)
            ctl.setWheelSuspensionRestLength(i, cfg.heights.low); ctl.setWheelSuspensionStiffness(i, cfg.stiff.low)
            if(i < 2) ctl.setWheelSteering(i, steer)
        }
        ctl.updateVehicle(1 / 60)
        world.step()
        const q = body.rotation()
        const upY = 1 - 2 * (q.x * q.x + q.z * q.z) // gövde yukarı vektörünün y bileşeni
        maxTilt = Math.max(maxTilt, Math.acos(Math.min(1, Math.max(-1, upY))) * 180 / Math.PI)
        if([0, 1, 2, 3].every(i => !ctl.wheelIsInContact(i))) airborne++
    }
    return { hizAni: +speed.toFixed(1), maksEgilmeDerece: +maxTilt.toFixed(1), havadaAdim: airborne }
}
console.log('\nSürüş testi (4 sn tam gaz, sonra 3 sn sert direksiyon 0.5 rad):')
for(const [name, cfg] of [['ESKİ ', OLD], ['W140 ', W140]])
    for(const boost of [0, 1])
        console.log(name, boost ? 'turbo' : 'normal', JSON.stringify(drive(cfg, boost)))
