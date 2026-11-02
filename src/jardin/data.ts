/*
 * El jardín que suena — los datos del juego.
 *
 * Restos de cocina y de jardín → la compostera → un compost distinto según la mezcla
 * → se pinta con él la tierra seca → crece una especie distinta, y cada especie trae su voz.
 *
 * La regla del compost (la de verdad, simplificada):
 *   verdes  = restos húmedos, ricos en nitrógeno (cáscaras de fruta, posos de café, césped)
 *   marrones = restos secos, ricos en carbono (hojas secas, cartón)
 *   cáscara de huevo = minerales (calcio)
 *   Un buen compost mezcla verdes y marrones. Si todo es verde queda húmedo (ahí salen hongos);
 *   si todo es marrón queda seco (solo aguanta la hierba y el trébol).
 *   Lo que no es orgánico (plástico, latas) no va en la compostera: va al contenedor amarillo.
 */

export type ScrapKind = 'green' | 'brown' | 'mineral' | 'reject'

export type ScrapId = 'peel' | 'coffee' | 'grass' | 'leaves' | 'cardboard' | 'egg' | 'bottle' | 'can'

export const SCRAPS: { id: ScrapId; kind: ScrapKind; color: string }[] = [
  { id: 'peel', kind: 'green', color: '#f0c53a' }, // cáscara de plátano
  { id: 'coffee', kind: 'green', color: '#4a2e1d' }, // posos de café
  { id: 'grass', kind: 'green', color: '#74b33e' }, // césped cortado
  { id: 'leaves', kind: 'brown', color: '#c8692a' }, // hojas secas
  { id: 'cardboard', kind: 'brown', color: '#b48d5c' }, // cartón
  { id: 'egg', kind: 'mineral', color: '#f3ecdc' }, // cáscara de huevo
  { id: 'bottle', kind: 'reject', color: '#7cc8ee' }, // botella de plástico (contenedor amarillo)
  { id: 'can', kind: 'reject', color: '#c3c8cf' }, // lata (contenedor amarillo)
]
export const scrapInfo = (id: ScrapId) => SCRAPS.find((s) => s.id === id)!

export type SpeciesId = 'grass' | 'mushroom' | 'flower' | 'fern' | 'bush' | 'tree'

export type Species = {
  id: SpeciesId
  icon: string // en el cuaderno de especies (sin texto: solo el dibujo)
  tint: string // color del compost y de sus chispas
  models: { name: string; w: number; scale: [number, number] }[] // modelos de Quaternius (w = cuánto sale)
  spacing: number // cada cuántos metros de trazo brota una
  weight: number // cuánto "llena" el jardín (abre la canción)
  voice: number // nota de su brote (índice en la escala)
}

