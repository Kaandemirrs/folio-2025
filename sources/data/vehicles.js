import config from '../../scripts/vehicle/vehicles.config.json'

// Araç kaydı. Tekerlek konumu/yarıçapı ve dinlenme yüksekliği üretim yapılandırmasından gelir
// (scripts/vehicle/vehicles.config.json: model ve fizik aynı değerleri kullanır).
// İlk araç varsayılandır. Çubuklar (stats) 0..1 arası göreli değerlerdir (garaj ekranı için).
const hubOf = (id) => config.vehicles[id].hub

const defaults = {
    steeringAmplitude: 0.5,
    boostMultiplier: 2,
    brakeAmplitude: 35,
    idleBrake: 0.06,
    reverseBrake: 0.4,
    suspensionsStiffness: { low: 20, mid: 30, high: 40 },
}

const vehicles = [
    {
        id: 'w140',
        name: 'Mercedes-Benz W140',
        year: 1992,
        description: 'Sağlam, ağır ve gösterişli. Yolun sahibi gibi gider.',
        file: 'vehicle/w140',
        defaultPaint: 'obsidian',
        stats: { speed: 0.8, weight: 0.9, grip: 0.7, boost: 0.8 },
        physics: {
            ...defaults,
            wheels: { offset: { x: hubOf('w140').x, y: 0, z: hubOf('w140').y }, radius: hubOf('w140').radiusPhysical },
            restHeight: config.vehicles.w140.restHeight,
            colliders: [
                { shape: 'cuboid', mass: 2.5, parameters: [ 1.45, 0.28, 0.66 ], position: { x: -0.09, y: -0.30, z: 0 }, centerOfMass: { x: 0.09, y: -0.11, z: 0 } }, // Main
                { shape: 'cuboid', mass: 0, parameters: [ 0.8, 0.14, 0.55 ], position: { x: -0.45, y: 0.14, z: 0 } }, // Top
                { shape: 'cuboid', mass: 0, parameters: [ 1.62, 0.27, 0.72 ], position: { x: -0.09, y: -0.30, z: 0 }, category: 'bumper' }, // Bumper
            ],
            suspensionsHeights: { low: 0.60, mid: 0.83, high: 1.10 },
            engineForceAmplitude: 300,
            topSpeed: 5,
            topSpeedBoost: 40,
        },
        boostPoints: [ { x: -1.73, y: -0.49, z: -0.40 }, { x: -1.73, y: -0.49, z: 0.40 } ], // çift egzoz
        tracks: { main: 1.5, wheel: 0.35 },
        parking: { yawOffset: 0 },
    },
    {
        id: 'dogan',
        name: 'Tofaş Doğan SLX',
        year: 1993,
        description: 'Anadolu yollarının efsanesi. Hafif, çevik ve herkesin bir hikâyesi var.',
        file: 'vehicle/dogan',
        defaultPaint: 'bordo',
        stats: { speed: 0.6, weight: 0.4, grip: 0.8, boost: 0.6 },
        physics: {
            ...defaults,
            wheels: { offset: { x: hubOf('dogan').x, y: 0, z: hubOf('dogan').y }, radius: hubOf('dogan').radiusPhysical },
            restHeight: config.vehicles.dogan.restHeight,
            colliders: [
                { shape: 'cuboid', mass: 2.0, parameters: [ 1.26, 0.265, 0.58 ], position: { x: -0.08, y: -0.28, z: 0 }, centerOfMass: { x: 0.08, y: -0.10, z: 0 } },
                { shape: 'cuboid', mass: 0, parameters: [ 0.69, 0.13, 0.48 ], position: { x: -0.39, y: 0.12, z: 0 } },
                { shape: 'cuboid', mass: 0, parameters: [ 1.40, 0.255, 0.63 ], position: { x: -0.08, y: -0.28, z: 0 }, category: 'bumper' },
            ],
            suspensionsHeights: { low: 0.66, mid: 0.87, high: 1.10 },
            suspensionsStiffness: { low: 16, mid: 24, high: 32 },
            engineForceAmplitude: 290,
            topSpeed: 4.6,
            topSpeedBoost: 36,
        },
        boostPoints: [ { x: -1.50, y: -0.42, z: -0.34 } ], // tek egzoz
        tracks: { main: 1.3, wheel: 0.3 },
        parking: { yawOffset: 0 },
    },
    {
        id: 'oldSchool',
        name: 'Eski Okul',
        year: 1985,
        description: 'Orijinal oyundan kalma, dört tekerlekli bir dost.',
        file: 'vehicle/oldSchool',
        defaultPaint: 'obsidian',
        stats: { speed: 0.5, weight: 0.7, grip: 0.5, boost: 0.5 },
        physics: {
            ...defaults,
            wheels: { offset: { x: 0.872, y: 0, z: 0.699 }, radius: 0.41 }, // model tekerleği (yarıçap 0.42, hub x 0.872, yan 0.699)
            restHeight: 0.907,
            colliders: [
                { shape: 'cuboid', mass: 2.5, parameters: [ 1.3, 0.4, 0.85 ], position: { x: 0, y: -0.1, z: 0 }, centerOfMass: { x: 0, y: -0.5, z: 0 } },
                { shape: 'cuboid', mass: 0, parameters: [ 0.5, 0.15, 0.65 ], position: { x: 0, y: 0.4, z: 0 } },
                { shape: 'cuboid', mass: 0, parameters: [ 1.5, 0.5, 0.9 ], position: { x: 0.1, y: -0.2, z: 0 }, category: 'bumper' },
            ],
            suspensionsHeights: { low: 0.68, mid: 1.03, high: 1.43 },
            engineForceAmplitude: 300,
            topSpeed: 5,
            topSpeedBoost: 40,
        },
        boostPoints: [ { x: -1.62, y: -0.55, z: -0.40 }, { x: -1.62, y: -0.55, z: 0.40 } ],
        tracks: { main: 1.7, wheel: 0.4 },
        parking: { yawOffset: 0 },
    },
]

export const defaultVehicleId = 'w140'
export const vehiclesById = new Map(vehicles.map(vehicle => [ vehicle.id, vehicle ]))
export default vehicles
