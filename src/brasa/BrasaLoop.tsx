import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { damp } from '../game/config'
import { game, input, setUi } from '../game/state'
import { bell, chord, NOTES } from '../game/sfx'
import { spawnBloom } from '../simbolos/blooms'
import type { Pt } from '../simbolos/recognizer'
import { addCricket, updateCrickets } from './crickets'
import {
  BLOOM_STEP, BOUNDS, EMBER_TIME, FLOWER_COST, FLOWERS, GIFT_BONUS, GIVE_DIST, HEARTH, MEMORY_FLIGHT, PICK_DIST, RECHARGE, REFUGE_R,
  RETURN_TIME, RING_COST, RINGS, RUN, RUN_DRAIN, WALK, b, refuges,
} from './brasaProto'

/*
 * Atajos para probar (y para las capturas automáticas):
 *   ?go        empieza sin pantalla de inicio
 *   ?auto      la elfa juega sola: toma la brasa, da luz a una flor y a los círculos, llega a las raíces
 *   ?steps=40  cada frame avanza 40 pasitos de 1/30 s
 *   ?ember     empieza ya con la brasa, junto a la hoguera
 *   ?lit       todo encendido y florecido (para ver cómo queda)
 *   ?out       con la brasa casi apagada lejos del fuego (para ver la chispa que vuelve)
 */
const params = new URLSearchParams(location.search)
const AUTO = params.has('auto')
const STEPS = Number(params.get('steps') ?? 0)
const QUICK = AUTO || ['go', 'ember', 'lit', 'out'].some((k) => params.has(k))
;(window as unknown as Record<string, unknown>).__game = game
;(window as unknown as Record<string, unknown>).__brasa = b

const MOVE = new THREE.Vector3()
let started = false

// ── Los grillos cantan donde hay algo dormido ──
addCricket({ x: HEARTH.x, z: HEARTH.z, on: () => !b.hasEmber, loud: 1.3 }) // la brasa espera
RINGS.forEach((r) => addCricket({ x: r.x, z: r.z, on: () => b.hasEmber && r.litAt < 0 }))
FLOWERS.forEach((f) => addCricket({ x: f.x, z: f.z, on: () => b.hasEmber && f.giftAt < 0, loud: 0.6 }))

export function BrasaLoop() {
  useFrame(({ camera }, rawDt) => {
    if (STEPS > 0) for (let i = 0; i < STEPS; i++) step(1 / 30)
    else step(Math.min(rawDt, 0.05))
    if (game.started) updateCrickets(camera)
  })
  return null
}

