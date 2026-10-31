import type { Pt, SymbolName } from './recognizer'

/*
 * Prototipo "El bosque que se dibuja" — zonas 1 (tierra) y 4 (fuego).
 *
 *   inicio (0, 0)
 *     ──► círculo de la tierra (0, 13) ──► barranco (z 21…25): sube un puente de piedras
 *     ──► bosque oscuro: círculo del fuego (0, 33) ──► muro de sombra (z 40): se encienden hogueras
 *     ──► alguien espera (0, 58): enciende su hoguera, y la cámara sube y se ve todo su camino
 *
 * En cada zona, cuando la elfa se acerca, aparece un ser del bosque y dibuja un símbolo de luz
 * dentro de un círculo. Si ella lo repite con sus pasos, el elemento abre el camino.
 */

// ── Zonas ────────────────────────────────────────────────────────
export type ZoneId = 'earth' | 'fire'
export type Zone = {
  id: ZoneId
  symbol: SymbolName
  x: number
  z: number
  r: number // radio del círculo donde se dibuja
  shape: Pt[] // el símbolo que dibuja el ser (puntos del mundo)
  color: string // color de su luz
  rest: { x: number; y: number; z: number } // dónde espera el ser
  // estado
  spiritAt: number // cuándo apareció el ser (-1 = todavía no)
  demoAt: number // cuándo empezó a dibujar el símbolo
  solvedAt: number // cuándo lo dibujó bien (-1 = todavía no)
}

const SYMBOL_R = 3.1 // tamaño del símbolo dentro del círculo

/** Triángulo con una punta hacia delante (+z). */
function triangle(cx: number, cz: number): Pt[] {
  return [0, 1, 2, 0].map((i) => {
    const a = Math.PI / 2 + (i / 3) * Math.PI * 2
    return { x: cx + Math.cos(a) * SYMBOL_R, z: cz + Math.sin(a) * SYMBOL_R }
  })
}
/** Círculo que empieza abajo (-z) y gira en sentido antihorario visto desde arriba. */
function ring(cx: number, cz: number): Pt[] {
  return Array.from({ length: 49 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 48) * Math.PI * 2
    return { x: cx + Math.cos(a) * SYMBOL_R, z: cz + Math.sin(a) * SYMBOL_R }
  })
}

const zone = (z: Omit<Zone, 'spiritAt' | 'demoAt' | 'solvedAt'>): Zone => ({ ...z, spiritAt: -1, demoAt: -1, solvedAt: -1 })

export const EARTH = zone({ id: 'earth', symbol: 'triangle', x: 0, z: 13, r: 4.6, shape: triangle(0, 13), color: '#ffcf7a', rest: { x: 5.4, y: 1.1, z: 14.5 } })
export const FIRE = zone({ id: 'fire', symbol: 'circle', x: 0, z: 33, r: 4.6, shape: ring(0, 33), color: '#ff9a52', rest: { x: -5.4, y: 1.1, z: 34.5 } })
export const ZONES = [EARTH, FIRE]

export const SPIRIT_RANGE = 10 // a esta distancia del círculo aparece el ser

// ── Lugares (metros) ─────────────────────────────────────────────
export const CHASM_Z0 = 21 // borde de este lado del barranco
export const CHASM_Z1 = 25 // borde del otro lado
export const BRIDGE_HALF = 1.25 // medio ancho del puente
export const DARK_Z0 = 26.5 // desde aquí el bosque está oscuro (hasta que se encienden las hogueras)
export const WALL_Z = 40 // muro de sombra: no se pasa sin fuego
export const END = { x: 0, z: 58 } // donde la espera la elfa recién nacida
export const BOUNDS = { x: 22, zMin: -6, zMax: 63 }

// ── Las hogueras ─────────────────────────────────────────────────
// alrededor del círculo del fuego, luego a lo largo del camino, y la última: la de la recién nacida
export type Fire = { x: number; z: number; delay: number } // delay: segundos después de dibujar el círculo
export const FIRES: Fire[] = [
  ...Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2
    return { x: FIRE.x + Math.cos(a) * 6.2, z: FIRE.z + Math.sin(a) * 6.2, delay: 0.8 + i * 0.35 }
  }),
  { x: -2.3, z: 43, delay: 3.4 },
  { x: 2.3, z: 47, delay: 4.0 },
  { x: -2.3, z: 51, delay: 4.6 },
  { x: 2.3, z: 54.5, delay: 5.2 },
]
export const HEARTH = { x: 1.5, z: END.z + 0.6 } // se enciende al llegar
export const WALL_OPEN = 3 // segundos después de dibujar el círculo en que se abre el muro de sombra

// ── Ritmo ────────────────────────────────────────────────────────
export const WALK = 1.5 // metros por segundo
export const RUN = 3.0 // corriendo (Tab)
export const BLOOM_STEP = 0.26 // cada cuántos metros brota algo
export const DEMO_TIME = 4.2 // segundos que tarda el ser en dibujar el símbolo
export const MIN_STROKE = 7 // metros mínimos de trazo para intentar reconocerlo
export const CLOSE_DIST = 1.2 // si vuelve a menos de esto de un punto de su trazo, la figura se cierra
export const PASS_SCORE = 0.72 // nota mínima para que valga
export const BRIDGE_TIME = 3 // segundos que tardan en subir las piedras
export const BRIDGE_STONES = 6

// ── Estado (se modifica cada frame, no es estado de React) ───────
export const proto = {
  stroke: [] as Pt[], // lo que lleva dibujado dentro del círculo
  strokeCum: [] as number[], // metros recorridos hasta cada punto del trazo
  strokeLen: 0,
  inZone: null as ZoneId | null, // en qué círculo está dibujando
  lastStroke: [] as Pt[], // el último intento (se desvanece)
  lastAt: -99, // cuándo terminó ese intento
  lastOk: false,
  lastColor: '#ffe2a0',
  tries: 0,
  endAt: -1, // cuándo llegó al final (-1 = todavía no)
  walked: 0, // metros desde la última flor
  totalWalked: 0,
}

/** Un ser dibujando su símbolo: 0..1 (o -1 si no está dibujando). */
export function demoProgress(z: Zone, time: number) {
  if (z.demoAt < 0 || time < z.demoAt || z.solvedAt >= 0) return -1
  return Math.min(1, (time - z.demoAt) / DEMO_TIME)
}

/** Punto a una fracción t (0..1) del recorrido de una línea (por distancia). */
export function pointAlong(pts: Pt[], t: number): Pt {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
  let want = Math.max(0, Math.min(1, t)) * total
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
    if (want <= d || i === pts.length - 1) {
      const k = d > 0 ? Math.min(1, want / d) : 0
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * k }
    }
    want -= d
  }
  return pts[pts.length - 1]
}

/** ¿Ya subió el puente lo suficiente para pasar? */
export function bridgeUp(time: number) {
  return EARTH.solvedAt >= 0 && time - EARTH.solvedAt > BRIDGE_TIME * 0.8
}

/** ¿Ya se abrió el muro de sombra? */
export function wallOpen(time: number) {
  return FIRE.solvedAt >= 0 && time - FIRE.solvedAt > WALL_OPEN
}

/** Cuándo se enciende cada hoguera (-1 = todavía no). */
export function fireLitAt(i: number) {
  return FIRE.solvedAt >= 0 ? FIRE.solvedAt + FIRES[i].delay : -1
}
export function hearthLitAt() {
  return proto.endAt >= 0 ? proto.endAt + 1.2 : -1
}
