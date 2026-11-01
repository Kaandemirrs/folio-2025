import { Game } from './Game.js'

export class Options
{
    constructor()
    {
        this.game = Game.getInstance()
        this.element = this.game.menu.items.get('options').contentElement

        this.setSound()
        this.setQuality()
        this.setRespawn()
        this.setHints()
        this.setReset()
        this.setRenderer()
    }

    setSound()
    {
        const element = this.element.querySelector('.js-audio-toggle')

        element.addEventListener('click', this.game.audio.mute.toggle)
    }

    setQuality()
    {
        const element = this.element.querySelector('.js-quality-toggle')
        const text = element.querySelector('span')
        text.textContent = this.game.quality.level === 0 ? 'Yüksek' : 'Düşük'

        element.addEventListener('click', () =>
        {
            this.game.quality.changeLevel(this.game.quality.level === 0 ? 1 : 0)
        })

        this.game.quality.events.on('change', () =>
        {
            text.textContent = this.game.quality.level === 0 ? 'Yüksek' : 'Düşük'
        })
    }

    setRespawn()
    {
        const element = this.element.querySelector('.js-respawn')

        element.addEventListener('click', () =>
        {
            this.game.player.respawn()
            this.game.menu.close()
        })
    }

    setHints()
    {
        const element = this.element.querySelector('.js-hints-replay')

        element.addEventListener('click', () =>
        {
            this.game.menu.close()
            this.game.hints.restart()
        })
    }

    setReset()
    {
        const element = this.element.querySelector('.js-reset')

        element.addEventListener('click', () =>
        {
            this.game.reset()
            this.game.menu.close()
        })
    }

    setRenderer()
    {        
        if(this.game.rendering.renderer.backend.isWebGLBackend)
        {
            const element = this.element.querySelector('.js-renderer')
            element.classList.remove('is-success')
            element.classList.add('is-danger')

            const text = element.querySelector('span')
            text.textContent = 'WebGL'

            const tooltip = element.querySelector('.js-tooltip')
            tooltip.innerHTML = /* html */`Tarayıcın WebGPU ile <strong>uyumlu değil</strong>, bu yüzden performans düşebilir`
        }
    }
}