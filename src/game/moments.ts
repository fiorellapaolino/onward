import { besidePath, damp, rng } from './config'
import { game } from './state'
import { NOTES, bell, chord, splash } from './sfx'

/*
 * Momentos de estar viva (inspirado en "Soul"): la chispa no es una meta, son las cosas pequeñas.
 * Nadie dice qué hacer: el mundo responde si te detienes a sentirlo.
 * Cada momento vivido hace crecer la luz de su pecho y devuelve el color al mundo.
 *
 *   seed      la semilla que gira: quedarse quieta bajo el árbol y una aterriza en su mano
 *   puddles   saltar en los charcos
 *   fireflies caminar despacio entre las luciérnagas: la rodean y la siguen (si corre, se dispersan)
 *   flowers   un prado de flores cerradas que se abren por donde pisa
 */
export type MomentId = 'seed' | 'puddles' | 'fireflies' | 'flowers'
export const MOMENT_COUNT = 7 // (con el viento, las nubes y el atardecer, que vienen después)

// ── Dónde está cada uno ──────────────────────────────────────────
export const SEED_TREE = besidePath(14, 1, 3.4)
export const PUDDLES = [
  { ...xz(besidePath(23.5, -1, 0.5)), r: 0.75 },
  { ...xz(besidePath(26, 1, 0.7)), r: 0.6 },
  { ...xz(besidePath(28.5, -1, 0.3)), r: 0.9 },
  { ...xz(besidePath(31, 1, 0.9)), r: 0.55 },
]
export const GROVE = besidePath(37, -1, 3.6) // las luciérnagas
export const MEADOW = besidePath(49.5, 1, 4.6) // el prado de flores
export const MEADOW_R = 3.6
export const BUDS = (() => {
  const r = rng(808)
  const out: { x: number; z: number; s: number; hue: number }[] = []
  while (out.length < 46) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * MEADOW_R
    const x = MEADOW.x + Math.cos(a) * d
    const z = MEADOW.z + Math.sin(a) * d
    if (out.some((b) => Math.hypot(b.x - x, b.z - z) < 0.55)) continue
    out.push({ x, z, s: 0.8 + r() * 0.5, hue: r() })
  }
  return out
})()

function xz(v: { x: number; z: number }) {
  return { x: v.x, z: v.z }
}

// ── Estado ───────────────────────────────────────────────────────
export const moments = {
  done: {} as Partial<Record<MomentId, number>>, // momento (game.time) en que se vivió cada uno
  count: 0,
  // semilla
  stillT: 0, // segundos quieta bajo el árbol
  seedT: -1, // la semilla que baja a su mano: segundos desde que empezó (-1 = ninguna)
  // charcos
  splashAt: [-99, -99, -99, -99],
  splashX: 0,
  splashZ: 0,
  splashes: 0,
  wasAir: false,
  // luciérnagas
  calm: 0, // 0..1 cuánto se han acercado a ella
  // flores
  openAt: BUDS.map(() => -1),
  opened: 0,
}

/** Se vivió un momento: la chispa crece. */
function live(id: MomentId) {
  if (moments.done[id] !== undefined) return
  moments.done[id] = game.time
  moments.count++
  game.spark = moments.count / MOMENT_COUNT
  game.pulse = 1
  chord() // un pequeño arpegio de campanas
}

/** Cada frame (desde GameLoop, solo cuando el jugador tiene el control). */
export function updateMoments(dt: number) {
  const g = game
  const m = moments

  // ── La semilla que gira: quieta bajo el árbol unos segundos → una semilla baja girando a su mano ──
  const dTree = Math.hypot(g.x - SEED_TREE.x, g.z - SEED_TREE.z)
  if (!m.done.seed) {
    if (dTree < 3.2 && g.speed < 0.15 && g.jumpT < 0) m.stillT += dt
    else m.stillT = Math.max(0, m.stillT - dt * 2)
    if (m.seedT < 0 && m.stillT > 1.6) m.seedT = 0
    if (m.seedT >= 0) {
      m.seedT += dt
      // si se va antes de que llegue, la semilla sigue cayendo sola
      if (dTree > 3.6) m.seedT = -1
      if (m.seedT > 4.2) live('seed')
    }
  }

  // ── Charcos: al caer de un salto dentro de uno, salpica ──
  const air = g.jumpY > 0.05
  if (m.wasAir && !air) {
    PUDDLES.forEach((p, i) => {
      if (Math.hypot(g.x - p.x, g.z - p.z) < p.r + 0.15) {
        m.splashAt[i] = g.time
        m.splashX = g.x
        m.splashZ = g.z
        m.splashes++
        splash()
        if (m.splashes >= 2) live('puddles')
      }
    })
  }
  m.wasAir = air

  // ── Luciérnagas: caminando despacio cerca, se acercan; corriendo, se dispersan ──
  const dGrove = Math.hypot(g.x - GROVE.x, g.z - GROVE.z)
  const following = m.done.fireflies !== undefined
  const target = g.speed > 1.6 && !following ? 0 : dGrove < 4 || following ? 1 : m.calm > 0.5 && dGrove < 9 ? 1 : 0
  m.calm += (target - m.calm) * damp(target > m.calm ? 0.6 : 2.5, dt)
  if (!following && m.calm > 0.95) live('fireflies')

  // ── Flores: se abren por donde pisa ──
  BUDS.forEach((b, i) => {
    if (m.openAt[i] < 0 && Math.hypot(g.x - b.x, g.z - b.z) < 0.75) {
      m.openAt[i] = g.time
      m.opened++
      bell(NOTES[Math.floor(b.hue * NOTES.length)] * 2, true) // una nota suave y aguda
    }
  })
  if (m.opened >= BUDS.length * 0.6) live('flowers')

}
