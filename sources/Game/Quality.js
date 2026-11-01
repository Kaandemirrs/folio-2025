import { Events } from './Events.js'
import { Game } from './Game.js'

export class Quality
{
    /**
     * Telefon/tablet tespiti:
     * - user-agent (Mobi, Android, iPhone, iPad, iPod)
     * - iPadOS 13+ (masaüstü Safari UA'sı verir: MacIntel + çoklu dokunma)
     * - dokunmatik birincil girdi (pointer: coarse, hover yok) + küçük ekran (kısa kenar ≤ 820 px)
     */
    static detectMobile()
    {
        const ua = navigator.userAgent
        if(/Mobi|Android|iPhone|iPad|iPod/i.test(ua))
            return true

        if(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
            return true

        const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches
        const shortSide = Math.min(window.screen.width, window.screen.height)
        if(coarse && shortSide <= 820)
            return true

        return false
    }

    // Kaliteye göre değer seç: pick(yüksek, düşük)
    pick(high, low)
    {
        return this.level === 0 ? high : low
    }

    constructor()
    {
        this.game = Game.getInstance()

        this.events = new Events()

        this.isMobile = Quality.detectMobile()
        this.level = this.isMobile ? 1 : 0 // 0 = highest quality, 1 = low (mobil)

        // Debug
        if(this.game.debug.active)
        {
            const debugPanel = this.game.debug.panel.addFolder({
                title: '⚙️ Quality',
                expanded: false,
            })

            this.game.debug.addButtons(
                debugPanel,
                {
                    low: () =>
                    {
                        this.changeLevel(1)
                    },
                    high: () =>
                    {
                        this.changeLevel(0)
                    },
                },
                'change'
            )
        }
    }

    changeLevel(level = 0)
    {
        // Same
        if(level === this.level)
            return
            
        this.level = level
        this.events.trigger('change', [ this.level ])
    }
}