function step(dt: number) {
  const g = game
  g.time += dt
  g.phase = 'play'
  g.phaseT += dt
  g.pulse = Math.max(0, g.pulse - dt * 1.2)

  if (!started && g.loaded && QUICK) {
    started = true
    g.started = true
    g.time = Math.max(g.time, 30)
    setUi({ start: false })
    if (params.has('ember') || params.has('lit') || params.has('out')) pick(g.time - 5, true)
    if (params.has('ember')) {
      g.x = HEARTH.x - 1.5
      g.z = HEARTH.z + 1
    }
    if (params.has('lit')) {
      RINGS.forEach((r) => (r.litAt = g.time - 8))
      FLOWERS.forEach((f) => (f.giftAt = g.time - 8))
      b.memories = FLOWERS.length
      b.max = 1 + GIFT_BONUS * FLOWERS.length
      b.ember = b.max
      g.x = 0
      g.z = 30
    }
    if (params.has('out')) {
      b.lastRefuge = { x: RINGS[0].x, z: RINGS[0].z }
      g.x = -4
      g.z = 29
      b.ember = 0.06
    }
  }
  if (!g.started) return

  // ── La chispa vuelve al último refugio (se apagó la brasa): ella espera ──
  if (b.outAt >= 0) {
    g.speed = 0
    if (g.time - b.outAt > RETURN_TIME) {
      g.x = b.lastRefuge.x
      g.z = b.lastRefuge.z - 1.2
      b.ember = b.max * 0.5
      b.outAt = -1
      g.pulse = 1
      bell(NOTES[0], true)
    }
    return
  }

  // ── Moverse (relativo a la cámara) ──
  const fIn = THREE.MathUtils.clamp((input.forward ? 1 : 0) - (input.backward ? 1 : 0) - input.joyY, -1, 1)
  const sIn = THREE.MathUtils.clamp((input.right ? 1 : 0) - (input.left ? 1 : 0) + input.joyX, -1, 1)
  const cy = input.camYaw
  MOVE.set(Math.sin(cy) * fIn - Math.cos(cy) * sIn, 0, Math.cos(cy) * fIn + Math.sin(cy) * sIn)
  if (AUTO) autopilot(dt)
  const moving = MOVE.lengthSq() > 0.04
  if (moving) MOVE.normalize()
  const running = input.run || input.runToggle
  const target = moving ? (running ? RUN : WALK) : 0
  g.speed += (target - g.speed) * damp(5, dt)
  if (moving) {
    const want = Math.atan2(MOVE.x, MOVE.z)
    g.yaw += Math.atan2(Math.sin(want - g.yaw), Math.cos(want - g.yaw)) * damp(9, dt)
    if (g.phaseT > 3) setUi({ hint: false })
  }
  g.idle = g.speed < 0.15 ? g.idle + dt : 0
  const px = g.x
  const pz = g.z
  g.x = THREE.MathUtils.clamp(g.x + Math.sin(g.yaw) * g.speed * dt, -BOUNDS.x, BOUNDS.x)
  g.z = THREE.MathUtils.clamp(g.z + Math.cos(g.yaw) * g.speed * dt, BOUNDS.zMin, BOUNDS.zMax)
  const stepLen = Math.hypot(g.x - px, g.z - pz)

  // ── Tomar la brasa de la hoguera ──
  if (!b.hasEmber && Math.hypot(g.x - HEARTH.x, g.z - HEARTH.z) < PICK_DIST) pick(g.time, false)

  // ── La brasa: se recarga en los refugios, se gasta lejos del fuego ──
  if (b.hasEmber) {
    const ref = refuges().find((r) => r.lit && Math.hypot(g.x - r.x, g.z - r.z) < REFUGE_R)
    b.inRefuge = !!ref
    if (ref) {
      b.ember = Math.min(b.max, b.ember + RECHARGE * dt)
      b.lastRefuge = { x: ref.x, z: ref.z }
    } else {
      b.ember -= (dt / EMBER_TIME) * (running && g.speed > WALK + 0.2 ? RUN_DRAIN : 1)
      if (b.ember <= 0) {
        b.ember = 0
        b.outAt = g.time
        b.outFrom = { x: g.x, z: g.z }
        bell(NOTES[1] * 0.5, true)
      }
    }
  }
  // (para el personaje: con poca luz mira a su alrededor, inquieta; su luz crece con la brasa)
  const lvl = b.hasEmber ? b.ember / b.max : 0
  g.spark = lvl
  const fear = b.hasEmber ? Math.max(0, 1 - lvl * 2.2) : 0.75
  g.fear = g.speed > 0.4 ? Math.min(0.29, fear) : fear // (caminando no gira la cabeza a cada paso)

  // ── La vida vuelve donde pisa con luz ──
  if (b.hasEmber) {
    b.walked += stepLen
    b.totalWalked += stepLen
    while (b.walked >= BLOOM_STEP) {
      b.walked -= BLOOM_STEP
      spawnBloom(g.x, g.z, g.time)
    }
  }

  // ── Dar luz: a un círculo de hongos apagado o a una flor dormida ──
  b.near = null
  if (b.hasEmber) {
    let best = GIVE_DIST
    RINGS.forEach((r, i) => {
      const d = Math.hypot(g.x - r.x, g.z - r.z)
      if (r.litAt < 0 && d < best + 1) {
        best = d
        b.near = { kind: 'ring', i }
      }
    })
    FLOWERS.forEach((f, i) => {
      const d = Math.hypot(g.x - f.x, g.z - f.z)
      if (f.giftAt < 0 && d < best) {
        best = d
        b.near = { kind: 'flower', i }
      }
    })
  }
  const give = input.interact || input.jumpPressed
  input.interact = false
  input.jumpPressed = false
  if (give && b.near) giveLight(g.time)
  setUi({ prompt: b.near ? 'give' : null })

  // ── Los recuerdos llegan a ella: la brasa dura un poco más ──
  b.memFlights = b.memFlights.filter((m) => {
    if (g.time - m.at < MEMORY_FLIGHT) return true
    b.memories++
    b.max += GIFT_BONUS
    b.ember = Math.min(b.max, b.ember + GIFT_BONUS)
    g.pulse = 1
    bell(NOTES[(b.memories + 1) % NOTES.length], false)
    return false
  })
}

