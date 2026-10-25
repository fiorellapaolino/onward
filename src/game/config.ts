import * as THREE from 'three'

// ── El sendero ───────────────────────────────────────────────────
// Avanza hacia +Z y serpentea suavemente a izquierda y derecha.
// "p" (progreso) son los metros recorridos por el sendero.
export const PATH_LEN = 300 // metros hasta llegar a la luz
export const PATH_END = 345 // metros totales (el final sigue un poco más)

// ── Obstáculos: uno por cada herramienta ─────────────────────────
// copa → arroyo · espada → ramas · vara → oscuridad · oro → barranco
export type GateKind = 'water' | 'branches' | 'dark' | 'chasm'
export const GATES = [60, 130, 195, 255]
export const GATE_KINDS: GateKind[] = ['water', 'branches', 'dark', 'chasm']
export const GATE_STOP = 2.2 // se detiene a esta distancia del obstáculo
export const GATE_HOLD = 1.6 // segundos insistiendo para usar la herramienta

// ── Tiempos de las animaciones ───────────────────────────────────
export const BIRTH_TIME = 2.2 // nace de la luz (en postura del niño)
export const RISE_TIME = 3.2 // se incorpora desde la postura del niño (animación "Standing Up")
export const GATHER_TIME = 2.4 // agarra las herramientas
export const LOOK_TIME = 2.6 // mira a los costados antes de andar
export const LOOK_BACK_TIME = 1.6 // se gira, mira atrás y vuelve
export const TOOL_DELAY = 0.45 // separación entre que agarra una herramienta y la siguiente
export const TOOL_FLY = 0.7 // lo que tarda cada una en llegar a sus manos
export const TOOL_TO_GATE = 0.9 // lo que tarda en volar hasta el obstáculo
export const OPEN_TIME = 1.6 // lo que tarda el obstáculo en abrirse

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
