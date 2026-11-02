import { damp } from '../game/config'
import { game, shadow } from '../game/state'
import type { Pt } from '../simbolos/recognizer'
import { BRIDGE, FLOWERS, HEARTH, PATH_LIGHTS, RINGS, WAIT_RING, b } from './brasaProto'

/*
 * Las demostraciones de la elfa dorada (el eco del jugador anterior).
 * La primera vez que hace falta cada acción, aparece y la MUESTRA (sin resolverla por ella):
 *   1. dar luz a una flor              (junto a la hoguera, después de tomar la brasa)
 *   2. ir a un refugio                 (la primera vez que la brasa baja)
 *   3. encender la luz del camino y esperar en el refugio   (después de que el miedo se esconde)
 *   4. mirar con el espejo y dar luz al puente              (al llegar a la grieta)
 * Si después de un rato no lo hizo, la elfa dorada vuelve a mostrarlo.
 */

type P = Pt | (() => Pt)
type Step = {
  dur: number
  to?: P // camina hasta aquí (desde donde esté)
  back?: boolean // camina hacia atrás (sin darse vuelta)
  face?: P // hacia dónde mira mientras tanto
  arc?: P // le da un hilo de luz a esto
  lilac?: boolean // con el espejo levantado (la luz es lila)
}
const get = (p?: P) => (p ? (typeof p === 'function' ? p() : p) : null)
type Demo = { id: string; start: () => Pt; steps: Step[]; when: () => boolean; done: () => boolean; again: number }

const near = (p: Pt, d: number) => Math.hypot(game.x - p.x, game.z - p.z) < d
const unlitPath = () => PATH_LIGHTS.find((p) => p.litAt < 0) ?? PATH_LIGHTS[0]
const flower0 = FLOWERS[0]

const DEMOS: Demo[] = [
  {
    id: 'flor',
    start: () => ({ x: HEARTH.x + 1.6, z: HEARTH.z - 1.2 }),
    steps: [
      { dur: 1.8, to: { x: flower0.x - 1.1, z: flower0.z - 0.4 } },
      { dur: 2.8, face: flower0, arc: flower0 },
    ],
    when: () => b.hasEmber && game.time > b.pickAt + 2 && near(HEARTH, 12),
    done: () => flower0.giftAt >= 0,
    again: 22,
  },
  {
    id: 'refugio',
    start: () => ({ x: game.x + 1.5, z: game.z + 1 }),
    steps: [{ dur: 3.2, to: nearestRefuge }, { dur: 2.4, face: { x: 0, z: 0 } }],
    when: () => b.hasEmber && b.ember < b.max * 0.55 && !b.inRefuge && RINGS.some((r) => r.litAt >= 0),
    done: () => b.inRefuge,
    again: 9999, // (una sola vez: después ya lo marca el refugio que late)
  },
  {
    id: 'miedo',
    start: () => ({ x: RINGS[WAIT_RING].x + 1, z: RINGS[WAIT_RING].z + 1.5 }),
    steps: [
      { dur: 2.4, to: () => ({ x: unlitPath().x + 1, z: unlitPath().z - 1.3 }) },
      { dur: 2.4, face: unlitPath, arc: unlitPath }, // le da luz a una de las luces del camino…
      { dur: 2.2, face: { x: 0, z: 62 } }, // …y mira al ser: "mira lo que pasa"
    ],
    when: () => b.hasEmber && b.fear.calmAt < 0 && near({ x: 0, z: 56 }, 11),
    done: () => b.fear.calmAt >= 0 || PATH_LIGHTS.every((p) => p.litAt >= 0),
    again: 18,
  },
  {
    id: 'puente',
    start: () => ({ x: BRIDGE.x + 1.8, z: BRIDGE.z - 1.6 }),
    steps: [
      { dur: 1.5, to: { x: BRIDGE.x + 1.3, z: BRIDGE.z - 0.8 } },
      { dur: 3.2, face: { x: BRIDGE.x, z: BRIDGE.z + 2 }, arc: { x: BRIDGE.x, z: BRIDGE.z + 1.4 }, lilac: true },
    ],
    when: () => b.hasMirror && near(BRIDGE, 9),
    done: () => BRIDGE.litAt >= 0,
    again: 20,
  },
]

