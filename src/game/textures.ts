import * as THREE from 'three'
import { rng } from './config'

/*
 * Texturas de materiales generadas por código: cada una da el color y su relieve (bumpMap).
 * Todas se repiten sin costura. Nada de contornos dibujados: la variación sale de ruido.
 */
export type Surface = { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }

/** Ruido suave repetible: suma de varias escalas. */
export function makeNoise(seed: number) {
  const r = rng(seed)
  const N = 256
  const table = Float32Array.from({ length: N * N }, () => r())
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const layer = (x: number, y: number, period: number) => {
    const px = x * period
    const py = y * period
    const ix = Math.floor(px)
    const iy = Math.floor(py)
    const at = (a: number, b: number) => table[((((a % period) + period) % period) * 7919 + (((b % period) + period) % period) * 104729 + period * 31 + seed * 523) % (N * N)]
    const fx = smooth(px - ix)
    const fy = smooth(py - iy)
    const top = at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx
    const low = at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx
    return top * (1 - fy) + low * fy
  }
  /** x, y de 0 a 1. Devuelve 0..1 (más o menos). */
  return (x: number, y: number, period = 4, octaves = 4) => {
    let sum = 0
    let amp = 1
    let total = 0
    let p = period
    for (let i = 0; i < octaves; i++) {
      sum += layer(x, y, p) * amp
      total += amp
      amp *= 0.5
      p *= 2
    }
    return sum / total
  }
}

function finish(size: number, fill: (x: number, y: number, rgb: number[]) => number): Surface {
  const color = document.createElement('canvas')
  const height = document.createElement('canvas')
  color.width = color.height = height.width = height.height = size
  const cc = color.getContext('2d')!
  const hc = height.getContext('2d')!
  const ci = cc.createImageData(size, size)
  const hi = hc.createImageData(size, size)
  const rgb = [0, 0, 0]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = fill(x / size, y / size, rgb)
      const i = (y * size + x) * 4
      ci.data[i] = rgb[0]
      ci.data[i + 1] = rgb[1]
      ci.data[i + 2] = rgb[2]
      ci.data[i + 3] = 255
      const v = Math.max(0, Math.min(255, h * 255))
      hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = v
      hi.data[i + 3] = 255
    }
  }
  cc.putImageData(ci, 0, 0)
  hc.putImageData(hi, 0, 0)
  const tune = (t: THREE.CanvasTexture) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8 // (de lejos y en ángulo, sin centelleo al moverse)
    return t
  }
  const map = tune(new THREE.CanvasTexture(color))
  map.colorSpace = THREE.SRGBColorSpace
  return { map, bump: tune(new THREE.CanvasTexture(height)) }
}

type Rock = { rows: number; cols: number; seed: number; base: number[]; mortar: number[]; spread: number; round: number; gap: number }

/** Bloques o adoquines: hiladas desplazadas, cada pieza con su tono, juntas hundidas y superficie áspera. */
function masonry({ rows, cols, seed, base, mortar, spread, round, gap }: Rock) {
  const noise = makeNoise(seed)
  const r = rng(seed + 1)
  const tone = Array.from({ length: rows * cols * 2 }, () => [r(), r(), r()])
  // el borde de cada hilada es irregular: no hay líneas perfectas
  return finish(512, (u, v, out) => {
    const wx = u + (noise(u, v, 6, 2) - 0.5) * 0.03
    const wy = v + (noise(u + 0.37, v, 6, 2) - 0.5) * 0.03
    const fy = ((wy % 1) + 1) % 1
    const row = Math.floor(fy * rows)
    const shift = row % 2 ? 0.5 : 0
    const fx = (((wx * cols + shift) % cols) + cols) % cols
    const col = Math.floor(fx)
    const [t, warm, bias] = tone[(row * cols + col) % tone.length]
    const dx = Math.min(fx - col, col + 1 - fx)
    const dy = Math.min(fy * rows - row, row + 1 - fy * rows)
    const corner = round > 0 ? Math.hypot(Math.max(0, round - dx), Math.max(0, round - dy)) - round : -Math.min(dx, dy)
    const edge = THREE.MathUtils.smoothstep(-corner, gap, gap + 0.09)
    const grain = noise(u, v, 16, 4)
    const stain = noise(u + 0.2, v + 0.6, 3, 3)
    const shade = (0.72 + (t - 0.5) * spread + (grain - 0.5) * 0.5) * (0.82 + stain * 0.32)
    for (let c = 0; c < 3; c++) {
      const b = base[c] * shade * (c === 0 ? 1 + (warm - 0.5) * 0.1 : c === 2 ? 1 - (warm - 0.5) * 0.14 : 1)
      out[c] = mortar[c] * (0.8 + grain * 0.4) + (b - mortar[c]) * edge
    }
    return edge * (0.62 + bias * 0.14) + grain * 0.24
  })
}

