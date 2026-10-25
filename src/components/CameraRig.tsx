import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clamp01, damp } from '../game/config'
import { game, input } from '../game/state'

const pos = new THREE.Vector3()
const fwd = new THREE.Vector3()
const target = new THREE.Vector3()
const look = new THREE.Vector3()
const ahead = new THREE.Vector3()

/**
 * Cámara en tercera persona que gira alrededor de la elfa.
 *   - Arrastrar con el ratón la gira (y arriba/abajo); la rueda acerca o aleja.
 *   - "camYaw" es hacia dónde mira la cámara en el mundo; el movimiento (W/A/S/D)
 *     es relativo a esa dirección.
 *   - Al principio y al final la cámara se coloca sola detrás de ella.
 */
export function CameraRig() {
  const lookSmooth = useRef(new THREE.Vector3(0, 1.3, 4))

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game

    const intro = g.phase === 'intro' || g.phase === 'rise' || g.phase === 'gather' || g.phase === 'look'
    const e = g.phase === 'end' ? clamp01(g.phaseT / 7) : 0
    const ee = e * e * (3 - 2 * e)

    // Al principio y al final la cámara se coloca sola detrás de ella
    if (!input.dragging && (intro || g.phase === 'end')) {
      const d = Math.atan2(Math.sin(g.yaw - input.camYaw), Math.cos(g.yaw - input.camYaw))
      input.camYaw += d * damp(intro ? 4 : 1.2, dt)
      input.camPitch += (0 - input.camPitch) * damp(1, dt)
    }

    pos.set(g.x, g.jumpY * 0.5, g.z)
    const cy = input.camYaw
    fwd.set(Math.sin(cy), 0, Math.cos(cy))

    const zoom = input.camZoom
    const back = ((intro ? 3.0 : 4.4) + ee * 6) * zoom
    const up = ((intro ? 1.5 : 1.9) + ee * 6) * zoom + input.camPitch * 3 * zoom

    // detrás de ella según hacia dónde mira la cámara
    target.copy(pos).addScaledVector(fwd, -back)
    target.y = Math.max(0.4, pos.y + up)
    camera.position.lerp(target, damp(input.dragging ? 12 : intro ? 2 : 6, dt))

    // mira un poco por delante de ella (en la dirección de la cámara); si la cámara está alta, mira más a ella
    ahead.copy(pos).addScaledVector(fwd, intro ? 3 : 6)
    ahead.y = 1.3 + ee * 2
    look.copy(pos).setY(0.8).lerp(ahead, 1 - clamp01(Math.max(0, input.camPitch) * 0.6))

    lookSmooth.current.lerp(look, damp(input.dragging ? 12 : 5, dt))
    camera.lookAt(lookSmooth.current)
  })

  return null
}
