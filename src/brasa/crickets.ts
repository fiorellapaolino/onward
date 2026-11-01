import * as THREE from 'three'
import { getAudio } from '../game/sfx'

/*
 * Grillos con posición (tema de la jam: "You Hear").
 * Cada grillo es un punto del mundo que canta de vez en cuando: se oye más fuerte de cerca
 * y de un lado o del otro según dónde está. Cantan donde hay algo dormido: así se orienta ella.
 * Sintetizados (no son archivos): ráfagas cortas de un tono agudo, como un grillo real.
 */
export type Cricket = { x: number; z: number; on: () => boolean; loud?: number; next?: number; panner?: PannerNode }

const crickets: Cricket[] = []

export function addCricket(c: Cricket) {
  crickets.push(c)
  return c
}

/** Cada frame: mueve el "oído" a la cámara y hace cantar a los grillos que toca. */
export function updateCrickets(camera: THREE.Camera) {
  const A = getAudio()
  if (!A) return
  const { ctx, master } = A
  const L = ctx.listener
  const p = camera.position
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  if (L.positionX) {
    L.positionX.value = p.x
    L.positionY.value = p.y
    L.positionZ.value = p.z
    L.forwardX.value = f.x
    L.forwardY.value = f.y
    L.forwardZ.value = f.z
    L.upX.value = 0
    L.upY.value = 1
    L.upZ.value = 0
  } else {
    L.setPosition(p.x, p.y, p.z)
    L.setOrientation(f.x, f.y, f.z, 0, 1, 0)
  }
  const now = ctx.currentTime
  for (const c of crickets) {
    if (!c.on()) continue
    if (!c.panner) {
      c.panner = ctx.createPanner()
      c.panner.panningModel = 'HRTF'
      c.panner.distanceModel = 'inverse'
      c.panner.refDistance = 2.5
      c.panner.rolloffFactor = 1.3
      c.panner.positionX.value = c.x
      c.panner.positionY.value = 0.3
      c.panner.positionZ.value = c.z
      c.panner.connect(master)
      c.next = now + Math.random() * 1.2
    }
    if (now >= (c.next ?? 0)) {
      chirp(ctx, c.panner, now, c.loud ?? 1)
      c.next = now + 0.75 + Math.random() * 0.7
    }
  }
}

/** Un canto: 3 o 4 pulsos muy cortos de un tono agudo. */
function chirp(ctx: AudioContext, out: AudioNode, t0: number, loud: number) {
  const pulses = 3 + Math.floor(Math.random() * 2)
  const freq = 4300 + Math.random() * 500
  for (let i = 0; i < pulses; i++) {
    const t = t0 + i * 0.055
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = freq
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.09 * loud, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.032)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + 0.04)
  }
}
