import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { damp } from '../game/config'
import { game, input, setUi } from '../game/state'
import { bell, chord, NOTES } from '../game/sfx'
import { recognize, type Pt } from '../simbolos/recognizer'
import { spawnBloom } from '../simbolos/blooms'
import { pointAlong } from '../simbolos/proto'
import {
  BOUNDS, CENTER_DIST, DEMO_TIME, END, MIN_STROKE, PASS_SCORE, PAST_TINT, RETURN_Z, RIVER_Z0, RIVER_Z1, SPIRAL, SPIRIT_RANGE, TIME,
  inPast, tp,
} from './timeProto'

/*
 * Atajos para probar (y para las capturas automáticas):
 *   ?tiempo&go       empieza sin pantalla de inicio
 *   ?tiempo&auto     la elfa camina sola: dibuja la espiral, cruza por el pasado y llega a la luz
 *   ?tiempo&steps=40 cada frame avanza 40 pasitos de 1/30 s (las capturas automáticas van a ~1 fps)
 *   ?tiempo&past     empieza ya en el pasado, frente al río
 *   ?tiempo&end      directamente la vista desde arriba (con un camino de ejemplo)
 */
const params = new URLSearchParams(location.search)
const AUTO = params.has('auto')
const STEPS = Number(params.get('steps') ?? 0)
const QUICK = AUTO || params.has('go') || params.has('past') || params.has('end')
;(window as unknown as Record<string, unknown>).__game = game
;(window as unknown as Record<string, unknown>).__time = tp

const BLOOM_STEP = 0.26
const WALK = 1.5
const RUN = 3.0
const MOVE = new THREE.Vector3()
let started = false

export function TimeLoop() {
  useFrame((_, rawDt) => {
    if (STEPS > 0) for (let i = 0; i < STEPS; i++) step(1 / 30)
    else step(Math.min(rawDt, 0.05))
  })
  return null
}

