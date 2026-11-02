import * as THREE from 'three'
import { rng } from '../game/config'
import {
  BIN, BIN_SIZE, DEAD_TREES, HEAP_PAINT, HEAP_SLOTS, ISLAND_R, PLANT_MODELS, RICH_FULL, SCRAPS, SPECIES, TRAY_STEP, TRAY_Z, YELLOW,
  recipe, scrapInfo, speciesInfo, type ScrapId, type SpeciesId,
} from './data'
import { sfx } from './audio'

/*
 * El estado del jardín (objetos que se cambian cada frame, no estado de React).
 */

export type Slot = { id: ScrapId; x: number; z: number; back: number } // back: cuándo vuelve a aparecer (-1 = está)
export type Flying = { id: ScrapId; x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; to: 'bin' | 'yellow' | 'tray'; slot: number }
export type Heap = { species: SpeciesId; slot: number; left: number; born: number }
export type Plant = { model: number; species: SpeciesId; x: number; z: number; rot: number; scale: number; born: number }

export const j = {
  t: 0, // reloj del juego (segundos)
  started: false,
  slots: SCRAPS.map((s, i): Slot => ({ id: s.id, x: (i - (SCRAPS.length - 1) / 2) * TRAY_STEP, z: TRAY_Z, back: -1 })),
  bin: [] as ScrapId[], // lo que hay dentro de la compostera
  binWorkAt: -1, // cuándo empezó a compostar (-1 = abierta)
  binShakeAt: -99, // rechazó algo (la compostera se sacude)
  yellowAt: -99, // el contenedor amarillo recibió algo
  yellowShakeAt: -99,
  flying: [] as Flying[],
  heaps: [] as (Heap | null)[],
  plants: [] as Plant[],
  rich: 0, // 0..1: cuánto jardín hay (abre la canción)
  richSmooth: 0,
  found: new Set<SpeciesId>(),
  foundAt: {} as Partial<Record<SpeciesId, number>>,
  // lo que se está arrastrando
  drag: null as null | { kind: 'scrap'; slot: number; x: number; y: number; z: number } | { kind: 'paint'; heap: number; x: number; z: number; on: boolean; lastX: number; lastZ: number; acc: number },
  lastAction: 0, // para las pistas: cuándo hizo algo por última vez
  painted: 0, // metros pintados en total
  dropped: 0, // restos echados en total
  cam: { yaw: 0, zoom: 1 },
  revived: DEAD_TREES.map(() => -1), // cuándo revivió cada árbol seco
  hintScrap: -1, // el resto que señala la pista (late un poco)
}
HEAP_SLOTS.forEach(() => j.heaps.push(null))
;(window as unknown as { __jardin: typeof j }).__jardin = j

export const COMPOST_TIME = 3.2 // segundos que tarda en hacerse el compost

const r = rng(2026)

// ── Restos ──────────────────────────────────────────────────────

/** Suelta un resto en (x, z): en la compostera, en el contenedor amarillo, o vuelve a la tabla. */
export function dropScrap(slot: number, x: number, y: number, z: number) {
  const id = j.slots[slot].id
  const inBin = Math.hypot(x - BIN.x, z - BIN.z) < 1.5
  const inYellow = Math.hypot(x - YELLOW.x, z - YELLOW.z) < 1.5
  const kind = scrapInfo(id).kind
  j.lastAction = j.t
  if (inBin && kind !== 'reject' && j.bin.length < BIN_SIZE && j.binWorkAt < 0) {
    j.slots[slot].back = j.t + 0.9
    fly(id, x, y, z, BIN.x, BIN.z, 'bin', slot)
    return
  }
  if (inYellow && kind === 'reject') {
    j.slots[slot].back = j.t + 0.9
    fly(id, x, y, z, YELLOW.x, YELLOW.z, 'yellow', slot)
    return
  }
  // no va ahí (o la compostera está ocupada): rebota y vuelve a la tabla
  if (inBin) {
    j.binShakeAt = j.t
    sfx.reject()
  } else if (inYellow) {
    j.yellowShakeAt = j.t
    sfx.reject()
  }
  j.slots[slot].back = j.t + 99 // (vuelve volando; reaparece al llegar)
  fly(id, x, y, z, j.slots[slot].x, j.slots[slot].z, 'tray', slot)
}

function fly(id: ScrapId, x: number, y: number, z: number, tx: number, tz: number, to: Flying['to'], slot: number) {
  const T = to === 'tray' ? 0.55 : 0.4
  const ty = to === 'tray' ? 0.2 : 1.3
  const vy = (ty - y) / T + 0.5 * 14 * T
  j.flying.push({ id, x, y, z, vx: (tx - x) / T, vy, vz: (tz - z) / T, t: T, to, slot })
}

