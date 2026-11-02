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

    static STORAGE_KEY = 'quality'

    // Kayıtlı tercih: 'high' → 0, 'low' → 1; yoksa/okunamıyorsa null
    static getSavedLevel()
    {
        try
        {
            const value = localStorage.getItem(Quality.STORAGE_KEY)
            if(value === 'high')
                return 0
            if(value === 'low')
                return 1
        }
        catch(error) {}

        return null
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
        // 0 = yüksek, 1 = düşük. Varsayılan HER cihazda düşük; kullanıcı Ayarlar'dan yükseğe geçerse tercih hatırlanır.
        // Mobil tespiti (isMobile) artık kaliteyi belirlemez; yalnızca başka yerlerde bilgi olarak kullanılır.
        this.level = Quality.getSavedLevel() ?? 1

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

        try { localStorage.setItem(Quality.STORAGE_KEY, level === 0 ? 'high' : 'low') } catch(error) {}

        this.events.trigger('change', [ this.level ])
    }
}