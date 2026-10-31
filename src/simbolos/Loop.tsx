import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { damp } from '../game/config'
import { game, input, setUi } from '../game/state'
import { bell, chord, NOTES } from '../game/sfx'
import { recognize, roundness, type Pt, type Result } from './recognizer'
import { spawnBloom } from './blooms'
import {
  BLOOM_STEP, BOUNDS, BRIDGE_HALF, CHASM_Z0, CHASM_Z1, CLOSE_DIST, DEMO_TIME, END, MIN_STROKE, PASS_SCORE, RUN,
  SPIRIT_RANGE, TRIANGLE, WALK, ZONE, bridgeUp, demoProgress, proto,
} from './proto'

/*
 * Atajos para probar (y para las capturas automáticas):
 *   ?go           empieza sin pantalla de inicio
 *   ?auto         la elfa camina sola: espera al ser, dibuja el triángulo, cruza y llega al final
 *   ?steps=40     cada frame avanza 40 pasitos de 1/30 s (las capturas automáticas van a ~1 fps)
 *   ?at=8         empieza en z = 8 (cerca del círculo)
 *   ?solved       el puente ya está levantado
 *   ?end          directamente la vista desde arriba (con un camino de ejemplo)
 */
const params = new URLSearchParams(location.search)
const AUTO = params.has('auto')
const STEPS = Number(params.get('steps') ?? 0)
const QUICK = AUTO || params.has('go') || params.has('at') || params.has('solved') || params.has('end')
;(window as unknown as Record<string, unknown>).__game = game
;(window as unknown as Record<string, unknown>).__proto = proto

// Recorrido del piloto automático (un poco torpe a propósito, como una persona)
const AUTO_WAY: Pt[] = [
  { x: 5.5, z: 8.5 }, // 0: espera aquí, fuera del círculo, a que el ser termine de dibujar
  TRIANGLE[2], // 1: entra por una esquina…
  { x: TRIANGLE[0].x + 0.3, z: TRIANGLE[0].z - 0.2 },
  TRIANGLE[1],
  { x: TRIANGLE[2].x - 0.2, z: TRIANGLE[2].z + 0.3 }, // 4: … y vuelve a ella: se cierra el triángulo
  { x: TRIANGLE[0].x - 0.5, z: TRIANGLE[0].z },
  { x: 0, z: 18.8 }, // 6: espera aquí a que suba el puente
  { x: 0, z: 27 },
  { x: END.x, z: END.z },
]
let autoI = 0

const MOVE = new THREE.Vector3()
let started = false

/** Toda la lógica del prototipo. No dibuja nada; corre antes que el resto cada frame. */
export function Loop() {
  useFrame((_, rawDt) => {
    if (STEPS > 0) for (let i = 0; i < STEPS; i++) step(1 / 30)
    else step(Math.min(rawDt, 0.05))
  })
  return null
}

function step(dt: number) {
  const g = game
  const P = proto
  g.time += dt
  g.phase = 'play'
  g.phaseT += dt
  g.pulse = Math.max(0, g.pulse - dt * 1.2)

  // ── Arranque ──
  if (!started && g.loaded && QUICK) {
    started = true
    g.started = true
    setUi({ start: false })
    if (params.has('at')) g.z = Number(params.get('at'))
    if (params.has('solved')) P.solvedAt = g.time - 10
    if (params.has('end')) fakeEnd()
  }
  if (!g.started) return

  // ── Moverse (relativo a la cámara, como en el juego) ──
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

  // ── Límites: el claro, y el barranco (solo se cruza por el puente) ──
  g.x = THREE.MathUtils.clamp(g.x, -BOUNDS.x, BOUNDS.x)
  g.z = THREE.MathUtils.clamp(g.z, BOUNDS.zMin, BOUNDS.zMax)
  if (bridgeUp(g.time)) {
    if (g.z > CHASM_Z0 - 0.4 && g.z < CHASM_Z1 + 0.4) g.x = THREE.MathUtils.clamp(g.x, -BRIDGE_HALF + 0.3, BRIDGE_HALF - 0.3)
  } else {
    if (pz <= CHASM_Z0 && g.z > CHASM_Z0 - 0.35) g.z = CHASM_Z0 - 0.35
    if (pz >= CHASM_Z1 && g.z < CHASM_Z1 + 0.35) g.z = CHASM_Z1 + 0.35
  }
  const stepLen = Math.hypot(g.x - px, g.z - pz)

  // ── Florece a su paso ──
  P.walked += stepLen
  P.totalWalked += stepLen
  while (P.walked >= BLOOM_STEP) {
    P.walked -= BLOOM_STEP
    spawnBloom(g.x, g.z, g.time)
  }

  // ── El ser de la tierra: aparece cuando ella se acerca al barranco (cuando duda) ──
  const dZone = Math.hypot(g.x - ZONE.x, g.z - ZONE.z)
  if (P.spiritAt < 0 && P.solvedAt < 0 && (dZone < SPIRIT_RANGE || g.z > ZONE.z)) {
    P.spiritAt = g.time
    P.demoAt = g.time + 1.6
    bell(NOTES[3], true)
  }

  // ── Dibujar dentro del círculo ──
  // (mientras el ser dibuja no cuenta: al terminar, si está dentro, el trazo empieza de cero)
  const demoing = P.demoAt >= 0 && g.time < P.demoAt + DEMO_TIME
  const inside = dZone < ZONE.r
  if (P.solvedAt < 0 && P.spiritAt >= 0 && !demoing) {
    if (inside && !P.inZone) {
      // entra al círculo: empieza un trazo nuevo
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
        // ¿cerró una figura? (volvió cerca de un punto por el que pasó hace más de MIN_STROKE metros)
        // Se prueba cada lazo posible: así no importa por dónde entró al círculo ni si cruzó su propio camino.
        // Si ninguno es el triángulo, sigue dibujando (no es un error: todavía no terminó).
        for (const j of closedLoopStarts(P.stroke, P.strokeCum)) {
          const loop = P.stroke.slice(j)
          if (isTriangle(recognize(loop), loop)) {
            evaluate(g.time, j)
            break
          }
        }
      }
      // se quedó quieta con un trazo largo: también se prueba
      if (P.strokeLen > MIN_STROKE && g.idle > 1.6) evaluate(g.time, 0)
    } else if (P.inZone) {
      // salió del círculo
      if (P.strokeLen > MIN_STROKE) evaluate(g.time, 0)
      P.stroke = []
      P.strokeCum = []
      P.strokeLen = 0
    }
  }
  P.inZone = inside && !demoing

  // ── Llega a donde la esperan: la cámara sube y se ve su camino ──
  if (P.endAt < 0 && Math.hypot(g.x - END.x, g.z - END.z) < 1.8) {
    P.endAt = g.time
    chord()
  }
}