function land(f: Flying) {
  if (f.to === 'bin') {
    j.bin.push(f.id)
    j.dropped++
    sfx.thud(j.bin.length)
    if (j.bin.length >= BIN_SIZE) j.binWorkAt = j.t
  } else if (f.to === 'yellow') {
    j.yellowAt = j.t
    sfx.sorted()
  } else {
    j.slots[f.slot].back = j.t
  }
}

// ── La compostera ───────────────────────────────────────────────

function binStep() {
  if (j.binWorkAt < 0 || j.t - j.binWorkAt < COMPOST_TIME) return
  const free = j.heaps.findIndex((h) => !h)
  if (free < 0) return // no hay sitio para otro montón: espera
  const species = recipe(j.bin)
  j.heaps[free] = { species, slot: free, left: HEAP_PAINT, born: j.t }
  j.bin = []
  j.binWorkAt = -1
  const isNew = !j.found.has(species)
  j.found.add(species)
  if (isNew) j.foundAt[species] = j.t
  sfx.ready(speciesInfo(species).voice, isNew)
  console.log(`[jardin] compost → ${species}${isNew ? ' (nueva)' : ''}`)
}

// ── Pintar con compost ──────────────────────────────────────────

/** Arrastrando un montón: pinta la tierra por donde pasa y siembra su especie. */
export function paintTo(x: number, z: number) {
  const d = j.drag
  if (!d || d.kind !== 'paint') return
  const heap = j.heaps[d.heap]
  if (!heap) return
  const onIsland = Math.hypot(x, z) < ISLAND_R - 0.25
  if (!onIsland) {
    d.on = false
    d.x = x
    d.z = z
    return
  }
  if (!d.on) {
    d.on = true
    d.lastX = x
    d.lastZ = z
    d.acc = 1e3 // la primera pincelada siembra ya
  }
  const sp = speciesInfo(heap.species)
  const step = Math.min(Math.hypot(x - d.lastX, z - d.lastZ), 3)
  const n = Math.max(1, Math.ceil(step / 0.15))
  for (let k = 1; k <= n; k++) {
    const px = d.lastX + ((x - d.lastX) * k) / n
    const pz = d.lastZ + ((z - d.lastZ) * k) / n
    paintSoil(px, pz, sp.tint)
  }
  d.acc += step
  heap.left -= step
  j.painted += step
  if (step > 0.01) sfx.rustle()
  while (d.acc >= sp.spacing) {
    d.acc = d.acc >= 1e3 ? sp.spacing : d.acc
    d.acc -= sp.spacing
    sow(sp.id, x, z)
  }
  d.x = x
  d.z = z
  d.lastX = x
  d.lastZ = z
  j.lastAction = j.t
  if (heap.left <= 0) {
    j.heaps[d.heap] = null
    j.drag = null
  }
}

/** Brota una planta de la especie cerca de (x, z). */
export function sow(species: SpeciesId, x: number, z: number) {
  const sp = speciesInfo(species)
  const spread = species === 'tree' ? 0.4 : 0.6
  const ang = r() * Math.PI * 2
  const dd = Math.sqrt(r()) * spread
  const px = x + Math.cos(ang) * dd
  const pz = z + Math.sin(ang) * dd
  if (Math.hypot(px, pz) > ISLAND_R - 0.35) return
  // los árboles necesitan sitio
  if (species === 'tree' && j.plants.some((p) => p.species === 'tree' && Math.hypot(p.x - px, p.z - pz) < 2.4)) return
  let u = r()
  let m = 0
  while (m < sp.models.length - 1 && u > sp.models[m].w) u -= sp.models[m++].w
  const model = sp.models[m]
  const [a, b] = model.scale
  j.plants.push({
    model: PLANT_INDEX[model.name], species, x: px, z: pz, rot: r() * Math.PI * 2,
    scale: a + r() * (b - a), born: j.t + 0.15 + r() * 0.5,
  })
  if (j.plants.length % 3 === 0 || species === 'tree' || species === 'bush') sfx.sprout(sp.voice, px)
  updateRich()
}

export const PLANT_INDEX: Record<string, number> = Object.fromEntries(PLANT_MODELS.map((n, i) => [n, i]))

function updateRich() {
  let w = 0
  for (const p of j.plants) w += speciesInfo(p.species).weight
  // la variedad cuenta: un jardín de una sola especie no abre la canción del todo
  const variety = 0.55 + 0.45 * (j.found.size / SPECIES.length)
  j.rich = Math.min(1, (w / RICH_FULL) * variety + j.found.size * 0.02)
}

