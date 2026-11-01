import gsap from 'gsap'
import { Game } from '../Game.js'

// Proje görüntüleme mantığı (ProjectsArea ve Landing'deki proje panosu ortak kullanır):
// açma/kapama durumu, sinematik kamera, girdiler (sol/sağ, ileri/geri, Enter = "Aç", dokunmatik düğmeler),
// proje + görsel gezinmesi, sesler ve başarım ilerlemesi. Çizim bu sınıfın işi değil; sahiplerinin verdiği
// kancalar (hooks) çağrılır:
//   onOpen(), onClose(), onProjectChange(direction, silent), onImageChange(direction, silent), onNavigate()
export class ProjectViewer
{
    static DIRECTION_PREVIOUS = 1
    static DIRECTION_NEXT = 2
    static STATE_OPEN = 3
    static STATE_OPENING = 4
    static STATE_CLOSED = 5
    static STATE_CLOSING = 6

    // projects: gösterilecek proje listesi, getCinematic: () => ({ position, target }), hooks: yukarıdaki kancalar
    constructor({ projects, getCinematic, hooks = {} })
    {
        this.game = Game.getInstance()
        this.projects = projects
        this.getCinematic = getCinematic
        this.hooks = hooks

        this.state = ProjectViewer.STATE_CLOSED
        this.stateTransition = null

        this.navigation = { index: 0, current: null, next: null, previous: null }
        this.imageIndex = 0

        this.setInputs()
    }

    get isActive()
    {
        return this.state === ProjectViewer.STATE_OPEN || this.state === ProjectViewer.STATE_OPENING
    }

    get isClosed()
    {
        return this.state === ProjectViewer.STATE_CLOSED || this.state === ProjectViewer.STATE_CLOSING
    }

    setInputs()
    {
        const inputs = this.game.inputs

        // Yalnızca bu görüntüleyici açıkken gezinme ve "Aç" çalışır (önceki ProjectsArea davranışıyla aynı)
        inputs.events.on('left', (action) =>
        {
            if(action.active)
                this.previous()
        })

        inputs.events.on('right', (action) =>
        {
            if(action.active)
                this.next()
        })

        inputs.events.on('forward', (action) =>
        {
            if(action.active && !action.activeKeys.has('Gamepad.r2'))
                this.previous()
        })

        inputs.events.on('backward', (action) =>
        {
            if(action.active && !action.activeKeys.has('Gamepad.l2'))
                this.next()
        })

        inputs.events.on('interact', (action) =>
        {
            if(!action.active && this.state === ProjectViewer.STATE_OPEN)
                this.openUrl()
        })

        inputs.interactiveButtons.events.on('previous', () =>
        {
            if(this.state === ProjectViewer.STATE_OPEN)
                this.previous()
        })

        inputs.interactiveButtons.events.on('next', () =>
        {
            if(this.state === ProjectViewer.STATE_OPEN)
                this.next()
        })

        inputs.interactiveButtons.events.on('open', () =>
        {
            if(this.state === ProjectViewer.STATE_OPEN)
                this.openUrl()
        })

        inputs.interactiveButtons.events.on('close', () =>
        {
            if(this.state === ProjectViewer.STATE_OPEN)
                this.close()
        })
    }

    openUrl()
    {
        if(this.navigation.current?.url)
            window.open(this.navigation.current.url, '_blank')
    }

    open()
    {
        if(this.state === ProjectViewer.STATE_OPEN || this.state === ProjectViewer.STATE_OPENING)
            return

        // State
        this.state = ProjectViewer.STATE_OPENING

        if(this.stateTransition)
            this.stateTransition.kill()

        this.stateTransition = gsap.delayedCall(1.5, () =>
        {
            this.state = ProjectViewer.STATE_OPEN
            this.stateTransition = null
        })

        // Inputs filters
        this.game.inputs.filters.delete('wandering')
        this.game.inputs.filters.add('cinematic')

        // View cinematic
        const cinematic = this.getCinematic()
        this.game.view.cinematic.start(cinematic.position, cinematic.target)

        // Interactive point
        this.game.interactivePoints.temporaryHide()

        // Owner
        this.hooks.onOpen?.()

        // Deactivate physical vehicle
        this.game.physicalVehicle.deactivate()

        // Buttons
        this.game.inputs.interactiveButtons.clearItems()
        this.game.inputs.interactiveButtons.addItems(['previous', 'next', 'open', 'close'])

        // Sound
        const sound = this.game.audio.groups.get('click')
        if(sound)
            sound.play(true)

        // Achievements
        this.game.achievements.setProgress('projects', this.navigation.current.title)
    }

