// Herramienta de desarrollo (CI): abre el juego en un navegador sin pantalla,
// guarda capturas y los errores de la consola en ci-out/ para poder revisarlos.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:4173/'
const shots = readFileSync('tools/ci-urls.txt', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
mkdirSync('ci-out', { recursive: true })
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const log = []
for (const line of shots) {
  const [name, query, wait = '15', keys = ''] = line.split(/\s+/)
  const page = await browser.newPage({ viewport: name.endsWith('_m') ? { width: 390, height: 780 } : { width: 800, height: 450 } }) // (_m: móvil en vertical)
  page.on('console', (m) => log.push(`[${name}] ${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => log.push(`[${name}] PAGEERROR: ${e.message}\n${e.stack}`))
  await page.goto(base + query)
  await page.waitForTimeout(Number(wait) * 1000)
  for (const k of keys.split(',').filter(Boolean)) {
    const [key, ms] = k.split(':')
    if (key === 'wait') await page.waitForTimeout(Number(ms))
    else if (key === 'state') {
      const st = await page.evaluate(() => { const g = window.__game; return g && { phase: g.phase, phaseT: g.phaseT, jumpT: g.jumpT, jumpY: g.jumpY } })
      log.push(`[${name}] state@${ms} ${JSON.stringify(st)}`)
    }
    else {
      await page.keyboard.down(key)
      await page.waitForTimeout(Number(ms ?? 100))
      await page.keyboard.up(key)
    }
  }
  try {
    // (cuánto tarda en dibujar un frame, para saber si va lento)
    const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 3000) res(n / 3); else requestAnimationFrame(f) }; requestAnimationFrame(f) }))
    log.push(`[${name}] fps≈${fps}`)
    try {
    const st = await page.evaluate(() => { const g = window.__game; return g && { phase: g.phase, story: g.story, x: g.x, z: g.z, jumpT: g.jumpT, jumpY: g.jumpY, speed: g.speed, talk: g.talk } })
    log.push(`[${name}] state ${JSON.stringify(st)}`)
  } catch (e) { log.push(`[${name}] state error ${e.message}`) }
  await page.screenshot({ path: `ci-out/${name}.png`, timeout: 120000 })
  } catch (e) {
    log.push(`[${name}] SCREENSHOT FAILED: ${e.message}`)
  }
  writeFileSync('ci-out/console.txt', log.join('\n'))
  await page.close()
}
writeFileSync('ci-out/console.txt', log.join('\n'))
await browser.close()
