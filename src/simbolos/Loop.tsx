import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { damp } from '../game/config'
import { game, input, setUi } from '../game/state'
import { bell, chord, NOTES } from '../game/sfx'
import { recognize, roundness, type Pt, type Result } from './recognizer'
import { spawnBloom } from './blooms'
import {
  BLOOM_STEP, BOUNDS, BRIDGE_HALF, CHASM_Z0, CHASM_Z1, CLOSE_DIST, DEMO_TIME, EARTH, END, FIRE, FIRES, MIN_STROKE, PASS_SCORE, RUN,
  SPIRIT_RANGE, WALK, WALL_Z, ZONES, bridgeUp, fireLitAt, hearthLitAt, proto, wallOpen, type Zone,
} from './proto'

/*
 * Atajos para probar (y para las capturas automáticas):
 *   ?go           empieza sin pantalla de inicio
 *   ?auto         la elfa camina sola: dibuja el triángulo, cruza el puente, dibuja el círculo y llega al final
 *   ?steps=40     cada frame avanza 40 pasitos de 1/30 s (las capturas automáticas van a ~1 fps)
 *   ?at=8         empieza en z = 8 (cerca del círculo de la tierra)
 *   ?solved       el puente ya está levantado
 *   ?lit          las hogueras ya están encendidas (también levanta el puente)
 *   ?end          directamente la vista desde arriba (con un camino de ejemplo)
 *   ?wrong        (con ?auto) primero dibuja mal cada símbolo, para ver que el ser lo repite
 */
const params = new URLSearchParams(location.search)
const AUTO = params.has('auto')
const STEPS = Number(params.get('steps') ?? 0)
const QUICK = AUTO || params.has('go') || params.has('at') || params.has('solved') || params.has('lit') || params.has('end')
;(window as unknown as Record<string, unknown>).__game = game
;(window as unknown as Record<string, unknown>).__proto = proto
;(window as unknown as Record<string, unknown>).__zones = ZONES

const MOVE = new THREE.Vector3()
let started = false
let firesHeard = 0 // cuántas hogueras ya sonaron al encenderse
let hearthHeard = false

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
    g.time = Math.max(g.time, 30) // (para poder poner momentos "en el pasado")
    setUi({ start: false })
    if (params.has('at')) g.z = Number(params.get('at'))
    if (params.has('solved') || params.has('lit')) solve(EARTH, g.time - 10)
    if (params.has('lit')) solve(FIRE, g.time - 10)
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

  // ── Límites: el claro, el barranco (solo se cruza por el puente) y el muro de sombra ──
  g.x = THREE.MathUtils.clamp(g.x, -BOUNDS.x, BOUNDS.x)
  g.z = THREE.MathUtils.clamp(g.z, BOUNDS.zMin, BOUNDS.zMax)
  if (bridgeUp(g.time)) {
    if (g.z > CHASM_Z0 - 0.4 && g.z < CHASM_Z1 + 0.4) g.x = THREE.MathUtils.clamp(g.x, -BRIDGE_HALF + 0.3, BRIDGE_HALF - 0.3)
  } else {
    if (pz <= CHASM_Z0 && g.z > CHASM_Z0 - 0.35) g.z = CHASM_Z0 - 0.35
    if (pz >= CHASM_Z1 && g.z < CHASM_Z1 + 0.35) g.z = CHASM_Z1 + 0.35
  }
  if (!wallOpen(g.time) && pz <= WALL_Z && g.z > WALL_Z - 0.6) g.z = WALL_Z - 0.6
  const stepLen = Math.hypot(g.x - px, g.z - pz)

  // ── Florece a su paso ──
  P.walked += stepLen
  P.totalWalked += stepLen
  while (P.walked >= BLOOM_STEP) {
    P.walked -= BLOOM_STEP
    spawnBloom(g.x, g.z, g.time)
  }

  // ── Los seres del bosque: aparecen cuando ella se acerca a su círculo (cuando duda) ──
  // (el del fuego, solo cuando ya cruzó el barranco)
  for (const z of ZONES) {
    if (z.spiritAt >= 0 || z.solvedAt >= 0) continue
    if (z === FIRE && g.z < CHASM_Z1) continue
    const d = Math.hypot(g.x - z.x, g.z - z.z)
    if (d < SPIRIT_RANGE || g.z > z.z) {
      z.spiritAt = g.time
      z.demoAt = g.time + 1.6
      bell(NOTES[z === FIRE ? 4 : 3], true)
    }
  }

  // ── Dibujar dentro de un círculo ──
  // (mientras el ser dibuja no cuenta: al terminar, si está dentro, el trazo empieza de cero)
  let inside: Zone | null = null
  for (const z of ZONES) {
    const demoing = z.demoAt >= 0 && g.time < z.demoAt + DEMO_TIME
    if (z.solvedAt < 0 && z.spiritAt >= 0 && !demoing && Math.hypot(g.x - z.x, g.z - z.z) < z.r) inside = z
  }
  const was = ZONES.find((z) => z.id === P.inZone) ?? null
  if (inside && inside !== was) {
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
      // Si ninguno es el símbolo, sigue dibujando (no es un error: todavía no terminó).
      for (const j of closedLoopStarts(P.stroke, P.strokeCum)) {
        const loop = P.stroke.slice(j)
        if (matches(inside, recognize(loop), loop)) {
          evaluate(inside, g.time, j)
          break
        }
      }
    }
    // se quedó quieta con un trazo largo: también se prueba
    if (inside.solvedAt < 0 && P.strokeLen > MIN_STROKE && g.idle > 1.6) evaluate(inside, g.time, 0)
  } else if (was && was.solvedAt < 0) {
    // salió del círculo
    if (P.strokeLen > MIN_STROKE) evaluate(was, g.time, 0)
    P.stroke = []
    P.strokeCum = []
    P.strokeLen = 0
  }
  P.inZone = inside?.id ?? null

  // ── Las hogueras suenan al encenderse, una detrás de otra ──
  while (firesHeard < FIRES.length && fireLitAt(firesHeard) >= 0 && g.time >= fireLitAt(firesHeard)) {
    if (g.time - fireLitAt(firesHeard) < 1) bell(NOTES[firesHeard % NOTES.length] * (firesHeard >= 6 ? 0.5 : 1), firesHeard % 2 === 1)
    firesHeard++
  }

  // ── Llega a donde la esperan: enciende su hoguera, y la cámara sube y se ve su camino ──
  if (P.endAt < 0 && Math.hypot(g.x - END.x, g.z - END.z) < 1.8) {
    P.endAt = g.time
  }
  if (!hearthHeard && hearthLitAt() >= 0 && g.time >= hearthLitAt()) {
    hearthHeard = true
    chord()
  }
}

