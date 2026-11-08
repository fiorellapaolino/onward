import * as THREE from 'three'
import { GIRL_DIST, GIRL_S, GIRL_SIDE, STAIR_END, STAIR_Z0, STREET_YAW, TERRACE_END, VILLAGE_S, besidePath, headingAt, pathAt, rng, sideAt, streetCenter, streetToWorld, tangentAt, worldToStreet } from './config'
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
const TERRACE_CENTER = (TERRACE_END - STAIR_Z0) / 2

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

/** Las casitas del kit que siguen en pie: al fondo de la entrada (el resto ahora es la calle de casas altas). */
const KEEP_HUTS = [0, 4, 6]
export function buildHuts(): Hut[] {
  return buildAllHuts().filter((_, i) => KEEP_HUTS.includes(i))
}

/*
 * Las casas altas de entramado (se arman en StreetScene.tsx). Coordenadas de la calle:
 * lx hacia la izquierda, lz escalera arriba (0 = primer escalón). La puerta mira a su +z.
 */
export type TallHouse = { lx: number; lz: number; lrot: number; w: number; d: number; floors: number; gableFront: boolean; onTerrace: boolean }
export const TALL_HOUSES: TallHouse[] = [
  // en la calle, a la izquierda: la grande, de costado a la calle
  { lx: 7.6, lz: -8.5, lrot: -Math.PI / 2, w: 8.5, d: 6.2, floors: 3, gableFront: true, onTerrace: false },
  { lx: 8.8, lz: -18.5, lrot: -Math.PI / 2, w: 6.5, d: 6.2, floors: 2, gableFront: false, onTerrace: false },
  // en la terraza
  { lx: -9.5, lz: 8.5, lrot: 0, w: 11, d: 7.5, floors: 3, gableFront: false, onTerrace: true },
  { lx: 7, lz: 7.8, lrot: 0, w: 7, d: 6.5, floors: 2, gableFront: true, onTerrace: true },
  { lx: 3.9, lz: 16.6, lrot: 0, w: 4.2, d: 4, floors: 3, gableFront: true, onTerrace: true },
  { lx: -22, lz: 11, lrot: 0.1, w: 9, d: 7, floors: 2, gableFront: true, onTerrace: true },
  { lx: 18, lz: 11, lrot: -0.1, w: 9, d: 7, floors: 3, gableFront: false, onTerrace: true },
  { lx: -7.5, lz: 15.9, lrot: 0, w: 6, d: 2.8, floors: 3, gableFront: true, onTerrace: true },
]
// Las casas de la entrada: mismo frente y misma puerta que las casitas de antes (el anciano sigue en la suya),
// pero más anchas y crecen hacia atrás.
;[
  { hut: 0, w: 5.4, d: 5.2, floors: 2, gableFront: false },
  { hut: 1, w: 6, d: 5.5, floors: 2, gableFront: true },
  { hut: 2, w: 7, d: 5.5, floors: 3, gableFront: false },
].forEach(({ hut, w, d, floors, gableFront }) => {
  const h = buildHuts()[hut]
  const back = d / 2 - h.hz
  const c = worldToStreet(h.x - Math.sin(h.rot) * back, h.z - Math.cos(h.rot) * back)
  TALL_HOUSES.push({ lx: c.lx, lz: c.lz, lrot: h.rot - STREET_YAW, w, d, floors, gableFront, onTerrace: false })
})

const tallBoxes = TALL_HOUSES.filter((h) => !h.onTerrace).map((h) => {
  const p = streetToWorld(h.lx, h.lz)
  const j = 0.17 * h.floors + 0.15
  return { x: p.x, z: p.z, rot: STREET_YAW + h.lrot, hx: h.w / 2 + j, hz: h.d / 2 + j }
})

function buildAllHuts(): Hut[] {
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
  for (let ds = -11; ds <= 1; ds += 6) { // (más allá está la calle de casas altas)
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

/** Dónde quedarse quieta para que baje una semilla del árbol de la niña (un círculo de luz en el suelo). */
export const SEED_SPOT = besidePath(GIRL_S + 2, GIRL_SIDE, GIRL_DIST + 0.3)
/** Radio del círculo: dentro y quieta, la semilla baja. */
export const SPOT_R = 0.95

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
export const POLE = besidePath(VILLAGE_S + 1, 1, 3.3) // (a un lado: no tapa la escalera)
// (la sombra va ECHO_DELAY segundos detrás: caminando sin correr tiene que dar tiempo de ir de una a la otra)
// (y sin faroles encima: chocar con el poste la desvía al pisar la piedra)
export const PLATES = [besidePath(VILLAGE_S, 1, 2.4), besidePath(VILLAGE_S - 0.8, -1, 2.2)]
export const PLATE_R = 0.85 // radio de cada piedra

/*
 * La música escondida: una mujer toca a escondidas en la casa de la izquierda, al fondo de la aldea.
 * Delante de su casa hay un círculo de campanas de piedra: cada una suena con una nota al pisarla.
 * Hay que tocar su melodía… y la sombra la repite detrás, como un canon.
 */
export const MUSIC_HUT = 3
// en un arco alrededor de un punto del sendero (así, al ir de una campana a otra no se pisa la de en medio)
const BELL_S = VILLAGE_S - 6
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
  const h = buildAllHuts()[MUSIC_HUT]
  const fx = Math.sin(h.rot)
  const fz = Math.cos(h.rot)
  const d = h.hz + 0.35
  const side = -1.0 * h.scale // delante de la puerta (en su X local negativa)
  return { x: h.x + fx * d + fz * side, z: h.z + fz * d - fx * side, rot: h.rot }
})()

