import * as THREE from 'three'
import { JUMP_AIR, JUMP_CROUCH, besidePath, pathAt } from './config'
import { game, input, setUi } from './state'
import { COLLIDERS } from './village'
import { NOTES, bell, chord, crack, fallSound } from './sfx'
import { DARK_MSG, FALL_MSG, GOAL_IRON, IRON_MSG, NEG_MSG, PROMPT_PRAY, WISP_MSG } from './story'

/*
 * El altar y el plano que la luz esconde.
 *   En el altar, la elfa se arrodilla a rezar: su cuerpo queda ahí, protegido, y el jugador pasa a su yo oscuro.
 *   plane 1  su estado oscuro: el mundo se apaga y se ve lo sobrenatural. Algo se mueve entre los árboles
 *            y lleva a un portal.
 *   plane 2  el plano negativo: el mismo lugar, al revés. Hay un vacío; al llegar aparecen piedras flotando.
 *            Cada piedra aguanta poco después de pisarla (cruje antes de caer). Si cae al vacío no muere:
 *            vuelve a su cuerpo, en el altar, y empieza de nuevo. Del otro lado está el hierro de estrella.
 * (z ≈ metros del sendero: el sendero va hacia +z)
 */
const TMP = new THREE.Vector3()
const at = (s: number, side: number, dist: number) => {
  const p = besidePath(s, side, dist, TMP)
  return { x: p.x, z: p.z }
}
const pathX = (z: number) => pathAt(z, TMP).x

export const ALTAR = at(51, 1, 3.4)
export const ALTAR_R = 1.5
COLLIDERS.push({ x: ALTAR.x, z: ALTAR.z, r: 0.6 }) // (no se atraviesa el altar)
/** Lo que se mueve entre los árboles sale de aquí y va hacia el portal. */
export const WISP_FROM = at(51.5, 1, 6.8)
export const PORTAL = at(47.6, -1, 2.4)
export const PORTAL_R = 0.9
/** El vacío (solo en el plano negativo): de borde a borde del sendero, entre estas dos z. */
export const VOID_NEAR = 45.5
export const VOID_FAR = 36.4
export const VOID_HALF = 8.5
/** Las piedras flotantes, de la orilla del portal hacia el otro lado. */
const STONE_SIDE = [0.3, -0.35, 0.45, -0.1, -0.55, 0.15, 0.55, -0.2] // (zigzag: cada salto hay que apuntarlo)
export const STONES = STONE_SIDE.map((side, i) => {
  const z = 44.8 - i * 1.12
  return { x: pathX(z) + side, z }
})
export const STONE_R = 0.55
const STONE_LAND = 0.75 // (algo más que lo que se ve: si cae justo en el borde, se la acomoda arriba)
const STONE_SNAP = 0.4 // (hasta dónde del centro se la acomoda al caer)
/** Cuánto aguanta una piedra después de pisarla (s). */
export const STONE_HOLD = 0.85
/** Al pisar la primera piedra, el puente se derrumba detrás de ella: la piedra i cae a los WAVE_START + i·WAVE_STEP s. */
const WAVE_START = 1.6
const WAVE_STEP = 0.85
/** Las piedras aparecen de a una al llegar al plano negativo. */
export const stoneAppearAt = (i: number) => game.planeAt + 0.3 + i * 0.15
/** El hierro de estrella, en el cráter del meteorito, del otro lado del vacío. */
export const MINERAL = at(34.2, 1, 2.4) // (a un costado del empedrado)

export const inVoid = (x: number, z: number) => z < VOID_NEAR && z > VOID_FAR && Math.abs(x - pathX(z)) < VOID_HALF

/** Cuándo se cae la piedra i (por haberla pisado, o por el derrumbe que la persigue). */
export function stoneFallTime(i: number) {
  const g = game
  let t = Infinity
  if (g.stoneAt[i] >= 0) t = g.stoneAt[i] + STONE_HOLD
  if (g.waveAt >= 0) t = Math.min(t, g.waveAt + WAVE_START + i * WAVE_STEP)
  return t
}

/** ¿La piedra i está entera (apareció y todavía no se cayó)? */
export function stoneIntact(i: number) {
  const g = game
  if (g.plane !== 2 || g.time < stoneAppearAt(i) + 0.3) return false
  return g.time < stoneFallTime(i)
}

/** Mientras reza, cae al vacío o toma el hierro, no se mueve. */
export function altarLocks() {
  const g = game
  return (g.prayAt >= 0 && g.plane === 0) || g.fallAt >= 0 || (g.ironAt >= 0 && g.plane > 0) || (g.sit > 0.4 && g.story !== 'fear' && g.story !== 'born')
}

/** Lo que baja su sombra al caer al vacío (metros). */
export const fallDrop = () => (game.fallAt >= 0 ? Math.min(6, (game.time - game.fallAt) ** 2 * 5) : 0)

const cracked = STONES.map(() => 0)

