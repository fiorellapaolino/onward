import * as THREE from 'three'
import { GIRL_DIST, GIRL_S, GIRL_SIDE, VILLAGE_S, besidePath, headingAt, pathAt, rng, sideAt, tangentAt } from './config'
import HOUSE_TYPES from './houseTypes.json'

/*
 * Dónde está cada cosa de la aldea. Se calcula una sola vez.
 *   - casas de entramado y piedra (Medieval Village MegaKit de Quaternius, CC0; tools/bake_houses.py
 *     las arma con las piezas del kit), alrededor del sendero, con la puerta mirando al camino
 *   - faroles apagados a los lados del sendero (la sombra los apagó)
 *   - el árbol de la niña
 */

export type HouseType = keyof typeof HOUSE_TYPES
/** Una casa: posición, giro (la puerta mira a su +Z), tamaño en el mundo y medio ancho / medio fondo en metros del mundo. */
export type Hut = { x: number; z: number; rot: number; scale: number; seed: number; type: HouseType; hx: number; hz: number }
/** Las casas del kit miden ~3 m de pared: se encogen para que la puerta tenga la altura de la elfa. */
export const HOUSE_SCALE = 0.55
export type Lantern = { x: number; z: number }

// [metros del sendero respecto al centro, lado, distancia al sendero, tamaño, tipo de casa]
const HUT_SPOTS: [number, number, number, number, HouseType][] = [
  [-3, -1, 6.5, 1.0, 'A'], // la del anciano
  [2, 1, 7.5, 1.0, 'B'],
  [6, -1, 8.5, 0.95, 'C'],
  [9.5, 1, 6.2, 1.0, 'A'],
  [-10, -1, 9, 0.95, 'C'],
  [12.5, -1, 6.2, 1.0, 'B'],
  [-1, 1, 13.5, 1.0, 'D'],
  [5, -1, 15, 1.0, 'D'],
]

export function buildHuts(): Hut[] {
  const r = rng(314)
  const out: Hut[] = []
  const p = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (const [ds, side, dist, size, type] of HUT_SPOTS) {
    const scale = HOUSE_SCALE * size
    const t = HOUSE_TYPES[type]
    const s = VILLAGE_S + ds
    besidePath(s, side, dist, p)
    pathAt(s, c)
    // la puerta mira hacia el sendero
    const rot = Math.atan2(c.x - p.x, c.z - p.z) + (r() - 0.5) * 0.5
    out.push({ x: p.x, z: p.z, rot, scale, seed: Math.floor(r() * 1e6), type, hx: t.hx * scale, hz: t.hz * scale })
  }
  return out
}

export function buildLanterns(): Lantern[] {
  const out: Lantern[] = []
  const p = new THREE.Vector3()
  for (let ds = -11; ds <= 13; ds += 6) {
    for (const side of [-1, 1]) {
      besidePath(VILLAGE_S + ds + (side > 0 ? 1.5 : 0), side, 2.1, p)
      // (ninguno junto a la niña: taparía la escena de la semilla)
      const g = besidePath(GIRL_S, GIRL_SIDE, GIRL_DIST)
      if (Math.hypot(p.x - g.x, p.z - g.z) < 3.5) continue
      out.push({ x: p.x, z: p.z })
    }
  }
  return out
}

/** Los faroles (siempre los mismos). */
export const LANTERNS = buildLanterns()

/** La niña: sentada en una piedra, al pie del árbol, mirando hacia el sendero. */
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

/** El anciano: sentado en un taburete junto a la puerta de la primera casa (a la derecha al entrar). */
export const ELDER_HUT = 0
export const ELDER = (() => {
  const h = buildHuts()[ELDER_HUT]
  // la puerta mira al sendero (rot) y está a la izquierda del frente; él se sienta delante, al otro lado
  const fx = Math.sin(h.rot)
  const fz = Math.cos(h.rot)
  const d = h.hz + 0.45
  const side = 0.6 // la puerta está en su X local negativa; él se sienta en la positiva
  return { x: h.x + fx * d + fz * side, z: h.z + fz * d - fx * side, rot: h.rot }
})()