// ── Piloto automático (?auto): sustituye a las teclas ────────────
type Way = { to: Pt; wait?: () => boolean; draw?: Zone }
const WRONG = params.has('wrong')
const corner = (z: Zone, i: number, dx = 0, dz = 0): Pt => ({ x: z.shape[i].x + dx, z: z.shape[i].z + dz })

/** El triángulo, caminado un poco torpe a propósito (como una persona). */
function walkTriangle(z: Zone): Way[] {
  return [
    { to: corner(z, 2), draw: z }, // entra por una esquina…
    { to: corner(z, 0, 0.3, -0.2), draw: z },
    { to: corner(z, 1), draw: z },
    { to: corner(z, 2, -0.2, 0.3), draw: z }, // … y vuelve a ella: se cierra el triángulo
  ]
}
/** El círculo: 16 puntos alrededor, y un poco más allá del inicio para cerrarlo. */
function walkCircle(z: Zone): Way[] {
  const out: Way[] = []
  for (let i = 0; i <= 18; i++) {
    const a = -Math.PI / 2 + (i / 16) * Math.PI * 2
    const r = 3.1 + Math.sin(i * 1.7) * 0.25
    out.push({ to: { x: z.x + Math.cos(a) * r, z: z.z + Math.sin(a) * r }, draw: z })
  }
  return out
}
/** Un intento equivocado: un zigzag que cruza el círculo y sale. */
function walkWrong(z: Zone): Way[] {
  return WRONG
    ? [
        { to: { x: z.x - 3, z: z.z - 2 }, draw: z },
        { to: { x: z.x + 3, z: z.z - 1 }, draw: z },
        { to: { x: z.x - 2, z: z.z + 2 }, draw: z },
        { to: { x: z.x + 6.5, z: z.z + 2 }, draw: z },
      ]
    : []
}
const spiritReady = (z: Zone) => () => z.spiritAt < 0 || game.time < z.demoAt + DEMO_TIME || (proto.lastAt > game.time - 0.5 && !proto.lastOk)

const AUTO_WAY: Way[] = [
  { to: { x: 5.5, z: 8.5 }, wait: spiritReady(EARTH) }, // espera, fuera del círculo, a que el ser termine de dibujar
  ...walkWrong(EARTH),
  { to: { x: 5.5, z: 8.5 }, wait: spiritReady(EARTH) },
  ...walkTriangle(EARTH),
  { to: corner(EARTH, 0, -0.5) },
  { to: { x: 0, z: 18.8 }, wait: () => !bridgeUp(game.time) }, // espera a que suba el puente
  { to: { x: 0, z: 27 } },
  { to: { x: 5.5, z: 27.5 }, wait: spiritReady(FIRE) },
  ...walkWrong(FIRE),
  { to: { x: 5.5, z: 27.5 }, wait: spiritReady(FIRE) },
  ...walkCircle(FIRE),
  { to: { x: 0, z: 38.6 }, wait: () => !wallOpen(game.time) }, // espera a que se abra el muro de sombra
  { to: { x: 0.6, z: 46 } },
  { to: { x: END.x, z: END.z } },
]
let autoI = 0