function pick(time: number, quiet: boolean) {
  b.hasEmber = true
  b.pickAt = time
  b.ember = b.max
  game.pulse = 1
  if (!quiet) chord()
}

function giveLight(time: number) {
  const n = b.near
  if (!n) return
  const cost = n.kind === 'ring' ? RING_COST : FLOWER_COST
  if (b.ember < cost + 0.04) {
    b.failAt = time
    bell(NOTES[0] * 0.5, true)
    return
  }
  b.ember -= cost
  b.giveAt = time
  if (n.kind === 'ring') {
    RINGS[n.i].litAt = time
    bell(NOTES[4], false)
  } else {
    const f = FLOWERS[n.i]
    f.giftAt = time
    b.memFlights.push({ from: { x: f.x, z: f.z }, at: time + 0.9 })
    bell(NOTES[3], true)
  }
}

// ── Piloto automático (?auto) ────────────────────────────────────
type Way = { to: Pt; give?: boolean; wait?: () => boolean }
const AUTO_WAY: Way[] = [
  { to: { x: 1.5, z: 5 } },
  { to: { x: HEARTH.x - 0.6, z: HEARTH.z - 0.6 } }, // toma la brasa
  { to: { x: FLOWERS[0].x - 1.2, z: FLOWERS[0].z }, give: true }, // la primera flor
  { to: { x: RINGS[0].x + 0.5, z: RINGS[0].z - 0.5 }, wait: () => b.ember < b.max * 0.95 }, // se recarga
  { to: { x: RINGS[1].x - 1.2, z: RINGS[1].z - 1 }, give: true }, // enciende el segundo círculo
  { to: { x: RINGS[1].x, z: RINGS[1].z }, wait: () => b.ember < b.max * 0.95 },
  { to: { x: RINGS[2].x + 1.2, z: RINGS[2].z - 1 }, give: true },
  { to: { x: RINGS[2].x, z: RINGS[2].z }, wait: () => b.ember < b.max * 0.95 },
  { to: { x: RINGS[3].x - 1.2, z: RINGS[3].z - 1 }, give: true },
  { to: { x: 0, z: BOUNDS.zMax - 0.5 } },
]
let autoI = 0
let gaveAt = -1

function autopilot(dt: number) {
  const g = game
  if (autoI >= AUTO_WAY.length) {
    MOVE.set(0, 0, 0)
    return
  }
  const w = AUTO_WAY[autoI]
  MOVE.set(w.to.x - g.x, 0, w.to.z - g.z)
  const near = MOVE.length() < 0.45
  if (near) {
    MOVE.set(0, 0, 0)
    if (w.give && gaveAt !== autoI) {
      gaveAt = autoI
      input.interact = true
    } else if (!(w.wait?.() ?? false)) autoI++
  }
  input.camYaw += Math.atan2(Math.sin(g.yaw - input.camYaw), Math.cos(g.yaw - input.camYaw)) * damp(1.5, dt)
}
