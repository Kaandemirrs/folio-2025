// /hakkimda/ ekran görüntüleri (masaüstü ve mobil).  node scripts/seo/about_shots.mjs <klasör> [port=4181]
import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' })
for(const [ name, viewport ] of [ [ 'desktop', { width: 1280, height: 900 } ], [ 'mobile', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } ] ])
{
    const page = await browser.newPage()
    await page.setViewport(viewport)
    await page.goto(`http://127.0.0.1:${process.argv[3] || 4181}/hakkimda/`, { waitUntil: 'networkidle0' })
    await page.screenshot({ path: `${process.argv[2]}/hakkimda_${name}.png`, fullPage: name === 'mobile' ? false : false })
    await page.close()
}
await browser.close()
