import { Game } from './Game.js'
import { Inputs } from './Inputs/Inputs.js'
import { Menu } from './Menu.js'
import { Modals } from './Modals.js'

// İlk ziyaret ipuçları: a) sürüş (araç ~15 m gidince kaybolur), b) etkileşim (ilk etkileşimde ya da 20 sn sonra),
// c) harita (8 sn). Metin giriş moduna göre (klavye / dokunmatik / gamepad) ve mod değişince güncellenir.
// Menü, modal ya da sinematik (projeler, garaj) açıkken gizlenir, süre o sırada işlemez. Yalnızca ilk ziyarette (localStorage).
export class Hints
{
    static STORAGE_KEY = 'hintsSeen'
    static DRIVE_DISTANCE = 15
    static INTERACT_TIMEOUT = 20
    static MAP_DURATION = 8

    constructor()
    {
        this.game = Game.getInstance()

        this.element = this.game.domElement.querySelector('.js-hints')
        this.textElement = this.element.querySelector('.js-hints-text')
        this.mapTrigger = this.game.domElement.querySelector('.js-map-trigger')

        this.step = null
        this.elapsed = 0
        this.startPosition = null

        this.game.inputs.events.on('modeChange', () => { this.updateText() })
        this.game.inputs.gamepad.events.on('typeChange', () => { this.updateText() })

        // İlk etkileşim: etkileşim noktası açıkken etkileşim tuşu / düğmesi
        const onInteract = () =>
        {
            if(this.step === 'interact' && this.game.interactivePoints.activeItem)
                this.next()
        }
        this.game.inputs.events.on('interact', (action) => { if(action.active) onInteract() })
        this.game.inputs.interactiveButtons.events.on('interact', onInteract)

        this.game.ticker.events.on('tick', () => { this.update() }, 14)
    }

    static getSeen()
    {
        try { return localStorage.getItem(Hints.STORAGE_KEY) === '1' } catch(error) { return false }
    }

    static setSeen(value)
    {
        try
        {
            if(value)
                localStorage.setItem(Hints.STORAGE_KEY, '1')
            else
                localStorage.removeItem(Hints.STORAGE_KEY)
        }
        catch(error) {}
    }

    // Oyun başladığında (Reveal adım 2) çağrılır
    start()
    {
        if(Hints.getSeen())
            return

        Hints.setSeen(true)
        this.restart()
    }

    // Ayarlar > "İpuçlarını tekrar göster"
    restart()
    {
        Hints.setSeen(true) // aynı oturumda tekrar çıkmasın; bu çağrı yalnızca bu oturumu kapsar
        this.startPosition = this.game.physicalVehicle.position.clone()
        this.goTo('drive')
    }

    goTo(step)
    {
        this.step = step
        this.elapsed = 0
        this.updateText()
        this.mapTrigger.classList.toggle('is-hinted', step === 'map' && this.game.inputs.mode === Inputs.MODE_TOUCH)
    }

    next()
    {
        if(this.step === 'drive')
            this.goTo('interact')
        else if(this.step === 'interact')
            this.goTo('map')
        else
            this.finish()
    }

    finish()
    {
        this.step = null
        this.mapTrigger.classList.remove('is-hinted')
        this.element.classList.remove('is-visible')
    }

    getText()
    {
        const mode = this.game.inputs.mode

        if(this.step === 'drive')
        {
            if(mode === Inputs.MODE_TOUCH)
                return 'Ekrana dokun ve sürükle'
            if(mode === Inputs.MODE_GAMEPAD)
                return 'Sol çubukla sür'
            return 'W A S D veya ok tuşlarıyla sür · Shift turbo'
        }

        if(this.step === 'interact')
        {
            if(mode === Inputs.MODE_TOUCH)
                return 'Parlayan ◆ noktalarına yaklaş ve etkileşim düğmesine dokun'
            if(mode === Inputs.MODE_GAMEPAD)
                return `Parlayan ◆ noktalarına yaklaş ve ${this.game.inputs.gamepad.type === 'xbox' ? 'A' : '✕'} tuşuna bas`
            return 'Parlayan ◆ noktalarına yaklaş ve Enter\'a bas'
        }

        if(this.step === 'map')
        {
            if(mode === Inputs.MODE_TOUCH)
                return 'Haritayı sağ üstteki düğmeyle aç'
            if(mode === Inputs.MODE_MOUSEKEYBOARD)
                return 'M ile haritayı aç'
            return null // gamepad'de harita kısayolu yok
        }

        return null
    }

    updateText()
    {
        if(!this.step)
            return

        const text = this.getText()
        if(text === null)
        {
            // Bu modda gösterilecek bir şey yok: sonrakine geç
            this.next()
            return
        }

        this.textElement.textContent = text
        this.mapTrigger.classList.toggle('is-hinted', this.step === 'map' && this.game.inputs.mode === Inputs.MODE_TOUCH)
    }

    isSuppressed()
    {
        const game = this.game
        return (
            game.menu.state === Menu.OPEN || game.menu.state === Menu.OPENING ||
            game.modals.state === Modals.OPEN || game.modals.state === Modals.OPENING ||
            game.view.cinematic.active ||
            game.view.cinematic.progress > 0
        )
    }

    update()
    {
        if(!this.step)
            return

        const visible = !this.isSuppressed()
        this.element.classList.toggle('is-visible', visible)

        if(!visible)
            return

        this.elapsed += this.game.ticker.delta

        if(this.step === 'drive')
        {
            const position = this.game.physicalVehicle.position
            if(Math.hypot(position.x - this.startPosition.x, position.z - this.startPosition.z) > Hints.DRIVE_DISTANCE)
                this.next()
        }
        else if(this.step === 'interact')
        {
            if(this.elapsed > Hints.INTERACT_TIMEOUT)
                this.next()
        }
        else if(this.step === 'map')
        {
            if(this.elapsed > Hints.MAP_DURATION)
                this.next()
        }
    }
}
