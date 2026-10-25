import * as THREE from 'three'
import { GATES, GATE_KINDS, PATH_END, PATH_LEN, pathAt, rng, sideAt, smoothstep } from './config'
import { placeMatrix } from '../components/instancing'

/*
 * Dónde va cada árbol, planta y flor. Se calcula una sola vez con números
 * aleatorios "con semilla", así el bosque es siempre igual.
 *
 * Zonas del bosque (f = progreso de 0 a 1):
 *   0.00–0.33  bosque oscuro: árboles secos y pinos, hongos
 *   0.33–0.66  bosque medio: pinos y árboles comunes
 *   0.66–1.00  bosque luminoso: árboles comunes y muchas flores
 *   final      un claro abierto donde está la luz
 */

export type Placement = { model: string; s: number; matrix: THREE.Matrix4 }
export const CHUNK = 40 // metros por "bloque" de bosque (para dibujar solo lo cercano)

const DEAD = ['DeadTree_1', 'DeadTree_2', 'DeadTree_3']
const PINE = ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5']
const COMMON = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5']
const TWISTED = ['TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3']

const p = new THREE.Vector3()
const sd = new THREE.Vector3()

function placer(out: Placement[], r: () => number) {
  return (model: string, s: number, side: number, dist: number, scale: number, y = 0) => {
    pathAt(s, p)
    sideAt(s, sd)
    out.push({
      model,
      s,
      matrix: placeMatrix(p.x + sd.x * side * dist, y, p.z + sd.z * side * dist, r() * Math.PI * 2, scale),
    })
  }
}

const oneOf = <T,>(list: T[], r: () => number) => list[Math.floor(r() * list.length)]

/** ¿Hay un obstáculo de agua o barranco cerca? (ahí no ponemos plantas encima) */
function nearOpenGround(s: number) {
  return GATES.some((G, i) => (GATE_KINDS[i] === 'water' || GATE_KINDS[i] === 'chasm') && Math.abs(s - G) < 2.5)
}

export function buildTrees(): Placement[] {
  const r = rng(7)
  const out: Placement[] = []
  const add = placer(out, r)

  for (let s = -45; s < PATH_END + 70; s += 3) {
    const f = s / PATH_LEN
    const clearing = s > PATH_LEN - 14
    for (const side of [-1, 1]) {
      for (const row of [0, 1, 2]) {
        if (r() > [0.5, 0.55, 0.45][row]) continue
        let dist = row === 0 ? 4 + r() * 4 : row === 1 ? 9 + r() * 8 : 18 + r() * 16
        if (clearing) dist += 16 // el claro final queda abierto

        let model: string
        const x = r()
        if (f < 0.33) model = x < 0.4 ? oneOf(DEAD, r) : x < 0.9 || row === 0 ? oneOf(PINE, r) : oneOf(TWISTED, r)
        else if (f < 0.66) model = x < 0.45 ? oneOf(PINE, r) : x < 0.9 || row === 0 ? oneOf(COMMON, r) : oneOf(TWISTED, r)
        else model = x < 0.15 ? oneOf(PINE, r) : x < 0.9 || row === 0 ? oneOf(COMMON, r) : oneOf(TWISTED, r)

        if (model.startsWith('Twisted')) dist = Math.max(dist, 11 + r() * 6) // son enormes
        add(model, s + (r() - 0.5) * 2.5, side, dist, 0.85 + r() * 0.45)
      }
    }
  }
  return out
}

export function buildUndergrowth(): Placement[] {
  const r = rng(21)
  const out: Placement[] = []
  const add = placer(out, r)

  for (let s = -30; s < PATH_END + 40; s += 1.5) {
    const f = s / PATH_LEN
    const dark = f < 0.33
    const avoid = nearOpenGround(s)
    for (const side of [-1, 1]) {
      const near = (min: number, max: number) => {
        const d = min + r() * (max - min)
        return avoid ? Math.max(d, 8) : d
      }
      if (r() < 0.85) add(oneOf(['Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short'], r), s, side, near(1.6, 9), 0.35 + r() * 0.25)
      if (r() < 0.45) add(oneOf(['Grass_Common_Short', 'Grass_Wispy_Short'], r), s + 0.7, side, near(1.4, 5), 0.3 + r() * 0.2)
      if (r() < 0.16) add('Fern_1', s, side, near(3, 9), 0.35 + r() * 0.25)
      if (r() < 0.12) add('Bush_Common', s, side, near(3, 11), 0.7 + r() * 0.5)
      if (r() < 0.12) add(oneOf(['Plant_1_Big', 'Plant_7', 'Clover_1'], r), s, side, near(2, 8), 0.5 + r() * 0.4)
      if (r() < (dark ? 0.22 : 0.06)) add(oneOf(['Mushroom_Common', 'Mushroom_Laetiporus'], r), s, side, near(1.8, 6), 0.6 + r() * 0.6)
      if (r() < 0.05) add(oneOf(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'], r), s, side, near(6, 18), 0.5 + r() * 0.6, -0.2)
    }
  }

  // Hierba extra: matas densas al borde del sendero y salpicadas por el pasto
  for (let s = -20; s < PATH_END + 30; s += 0.6) {
    const avoid = nearOpenGround(s)
    for (const side of [-1, 1]) {
      if (r() < 0.7) {
        const d = avoid ? 8 + r() * 4 : 1.7 + r() * 1.6
        add(oneOf(['Grass_Common_Short', 'Grass_Wispy_Short', 'Grass_Common_Tall'], r), s + r() * 0.6, side, d, 0.28 + r() * 0.25)
      }
      if (r() < 0.55) add(oneOf(['Grass_Common_Short', 'Grass_Wispy_Short'], r), s + r() * 0.6, side, avoid ? 9 + r() * 10 : 3.2 + r() * 14, 0.3 + r() * 0.3)
      if (r() < 0.06) add('Clover_1', s, side, avoid ? 9 : 2 + r() * 6, 0.35 + r() * 0.2)
    }
  }

  // Donde nace: un pequeño círculo de hongos
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    out.push({ model: 'Mushroom_Common', s: 0, matrix: placeMatrix(Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9, a, 0.7 + r() * 0.4) })
  }
  return out
}

/** Flores que brotan cuando la elfa pasa a su lado. Cada vez más hacia el final. */
export function buildFlowers(): Placement[] {
  const r = rng(99)
  const out: Placement[] = []
  const add = placer(out, r)
  for (let s = 4; s < PATH_END; s += 1.2) {
    const f = s / PATH_LEN
    const chance = 0.06 + 0.75 * smoothstep(0.25, 0.9, f)
    if (nearOpenGround(s)) continue
    for (const side of [-1, 1]) {
      if (r() > chance) continue
      const dist = 1.3 + r() * 4
      const model = dist > 2.6 && r() < 0.3 ? 'Bush_Common_Flowers' : oneOf(['Flower_3_Group', 'Flower_4_Group'], r)
      add(model, s, side, dist, model === 'Bush_Common_Flowers' ? 0.45 + r() * 0.25 : 0.22 + r() * 0.15)
    }
  }
  return out
}

/** Agrupa por modelo y por bloque de CHUNK metros. */
export function groupByChunk(list: Placement[]) {
  const chunks = new Map<number, Map<string, THREE.Matrix4[]>>()
  for (const pl of list) {
    const c = Math.floor(pl.s / CHUNK)
    if (!chunks.has(c)) chunks.set(c, new Map())
    const byModel = chunks.get(c)!
    if (!byModel.has(pl.model)) byModel.set(pl.model, [])
    byModel.get(pl.model)!.push(pl.matrix)
  }
  return chunks
}