function backToBody(msg: string) {
  const g = game
  g.plane = 0
  g.planeAt = g.time
  g.x = g.bodyX
  g.z = g.bodyZ
  g.yaw = g.bodyYaw
  g.sit = 1 // (se levanta)
  g.prayAt = -1
  g.fallAt = -1
  g.jumpT = -1
  g.jumpY = 0
  g.speed = 0
  g.stoneAt.fill(-1)
  g.waveAt = -1
  cracked.fill(0)
  g.pulse = 0.6
  setUi({ msg, prompt: null, hold: -1 })
}

export function updateAltar(dt: number) {
  const g = game
  // de rodillas → de pie, cuando ya no reza (ni tiene miedo)
  if (g.story !== 'fear' && g.story !== 'born' && g.prayAt < 0 && g.sit > 0) g.sit = Math.max(0, g.sit - dt / 0.8)
  if (g.story !== 'altar') return

  if (g.plane === 0) {
    if (g.prayAt < 0) {
      const near = Math.hypot(g.x - ALTAR.x, g.z - ALTAR.z) < ALTAR_R && g.jumpY < 0.05 && !g.talk
      setUi({ prompt: near ? PROMPT_PRAY : null, hold: -1 })
      if (near && input.interact) {
        // se arrodilla frente al altar: su cuerpo queda aquí
        g.prayAt = g.time
        g.bodyYaw = g.yaw = Math.atan2(ALTAR.x - g.x, ALTAR.z - g.z)
        g.bodyX = g.x
        g.bodyZ = g.z
        g.speed = 0
        bell(NOTES[0], true)
        setUi({ prompt: null, msg: null })
      }
    } else {
      g.sit = Math.min(1, g.sit + dt / 0.9)
      g.speed = 0
      if (g.time - g.prayAt > 1.4) {
        // se separa: el jugador ahora es su yo oscuro
        g.plane = 1
        g.planeAt = g.time
        g.sit = 0
        g.pulse = 0.8
        chord()
        setUi({ msg: DARK_MSG, goal: null })
      }
    }
    return
  }

  const since = g.time - g.planeAt
  if (g.plane === 1) {
    if (since >= 3.5 && since - dt < 3.5) setUi({ msg: WISP_MSG })
    if (Math.hypot(g.x - PORTAL.x, g.z - PORTAL.z) < PORTAL_R) {
      g.plane = 2
      g.planeAt = g.time
      g.stoneAt.fill(-1)
      g.waveAt = -1
      cracked.fill(0)
      g.pulse = 1
      chord()
      setUi({ msg: NEG_MSG })
    }
    return
  }

  // ── el plano negativo ──
  if (since >= 5 && since - dt < 5) setUi({ msg: null })
  if (g.fallAt >= 0) {
    if (g.time - g.fallAt > 1.4) backToBody(FALL_MSG)
    return
  }
  if (g.ironAt >= 0) {
    if (g.time - g.ironAt > 1.4) {
      backToBody(IRON_MSG)
      g.story = 'starIron'
      setUi({ goal: GOAL_IRON })
    }
    return
  }
  const airborne = g.jumpT >= JUMP_CROUCH && g.jumpT < JUMP_CROUCH + JUMP_AIR
  const grounded = !airborne && g.jumpY < 0.02
  let onStone = -1
  STONES.forEach((st, i) => {
    // crujidos: el aviso se escucha antes de que caiga
    const left = stoneFallTime(i) - g.time
    if (cracked[i] === 0 && left < 0.5) {
      cracked[i] = 1
      crack(0.3)
    } else if (cracked[i] === 1 && left < 0.15) {
      cracked[i] = 2
      crack(1)
    }
    if (stoneIntact(i) && Math.hypot(g.x - st.x, g.z - st.z) < STONE_LAND) onStone = i
  })
  if (grounded && onStone >= 0) {
    // cayó cerca del borde: se la acomoda sobre la piedra (saltar en tercera persona sobre el vacío ya es difícil)
    const st = STONES[onStone]
    const d = Math.hypot(g.x - st.x, g.z - st.z)
    if (d > STONE_SNAP) {
      g.x = st.x + ((g.x - st.x) / d) * STONE_SNAP
      g.z = st.z + ((g.z - st.z) / d) * STONE_SNAP
    }
    if (g.stoneAt[onStone] < 0) g.stoneAt[onStone] = g.time
    if (g.waveAt < 0) g.waveAt = g.time // (empieza el derrumbe)
  }
  // pisa el vacío (o la piedra se le rompió debajo): cae
  if (grounded && onStone < 0 && inVoid(g.x, g.z)) {
    g.fallAt = g.time
    g.speed = 0
    fallSound()
    return
  }
  if (Math.hypot(g.x - MINERAL.x, g.z - MINERAL.z) < 0.85) {
    g.ironAt = g.time
    g.pulse = 1
    chord()
  }
}
