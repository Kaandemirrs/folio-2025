// Araç profillerini (sources/data/vehicles.js) Rapier'de ölçer: dinlenme yüksekliği (3 süspansiyon konumu),
// tam gaz + sert direksiyonda eğilme (normal/turbo). Profildeki restHeight ile ölçülen "low" yüksekliği karşılaştırılır.
//   node --experimental-wasm-modules --import ./scripts/vehicle/rapier_register.mjs scripts/vehicle/measure_vehicles.mjs [id ...]
import RAPIER from '../../node_modules/@dimforge/rapier3d/rapier.js'
import vehicles from '../../sources/data/vehicles.js'

function build(profile)
{
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    world.timestep = 2 / 60 // Ticker.scale = 2
    const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(500, 1, 500).setTranslation(0, -1, 0).setFriction(0.25).setRestitution(0).setCollisionGroups((1 << 16) | 1), floor)
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, 0).setCanSleep(false).setLinearDamping(0.1).setAngularDamping(0.1))
    for(const c of profile.colliders)
    {
        let d = RAPIER.ColliderDesc.cuboid(...c.parameters).setTranslation(c.position.x, c.position.y, c.position.z).setDensity(0.1)
        d = c.centerOfMass ? d.setMassProperties(c.mass, c.centerOfMass, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0, w: 1 }) : d.setMass(c.mass)
        d = d.setFriction(0.4).setRestitution(0.15).setCollisionGroups(c.category === 'bumper' ? ((4 << 16) | 2) : (((1 | 2) << 16) | (1 | 4)))
        world.createCollider(d, body)
    }
    const ctl = world.createVehicleController(body)
    const o = profile.wheels.offset
    const pos = [[o.x, o.y, o.z], [o.x, o.y, -o.z], [-o.x, o.y, o.z], [-o.x, o.y, -o.z]]
    for(let i = 0; i < 4; i++)
    {
        ctl.addWheel({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, 1, 1)
        ctl.setWheelDirectionCs(i, { x: 0, y: -1, z: 0 }); ctl.setWheelAxleCs(i, { x: 0, y: 0, z: 1 }); ctl.setWheelRadius(i, profile.wheels.radius)
        ctl.setWheelChassisConnectionPointCs(i, { x: pos[i][0], y: pos[i][1], z: pos[i][2] })
        ctl.setWheelFrictionSlip(i, 0.9); ctl.setWheelMaxSuspensionForce(i, 150); ctl.setWheelMaxSuspensionTravel(i, 2)
        ctl.setWheelSideFrictionStiffness(i, 3); ctl.setWheelSuspensionCompression(i, 10); ctl.setWheelSuspensionRelaxation(i, 2.7)
    }
    return { body, ctl, world }
}

export function rest(profile, state = 'low', steps = 240)
{
    const { body, ctl, world } = build(profile)
    const brake = profile.idleBrake * profile.brakeAmplitude * (2 / 60)
    for(let s = 0; s < steps; s++)
    {
        for(let i = 0; i < 4; i++)
        {
            ctl.setWheelBrake(i, brake); ctl.setWheelEngineForce(i, 0)
            ctl.setWheelSuspensionRestLength(i, profile.suspensionsHeights[state]); ctl.setWheelSuspensionStiffness(i, profile.suspensionsStiffness[state])
        }
        ctl.updateVehicle(1 / 60)
        world.step()
    }
    return { orijinYuksekligi: +body.translation().y.toFixed(3), suspansiyonBoyu: +ctl.wheelSuspensionLength(0).toFixed(3), temas: [0, 1, 2, 3].every(i => ctl.wheelIsInContact(i)) }
}

export function drive(profile, boost)
{
    const { body, ctl, world } = build(profile)
    const dt = 2 / 60
    let maxTilt = 0, speed = 0, airborne = 0
    for(let s = 0; s < 210; s++)
    {
        const steer = s >= 120 ? profile.steeringAmplitude : 0
        const v = body.linvel()
        speed = Math.hypot(v.x, v.y, v.z)
        const top = boost ? profile.topSpeedBoost : profile.topSpeed
        const overflow = Math.max(0, speed - top)
        const force = (1 + boost * profile.boostMultiplier) * profile.engineForceAmplitude / (1 + overflow) * dt
        for(let i = 0; i < 4; i++)
        {
            ctl.setWheelEngineForce(i, force); ctl.setWheelBrake(i, 0)
            ctl.setWheelSuspensionRestLength(i, profile.suspensionsHeights.low); ctl.setWheelSuspensionStiffness(i, profile.suspensionsStiffness.low)
            if(i < 2) ctl.setWheelSteering(i, steer)
        }
        ctl.updateVehicle(1 / 60)
        world.step()
        const q = body.rotation()
        const upY = 1 - 2 * (q.x * q.x + q.z * q.z)
        maxTilt = Math.max(maxTilt, Math.acos(Math.min(1, Math.max(-1, upY))) * 180 / Math.PI)
        if([0, 1, 2, 3].every(i => !ctl.wheelIsInContact(i))) airborne++
    }
    return { hizAni: +speed.toFixed(1), maksEgilmeDerece: +maxTilt.toFixed(1), havadaAdim: airborne }
}

if(import.meta.url === `file://${process.argv[1]}`)
{
    const ids = process.argv.slice(2)
    for(const vehicle of vehicles)
    {
        if(ids.length && !ids.includes(vehicle.id)) continue
        const p = vehicle.physics
        console.log(`\n== ${vehicle.id}  (hedef dinlenme yüksekliği ${p.restHeight})`)
        for(const state of ['low', 'mid', 'high'])
            console.log(' ', state.padEnd(4), JSON.stringify(rest(p, state)))
        for(const boost of [0, 1])
            console.log(' ', boost ? 'turbo' : 'normal', JSON.stringify(drive(p, boost)))
    }
}