/*
 * La plaza: el gran farol cuelga bajo, apagado, de un poste con una polea.
 * Dos cuerdas bajan hasta dos piedras, una a cada lado del sendero:
 * solo sube si se pisan las dos A LA VEZ (ella sola no llega: necesita a su sombra).
 */
export const POLE = besidePath(VILLAGE_S + 2.8, 1, 0.2)
export const PLATES = [besidePath(VILLAGE_S - 2, 1, 2.6), besidePath(VILLAGE_S + 4, -1, 2.4)]
export const PLATE_R = 0.75 // radio de cada piedra

/*
 * La música escondida: una mujer toca a escondidas en la casa de la izquierda, al fondo de la aldea.
 * Delante de su casa hay un círculo de campanas de piedra: cada una suena con una nota al pisarla.
 * Hay que tocar su melodía… y la sombra la repite detrás, como un canon.
 */
export const MUSIC_HUT = 3
// en un arco alrededor de un punto del sendero (así, al ir de una campana a otra no se pisa la de en medio)
const BELL_S = VILLAGE_S + 11.5
export const BELL_R = 0.38 // radio de cada campana
export const BELLS = Array.from({ length: 5 }, (_, i) => {
  const c = pathAt(BELL_S)
  const sd = sideAt(BELL_S)
  const t = tangentAt(BELL_S)
  const a = (i - 2) * 0.6 // de un extremo del arco al otro
  const r = 3.0
  // hacia la izquierda del sendero (donde está su casa), abriéndose hacia delante y hacia atrás
  return { x: c.x + (sd.x * Math.cos(a) + t.x * Math.sin(a)) * r, z: c.z + (sd.z * Math.cos(a) + t.z * Math.sin(a)) * r }
})
/** Su melodía: índices de las campanas (Mi, La, Sol, Do). */
export const MELODY = [2, 4, 3, 0]
/** Ella, cuando se atreve: de pie en su puerta. */
export const MUSICIAN = (() => {
  const h = buildHuts()[MUSIC_HUT]
  const fx = Math.sin(h.rot)
  const fz = Math.cos(h.rot)
  const d = h.hz + 0.35
  const side = -1.0 * h.scale // delante de la puerta (en su X local negativa)
  return { x: h.x + fx * d + fz * side, z: h.z + fz * d - fx * side, rot: h.rot }
})()

/** Cosas sólidas de la aldea (círculos en el suelo): la elfa no las atraviesa. */
export const COLLIDERS: { x: number; z: number; r: number }[] = [
  { x: GIRL_TREE.x, z: GIRL_TREE.z, r: 0.6 },
  { x: GIRL.x, z: GIRL.z, r: 0.75 },
  { x: ELDER.x, z: ELDER.z, r: 0.8 },
  ...LANTERNS.map((l) => ({ x: l.x, z: l.z, r: 0.2 })),
  { x: POLE.x, z: POLE.z, r: 0.3 },
]

/** Las casas son rectángulos sólidos (girados): x, z, giro, medio ancho y medio fondo. */
export const BOXES = buildHuts().map((h) => ({ x: h.x, z: h.z, rot: h.rot, hx: h.hx + 0.15, hz: h.hz + 0.15 }))

/** ¿El punto está dentro de un rectángulo girado (con margen)? */
export function inBox(b: { x: number; z: number; rot: number; hx: number; hz: number }, x: number, z: number, margin = 0) {
  const dx = x - b.x
  const dz = z - b.z
  const c = Math.cos(b.rot)
  const s = Math.sin(b.rot)
  const lx = dx * c - dz * s
  const lz = dx * s + dz * c
  return Math.abs(lx) < b.hx + margin && Math.abs(lz) < b.hz + margin
}

/** ¿Este punto cae encima de una casa, del árbol de la niña o de ella? (para no poner plantas encima) */
export function blockedByVillage(x: number, z: number) {
  for (const b of BOXES) if (inBox(b, x, z, 0.6)) return true
  if (Math.hypot(x - GIRL_TREE.x, z - GIRL_TREE.z) < 2.2) return true
  if (Math.hypot(x - GIRL.x, z - GIRL.z) < 3.5) return true // (sin plantas que la tapen: ahí se ve la escena de la semilla)
  if (Math.hypot(x - ELDER.x, z - ELDER.z) < 1.2) return true
  return false
}
