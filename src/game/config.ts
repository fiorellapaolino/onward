import * as THREE from 'three'

// ── Forma de la escalera en espiral ──────────────────────────────
export const RADIUS = 6 // distancia del centro de la montaña a los escalones
export const STEP_ANGLE = 0.16 // cuánto gira cada escalón (radianes)
export const STEP_H = 0.22 // cuánto sube cada escalón
export const STEP_THICK = 0.18 // grosor visual del escalón

// ── Duración del juego ───────────────────────────────────────────
export const N_GOAL = 260 // escalón donde "llegas arriba"
export const N_TOTAL = 300 // escalones totales (los últimos son del final)

// ── Momentos difíciles: falta el escalón siguiente ───────────────
// Uno por cada herramienta del Mago (copa, espada, vara, oro).
export const GATES = [40, 95, 150, 205]
export const GATE_HOLD = 1.6 // segundos insistiendo para que aparezca

// ── Tiempos de las animaciones ───────────────────────────────────
export const BIRTH_TIME = 2.2 // nace de la luz
export const GATHER_TIME = 2.4 // agarra las herramientas
export const LOOK_TIME = 2.6 // mira a los costados antes de andar
export const LOOK_BACK_TIME = 1.6 // se gira, mira atrás y vuelve
export const TOOL_DELAY = 0.45 // separación entre que agarra una herramienta y la siguiente
export const TOOL_FLY = 0.7 // lo que tarda cada una en llegar a sus manos
export const TOOL_TO_GATE = 0.9 // lo que tarda en volar hasta el escalón que falta

// ── Utilidades de la espiral ─────────────────────────────────────
/** Posición del centro de la parte de arriba del escalón p (p puede tener decimales). */
export function spiralAt(p: number, out = new THREE.Vector3()) {
  const a = p * STEP_ANGLE
  return out.set(Math.cos(a) * RADIUS, p * STEP_H, Math.sin(a) * RADIUS)
}
/** Dirección "hacia adelante" en el escalón p. */
export function tangentAt(p: number, out = new THREE.Vector3()) {
  const a = p * STEP_ANGLE
  return out.set(-Math.sin(a), 0, Math.cos(a))
}
/** Dirección "hacia afuera" de la montaña en el escalón p. */
export function radialAt(p: number, out = new THREE.Vector3()) {
  const a = p * STEP_ANGLE
  return out.set(Math.cos(a), 0, Math.sin(a))
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
/** Suavizado independiente de los FPS. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt)

/** Mezcla una lista de colores según f (0 → primero, 1 → último). */
export function gradient(stops: THREE.Color[], f: number, out: THREE.Color) {
  const x = clamp01(f) * (stops.length - 1)
  const i = Math.min(Math.floor(x), stops.length - 2)
  return out.copy(stops[i]).lerp(stops[i + 1], x - i)
}
