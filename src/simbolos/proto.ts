import type { Pt } from './recognizer'

/*
 * Prototipo "El bosque que se dibuja" — zona 1: el barranco y el ser de la tierra.
 *
 *   inicio (0, 0) ──► círculo de dibujo (0, 14) ──► barranco (z 21…25) ──► alguien espera (0, 37)
 *
 * La elfa camina por un claro dormido y su rastro florece. Cuando se acerca al barranco,
 * aparece el ser de la tierra y dibuja un triángulo de luz dentro del círculo.
 * Si ella lo repite con sus pasos, se levanta un puente de piedras.
 * Al llegar al final, la cámara sube y se ve todo su camino desde arriba.
 */

// ── Lugares (metros) ─────────────────────────────────────────────
export const ZONE = { x: 0, z: 13, r: 4.6 } // círculo donde se dibuja el símbolo
export const SPIRIT_RANGE = 10 // a esta distancia del círculo aparece el ser
export const CHASM_Z0 = 21 // borde de este lado del barranco
export const CHASM_Z1 = 25 // borde del otro lado
export const BRIDGE_HALF = 1.25 // medio ancho del puente
export const END = { x: 0, z: 36 } // donde la espera la elfa recién nacida
export const BOUNDS = { x: 22, zMin: -6, zMax: 42 }

// El triángulo que dibuja el ser (una punta hacia el barranco)
const TRI_R = 3.1
export const TRIANGLE: Pt[] = [0, 1, 2, 0].map((i) => {
  const a = Math.PI / 2 + (i / 3) * Math.PI * 2
  return { x: ZONE.x + Math.cos(a) * TRI_R, z: ZONE.z + Math.sin(a) * TRI_R }
})

// ── Ritmo ────────────────────────────────────────────────────────
export const WALK = 1.5 // metros por segundo
export const RUN = 3.0 // corriendo (Tab)
export const BLOOM_STEP = 0.26 // cada cuántos metros brota algo
export const DEMO_TIME = 4.2 // segundos que tarda el ser en dibujar el triángulo
export const MIN_STROKE = 7 // metros mínimos de trazo para intentar reconocerlo
export const CLOSE_DIST = 1.2 // si vuelve a menos de esto del inicio, el trazo se cierra
export const PASS_SCORE = 0.72 // nota mínima para que valga
export const BRIDGE_TIME = 3 // segundos que tardan en subir las piedras
export const BRIDGE_STONES = 6

// ── Estado (se modifica cada frame, no es estado de React) ───────
export const proto = {
  stroke: [] as Pt[], // lo que lleva dibujado dentro del círculo
  strokeCum: [] as number[], // metros recorridos hasta cada punto del trazo
  strokeLen: 0,
  inZone: false,
  lastStroke: [] as Pt[], // el último intento (se desvanece)
  lastAt: -99, // cuándo terminó ese intento
  lastOk: false,
  tries: 0,
  spiritAt: -1, // cuándo apareció el ser (-1 = todavía no)
  demoAt: -1, // cuándo empezó a dibujar el triángulo
  solvedAt: -1, // cuándo lo dibujó bien (-1 = todavía no)
  endAt: -1, // cuándo llegó al final (-1 = todavía no)
  walked: 0, // metros desde la última flor
  totalWalked: 0,
}

/** El ser dibujando: 0..1 (o -1 si no está dibujando). */
export function demoProgress(time: number) {
  if (proto.demoAt < 0 || time < proto.demoAt) return -1
  return Math.min(1, (time - proto.demoAt) / DEMO_TIME)
}

/** Punto del triángulo a una fracción t (0..1) del recorrido. */
export function trianglePoint(t: number): Pt {
  const seg = Math.min(2, Math.floor(t * 3))
  const k = t * 3 - seg
  const a = TRIANGLE[seg]
  const b = TRIANGLE[seg + 1]
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }
}

/** ¿Ya subió el puente lo suficiente para pasar? */
export function bridgeUp(time: number) {
  return proto.solvedAt >= 0 && time - proto.solvedAt > BRIDGE_TIME * 0.8
}
