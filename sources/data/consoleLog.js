import * as THREE from 'three/webgpu'
import contact from './contact.js'

const text = `
██╗  ██╗ █████╗  █████╗ ███╗   ██╗    ██████╗ ███████╗███╗   ███╗██╗██████╗
██║ ██╔╝██╔══██╗██╔══██╗████╗  ██║    ██╔══██╗██╔════╝████╗ ████║██║██╔══██╗
█████╔╝ ███████║███████║██╔██╗ ██║    ██║  ██║█████╗  ██╔████╔██║██║██████╔╝
██╔═██╗ ██╔══██║██╔══██║██║╚██╗██║    ██║  ██║██╔══╝  ██║╚██╔╝██║██║██╔══██╗
██║  ██╗██║  ██║██║  ██║██║ ╚████║    ██████╔╝███████╗██║ ╚═╝ ██║██║██║  ██║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝    ╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝╚═╝  ╚═╝

██████╗  ██████╗ ██████╗ ████████╗███████╗ ██████╗ ██╗     ██╗ ██████╗
██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝██╔═══██╗██║     ██║██╔═══██╗
██████╔╝██║   ██║██████╔╝   ██║   █████╗  ██║   ██║██║     ██║██║   ██║
██╔═══╝ ██║   ██║██╔══██╗   ██║   ██╔══╝  ██║   ██║██║     ██║██║   ██║
██║     ╚██████╔╝██║  ██║   ██║   ██║     ╚██████╔╝███████╗██║╚██████╔╝
╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚═════╝

╔═ Giriş ═══════════════╗
║ Portfolyomu ziyaret ettiğin için teşekkürler, meraklı geliştirici!
║ Bu projenin nasıl yapıldığını merak ediyorsan, bilmen gerekenler burada.
╚═══════════════════════╝

╔═ Sosyal ══════════════╗
║ GitHub   ⇒ https://github.com/Kaandemirrs
║ LinkedIn ⇒ https://www.linkedin.com/in/kaandev/
║ E-posta  ⇒ ${contact.email}
╚═══════════════════════╝

╔═ Three.js ════════════╗
║ Bu 3D dünyayı Three.js ile çiziyorum (sürüm: ${THREE.REVISION})
║ https://threejs.org/
║ Three.js'i mr.doob (https://x.com/mrdoob, https://github.com/mrdoob) başlattı,
║ sonrasında yüzlerce geliştirici katkı verdi.
║ Bunlardan biri olan Sunag (https://github.com/sunag) TSL'yi ekledi;
║ WebGL ve WebGPU'yu birlikte kullanabilmemi sağlayan da bu.
╚═══════════════════════╝

╔═ Kaynak kod ══════════╗
║ Kod GitHub'da, MIT lisansıyla duruyor.
║ https://github.com/Kaandemirrs/folio-2025
╚═══════════════════════╝

╔═ Bağlantılar ═════════╗
║ Rapier (Fizik kütüphanesi) ⇒ https://rapier.rs/
║ Howler.js (Ses kütüphanesi) ⇒ https://howlerjs.com/
║ Amatic SC (Yazı tipi)       ⇒ https://fonts.google.com/specimen/Amatic+SC
║ Nunito (Yazı tipi)          ⇒ https://fonts.google.com/specimen/Nunito
╚═══════════════════════╝

Bruno Simon'un folio-2025 projesi üzerine kuruldu — github.com/brunosimon/folio-2025
`
let finalText = ''
let finalStyles = []
const stylesSet = {
    letter: 'color: #ffffff; font: 400 1em monospace;',
    pipe: 'color: #D66FFF; font: 400 1em monospace;',
}
let currentStyle = null
for(let i = 0; i < text.length; i++)
{
    const char = text[i]

    const style = char.match(/[╔║═╗╚╝╔╝]/) ? 'pipe' : 'letter'
    if(style !== currentStyle)
    {
        currentStyle = style
        finalText += '%c'

        finalStyles.push(stylesSet[currentStyle])
    }
    finalText += char
}

export default [finalText, ...finalStyles]