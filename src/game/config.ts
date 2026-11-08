import * as THREE from 'three'

// ── El sendero ───────────────────────────────────────────────────
// Avanza hacia +Z y serpentea suavemente a izquierda y derecha.
// "p" (progreso) son los metros recorridos por el sendero.
export const PATH_LEN = 125 // metros hasta el claro del final (pasada la aldea)
export const PATH_END = 170 // metros totales (el final sigue un poco más, hacia la luz)

// ── La aldea ─────────────────────────────────────────────────────
// Una aldea pequeña en un claro del bosque, apagada por una sombra.
// El sendero la cruza; a la salida, la sombra corta el paso.
export const VILLAGE_S = 72 // centro de la aldea (metros del sendero)
export const VILLAGE_R = 15 // radio del claro
export const SHADOW_S = VILLAGE_S + 26 // muro de sombra a la salida de la aldea (arriba de la escalera)
// ── La calle: al final de la aldea, una escalera sube a una terraza; detrás baja de nuevo ──
export const STAIR_Z0 = 79 // primer escalón
export const STAIR_TOP = 85.5 // último escalón: aquí empieza la terraza
export const TERRACE_END = 98 // termina la terraza y baja la segunda escalera
export const STAIR_END = 103 // vuelve al suelo del bosque
export const TERRACE_H = 3.4 // altura de la terraza (metros)
/** Mitad del ancho por donde se puede subir (entre los muros). */
export const STREET_HALF = 1.35
// La niña llora al pie de un árbol, a un lado del sendero, al entrar en la aldea
export const GIRL_S = VILLAGE_S - 8
export const GIRL_SIDE = 1 // 1 = a la izquierda del sendero (mirando hacia delante), -1 = a la derecha
export const GIRL_DIST = 2.9
export const TALK_DIST = 2.4 // a esta distancia se puede escuchar a la niña

// ── Tiempos de las animaciones ───────────────────────────────────
export const BIRTH_TIME = 1.0 // nace de la luz (acostada)
export const RISE_TIME = 4.8 // se levanta del suelo (animación "Standing Up" desde acostada)
export const GATHER_TIME = 1.27 // ya de pie, gira hacia el camino (animación "Left Turn 90")
export const LOOK_TIME = 0.6 // mira a los costados un momento antes de andar

// ── Salto ────────────────────────────────────────────────────────
export const JUMP_CROUCH = 0.08 // se agacha antes de saltar
export const JUMP_AIR = 0.5 // tiempo en el aire
export const JUMP_LAND = 0.3 // amortigua al caer (se puede volver a saltar antes de que termine)
export const JUMP_HEIGHT = 0.5 // metros
export const JUMP_BOOST = 2.6 // impulso hacia delante en el aire (metros por segundo, se suma a lo que ya iba)

// ── Velocidades (metros por segundo) ─────────────────────────────
export const WALK_SPEED = 0.85 // caminar (sube un poco con la confianza)
export const RUN_SPEED = 3.5 // correr con Shift (o Tab)

// ── Límites del bosque ───────────────────────────────────────────
export const PATH_HALF_WIDTH = 7 // cuánto se puede alejar del sendero hacia los lados

// ── Utilidades del sendero ───────────────────────────────────────
const A1 = 6, F1 = 0.021, A2 = 3, F2 = 0.057, P2 = 1.3

/** Punto del sendero a s metros del inicio. */
export function pathAt(s: number, out = new THREE.Vector3()) {
  return out.set(A1 * Math.sin(s * F1) + A2 * Math.sin(s * F2 + P2) - A2 * Math.sin(P2), 0, s)
}
/** Cuánto sube el suelo por las piedras del sendero (miden unos 12 cm): así camina y se acuesta encima, no entre ellas. */
/** El empedrado empieza aquí (metros del sendero) y sigue hasta el final; antes, el sendero es de piedras sueltas. */
export const COBBLE_FROM = 28
/** Las piedras sueltas se van espaciando y terminan entre estas dos distancias (justo donde aparece el empedrado). */
export const STONES_FADE = [COBBLE_FROM - 4, COBBLE_FROM + 2]
export function stoneLift(x: number, z: number) {
  const band = 1 - smoothstep(1.0, 1.6, Math.abs(x - pathAt(z, _lift).x))
  const along = 1 - smoothstep(STONES_FADE[0], STONES_FADE[1], z) // (sobre el empedrado no se eleva)
  return 0.12 * band * along
}
const _lift = new THREE.Vector3()
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
/** Altura del suelo en este punto del sendero (solo cambia en la escalera y la terraza). */
export function heightAt(z: number) {
  if (z <= STAIR_Z0 || z >= STAIR_END) return 0
  if (z < STAIR_TOP) return (TERRACE_H * (z - STAIR_Z0)) / (STAIR_TOP - STAIR_Z0)
  if (z <= TERRACE_END) return TERRACE_H
  return (TERRACE_H * (STAIR_END - z)) / (STAIR_END - TERRACE_END)
}
/** Dónde empieza la calle recta de la escalera (en el mundo). */
export const streetOrigin = () => pathAt(STAIR_Z0)
/** Giro de la calle recta: sale en la dirección que traía el sendero. */
export const STREET_YAW = (() => {
  const t = tangentAt(STAIR_Z0)
  return Math.atan2(t.x, t.z)
})()
/** El centro de la calle recta a esta altura del camino. */
export function streetCenter(z: number) {
  return streetOrigin().x + (z - STAIR_Z0) * Math.tan(STREET_YAW)
}
/** Pasa de coordenadas de la calle (x a la izquierda, z escalera arriba) al mundo. */
export function streetToWorld(lx: number, lz: number) {
  const o = streetOrigin()
  const c = Math.cos(STREET_YAW)
  const s = Math.sin(STREET_YAW)
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c }
}

/** Lo contrario: del mundo a coordenadas de la calle. */
export function worldToStreet(x: number, z: number) {
  const o = streetOrigin()
  const c = Math.cos(STREET_YAW)
  const s = Math.sin(STREET_YAW)
  const dx = x - o.x
  const dz = z - o.z
  return { lx: dx * c - dz * s, lz: dx * s + dz * c }
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