function nearestRefuge(): Pt {
  let best: Pt = RINGS[0]
  let bd = Infinity
  for (const r of [{ x: HEARTH.x, z: HEARTH.z, litAt: 0 }, ...RINGS]) {
    if (r.litAt < 0) continue
    const d = Math.hypot(game.x - r.x, game.z - r.z)
    if (d < bd) {
      bd = d
      best = r
    }
  }
  return best
}

/** Lo que la elfa dorada está mostrando ahora (para dibujar el hilo de luz y el espejo). */
export const demo = { on: false, alpha: 0, arc: null as Pt | null, lilac: false, hand: { x: 0, z: 0 } as Pt, id: '' }

let cur: Demo | null = null
let t0 = 0
let from: Pt = { x: 0, z: 0 }
let stepI = 0
let stepT = 0
let stepFrom: Pt = { x: 0, z: 0 }
const last: Record<string, number> = {}

/** Cada frame (después de la escena del principio y antes del final). */
export function demoStep(dt: number) {
  const g = game
  const t = g.time
  // la sombra de la gruta y la recién nacida usan la misma figura: ahí no hay demostraciones
  const busy = !b.introDone || b.end.landAt >= 0 || (b.shadow.appearAt >= 0 && b.shadow.lightAt < 0) || b.outAt >= 0
  if (cur && (busy || cur.done())) stop()
  if (!cur) {
    if (busy) return
    const next = DEMOS.find((d) => !d.done() && d.when() && t - (last[d.id] ?? -9999) > d.again)
    if (!next) return
    cur = next
    t0 = t
    from = next.start()
    stepI = 0
    stepT = 0
    stepFrom = from
    last[next.id] = t
    shadow.x = from.x
    shadow.z = from.z
    g.shadowOn = true
    g.shadowAt = t - 1.5
    g.ghostGold = 1
    demo.id = next.id
  }
  const d = cur
  const total = d.steps.reduce((a, s) => a + s.dur, 0)
  const k = t - t0
  // aparece y se desvanece suave
  g.ghostAlpha = Math.min(1, k / 0.6, (total + 0.8 - k) / 0.8)
  demo.alpha = g.ghostAlpha
  if (k > total + 0.8) {
    stop()
    return
  }
  // el paso actual
  while (stepI < d.steps.length - 1 && stepT > d.steps[stepI].dur) {
    stepT -= d.steps[stepI].dur
    stepFrom = { x: shadow.x, z: shadow.z }
    stepI++
  }
  stepT += dt
  const s = d.steps[Math.min(stepI, d.steps.length - 1)]
  const to = get(s.to)
  if (to && k <= total) {
    const f = Math.min(1, stepT / s.dur)
    const e = f * f * (3 - 2 * f)
    const nx = stepFrom.x + (to.x - stepFrom.x) * e
    const nz = stepFrom.z + (to.z - stepFrom.z) * e
    const moved = Math.hypot(nx - shadow.x, nz - shadow.z)
    shadow.speed = moved / Math.max(dt, 1e-4)
    if (!s.back && moved > 1e-4) turnTo(Math.atan2(nx - shadow.x, nz - shadow.z), dt)
    shadow.x = nx
    shadow.z = nz
  } else shadow.speed = 0
  const face = get(s.face)
  if (face && (!to || s.back)) turnTo(Math.atan2(face.x - shadow.x, face.z - shadow.z), dt)
  shadow.phase = 'play'
  shadow.phaseT += dt
  shadow.time = t
  const arc = get(s.arc)
  demo.on = true
  demo.arc = arc
  demo.lilac = !!s.lilac
  demo.hand = { x: shadow.x + Math.sin(shadow.yaw) * 0.35, z: shadow.z + Math.cos(shadow.yaw) * 0.35 }
}

function turnTo(want: number, dt: number) {
  shadow.yaw += Math.atan2(Math.sin(want - shadow.yaw), Math.cos(want - shadow.yaw)) * damp(6, dt)
}

function stop() {
  cur = null
  demo.on = false
  demo.arc = null
  demo.lilac = false
  // (si la figura sigue siendo la elfa dorada de la demostración, se apaga)
  if (b.shadow.appearAt < 0 && b.end.landAt < 0) game.shadowOn = false
}
