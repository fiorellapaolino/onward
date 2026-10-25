import * as THREE from 'three'

// ── El sendero ───────────────────────────────────────────────────
// Avanza hacia +Z y serpentea suavemente a izquierda y derecha.
// "p" (progreso) son los metros recorridos por el sendero.
export const PATH_LEN = 300 // metros hasta llegar a la luz
export const PATH_END = 345 // metros totales (el final sigue un poco más)

// ── La aldea ─────────────────────────────────────────────────────
// Una aldea pequeña en un claro del bosque, apagada por una sombra.
// El sendero la cruza; a la salida, la sombra corta el paso.
export const VILLAGE_S = 72 // centro de la aldea (metros del sendero)
export const VILLAGE_R = 15 // radio del claro
export const SHADOW_S = VILLAGE_S + 16 // muro de sombra a la salida de la aldea
// La niña llora al pie de un árbol, a un lado del sendero, al entrar en la aldea
export const GIRL_S = VILLAGE_S - 8
export const GIRL_SIDE = 1 // 1 = a la izquierda del sendero (mirando hacia delante), -1 = a la derecha
export const GIRL_DIST = 4.2
export const TALK_DIST = 2.4 // a esta distancia se puede escuchar a la niña

// ── Tiempos de las animaciones ───────────────────────────────────
export const BIRTH_TIME = 1.0 // nace de la luz (de rodillas)
export const RISE_TIME = 2.2 // termina de levantarse (animación "Standing Up")
export const GATHER_TIME = 1.8 // agarra las herramientas
export const LOOK_TIME = 1.4 // mira a los costados antes de andar
export const TOOL_DELAY = 0.3 // separación entre que agarra una herramienta y la siguiente
export const TOOL_FLY = 0.7 // lo que tarda cada una en llegar a sus manos
export const TOOL_ABSORB = 0.9 // lo que tardan en entrar en ella (la magia queda dormida dentro)

// ── Salto ────────────────────────────────────────────────────────
export const JUMP_CROUCH = 0.12 // se agacha antes de saltar
export const JUMP_AIR = 0.62 // tiempo en el aire
export const JUMP_LAND = 0.18 // amortigua al caer
export const JUMP_HEIGHT = 0.5 // metros
export const JUMP_BOOST = 2.6 // impulso hacia delante en el aire (metros por segundo, se suma a lo que ya iba)

// ── Velocidades (metros por segundo) ─────────────────────────────
export const WALK_SPEED = 0.85 // caminar (sube un poco con la confianza)
export const RUN_SPEED = 2.7 // correr con Tab

// ── Límites del bosque ───────────────────────────────────────────
export const PATH_HALF_WIDTH = 7 // cuánto se puede alejar del sendero hacia los lados

// ── Utilidades del sendero ───────────────────────────────────────
const A1 = 6, F1 = 0.021, A2 = 3, F2 = 0.057, P2 = 1.3

/** Punto del sendero a s metros del inicio. */
export function pathAt(s: number, out = new THREE.Vector3()) {
  return out.set(A1 * Math.sin(s * F1) + A2 * Math.sin(s * F2 + P2) - A2 * Math.sin(P2), 0, s)
}
/** Dirección "hacia adelante" en el sendero. */
export function tangentAt(s: number, out = new THREE.Vector3()) {
  const dx = A1 * F1 * Math.cos(s * F1) + A2 * F2 * Math.cos(s * F2 + P2)
  return out.set(dx, 0, 1).normalize()
}
/** Dirección perpendicular al sendero (hacia un costado). */
export function sideAt(s: number, out = new THREE.Vector3()) {
  tangentAt(s, out)
  return out.set(out.z, 0, -out.x)
}
/** Ángulo de giro (rotation.y) para mirar hacia adelante en el sendero. */
export function headingAt(s: number) {
  const t = tangentAt(s, _t)
  return Math.atan2(t.x, t.z)
}
const _t = new THREE.Vector3()

// ── Matemáticas pequeñas ─────────────────────────────────────────
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

/** Números aleatorios repetibles (el bosque es siempre el mismo). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ruta de un modelo del bosque (Quaternius). */
export const natureUrl = (name: string) => `${import.meta.env.BASE_URL}models/nature/${name}.gltf`

/** Posición de un punto a s metros del sendero, desplazado hacia un costado. */
export function besidePath(s: number, side: number, dist: number, out = new THREE.Vector3()) {
  pathAt(s, out)
  const sd = sideAt(s, _sd)
  return out.addScaledVector(sd, side * dist)
}
const _sd = new THREE.Vector3()

/** Distancia (en el suelo) desde un punto al centro de la aldea. */
export function distToVillage(x: number, z: number) {
  const c = pathAt(VILLAGE_S, _vc)
  return Math.hypot(x - c.x, z - c.z)
}
const _vc = new THREE.Vector3()