    close()
    {
        if(this.state === ProjectViewer.STATE_CLOSED || this.state === ProjectViewer.STATE_CLOSING)
            return

        // State
        this.state = ProjectViewer.STATE_CLOSING

        if(this.stateTransition)
            this.stateTransition.kill()

        this.stateTransition = gsap.delayedCall(1.5, () =>
        {
            this.state = ProjectViewer.STATE_CLOSED
            this.stateTransition = null
        })

        // Input filters
        this.game.inputs.filters.delete('cinematic')
        this.game.inputs.filters.add('wandering')

        // View cinematic
        this.game.view.cinematic.end()

        // Owner
        this.hooks.onClose?.()

        // Interactive point
        gsap.delayedCall(1, () =>
        {
            this.game.interactivePoints.recover()
        })

        // Activate physical vehicle
        this.game.physicalVehicle.activate()

        // Buttons
        this.game.inputs.interactiveButtons.clearItems([])

        // Sound
        const sound = this.game.audio.groups.get('click')
        if(sound)
            sound.play(false)
    }

    previous()
    {
        if(this.state === ProjectViewer.STATE_CLOSED || this.state === ProjectViewer.STATE_CLOSING)
            return

        if(this.imageIndex > 0)
            this.previousImage()
        else
            this.previousProject(false)
    }

    previousImage()
    {
        if(this.isClosed)
            return

        this.changeImage(this.imageIndex - 1, ProjectViewer.DIRECTION_PREVIOUS)
        this.hooks.onNavigate?.()
    }

    previousProject(firstImage = false)
    {
        if(this.isClosed)
            return

        this.changeProject(this.navigation.index - 1, ProjectViewer.DIRECTION_PREVIOUS, firstImage)
        this.hooks.onNavigate?.()
    }

    next()
    {
        if(this.isClosed)
            return

        if(this.imageIndex < this.navigation.current.images.length - 1)
            this.nextImage()
        else
            this.nextProject()
    }

    nextImage()
    {
        if(this.isClosed)
            return

        this.changeImage(this.imageIndex + 1, ProjectViewer.DIRECTION_NEXT)
        this.hooks.onNavigate?.()
    }

    nextProject()
    {
        if(this.isClosed)
            return

        this.changeProject(this.navigation.index + 1, ProjectViewer.DIRECTION_NEXT)
        this.hooks.onNavigate?.()
    }

    changeProject(index = 0, direction = ProjectViewer.DIRECTION_NEXT, firstImage = false, silent = false)
    {
        const projects = this.projects

        // Loop index
        let loopIndex = index

        if(loopIndex > projects.length - 1)
            loopIndex = 0
        else if(loopIndex < 0)
            loopIndex = projects.length - 1

        // Save
        this.navigation.index = loopIndex
        this.navigation.current = projects[loopIndex]
        this.navigation.previous = projects[(loopIndex - 1) < 0 ? projects.length - 1 : loopIndex - 1]
        this.navigation.next = projects[(loopIndex + 1) % projects.length]

        // Update components
        this.hooks.onProjectChange?.(direction, silent)

        // Change image
        let imageIndex = null
        if(firstImage)
            imageIndex = 0
        else
            imageIndex = direction === ProjectViewer.DIRECTION_NEXT ? 0 : this.navigation.current.images.length - 1

        // Sound
        if(!silent)
        {
            this.game.audio.groups.get('click').play()
            this.game.audio.groups.get('assemble').play()
        }

        this.changeImage(imageIndex, direction, silent)

        // Achievements
        if(this.state === ProjectViewer.STATE_OPEN)
            this.game.achievements.setProgress('projects', this.navigation.current.title)
    }

    changeImage(imageIndex = 0, direction = null, silent = false)
    {
        if(direction === null)
            direction = imageIndex > this.imageIndex ? ProjectViewer.DIRECTION_NEXT : ProjectViewer.DIRECTION_PREVIOUS

        this.imageIndex = imageIndex

        // Update components
        this.hooks.onImageChange?.(direction, silent)

        // Sounds
        if(!silent)
        {
            this.game.audio.groups.get('click').play()
            this.game.audio.groups.get('slide').play()
        }
    }
}
