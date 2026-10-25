import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clamp01, damp, pathAt, sideAt, tangentAt } from '../game/config'
import { game } from '../game/state'

const pos = new THREE.Vector3()
const fwd = new THREE.Vector3()
const side = new THREE.Vector3()
const target = new THREE.Vector3()
const look = new THREE.Vector3()

/**
 * Cámara detrás de la elfa, que queda abajo en el centro de la pantalla
 * mirando hacia el sendero. Al principio está más cerca (el nacimiento);
 * al final se eleva para mostrar el claro y los caminos que siguen.
 */
export function CameraRig() {
  const lookSmooth = useRef(new THREE.Vector3(0, 1.3, 4))

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game

    pathAt(g.p, pos)
    tangentAt(g.p, fwd)
    sideAt(g.p, side)

    const intro = g.phase === 'intro' || g.phase === 'gather' || g.phase === 'look'
    const e = g.phase === 'end' ? clamp01(g.phaseT / 7) : 0
    const ee = e * e * (3 - 2 * e)

    const back = (intro ? 3.0 : 4.4) + ee * 6
    const off = (intro ? 0.15 : 0.5) + ee * 2
    const up = (intro ? 1.5 : 1.9) + ee * 6

    target.copy(pos).addScaledVector(fwd, -back).addScaledVector(side, off)
    target.y += up
    camera.position.lerp(target, damp(intro ? 1.5 : 2.5, dt))

    // Mira por delante y un poco arriba → la elfa queda abajo en el centro
    if (intro) {
      look.copy(pos).addScaledVector(fwd, 3)
      look.y += 1.4
    } else {
      pathAt(g.p + 7, look)
      look.y += 1.3 + ee * 2
    }
    lookSmooth.current.lerp(look, damp(3, dt))
    camera.lookAt(lookSmooth.current)
  })

  return null
}
