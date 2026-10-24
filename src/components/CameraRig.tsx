import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clamp01, damp, radialAt, spiralAt, tangentAt } from '../game/config'
import { game } from '../game/state'

const pos = new THREE.Vector3()
const fwd = new THREE.Vector3()
const out = new THREE.Vector3()
const target = new THREE.Vector3()
const look = new THREE.Vector3()

/**
 * Cámara detrás de la personita, que queda abajo en el centro de la pantalla
 * mirando hacia el camino. Al principio está más cerca (el nacimiento);
 * al final se aleja y sube para mostrar el horizonte.
 */
export function CameraRig() {
  const lookSmooth = useRef(spiralAt(2).add(new THREE.Vector3(0, 1.2, 0)))

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game

    spiralAt(g.p, pos)
    tangentAt(g.p, fwd)
    radialAt(g.p, out)

    const intro = g.phase === 'intro' || g.phase === 'gather' || g.phase === 'look'
    const e = g.phase === 'end' ? clamp01(g.phaseT / 7) : 0
    const ee = e * e * (3 - 2 * e)

    const back = (intro ? 3.0 : 4.2) + ee * 8
    const side = (intro ? 0.2 : 0.9) + ee * 6
    const up = (intro ? 1.5 : 1.8) + ee * 5

    target.copy(pos).addScaledVector(fwd, -back).addScaledVector(out, side)
    target.y += up
    camera.position.lerp(target, damp(intro ? 1.5 : 2.5, dt))

    // Mira un poco por delante y por encima → la personita queda abajo en el centro
    if (intro) {
      look.copy(pos).addScaledVector(fwd, 3)
      look.y += 1.4
    } else {
      spiralAt(g.p + 5, look)
      look.y += 1.1 + ee * 3
    }
    lookSmooth.current.lerp(look, damp(3, dt))
    camera.lookAt(lookSmooth.current)
  })

  return null
}
