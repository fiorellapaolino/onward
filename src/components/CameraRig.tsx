import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clamp01, damp, pathAt, sideAt, tangentAt } from '../game/config'
import { game, input } from '../game/state'

const pos = new THREE.Vector3()
const fwd = new THREE.Vector3()
const side = new THREE.Vector3()
const offset = new THREE.Vector3()
const target = new THREE.Vector3()
const look = new THREE.Vector3()
const ahead = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/**
 * Cámara detrás de la elfa, que queda abajo en el centro de la pantalla
 * mirando hacia el sendero. Al principio está más cerca (el nacimiento);
 * al final se eleva para mostrar el claro y los caminos que siguen.
 *
 * Con el ratón se puede girar alrededor de ella (arrastrar) y acercar/alejar (rueda).
 * Cuando sueltas y la elfa camina, la cámara vuelve poco a poco a su sitio detrás.
 */
export function CameraRig() {
  const lookSmooth = useRef(new THREE.Vector3(0, 1.3, 4))

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game

    // Al caminar sin tocar el ratón, la cámara vuelve suavemente detrás de ella
    if (!input.dragging && g.speed > 0.3) {
      const k = damp(0.6, dt)
      input.camYaw += (0 - input.camYaw) * k
      input.camPitch += (0 - input.camPitch) * k
    }

    pathAt(g.p, pos)
    tangentAt(g.p, fwd)
    sideAt(g.p, side)

    const intro = g.phase === 'intro' || g.phase === 'rise' || g.phase === 'gather' || g.phase === 'look'
    const e = g.phase === 'end' ? clamp01(g.phaseT / 7) : 0
    const ee = e * e * (3 - 2 * e)

    const z = input.camZoom
    const back = ((intro ? 3.0 : 4.4) + ee * 6) * z
    const off = (intro ? 0.15 : 0.5) + ee * 2
    const up = ((intro ? 1.5 : 1.9) + ee * 6) * z + input.camPitch * 3 * z

    // posición detrás de ella, girada alrededor de la elfa según lo que arrastres
    offset.copy(fwd).multiplyScalar(-back).addScaledVector(side, off).applyAxisAngle(UP, input.camYaw)
    target.copy(pos).add(offset)
    target.y = Math.max(0.4, pos.y + up)
    camera.position.lerp(target, damp(input.dragging ? 10 : intro ? 1.5 : 2.5, dt))

    // Hacia dónde mira: por delante en el sendero… o a la elfa si la estás rodeando
    if (intro) {
      ahead.copy(pos).addScaledVector(fwd, 3)
      ahead.y += 1.4
    } else {
      pathAt(g.p + 7, ahead)
      ahead.y += 1.3 + ee * 2
    }
    const orbit = clamp01(Math.abs(input.camYaw) / 0.7 + Math.max(0, input.camPitch) * 0.5)
    look.copy(pos).setY(pos.y + 0.8).lerp(ahead, 1 - orbit)

    lookSmooth.current.lerp(look, damp(input.dragging ? 10 : 3, dt))
    camera.lookAt(lookSmooth.current)
  })

  return null
}
