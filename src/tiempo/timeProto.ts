import type { Pt } from '../simbolos/recognizer'

/*
 * Zona de prueba: el símbolo del tiempo (?tiempo en la dirección).
 *
 *   inicio (0, 0)
 *     ──► círculo del ser del tiempo (0, 11): dibuja una espiral
 *     ──► el río (z 19…23): en el presente no se puede cruzar
 *         · al dibujar la espiral, el bosque vuelve a su pasado: árboles jóvenes y verdes, y el río todavía no existía
 *         · ella cruza por donde antes había pradera
 *     ──► al llegar al otro lado, el tiempo vuelve solo al presente (mirar atrás sirve para entender, no para quedarse)
 *     ──► una luz espera (0, 36): la cámara sube y se ve su camino; lo que caminó en el pasado quedó de otro color
 */

export const TIME = {
  x: 0,
  z: 11,
  r: 4.6, // radio del círculo donde se dibuja
  color: '#c8b6ff', // luz lila del ser del tiempo
  rest: { x: -5.4, y: 1.1, z: 12.5 }, // dónde espera el ser
}

const SPIRAL_R = 3.1
const SPIRAL_TURNS = 2.25 // (igual que la plantilla del reconocedor)

/** Espiral que entra desde el borde de abajo (-z) hacia el centro. */
function spiralShape(cx: number, cz: number): Pt[] {
  return Array.from({ length: 121 }, (_, i) => {
    const t = i / 120
    const r = SPIRAL_R * (1 - t * 0.85)
    const a = -Math.PI / 2 + t * Math.PI * 2 * SPIRAL_TURNS
    return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }
  })
}
export const SPIRAL = spiralShape(TIME.x, TIME.z)

// ── Lugares (metros) ─────────────────────────────────────────────
export const RIVER_Z0 = 19 // orilla de este lado
export const RIVER_Z1 = 23 // la otra orilla
export const RETURN_Z = RIVER_Z1 + 1.8 // al pasar de aquí, vuelve al presente
export const END = { x: 0, z: 36 }
export const BOUNDS = { x: 18, zMin: -6, zMax: 41 }

// ── Ritmo ────────────────────────────────────────────────────────
export const SPIRIT_RANGE = 9
export const DEMO_TIME = 6 // la espiral es más larga que los otros símbolos
export const MIN_STROKE = 12 // metros mínimos de trazo para intentar reconocerla
export const CENTER_DIST = 1.1 // la espiral termina en el centro: ahí se prueba
export const PASS_SCORE = 0.72
export const SHIFT_TIME = 1.8 // segundos que tarda el bosque en cambiar de época

/** Colores del pasto donde caminó en el pasado (se ven desde arriba al final). */
export const PAST_TINT = ['#b79bd8', '#c7aee3', '#a98bcf', '#d4bfe8']

// ── Estado (se modifica cada frame, no es estado de React) ───────
export const tp = {
  spiritAt: -1, // cuándo apareció el ser (-1 = todavía no)
  demoAt: -1, // cuándo empezó a dibujar la espiral
  solvedAt: -1, // cuándo la dibujó bien
  pastAt: -1, // cuándo empezó el pasado
  presentAt: -1, // cuándo volvió al presente
  stroke: [] as Pt[],
  strokeCum: [] as number[],
  strokeLen: 0,
  inside: false,
  lastTry: -99, // la última vez que se probó el trazo
  lastStroke: [] as Pt[],
  lastAt: -99,
  lastOk: false,
  endAt: -1,
  walked: 0,
  totalWalked: 0,
}

/** 0 = presente, 1 = pasado (con la transición suave entre los dos). */
export function pastMix(time: number) {
  const P = tp
  if (P.pastAt < 0) return 0
  const k = (t: number) => {
    const a = Math.max(0, Math.min(1, t / SHIFT_TIME))
    return a * a * (3 - 2 * a)
  }
  const into = k(time - P.pastAt)
  return P.presentAt >= 0 ? into * (1 - k(time - P.presentAt)) : into
}

/** ¿Está ahora en el pasado? (el río no existe) */
export function inPast(time: number) {
  return tp.pastAt >= 0 && tp.presentAt < 0 && time - tp.pastAt > SHIFT_TIME * 0.5
}

/** El ser dibujando: 0..1 (o -1 si no está dibujando). */
export function demoProgress(time: number) {
  const P = tp
  if (P.demoAt < 0 || time < P.demoAt || P.solvedAt >= 0) return -1
  return Math.min(1, (time - P.demoAt) / DEMO_TIME)
}