/** El piloto automático (?auto): sustituye a las teclas. */
function autopilot(dt: number) {
  const g = game
  const P = proto
  // si falló, vuelve a intentarlo desde la esquina
  if (autoI >= 5 && autoI <= 6 && P.solvedAt < 0 && P.lastAt >= 0 && !P.lastOk) autoI = 1
  const w = AUTO_WAY[Math.min(autoI, AUTO_WAY.length - 1)]
  const waitSpirit = autoI === 1 && (P.spiritAt < 0 || g.time < P.demoAt + DEMO_TIME)
  const waitBridge = autoI === 7 && !bridgeUp(g.time)
  MOVE.set(w.x - g.x, 0, w.z - g.z)
  const near = MOVE.length() < 0.45
  if (near && !waitSpirit && !waitBridge) autoI++
  if (near || ((waitSpirit || waitBridge) && MOVE.length() < 0.6)) MOVE.set(0, 0, 0)
  // la cámara la sigue por detrás
  input.camYaw += Math.atan2(Math.sin(g.yaw - input.camYaw), Math.cos(g.yaw - input.camYaw)) * damp(1.5, dt)
}

/** Dónde empiezan los lazos cerrados que terminan en el último punto (uno por cada vez que pasó cerca). */
export function closedLoopStarts(pts: Pt[], cum: number[]) {
  const n = pts.length - 1
  const p = pts[n]
  const out: number[] = []
  let wasNear = false
  for (let j = 0; j < n; j++) {
    if (cum[n] - cum[j] < MIN_STROKE) break
    const near = Math.hypot(p.x - pts[j].x, p.z - pts[j].z) < CLOSE_DIST
    if (near && !wasNear) out.push(j) // (solo el primer punto de cada tramo cercano)
    wasNear = near
  }
  return out
}

/** ¿Es el triángulo? Lo más parecido según $1, con nota suficiente, y no demasiado redondo (un círculo da ~1). */
const isTriangle = (res: Result, shape: Pt[]) => res.name === 'triangle' && res.score >= PASS_SCORE && roundness(shape) < 0.78

function evaluate(time: number, from: number) {
  const P = proto
  const shape = P.stroke.slice(from)
  const res = recognize(shape)
  const ok = isTriangle(res, shape)
  // (para probar: en la consola se ve qué entendió)
  console.log(`[símbolo] ${res.name} ${res.score.toFixed(2)} → ${ok ? 'bien' : 'otra vez'}`)
  P.lastStroke = shape
  P.lastAt = time
  P.lastOk = ok
  P.stroke = [P.stroke[P.stroke.length - 1]]
  P.strokeCum = [0]
  P.strokeLen = 0
  P.tries++
  if (ok) {
    P.solvedAt = time
    game.pulse = 1
    chord()
  } else {
    // el ser vuelve a dibujarlo, con paciencia
    bell(NOTES[1], true)
    P.demoAt = time + 1.4
  }
}

/** Para ?end: un camino de ejemplo que serpentea hasta el final, ya florecido. */
function fakeEnd() {
  const g = game
  const P = proto
  P.spiritAt = 0
  P.solvedAt = g.time - 20
  const pts: Pt[] = []
  for (let t = 0; t < 1; t += 0.002) pts.push({ x: Math.sin(t * 9) * 6 * (1 - t) + Math.sin(t * 23) * 1.2, z: t * 9 })
  pts.push(...TRIANGLE, { x: 0, z: 19 }, { x: 0, z: 27 }, { x: 2, z: 31 }, { x: END.x, z: END.z })
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / BLOOM_STEP)
    for (let k = 0; k < n; k++) spawnBloom(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n, g.time - 5)
  }
  g.x = END.x
  g.z = END.z
  P.endAt = g.time - 6
}
