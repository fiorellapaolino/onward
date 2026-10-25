import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GIRL_S, clamp01, damp, tangentAt } from '../game/config'
import { game, input } from '../game/state'
import { GIRL } from '../game/village'
import { GIFT, elfHand, giftSeedPos, inGiftScene } from '../game/gift'

const pos = new THREE.Vector3()
const fwd = new THREE.Vector3()
const target = new THREE.Vector3()
const look = new THREE.Vector3()
const ahead = new THREE.Vector3()
const mid = new THREE.Vector3()
const perp = new THREE.Vector3()
const tmpV = new THREE.Vector3()
const seedP = new THREE.Vector3()

/**
 * Cámara en tercera persona que gira alrededor de la elfa.
 *   - Arrastrar con el ratón la gira (y arriba/abajo); la rueda acerca o aleja.
 *   - "camYaw" es hacia dónde mira la cámara en el mundo; el movimiento (W/A/S/D)
 *     es relativo a esa dirección.
 *   - Al principio y al final la cámara se coloca sola detrás de ella.
 */
export function CameraRig() {
  const lookSmooth = useRef(new THREE.Vector3(0, 1.3, 4))
  const cineSide = useRef(0)

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

    // ── La escena de la semilla: plano de las dos, de perfil, mirando la semilla subir ──
    if (inGiftScene()) {
      const k = g.time - g.giftAt
      mid.set((g.x + GIRL.x) / 2, 0, (g.z + GIRL.z) / 2)
      perp.set(GIRL.z - g.z, 0, -(GIRL.x - g.x)).normalize()
      // del lado de la aldea (ahí solo hay pasto: nada tapa la vista)
      if (cineSide.current === 0) cineSide.current = perp.dot(tangentAt(GIRL_S, tmpV)) >= 0 ? 1 : -1
      const rise = Math.max(0, Math.min(1, (k - GIFT.RELEASE) / 3))
      const dist = 1.7 + rise * 0.8
      target.copy(mid).addScaledVector(perp, dist * cineSide.current)
      target.y = 0.85 + rise * 0.3
      camera.position.lerp(target, damp(2.2, dt))
      giftSeedPos(k, elfHand(tmpV), seedP)
      look.set(mid.x, 0.75 + Math.max(0, Math.min(seedP.y, 3) - 0.75) * 0.55, mid.z)
      lookSmooth.current.lerp(look, damp(2.5, dt))
      camera.lookAt(lookSmooth.current)
      // al terminar, la cámara vuelve detrás de ella mirando hacia donde mira
      input.camYaw = g.yaw
      return
    }
    cineSide.current = 0

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