function step(dt: number) {
  const g = game
  const P = tp
  g.time += dt
  g.phase = 'play'
  g.phaseT += dt
  g.pulse = Math.max(0, g.pulse - dt * 1.2)

  if (!started && g.loaded && QUICK) {
    started = true
    g.started = true
    g.time = Math.max(g.time, 30)
    setUi({ start: false })
    if (params.has('past')) {
      solve(g.time - 6)
      g.z = RIVER_Z0 - 2
    }
    if (params.has('end')) fakeEnd()
  }
  if (!g.started) return

  // ── Moverse (relativo a la cámara) ──
  const fIn = THREE.MathUtils.clamp((input.forward ? 1 : 0) - (input.backward ? 1 : 0) - input.joyY, -1, 1)
  const sIn = THREE.MathUtils.clamp((input.right ? 1 : 0) - (input.left ? 1 : 0) + input.joyX, -1, 1)
  const cy = input.camYaw
  MOVE.set(Math.sin(cy) * fIn - Math.cos(cy) * sIn, 0, Math.cos(cy) * fIn + Math.sin(cy) * sIn)
  if (AUTO && P.endAt < 0) autopilot(dt)
  const moving = MOVE.lengthSq() > 0.04 && P.endAt < 0
  if (moving) MOVE.normalize()
  const target = moving ? (input.run || input.runToggle ? RUN : WALK) : 0
  g.speed += (target - g.speed) * damp(5, dt)
  if (moving) {
    const want = Math.atan2(MOVE.x, MOVE.z)
    g.yaw += Math.atan2(Math.sin(want - g.yaw), Math.cos(want - g.yaw)) * damp(9, dt)
    if (g.phaseT > 3) setUi({ hint: false })
  }
  g.idle = g.speed < 0.15 ? g.idle + dt : 0
  const px = g.x
  const pz = g.z
  g.x += Math.sin(g.yaw) * g.speed * dt
  g.z += Math.cos(g.yaw) * g.speed * dt

  // ── Límites: el río solo se cruza en el pasado ──
  g.x = THREE.MathUtils.clamp(g.x, -BOUNDS.x, BOUNDS.x)
  g.z = THREE.MathUtils.clamp(g.z, BOUNDS.zMin, BOUNDS.zMax)
  if (!inPast(g.time)) {
    if (pz <= RIVER_Z0 && g.z > RIVER_Z0 - 0.35) g.z = RIVER_Z0 - 0.35
    if (pz >= RIVER_Z1 && g.z < RIVER_Z1 + 0.35) g.z = RIVER_Z1 + 0.35
  }
  const stepLen = Math.hypot(g.x - px, g.z - pz)

  // ── Florece a su paso (en el pasado, de otro color) ──
  P.walked += stepLen
  P.totalWalked += stepLen
  while (P.walked >= BLOOM_STEP) {
    P.walked -= BLOOM_STEP
    spawnBloom(g.x, g.z, g.time, inPast(g.time) ? PAST_TINT : undefined)
  }

  // ── Vuelve al presente al llegar al otro lado ──
  if (P.pastAt >= 0 && P.presentAt < 0 && g.z > RETURN_Z) {
    P.presentAt = g.time
    bell(NOTES[2], false)
    setTimeout(() => bell(NOTES[0], true), 260)
  }

  // ── El ser del tiempo aparece cuando ella se acerca ──
  if (P.spiritAt < 0 && P.solvedAt < 0) {
    const d = Math.hypot(g.x - TIME.x, g.z - TIME.z)
    if (d < SPIRIT_RANGE || g.z > TIME.z) {
      P.spiritAt = g.time
      P.demoAt = g.time + 1.6
      bell(NOTES[4], true)
    }
  }

  // ── Dibujar la espiral dentro del círculo ──
  const demoing = P.demoAt >= 0 && g.time < P.demoAt + DEMO_TIME
  const inside = P.solvedAt < 0 && P.spiritAt >= 0 && !demoing && Math.hypot(g.x - TIME.x, g.z - TIME.z) < TIME.r
  if (inside && !P.inside) {
    P.stroke = [{ x: g.x, z: g.z }]
    P.strokeCum = [0]
    P.strokeLen = 0
  }
  if (inside) {
    const last = P.stroke[P.stroke.length - 1]
    const d = Math.hypot(g.x - last.x, g.z - last.z)
    if (d >= 0.15) {
      P.strokeLen += d
      P.stroke.push({ x: g.x, z: g.z })
      P.strokeCum.push(P.strokeLen)
    }
    // la espiral termina en el centro: al llegar ahí se prueba (desde cada punto de partida posible)
    const center = Math.hypot(g.x - TIME.x, g.z - TIME.z) < CENTER_DIST
    if (center && P.strokeLen > MIN_STROKE && g.time - P.lastTry > 0.4) {
      P.lastTry = g.time
      const j = bestStart()
      if (j >= 0) evaluate(g.time, j, true)
    }
    // se quedó quieta con un trazo largo: se prueba (y si no es, el ser lo repite)
    if (P.solvedAt < 0 && P.strokeLen > MIN_STROKE && g.idle > 1.6) evaluate(g.time, Math.max(0, bestStart()), false)
  } else if (P.inside && P.solvedAt < 0) {
    if (P.strokeLen > MIN_STROKE) evaluate(g.time, Math.max(0, bestStart()), false)
    P.stroke = []
    P.strokeCum = []
    P.strokeLen = 0
  }
  P.inside = inside

  // ── Llega a la luz ──
  if (P.endAt < 0 && Math.hypot(g.x - END.x, g.z - END.z) < 1.8) {
    P.endAt = g.time
    chord()
  }
}

/** Desde qué punto del trazo sale una espiral reconocible (o -1). Prueba un inicio cada ~1 m. */
function bestStart() {
  const P = tp
  const n = P.stroke.length - 1
  for (let j = 0; j < n; j++) {
    if (P.strokeCum[n] - P.strokeCum[j] < MIN_STROKE) break
    if (j > 0 && P.strokeCum[j] - P.strokeCum[j - 1] < 1 && j % 6 !== 0) continue
    const res = recognize(P.stroke.slice(j))
    if (res.name === 'spiral' && res.score >= PASS_SCORE) return j
  }
  return -1
}

