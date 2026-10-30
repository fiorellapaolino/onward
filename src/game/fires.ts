import { besidePath } from './config'
import { game } from './state'
import { chord } from './sfx'

/*
 * Las hogueras del bosque apagado.
 *
 *   La primera hoguera arde junto a donde nace la elfa. Al acercarse, una brasa se va con ella
 *   (flota delante de su pecho). La brasa se va apagando poco a poco: hay que llevarla hasta
 *   la siguiente hoguera antes de que se apague (si se apaga, se vuelve a buscar otra a un fuego encendido).
 *   Al tocar una hoguera apagada con la brasa, se enciende: el bosque alrededor revive
 *   y aparece un recuerdo de luz dorada (gente sentada alrededor de ese fuego, hace mucho).
 */
export type Fire = { x: number; z: number; s: number }

export const FIRES: Fire[] = [
  { ...besidePath(4, -1, 2.0), s: 4 }, // junto a donde nace (ya arde)
  { ...besidePath(19, 1, 2.3), s: 19 },
  { ...besidePath(34, -1, 2.4), s: 34 },
  { ...besidePath(49, -1, 2.6), s: 49 },
].map((p) => ({ x: p.x, z: p.z, s: p.s }))

export const TOUCH = 1.6 // distancia para tomar o dar el fuego
export const EMBER_LIFE = 32 // segundos que dura la brasa lejos del fuego

export const fires = {
  litAt: FIRES.map((_, i) => (i === 0 ? 0 : -1)), // cuándo se encendió cada una (-1 = apagada)
  ember: 0, // 0..1 cuánto le queda a la brasa que lleva (0 = no lleva)
  emberDiedAt: -99,
  near: -1, // la hoguera encendida más cercana (índice) y a qué distancia
  nearD: 99,
}

/** ¿Cuánto revivió el bosque en este punto? (0 apagado → 1 vivo, por las hogueras encendidas cerca) */
export function aliveAt(x: number, z: number) {
  let a = 0
  FIRES.forEach((f, i) => {
    const at = fires.litAt[i]
    if (at < 0) return
    const grow = Math.min(1, (game.time - at) / 3) // (crece despacio desde la hoguera)
    const d = Math.hypot(x - f.x, z - f.z)
    a = Math.max(a, grow * Math.max(0, Math.min(1, (13 - d) / 7)))
  })
  return a
}

/** La siguiente hoguera apagada (o -1 si ya están todas). */
export const nextUnlit = () => fires.litAt.findIndex((t) => t < 0)

export function updateFires(dt: number) {
  const g = game
  if (g.phase !== 'play') return
  let nearD = 99
  let near = -1
  FIRES.forEach((f, i) => {
    const d = Math.hypot(g.x - f.x, g.z - f.z)
    if (fires.litAt[i] >= 0) {
      if (d < nearD) {
        nearD = d
        near = i
      }
    } else if (d < TOUCH && fires.ember > 0) {
      // ¡la enciende!
      fires.litAt[i] = g.time
      g.pulse = 1
      g.c = Math.min(1, g.c + 0.12)
      g.spark = Math.min(1, g.spark + 0.15)
      chord()
    }
  })
  fires.near = near
  fires.nearD = nearD
  // junto a un fuego encendido, la brasa se aviva (o la toma)
  if (nearD < TOUCH) fires.ember = 1
  else if (fires.ember > 0) {
    fires.ember = Math.max(0, fires.ember - dt / EMBER_LIFE)
    if (fires.ember === 0) fires.emberDiedAt = g.time
  }
}