// ── La tierra pintada ───────────────────────────────────────────
export const SOIL_PX = 768
let soilCanvas: HTMLCanvasElement | null = null
let soilCtx: CanvasRenderingContext2D | null = null
export let soilTexture: THREE.CanvasTexture | null = null
let soilDirty = false

export function getSoilTexture() {
  if (soilTexture) return soilTexture
  soilCanvas = document.createElement('canvas')
  soilCanvas.width = soilCanvas.height = SOIL_PX
  soilCtx = soilCanvas.getContext('2d')!
  const c = soilCtx
  // tierra seca y agrietada
  c.fillStyle = '#9a8a74'
  c.fillRect(0, 0, SOIL_PX, SOIL_PX)
  const rr = rng(5)
  for (let i = 0; i < 2600; i++) {
    const v = 120 + Math.floor(rr() * 40)
    c.fillStyle = `rgba(${v + 12},${v},${v - 18},${0.25 + rr() * 0.3})`
    c.fillRect(rr() * SOIL_PX, rr() * SOIL_PX, 2 + rr() * 6, 2 + rr() * 6)
  }
  c.strokeStyle = 'rgba(70,58,44,0.45)'
  c.lineWidth = 1.6
  for (let i = 0; i < 70; i++) {
    let x = rr() * SOIL_PX
    let y = rr() * SOIL_PX
    let a = rr() * Math.PI * 2
    c.beginPath()
    c.moveTo(x, y)
    for (let k = 0; k < 5; k++) {
      a += (rr() - 0.5) * 1.4
      x += Math.cos(a) * (10 + rr() * 18)
      y += Math.sin(a) * (10 + rr() * 18)
      c.lineTo(x, y)
    }
    c.stroke()
  }
  soilTexture = new THREE.CanvasTexture(soilCanvas)
  soilTexture.colorSpace = THREE.SRGBColorSpace
  soilTexture.anisotropy = 4
  return soilTexture
}

function toPx(x: number, z: number) {
  return [((x + ISLAND_R) / (2 * ISLAND_R)) * SOIL_PX, ((z + ISLAND_R) / (2 * ISLAND_R)) * SOIL_PX] as const
}

function paintSoil(x: number, z: number, tint: string) {
  if (!soilCtx) return
  const [px, py] = toPx(x, z)
  const rad = (0.85 / (2 * ISLAND_R)) * SOIL_PX
  const g = soilCtx.createRadialGradient(px, py, 0, px, py, rad)
  g.addColorStop(0, 'rgba(52,36,24,0.55)')
  g.addColorStop(0.65, 'rgba(60,42,28,0.35)')
  g.addColorStop(1, 'rgba(60,42,28,0)')
  soilCtx.fillStyle = g
  soilCtx.beginPath()
  soilCtx.arc(px, py, rad, 0, Math.PI * 2)
  soilCtx.fill()
  // un poco del color de su especie en la tierra húmeda
  soilCtx.fillStyle = tint
  soilCtx.globalAlpha = 0.05
  soilCtx.beginPath()
  soilCtx.arc(px + (r() - 0.5) * rad, py + (r() - 0.5) * rad, rad * 0.4, 0, Math.PI * 2)
  soilCtx.fill()
  soilCtx.globalAlpha = 1
  soilDirty = true
}

// ── Cada frame ──────────────────────────────────────────────────
export function gardenStep(dt: number) {
  j.t += dt
  for (let i = j.flying.length - 1; i >= 0; i--) {
    const f = j.flying[i]
    f.vy -= 14 * dt
    f.x += f.vx * dt
    f.y += f.vy * dt
    f.z += f.vz * dt
    f.t -= dt
    if (f.t <= 0) {
      j.flying.splice(i, 1)
      land(f)
    }
  }
  binStep()
  // los árboles secos del borde reviven
  DEAD_TREES.forEach((d, i) => {
    if (j.revived[i] >= 0 || j.rich < d.at) return
    j.revived[i] = j.t
    const m = speciesInfo('tree').models[i % 3]
    j.plants.push({ model: PLANT_INDEX[m.name], species: 'tree', x: d.x, z: d.z, rot: i * 2.1, scale: m.scale[1] * 1.1, born: j.t + 0.6 })
    sfx.ready(5, false)
    console.log(`[jardin] revive el árbol ${i}`)
  })
  j.richSmooth += (j.rich - j.richSmooth) * Math.min(1, dt * 0.6)
  if (soilDirty && soilTexture) {
    soilTexture.needsUpdate = true
    soilDirty = false
  }
}