function evaluate(time: number, from: number, sure: boolean) {
  const P = tp
  const shape = P.stroke.slice(from)
  const res = recognize(shape)
  const ok = sure || (res.name === 'spiral' && res.score >= PASS_SCORE)
  console.log(`[símbolo tiempo] ${res.name} ${res.score.toFixed(2)} → ${ok ? 'bien' : 'otra vez'}`)
  P.lastStroke = shape
  P.lastAt = time
  P.lastOk = ok
  P.stroke = [P.stroke[P.stroke.length - 1]]
  P.strokeCum = [0]
  P.strokeLen = 0
  if (ok) {
    solve(time)
    game.pulse = 1
    chord()
  } else {
    bell(NOTES[1], true)
    P.demoAt = time + 1.4
  }
}

function solve(time: number) {
  const P = tp
  if (P.spiritAt < 0) P.spiritAt = time - 2
  P.solvedAt = time
  P.pastAt = time + 0.4
}

// ── Piloto automático (?auto) ────────────────────────────────────
type Way = { to: Pt; wait?: () => boolean }
const spiralWalk: Way[] = []
for (let i = 0; i <= 40; i++) {
  const q = pointAlong(SPIRAL, i / 40)
  // un poco torpe a propósito, como una persona
  spiralWalk.push({ to: { x: q.x + Math.sin(i * 1.3) * 0.12, z: q.z + Math.cos(i * 1.7) * 0.12 } })
}
const AUTO_WAY: Way[] = [
  { to: { x: 0, z: 4.5 }, wait: () => tp.spiritAt < 0 || game.time < tp.demoAt + DEMO_TIME },
  ...spiralWalk,
  { to: { x: TIME.x, z: TIME.z }, wait: () => tp.solvedAt < 0 }, // quieta en el centro hasta que el bosque responde
  { to: { x: 0.4, z: RIVER_Z0 - 1 }, wait: () => !inPast(game.time) },
  { to: { x: 0.8, z: RIVER_Z1 + 3 } },
  { to: { x: -0.5, z: 30 } },
  { to: { x: END.x, z: END.z } },
]
let autoI = 0

function autopilot(dt: number) {
  const g = game
  const w = AUTO_WAY[Math.min(autoI, AUTO_WAY.length - 1)]
  const waiting = w.wait?.() ?? false
  MOVE.set(w.to.x - g.x, 0, w.to.z - g.z)
  const near = MOVE.length() < 0.45
  if (near && !waiting) autoI++
  if (near || (waiting && MOVE.length() < 0.6)) MOVE.set(0, 0, 0)
  input.camYaw += Math.atan2(Math.sin(g.yaw - input.camYaw), Math.cos(g.yaw - input.camYaw)) * damp(1.5, dt)
}

/** Para ?end: un camino de ejemplo, con el tramo del pasado de otro color. */
function fakeEnd() {
  const g = game
  const P = tp
  solve(g.time - 30)
  P.presentAt = g.time - 20
  const lay = (pts: Pt[], tint?: string[]) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / BLOOM_STEP)
      for (let k = 0; k < n; k++) spawnBloom(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n, g.time - 5, tint)
    }
  }
  lay([{ x: 0, z: 0 }, { x: 1.5, z: 4 }, { x: 0, z: 7.9 }, ...SPIRAL])
  lay([{ x: 0, z: 11 }, { x: 0.4, z: 18 }, { x: 0.8, z: 24 }, { x: 0.6, z: RETURN_Z }], PAST_TINT)
  lay([{ x: 0.6, z: RETURN_Z }, { x: -0.5, z: 30 }, { x: END.x, z: END.z }])
  g.x = END.x
  g.z = END.z
  P.endAt = g.time - 12
}
