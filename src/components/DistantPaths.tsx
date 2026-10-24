import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { N_GOAL, clamp01, smoothstep, spiralAt } from '../game/config'
import { game } from '../game/state'

/*
 * Otras escaleras de luz a lo lejos, alrededor de la montaña.
 * Se insinúan cerca de la cima y aparecen del todo al llegar:
 * siempre hay más camino por delante.
 */
const STEPS = 70
const top = spiralAt(N_GOAL)

const PATHS = Array.from({ length: 6 }, (_, k) => {
  const a = k * (Math.PI / 3) + 0.3
  const dist = 70 + (k % 2) * 30
  return {
    center: new THREE.Vector3(Math.cos(a) * dist, top.y - 15 + k * 6, Math.sin(a) * dist),
    radius: 5 + (k % 3) * 2,
    turn: 0.18 + (k % 2) * 0.05,
  }
})

function Path({ center, radius, turn, geometry, material }: {
  center: THREE.Vector3
  radius: number
  turn: number
  geometry: THREE.BufferGeometry
  material: THREE.Material
}) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D()
    for (let i = 0; i < STEPS; i++) {
      const a = i * turn
      dummy.position.set(center.x + Math.cos(a) * radius, center.y + i * 0.3, center.z + Math.sin(a) * radius)
      dummy.rotation.set(0, -a, 0)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  }, [center, radius, turn])
  return <instancedMesh ref={ref} args={[geometry, material, STEPS]} frustumCulled={false} />
}

export function DistantPaths() {
  const geometry = useMemo(() => new THREE.BoxGeometry(1.4, 0.12, 0.8), [])
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#fff1d6',
        transparent: true,
        opacity: 0,
        toneMapped: false,
        fog: false,
      }),
    [],
  )

  useFrame(() => {
    const f = game.p / N_GOAL
    const endT = game.phase === 'end' ? game.phaseT : 0
    material.opacity = smoothstep(0.8, 1, f) * 0.3 + clamp01(endT / 4) * 0.7
  })

  return (
    <>
      {PATHS.map((p, k) => (
        <Path key={k} {...p} geometry={geometry} material={material} />
      ))}
    </>
  )
}