export const stoneWall = () => masonry({ rows: 7, cols: 4, seed: 11, base: [214, 192, 156], mortar: [108, 92, 70], spread: 0.32, round: 0.1, gap: 0.03 })
export const cobbles = () => masonry({ rows: 9, cols: 8, seed: 23, base: [205, 188, 158], mortar: [92, 78, 58], spread: 0.3, round: 0.3, gap: 0.05 })
export const dressedStone = () => masonry({ rows: 3, cols: 2, seed: 37, base: [205, 192, 168], mortar: [120, 108, 90], spread: 0.1, round: 0, gap: 0.01 })

/** Revoque viejo: manchas, zonas lavadas y grietas finas. */
export function plaster() {
  const noise = makeNoise(41)
  return finish(512, (u, v, out) => {
    const big = noise(u, v, 3, 4)
    const fine = noise(u + 0.5, v, 28, 3)
    const streak = noise(u * 1, v * 0.25, 12, 2)
    const crackA = Math.abs(noise(u, v + 0.3, 5, 4) - 0.5)
    const crack = 1 - THREE.MathUtils.smoothstep(crackA, 0.003, 0.009)
    const shade = 0.82 + big * 0.2 + (fine - 0.5) * 0.08 - Math.max(0, streak - 0.55) * 0.3 - crack * 0.16
    out[0] = 240 * shade
    out[1] = 214 * shade
    out[2] = 168 * shade
    return 0.5 + (fine - 0.5) * 0.5 + (big - 0.5) * 0.3 - crack * 0.3
  })
}

/** Tejas de barro: cada una con su tono, solapadas, con musgo y suciedad en las juntas. */
export function clayTiles() {
  const noise = makeNoise(53)
  const r = rng(54)
  const ROWS = 8
  const COLS = 6
  const tone = Array.from({ length: ROWS * COLS }, () => [r(), r()])
  return finish(512, (u, v, out) => {
    const fy = v * ROWS
    const row = Math.floor(fy)
    const fx = (u * COLS + (row % 2 ? 0.5 : 0)) % COLS
    const col = Math.floor(fx)
    const [t, w] = tone[(row * COLS + col) % tone.length]
    const across = fx - col - 0.5
    const along = fy - row
    const arch = Math.cos(across * Math.PI) // el lomo de la teja
    const lip = THREE.MathUtils.smoothstep(along, 0, 0.22) // sombra bajo la hilada de arriba
    const dirt = noise(u, v, 8, 4)
    const moss = THREE.MathUtils.smoothstep(noise(u + 0.3, v + 0.1, 5, 4), 0.58, 0.72) * (1 - arch * 0.4)
    const shade = (0.5 + arch * 0.34) * (0.45 + lip * 0.55) * (0.78 + t * 0.34) * (0.78 + dirt * 0.4)
    const base = [186 + w * 28, 96 + w * 26, 62 + w * 8]
    const lichen = [92, 96, 58]
    for (let c = 0; c < 3; c++) out[c] = (base[c] + (lichen[c] - base[c]) * moss * 0.7) * shade * 1.15
    return (0.25 + arch * 0.5) * (0.35 + lip * 0.65) + dirt * 0.1
  })
}

/** Madera vieja y oscura: vetas largas y grietas. */
export function oldWood() {
  const noise = makeNoise(67)
  return finish(512, (u, v, out) => {
    const grain = noise(u * 1, v * 0.06, 34, 3)
    const ring = Math.sin((u * 26 + noise(u, v * 0.12, 8, 3) * 7) * Math.PI)
    const blotch = noise(u, v, 4, 3)
    const shade = 0.55 + grain * 0.5 + ring * 0.07 + (blotch - 0.5) * 0.3
    out[0] = 72 * shade
    out[1] = 50 * shade
    out[2] = 34 * shade
    return 0.3 + grain * 0.55 + ring * 0.1
  })
}
