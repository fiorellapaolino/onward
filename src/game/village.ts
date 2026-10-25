import * as THREE from 'three'
import { GIRL_DIST, GIRL_S, GIRL_SIDE, VILLAGE_S, besidePath, headingAt, pathAt, rng } from './config'

/*
 * Dónde está cada cosa de la aldea. Se calcula una sola vez.
 *   - casitas redondas con techo de paja, alrededor del sendero
 *   - faroles apagados a los lados del sendero (la sombra los apagó)
 *   - el árbol de la niña
 */

export type Hut = { x: number; z: number; rot: number; scale: number; seed: number }
export type Lantern = { x: number; z: number }

// [metros del sendero respecto al centro, lado, distancia al sendero, tamaño]
const HUT_SPOTS: [number, number, number, number][] = [
  [-3, -1, 6.5, 1.0],
  [2, 1, 7.5, 1.15],
  [6, -1, 8.5, 0.9],
  [9, 1, 6.2, 1.0],
  [-10, -1, 9, 0.85],
  [12, -1, 5.8, 0.95],
  [-1, 1, 12.5, 0.9],
  [5, -1, 14, 1.05],
]

export function buildHuts(): Hut[] {
  const r = rng(314)
  const out: Hut[] = []
  const p = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (const [ds, side, dist, scale] of HUT_SPOTS) {
    const s = VILLAGE_S + ds
    besidePath(s, side, dist, p)
    pathAt(s, c)
    // la puerta mira hacia el sendero
    const rot = Math.atan2(c.x - p.x, c.z - p.z) + (r() - 0.5) * 0.5
    out.push({ x: p.x, z: p.z, rot, scale, seed: Math.floor(r() * 1e6) })
  }
  return out
}

export function buildLanterns(): Lantern[] {
  const out: Lantern[] = []
  const p = new THREE.Vector3()
  for (let ds = -11; ds <= 13; ds += 6) {
    for (const side of [-1, 1]) {
      besidePath(VILLAGE_S + ds + (side > 0 ? 1.5 : 0), side, 2.1, p)
      out.push({ x: p.x, z: p.z })
    }
  }
  return out
}

/** La niña: sentada abrazando sus rodillas, al pie del árbol, mirando hacia el sendero. */
export const GIRL = (() => {
  const p = besidePath(GIRL_S, GIRL_SIDE, GIRL_DIST)
  const c = pathAt(GIRL_S - 2) // mira hacia el sendero, un poco hacia por donde llega la elfa
  return { x: p.x, z: p.z, rot: Math.atan2(c.x - p.x, c.z - p.z) }
})()

/** Su árbol, justo detrás de ella. */
export const GIRL_TREE = (() => {
  const p = besidePath(GIRL_S + 0.3, GIRL_SIDE, GIRL_DIST + 1.6)
  return { x: p.x, z: p.z, rot: headingAt(GIRL_S) }
})()

/** ¿Este punto cae encima de una casa, del árbol de la niña o de ella? (para no poner plantas encima) */
const HUTS = buildHuts()
export function blockedByVillage(x: number, z: number) {
  for (const h of HUTS) if (Math.hypot(x - h.x, z - h.z) < 2.6 * h.scale) return true
  if (Math.hypot(x - GIRL_TREE.x, z - GIRL_TREE.z) < 2.2) return true
  if (Math.hypot(x - GIRL.x, z - GIRL.z) < 1.2) return true
  return false
}
