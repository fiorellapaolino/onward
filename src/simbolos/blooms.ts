import * as THREE from 'three'
import { rng } from '../game/config'

/*
 * Lo que florece a su paso.
 *   - plantas: hierba, tréboles y flores de Quaternius que brotan y crecen
 *   - "mapa de vida": una textura donde se pinta verde cada vez que pisa,
 *     para que el suelo gris se vuelva pasto bajo su camino (y se vea desde arriba)
 */

export const BLOOM_MODELS = ['Grass_Common_Short', 'Clover_1', 'Flower_3_Group', 'Flower_4_Group', 'Grass_Wispy_Short'] as const
const WEIGHTS = [0.34, 0.2, 0.2, 0.14, 0.12]
const SCALES: [number, number][] = [
  [0.35, 0.55],
  [0.35, 0.5],
  [0.4, 0.62],
  [0.4, 0.62],
  [0.3, 0.45],
]
export const MAX_PER_MODEL = 1600

export type Bloom = { x: number; z: number; rot: number; scale: number; born: number }
export const blooms: Bloom[][] = BLOOM_MODELS.map(() => [])

const r = rng(77)

/** Brota algo cerca de (x, z). */
export function spawnBloom(x: number, z: number, time: number) {
  let u = r()
  let m = 0
  while (m < WEIGHTS.length - 1 && u > WEIGHTS[m]) u -= WEIGHTS[m++]
  const list = blooms[m]
  if (list.length >= MAX_PER_MODEL) return
  const [a, b] = SCALES[m]
  const ang = r() * Math.PI * 2
  const d = Math.sqrt(r()) * 0.55
  list.push({ x: x + Math.cos(ang) * d, z: z + Math.sin(ang) * d, rot: r() * Math.PI * 2, scale: a + r() * (b - a), born: time })
  paintLife(x, z)
}

// ── Mapa de vida ─────────────────────────────────────────────────
export const LIFE = { cx: 0, cz: 16, size: 90, px: 1024 }
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
export let lifeTexture: THREE.CanvasTexture | null = null

export function getLifeTexture() {
  if (lifeTexture) return lifeTexture
  canvas = document.createElement('canvas')
  canvas.width = canvas.height = LIFE.px
  ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, LIFE.px, LIFE.px)
  lifeTexture = new THREE.CanvasTexture(canvas)
  lifeTexture.colorSpace = THREE.SRGBColorSpace
  return lifeTexture
}

const GREENS = ['#6f9a3f', '#7fab48', '#5f8a37', '#8db552']
function paintLife(x: number, z: number) {
  if (!ctx || !lifeTexture) return
  // (x, z) del mundo → píxel; la textura se ve desde arriba con +z hacia arriba
  const u = ((x - LIFE.cx) / LIFE.size + 0.5) * LIFE.px
  const v = (0.5 - (z - LIFE.cz) / LIFE.size) * LIFE.px
  const rad = (0.9 + r() * 0.6) * (LIFE.px / LIFE.size)
  const g = ctx.createRadialGradient(u, v, 0, u, v, rad)
  const c = GREENS[Math.floor(r() * GREENS.length)]
  g.addColorStop(0, c)
  g.addColorStop(0.6, c + 'cc')
  g.addColorStop(1, c + '00')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(u, v, rad, 0, Math.PI * 2)
  ctx.fill()
  lifeTexture.needsUpdate = true
}
