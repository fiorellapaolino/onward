import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GATES, N_TOTAL, RADIUS, STEP_ANGLE, STEP_H, STEP_THICK, damp } from '../game/config'
import { game } from '../game/state'

const STONE_LOW = new THREE.Color('#3b4068') // abajo: frío, apagado
const STONE_HIGH = new THREE.Color('#f2c6a6') // arriba: cálido
const GLOW = new THREE.Color('#fff4e0') // al aparecer / deshacerse brillan

const dummy = new THREE.Object3D()
const base = new THREE.Color()
const col = new THREE.Color()

const BEHIND = 14 // escalones que siguen visibles detrás antes de deshacerse en luz

/**
 * Todos los escalones en un solo objeto (InstancedMesh) para que sea rápido.
 * Solo existen los que están cerca: aparecen delante al avanzar
 * y se deshacen detrás. Cuanta más confianza, más lejos ves el camino.
 */
export function Stairs() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const appear = useMemo(() => new Float32Array(N_TOTAL), [])

  useLayoutEffect(() => {
    const m = ref.current
    dummy.scale.setScalar(0)
    dummy.updateMatrix()
    for (let i = 0; i < N_TOTAL; i++) {
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, STONE_LOW)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game
    const m = ref.current

    const closed = GATES.find((G) => !g.opened.has(G)) ?? N_TOTAL
    const ahead = g.phase === 'end' ? 8 : 1 + Math.round(g.c * 6)
    const visibleMax = Math.min(Math.floor(g.p) + ahead, closed - 1, N_TOTAL - 1)
    const k = damp(6, dt)

    for (let i = 0; i < N_TOTAL; i++) {
      const target = i <= visibleMax && i >= g.p - BEHIND ? 1 : 0
      appear[i] += (target - appear[i]) * k
      const a = appear[i]

      const angle = i * STEP_ANGLE
      dummy.position.set(
        Math.cos(angle) * RADIUS,
        i * STEP_H - STEP_THICK / 2 - (1 - a) * 0.6, // sube desde abajo al aparecer
        Math.sin(angle) * RADIUS,
      )
      dummy.rotation.set(0, -angle, 0)
      dummy.scale.setScalar(a < 0.001 ? 0 : a)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)

      base.copy(STONE_LOW).lerp(STONE_HIGH, i / N_TOTAL)
      col.copy(base).lerp(GLOW, 1 - a)
      m.setColorAt(i, col)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N_TOTAL]} frustumCulled={false}>
      <boxGeometry args={[1.7, STEP_THICK, 1.05]} />
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
  )
}
