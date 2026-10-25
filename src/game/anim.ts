import * as THREE from 'three'
/** Nombre de un hueso del esqueleto (pelvis, spine_01, upperarm_l…). */
export type BoneName = string
import walkJson from '../anims/walk.json'
import runJson from '../anims/run.json'
import idleJson from '../anims/idle.json'
import lookJson from '../anims/look.json'
import standupJson from '../anims/standup.json'

/*
 * Animaciones de Mixamo (captura de movimiento) traspasadas al esqueleto de la elfa.
 * Las genera tools/retarget_ue.py a partir de los .fbx: para cada hueso hay un
 * cuaternión por frame (o uno solo si no se mueve), y "offset" es cuánto se mueve
 * la cadera (en metros del modelo original, que mide 1.78 m).
 */
export type ClipData = {
  fps: number
  frames: number
  loop: boolean
  bones: Record<string, number[]>
  offset: number[]
  speed?: number // metros por segundo a velocidad normal (caminar / correr)
  sync?: number // momento del ciclo (0..1) en que el pie izquierdo está más adelante
}

export const CLIPS = {
  walk: walkJson as ClipData,
  run: runJson as ClipData,
  idle: idleJson as ClipData,
  look: lookJson as ClipData,
  standup: standupJson as ClipData,
}

/** Duración en segundos (en clips en bucle, el último frame repite el primero). */
export const duration = (c: ClipData) => (c.frames - 1) / c.fps

/** Metros que avanza en un ciclo completo (dos pasos). */
export const cycleLength = (c: ClipData) => (c.speed ?? 1) * duration(c)

export type Sample = { q: Partial<Record<BoneName, THREE.Quaternion>>; offset: THREE.Vector3 }

export function makeSample(): Sample {
  const q: Partial<Record<BoneName, THREE.Quaternion>> = {}
  for (const name of Object.keys(CLIPS.walk.bones)) q[name as BoneName] = new THREE.Quaternion()
  return { q, offset: new THREE.Vector3() }
}

const qa = new THREE.Quaternion()
const qb = new THREE.Quaternion()

/** Lee el clip en el instante t (segundos) y lo deja en out. */
export function sampleAt(c: ClipData, t: number, out: Sample) {
  const last = c.frames - 1
  let f = t * c.fps
  if (c.loop) f = ((f % last) + last) % last
  else f = Math.min(Math.max(f, 0), last)
  const i = Math.floor(f)
  const j = Math.min(i + 1, last)
  const u = f - i
  for (const [name, arr] of Object.entries(c.bones)) {
    const q = out.q[name as BoneName]
    if (!q) continue
    if (arr.length === 4) {
      q.fromArray(arr) // hueso quieto en este clip
      continue
    }
    qa.fromArray(arr, i * 4)
    qb.fromArray(arr, j * 4)
    q.slerpQuaternions(qa, qb, u)
  }
  const o = c.offset
  out.offset.set(
    o[i * 3] + (o[j * 3] - o[i * 3]) * u,
    o[i * 3 + 1] + (o[j * 3 + 1] - o[i * 3 + 1]) * u,
    o[i * 3 + 2] + (o[j * 3 + 2] - o[i * 3 + 2]) * u,
  )
  return out
}

/** Lee el clip en un momento del ciclo (0..1), alineado para que los pasos coincidan entre clips. */
export function sampleCycle(c: ClipData, phase: number, out: Sample) {
  const p = phase + (c.sync ?? 0)
  return sampleAt(c, (p - Math.floor(p)) * duration(c), out)
}

/** Mezcla b sobre a con peso w (a = a·(1-w) + b·w). */
export function blendInto(a: Sample, b: Sample, w: number) {
  if (w <= 0) return a
  for (const [name, q] of Object.entries(a.q)) {
    const qb2 = b.q[name as BoneName]
    if (q && qb2) q.slerp(qb2, w)
  }
  a.offset.lerp(b.offset, w)
  return a
}
