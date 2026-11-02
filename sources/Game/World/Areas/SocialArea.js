import { Game } from '../../Game.js'
import { InteractivePoints } from '../../InteractivePoints.js'
import socialData from '../../../data/social.js'
import { Area } from './Area.js'
import { Envelopes } from '../Envelopes.js'

export class SocialArea extends Area
{
    constructor(model)
    {
        super(model)

        this.center = this.references.items.get('center')[0].position

        // Debug
        if(this.game.debug.active)
        {
            this.debugPanel = this.game.debug.panel.addFolder({
                title: '🔗 Social',
                expanded: false,
            })
        }

        this.setLinks()
        this.setAchievement()
    }

    setLinks()
    {
        const radius = 6
        const slotsCount = socialData.length // Yarım çember, açı = π · (slot + 0.5) / bağlantı sayısı (scripts/world/patch_areas.mjs ile aynı)

        for(const link of socialData)
        {
            const angle = Math.PI * (link.slot + 0.5) / slotsCount
            const position = this.center.clone()
            position.x += Math.cos(angle) * radius
            position.y = 1
            position.z -= Math.sin(angle) * radius

            // Zarf ikonunun üstüne "Bana ulaşın" levhası (ikon halkası yarıçapı 7.85, scripts/world/world.config.json > social.radius)
            if(link.action === 'contact')
            {
                const label = Envelopes.createLabel()
                label.position.set(this.center.x + Math.cos(angle) * 7.85, 2.9, this.center.z - Math.sin(angle) * 7.85)
                label.rotation.y = Math.PI / 4 // kameraya (+X+Z) bakar
                this.game.scene.add(label)
            }

            this.interactivePoint = this.game.interactivePoints.create(
                position,
                link.name,
                link.align === 'left' ? InteractivePoints.ALIGN_LEFT : InteractivePoints.ALIGN_RIGHT,
                InteractivePoints.STATE_CONCEALED,
                () =>
                {
                    if(link.action === 'contact')
                        Envelopes.contact()
                    else
                        window.open(link.url, '_blank')
                },
                () =>
                {
                    this.game.inputs.interactiveButtons.addItems(['interact'])
                },
                () =>
                {
                    this.game.inputs.interactiveButtons.removeItems(['interact'])
                },
                () =>
                {
                    this.game.inputs.interactiveButtons.removeItems(['interact'])
                }
            )
        }
    }

    setAchievement()
    {
        this.events.on('boundingIn', () =>
        {
            this.game.achievements.setProgress('areas', 'social')
        })
    }
}
