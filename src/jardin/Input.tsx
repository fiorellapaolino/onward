import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { HEAP_SLOTS, ISLAND_R } from './data'
import { dropScrap, gardenStep, j, paintTo } from './garden'
import { setOpenness } from './audio'
import { updateVoices } from './voices'

/*
 * Un solo gesto para todo: tocar y arrastrar.
 *   - sobre un resto de la tabla: se lleva (y se suelta en la compostera o en el contenedor amarillo)
 *   - sobre un montón de compost: se pinta la tierra arrastrando
 *   - en cualquier otro sitio: se gira la maqueta
 * Rueda del ratón: acercar o alejar.
 */
export function GardenInput() {
  const { camera, gl } = useThree()
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])

  useEffect(() => {
    const el = gl.domElement
    let orbit: { x: number; yaw: number } | null = null

    /** Dónde toca el puntero el plano horizontal a la altura y. */
    const ground = (e: PointerEvent, y: number) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      plane.constant = -y
      return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null
    }

    const down = (e: PointerEvent) => {
      if (!j.started) return
      el.setPointerCapture(e.pointerId)
      const p = ground(e, 0.2)
      if (p) {
        // ¿un resto de la tabla?
        let best = -1
        let bd = 0.62
        j.slots.forEach((s, i) => {
          if (s.back > j.t) return
          const d = Math.hypot(p.x - s.x, p.z - s.z)
          if (d < bd) {
            bd = d
            best = i
          }
        })
        if (best >= 0) {
          j.drag = { kind: 'scrap', slot: best, x: p.x, y: 1.2, z: p.z }
          j.lastAction = j.t
          return
        }
        // ¿un montón de compost?
        const heap = j.heaps.findIndex((h, i) => h && Math.hypot(p.x - HEAP_SLOTS[i].x, p.z - HEAP_SLOTS[i].z) < 1.0)
        if (heap >= 0) {
          j.drag = { kind: 'paint', heap, x: p.x, z: p.z, on: false, lastX: p.x, lastZ: p.z, acc: 0 }
          j.lastAction = j.t
          return
        }
      }
      orbit = { x: e.clientX, yaw: j.cam.yaw }
    }

    const move = (e: PointerEvent) => {
      const d = j.drag
      if (d && d.kind === 'scrap') {
        const p = ground(e, 1.2)
        if (p) {
          d.x = p.x
          d.z = p.z
        }
      } else if (d && d.kind === 'paint') {
        const p = ground(e, 0.03)
        if (p) paintTo(p.x, p.z)
      } else if (orbit) {
        j.cam.yaw = Math.max(-0.9, Math.min(0.9, orbit.yaw - ((e.clientX - orbit.x) / el.clientWidth) * 2.4))
      }
    }

    const up = () => {
      const d = j.drag
      if (d && d.kind === 'scrap') dropScrap(d.slot, d.x, d.y, d.z)
      if (d) j.drag = null
      orbit = null
    }

    const wheel = (e: WheelEvent) => {
      j.cam.zoom = Math.max(0.75, Math.min(1.6, j.cam.zoom * Math.exp(-e.deltaY * 0.001)))
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: true })
    el.style.touchAction = 'none'
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [camera, gl, ray, ndc, hit, plane])

  return null
}

// ── El paso del juego (y el piloto automático para las pruebas) ─
const params = new URLSearchParams(location.search)
const AUTO = params.has('auto')
const SPEED = Number(params.get('speed') ?? 1)

/** Recetas que prueba el piloto: una de cada especie. */
const AUTO_MIXES: string[][] = [
  ['leaves', 'cardboard', 'leaves'], // hierba
  ['peel', 'leaves', 'cardboard'], // flores
  ['coffee', 'grass', 'peel'], // hongos
  ['coffee', 'cardboard', 'leaves'], // helechos
  ['grass', 'cardboard', 'leaves'], // arbustos
  ['peel', 'leaves', 'egg'], // árbol
]

export function GardenLoop() {
  const auto = useMemo(() => ({ step: 0, wait: 0, mix: 0, ang: 0, painting: -1, rejectDone: false }), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05) * SPEED
    gardenStep(dt)
    setOpenness(j.richSmooth)
    updateVoices()
    if (AUTO && j.started) autopilot(auto, dt)
  })
  return null
}

type Auto = { step: number; wait: number; mix: number; ang: number; painting: number; rejectDone: boolean }
function autopilot(a: Auto, dt: number) {
  a.wait -= dt
  if (a.wait > 0) return
  // primero prueba a echar una botella en la compostera (rebota) y luego en el amarillo
  if (!a.rejectDone) {
    const b = j.slots.findIndex((s) => s.id === 'bottle')
    if (a.step === 0) {
      if (j.slots[b].back > j.t) return
      dropScrap(b, -6.4, 1.2, 5.6)
      a.step = 1
      a.wait = 1
      return
    }
    if (j.slots[b].back > j.t) return
    dropScrap(b, 6.4, 1.2, 5.6)
    a.rejectDone = true
    a.step = 0
    a.wait = 1
    console.log('[auto] separó la botella')
    return
  }
  // pinta si hay un montón listo
  if (a.painting < 0) {
    const h = j.heaps.findIndex((x) => !!x)
    if (h >= 0) {
      a.painting = h
      j.drag = { kind: 'paint', heap: h, x: HEAP_SLOTS[h].x, z: HEAP_SLOTS[h].z, on: false, lastX: 0, lastZ: 0, acc: 0 }
      a.ang = a.mix * 1.05
    }
  }
  if (a.painting >= 0) {
    if (!j.heaps[a.painting]) {
      a.painting = -1
      j.drag = null
      return
    }
    a.ang += dt * 1.6
    const rad = 1.2 + ((a.ang * 0.9) % (ISLAND_R - 2.2))
    const k = (j.found.size % 6) * 1.05
    paintTo(Math.cos(a.ang + k) * rad, Math.sin(a.ang * 1.3 + k) * rad * 0.9)
    return
  }
  // echa la siguiente receta, un resto cada poco
  if (j.binWorkAt >= 0 || a.mix >= AUTO_MIXES.length * 2) return
  const mix = AUTO_MIXES[a.mix % AUTO_MIXES.length]
  const id = mix[j.bin.length]
  const slot = j.slots.findIndex((s) => s.id === id)
  if (slot < 0 || j.slots[slot].back > j.t) return
  dropScrap(slot, -6.4, 1.2, 5.6)
  a.wait = 0.5
  if (j.bin.length + 1 >= 3) a.mix++
}
