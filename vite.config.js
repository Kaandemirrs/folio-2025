import 'dotenv/config'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'node:path'

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
        sourcemap: false, // Add sourcemap
        rollupOptions:
        {
            // Çok sayfalı build: oyun + statik metin sürümü (/hakkimda/)
            input:
            {
                main: path.resolve('sources/index.html'),
                hakkimda: path.resolve('sources/hakkimda/index.html')
            }
        }
    },
    plugins:
    [
        wasm(),
        topLevelAwait(),
    ]
}