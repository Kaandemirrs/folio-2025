import 'dotenv/config'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import basicSsl from '@vitejs/plugin-basic-ssl'
import fs from 'node:fs'
import path from 'node:path'

// Horon müziği telifli: repoya ve static/'e girmez. Geliştirmede yerel dosyayı '/horon-dev.mp3' adresinde sunar
// (HORON_MUSIC_FILE ortam değişkeni ya da resources/references/examples altındaki "Zakara" mp3'ü). Production build'e dahil edilmez.
const horonDevMusic = () => ({
    name: 'horon-dev-music',
    apply: 'serve',
    configureServer(server)
    {
        const examples = path.resolve('resources/references/examples')
        const found = fs.existsSync(examples) ? fs.readdirSync(examples).find(file => /zakara.*\.mp3$/i.test(file)) : null
        const file = process.env.HORON_MUSIC_FILE || (found ? path.join(examples, found) : null)

        server.middlewares.use('/horon-dev.mp3', (request, response) =>
        {
            if(!file || !fs.existsSync(file))
            {
                response.statusCode = 404
                response.end()
                return
            }

            const size = fs.statSync(file).size
            response.setHeader('Content-Type', 'audio/mpeg')
            response.setHeader('Accept-Ranges', 'bytes')

            const range = request.headers.range
            if(range)
            {
                const [ startText, endText ] = range.replace('bytes=', '').split('-')
                const start = parseInt(startText, 10)
                const end = endText ? parseInt(endText, 10) : size - 1
                response.statusCode = 206
                response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
                response.setHeader('Content-Length', end - start + 1)
                fs.createReadStream(file, { start, end }).pipe(response)
            }
            else
            {
                response.setHeader('Content-Length', size)
                fs.createReadStream(file).pipe(response)
            }
        })
    }
})

export default {
    root: 'sources/', // Sources files (typically where index.html is)
    envDir: '../',  // Directory where the env file is located
    publicDir: '../static/', // Path from "root" to static assets (files that are served as they are)
    base: './', // Public path (what's after the domain)
    server:
    {
        // https: true,
        host: true, // Open to local network and display URL
        open: true // Open in browser
    },
    build:
    {
        outDir: '../dist', // Output in the dist/ folder
        emptyOutDir: true, // Empty the folder first
        sourcemap: false // Add sourcemap
    },
    plugins:
    [
        wasm(),
        topLevelAwait(),
        horonDevMusic(),
        // basicSsl()
    ]
}