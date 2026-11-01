import { Events } from './Events.js'
import { Game } from './Game.js'

export class Viewport
{
    constructor(domElement)
    {
        this.game = Game.getInstance()
        this.domElement = domElement

        this.events = new Events()
        
        this.measure()
        this.setResize()

        // Kalite değişince piksel oranı sınırı da değişir
        this.game.quality.events.on('change', () =>
        {
            this.measure()
            this.events.trigger('change')
        })
    }

    measure()
    {
        const bounding = this.domElement.getBoundingClientRect()

        this.width = bounding.width
        this.height = bounding.height
        this.ratio = this.width / this.height

        this.pixelRatioPure = window.devicePixelRatio
        this.pixelRatioMax = this.game.quality.pick(2, 1.5) // high: 2, low: 1.5
        this.pixelRatio = Math.min(this.pixelRatioPure, this.pixelRatioMax)
    }

    setResize()
    {
        const throttleDuration = 400
        let throttleTimeout = null
        addEventListener('resize', () =>
        {
            this.measure()
            this.events.trigger('change')

            if(throttleTimeout)
            {
                clearTimeout(throttleTimeout)
            }

            throttleTimeout = setTimeout(() =>
            {
                throttleTimeout = null
                this.events.trigger('throttleChange')
            }, throttleDuration)
        })
    }
}