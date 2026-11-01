import './threejs-override.js'
import { Game } from './Game/Game.js'
import consoleLog from './data/consoleLog.js'
import contact from './data/contact.js'

// Ana Sayfa'daki e-posta bağlantısı (adres yalnızca data/contact.js'te tanımlı)
for(const link of document.querySelectorAll('.js-contact-email'))
{
    link.textContent = contact.email
    link.href = contact.mailto
}

if(import.meta.env.VITE_LOG)
    console.log(
        ...consoleLog
    )

if(import.meta.env.VITE_GAME_PUBLIC)
    window.game = new Game()
else
    new Game()