/*
 * La herrería: a un lado de la calle, antes de la plaza. El herrero tiene la llave del portal viejo.
 * Coordenadas propias: (lx, lz) con lz hacia el sendero (el frente) y lx a lo largo del sendero.
 */
const FORGE_S = VILLAGE_S - 16
const FORGE_SIDE = -1
const FORGE_DIST = 4.3
export const FORGE = (() => {
  const c = besidePath(FORGE_S, FORGE_SIDE, FORGE_DIST)
  const p = pathAt(FORGE_S)
  return { x: c.x, z: c.z, rot: Math.atan2(p.x - c.x, p.z - c.z) }
})()
/** Un punto de la herrería en el mundo. */
export function forgeAt(lx: number, lz: number) {
  const c = Math.cos(FORGE.rot)
  const s = Math.sin(FORGE.rot)
  return { x: FORGE.x + lx * c + lz * s, z: FORGE.z - lx * s + lz * c }
}
export const ANVIL = forgeAt(0, 0)
export const FURNACE = forgeAt(0, -2)
export const BELLOWS = forgeAt(1.7, -1.4) // pararse aquí y apretar E: aviva el fuego
export const FORGE_R = 0.75 // radio de la piedra del fuelle
/** La piedra baja donde el herrero deja la llave al rojo, delante del yunque (se enfría bajo su sombra). */
export const COOL_STONE = forgeAt(0, 1.7)
/** La boca del horno: de ahí sale la luz que proyecta su sombra. */
export const FIRE_MOUTH = forgeAt(0, -1.3)
/** Su sombra, proyectada por el fuego del horno: largo y ancho (metros). */
export const FORGE_SHADOW = { len: 2.8, half: 0.32 }
/** ¿La sombra de la elfa (parada en px, pz) cae sobre el punto (kx, kz)? La luz sale de la boca del horno. */
export function shadowCovers(px: number, pz: number, kx: number, kz: number) {
  const ux = px - FIRE_MOUTH.x
  const uz = pz - FIRE_MOUTH.z
  const ul = Math.hypot(ux, uz)
  if (ul < 0.3) return false
  const dx = ux / ul
  const dz = uz / ul
  // el punto, visto desde ella: tiene que estar detrás (del lado contrario al fuego), cerca de la línea
  const along = (kx - px) * dx + (kz - pz) * dz
  const across = Math.abs((kx - px) * dz - (kz - pz) * dx)
  return along > -0.1 && along < FORGE_SHADOW.len && across < FORGE_SHADOW.half
}
/** A esta distancia del yunque se le puede pedir que forje, o tomar la llave. */
export const ANVIL_R = 1.7
export const SMITH = (() => {
  const p = forgeAt(0.4, -0.95)
  return { x: p.x, z: p.z, rot: Math.atan2(ANVIL.x - p.x, ANVIL.z - p.z) + 0.35 }
})()

/** Cosas sólidas de la aldea (círculos en el suelo): la elfa no las atraviesa. */
export const COLLIDERS: { x: number; z: number; r: number }[] = [
  { x: GIRL_TREE.x, z: GIRL_TREE.z, r: 0.6 },
  { x: ELDER.x, z: ELDER.z, r: 0.8 },
  ...LANTERNS.map((l) => ({ x: l.x, z: l.z, r: 0.2 })),
  { x: POLE.x, z: POLE.z, r: 0.3 },
  { x: ANVIL.x, z: ANVIL.z, r: 0.5 },
  { x: FURNACE.x, z: FURNACE.z, r: 1.0 },
  { x: SMITH.x, z: SMITH.z, r: 0.45 },
]

/** Las casas son rectángulos sólidos (girados): x, z, giro, medio ancho y medio fondo. */
export const BOXES = tallBoxes

/** Lo que la cámara no atraviesa: todas las casas (también las de la terraza). */
export const CAMERA_BOXES = TALL_HOUSES.map((h) => {
  const p = streetToWorld(h.lx, h.lz)
  const j = 0.17 * h.floors + 0.15
  return { x: p.x, z: p.z, rot: STREET_YAW + h.lrot, hx: h.w / 2 + j, hz: h.d / 2 + j }
})
/** Los dos bloques de la terraza: la cámara no los atraviesa mientras la elfa está abajo. */
export const TERRACE_BOXES = [1, -1].map((side) => {
  const p = streetToWorld(side * (1.8 + 23), TERRACE_CENTER)
  return { x: p.x, z: p.z, rot: STREET_YAW, hx: 23, hz: TERRACE_CENTER }
})

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
  // (la terraza y sus muros: nada de árboles atravesándola; y un poco de aire delante)
  if (z > STAIR_Z0 - 5 && z < STAIR_END + 2 && Math.abs(x - streetCenter(z)) < 50) return true
  for (const b of BOXES) if (inBox(b, x, z, 0.6)) return true
  if (Math.hypot(x - GIRL_TREE.x, z - GIRL_TREE.z) < 2.2) return true
  if (Math.hypot(x - GIRL.x, z - GIRL.z) < 3.5) return true // (sin plantas que la tapen: ahí se ve la escena de la semilla)
  if (Math.hypot(x - ELDER.x, z - ELDER.z) < 1.2) return true
  return false
}