export const SPECIES: Species[] = [
  {
    id: 'grass', icon: '🌾', tint: '#9fc95a', spacing: 0.32, weight: 0.35, voice: 0,
    models: [
      { name: 'Grass_Common_Short', w: 0.45, scale: [0.35, 0.5] },
      { name: 'Clover_1', w: 0.35, scale: [0.35, 0.48] },
      { name: 'Grass_Wispy_Short', w: 0.2, scale: [0.3, 0.42] },
    ],
  },
  {
    id: 'mushroom', icon: '🍄', tint: '#d9774f', spacing: 0.55, weight: 0.6, voice: 1,
    models: [
      { name: 'Mushroom_Common', w: 0.65, scale: [0.8, 1.25] },
      { name: 'Mushroom_Laetiporus', w: 0.3, scale: [0.38, 0.55] },
    ],
  },
  {
    id: 'flower', icon: '🌸', tint: '#f2a3c4', spacing: 0.45, weight: 0.7, voice: 2,
    models: [
      { name: 'Flower_3_Group', w: 0.45, scale: [0.3, 0.42] },
      { name: 'Flower_4_Group', w: 0.4, scale: [0.28, 0.4] },
      { name: 'Grass_Common_Short', w: 0.15, scale: [0.3, 0.42] },
    ],
  },
  {
    id: 'fern', icon: '🌿', tint: '#5fae73', spacing: 0.8, weight: 0.9, voice: 3,
    models: [
      { name: 'Fern_1', w: 0.6, scale: [0.09, 0.125] },
      { name: 'Plant_1_Big', w: 0.25, scale: [0.18, 0.26] },
      { name: 'Plant_7', w: 0.15, scale: [0.8, 1.1] },
    ],
  },
  {
    id: 'bush', icon: '🌼', tint: '#f3d65a', spacing: 1.3, weight: 1.6, voice: 4,
    models: [
      { name: 'Bush_Common_Flowers', w: 0.65, scale: [0.42, 0.6] },
      { name: 'Bush_Common', w: 0.35, scale: [0.42, 0.58] },
    ],
  },
  {
    id: 'tree', icon: '🌳', tint: '#7fd0e0', spacing: 3.2, weight: 5, voice: 5,
    models: [
      { name: 'CommonTree_1', w: 0.34, scale: [0.3, 0.38] },
      { name: 'CommonTree_2', w: 0.33, scale: [0.3, 0.38] },
      { name: 'CommonTree_3', w: 0.33, scale: [0.26, 0.32] },
    ],
  },
]
export const speciesInfo = (id: SpeciesId) => SPECIES.find((s) => s.id === id)!

/** Todos los modelos que pueden brotar (uno por "DynamicModel"). */
export const PLANT_MODELS = [...new Set(SPECIES.flatMap((s) => s.models.map((m) => m.name)))]

/** Lo que sale de la compostera según los tres restos que se echaron. */
export function recipe(mix: ScrapId[]): SpeciesId {
  const k = mix.map((id) => scrapInfo(id).kind)
  const greens = k.filter((x) => x === 'green').length
  const browns = k.filter((x) => x === 'brown').length
  const egg = k.includes('mineral')
  if (egg && greens >= 1 && browns >= 1) return 'tree' // la receta perfecta: verde + marrón + minerales
  if (greens === 3) return 'mushroom' // demasiado húmedo: hongos
  if (browns === 3 || (browns === 2 && egg)) return 'grass' // demasiado seco: solo hierba y trébol
  if (browns >= 1 && mix.includes('peel')) return 'flower' // fruta + seco: flores
  if (browns >= 1 && mix.includes('coffee')) return 'fern' // café + seco: helechos
  if (browns >= 1 && mix.includes('grass')) return 'bush' // césped + seco: arbustos
  return 'grass'
}

// ── El escenario (metros) ───────────────────────────────────────
export const ISLAND_R = 7 // el jardín: una isla redonda de tierra
export const BIN = { x: -5.6, z: 8.0 } // la compostera
export const YELLOW = { x: 5.6, z: 8.0 } // el contenedor amarillo (plástico y latas)
export const TRAY_Z = 10.3 // la tabla con los restos, delante del jardín
export const TRAY_STEP = 0.8 // separación entre restos en la tabla
export const BIN_SIZE = 3 // restos por tanda
export const HEAP_SLOTS = [
  { x: -3.4, z: 8.1 },
  { x: -4.7, z: 6.5 },
  { x: -7.0, z: 6.0 },
] // donde quedan los montones de compost listos
export const HEAP_PAINT = 26 // metros de trazo que pinta un montón
export const RICH_FULL = 300 // "peso" de plantas con el que la canción suena del todo

/** Árboles secos en el borde del bancal: reviven (se vuelven árboles verdes) cuando el jardín llega a "at". */
export const DEAD_TREES = [
  { x: -4.2, z: -5.1, at: 0.3, model: 'DeadTree_1' },
  { x: 1.2, z: -6.2, at: 0.55, model: 'DeadTree_2' },
  { x: 5.1, z: -4.1, at: 0.8, model: 'DeadTree_1' },
]