function autopilot(dt: number) {
  const g = game
  const P = proto
  // si dibujó mal, vuelve a esperar al ser y lo intenta otra vez
  const cur = AUTO_WAY[Math.min(autoI, AUTO_WAY.length - 1)]
  if (cur.draw && cur.draw.solvedAt < 0 && P.lastAt > g.time - dt * 1.5 && !P.lastOk) {
    const z = cur.draw
    // el primer punto de "esperar al ser" de esa zona después del intento equivocado
    const waits = AUTO_WAY.map((w, i) => (w.wait && AUTO_WAY.slice(i + 1).find((x) => x.draw)?.draw === z ? i : -1)).filter((i) => i >= 0)
    autoI = waits[waits.length - 1] ?? autoI
  }
  const w = AUTO_WAY[Math.min(autoI, AUTO_WAY.length - 1)]
  const waiting = w.wait?.() ?? false
  MOVE.set(w.to.x - g.x, 0, w.to.z - g.z)
  const near = MOVE.length() < 0.45
  if (near && !waiting) autoI++
  // (si ya resolvió esa zona, se salta el resto del dibujo)
  while (autoI < AUTO_WAY.length && AUTO_WAY[autoI].draw && AUTO_WAY[autoI].draw!.solvedAt >= 0) autoI++
  if (near || (waiting && MOVE.length() < 0.6)) MOVE.set(0, 0, 0)
  // la cámara la sigue por detrás
  input.camYaw += Math.atan2(Math.sin(g.yaw - input.camYaw), Math.cos(g.yaw - input.camYaw)) * damp(1.5, dt)
}

// ── Reconocer ────────────────────────────────────────────────────

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

/**
 * ¿Es el símbolo de esta zona? Lo más parecido según $1, con nota suficiente,
 * y la "redondez" como segunda opinión (un círculo da ~1, un cuadrado 0.79, un triángulo 0.6).
 */
function matches(z: Zone, res: Result, shape: Pt[]) {
  if (res.name !== z.symbol || res.score < PASS_SCORE) return false
  const round = roundness(shape)
  return z.symbol === 'circle' ? round > 0.8 : z.symbol === 'triangle' ? round < 0.78 : true
}

function evaluate(z: Zone, time: number, from: number) {
  const P = proto
  const shape = P.stroke.slice(from)
  const res = recognize(shape)
  const ok = matches(z, res, shape)
  // (para probar: en la consola se ve qué entendió)
  console.log(`[símbolo ${z.id}] ${res.name} ${res.score.toFixed(2)} redondez ${roundness(shape).toFixed(2)} → ${ok ? 'bien' : 'otra vez'}`)
  P.lastStroke = shape
  P.lastAt = time
  P.lastOk = ok
  P.lastColor = z.color
  P.stroke = [P.stroke[P.stroke.length - 1]]
  P.strokeCum = [0]
  P.strokeLen = 0
  P.tries++
  if (ok) {
    solve(z, time)
    game.pulse = 1
    chord()
  } else {
    // el ser vuelve a dibujarlo, con paciencia
    bell(NOTES[1], true)
    z.demoAt = time + 1.4
  }
}

function solve(z: Zone, time: number) {
  if (z.spiritAt < 0) z.spiritAt = time - 2
  z.solvedAt = time
  // (las hogueras que ya se encendieron "en el pasado" no suenan)
  if (z === FIRE) while (firesHeard < FIRES.length && fireLitAt(firesHeard) < game.time - 1) firesHeard++
}

/** Para ?end: un camino de ejemplo que serpentea hasta el final, ya florecido. */
function fakeEnd() {
  const g = game
  const P = proto
  solve(EARTH, g.time - 40)
  solve(FIRE, g.time - 25)
  const pts: Pt[] = []
  for (let t = 0; t < 1; t += 0.002) pts.push({ x: Math.sin(t * 9) * 6 * (1 - t) + Math.sin(t * 23) * 1.2, z: t * 9 })
  pts.push(...EARTH.shape, { x: 0, z: 19 }, { x: 0, z: 27 }, { x: 4, z: 28.5 }, ...FIRE.shape)
  pts.push({ x: 0, z: 38 }, { x: 1.5, z: 44 }, { x: -1, z: 50 }, { x: END.x, z: END.z })
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / BLOOM_STEP)
    for (let k = 0; k < n; k++) spawnBloom(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n, g.time - 5)
  }
  g.x = END.x
  g.z = END.z
  P.endAt = g.time - 12 // (directamente la vista desde arriba)
  firesHeard = FIRES.length
  hearthHeard = true
}
