import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { N_GOAL, N_TOTAL, STEP_H, clamp01, gradient, spiralAt } from '../game/config'
import { game } from '../game/state'

// El mundo cambia de color a medida que subes:
// noche → violeta → amanecer → luz cálida
const SKY = ['#0b0d1a', '#241f48', '#6b4a78', '#e49a7e', '#fbe3c8'].map((c) => new THREE.Color(c))
const MOUNTAIN = ['#151829', '#2b2850', '#5b4a6e', '#b07e74', '#e8bfa5'].map((c) => new THREE.Color(c))

const MOUNTAIN_H = N_TOTAL * STEP_H - 4
const tmp = new THREE.Color()
const start = spiralAt(0)

export function World() {
  const scene = useThree((s) => s.scene)
  const mountain = useRef<THREE.MeshStandardMaterial>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const sun = useRef<THREE.DirectionalLight>(null!)
  const sparkles = useRef<THREE.Group>(null!)

  useFrame(() => {
    const f = clamp01(game.p / N_GOAL)

    gradient(SKY, f, tmp)
    if (scene.background instanceof THREE.Color) scene.background.copy(tmp)
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(tmp)
      // la niebla se abre: cada vez ves más lejos
      scene.fog.near = 6 + f * 20
      scene.fog.far = 26 + f * 120
    }

    gradient(MOUNTAIN, f, mountain.current.color)
    hemi.current.intensity = 0.25 + f * 1.1
    sun.current.intensity = f * 2.2

    // las partículas acompañan a la personita
    spiralAt(game.p, sparkles.current.position)
  })

  return (
    <>
      <color attach="background" args={['#0b0d1a']} />
      <fog attach="fog" args={['#0b0d1a', 6, 26]} />
      <hemisphereLight ref={hemi} args={['#c9d4ff', '#2a2238', 0.25]} />
      <directionalLight ref={sun} position={[30, 80, 20]} intensity={0} color="#ffe2c4" />

      {/* Montaña central alrededor de la que sube la escalera */}
      <mesh position={[0, MOUNTAIN_H / 2 - 4, 0]}>
        <cylinderGeometry args={[1, 5, MOUNTAIN_H, 40, 1]} />
        <meshStandardMaterial ref={mountain} roughness={1} flatShading />
      </mesh>

      {/* Plataforma donde nace */}
      <mesh position={[start.x, -0.16, start.z]}>
        <cylinderGeometry args={[1.4, 1.5, 0.3, 32]} />
        <meshStandardMaterial color="#2c3052" roughness={0.9} />
      </mesh>

      {/* Mar de nubes abajo */}
      <mesh rotation-x={-Math.PI / 2} position-y={-4}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#14162a" roughness={1} />
      </mesh>

      <group ref={sparkles}>
        <Sparkles count={160} scale={[24, 14, 24]} size={3} speed={0.3} color="#ffe8c8" />
      </group>
    </>
  )
}
