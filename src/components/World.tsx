import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { PATH_END, PATH_LEN, clamp01, gradient, pathAt } from '../game/config'
import { game } from '../game/state'

// El bosque cambia a medida que avanza:
// noche azul verdosa → bosque en penumbra → luz verde entre las hojas → amanecer dorado
const SKY = ['#060a12', '#0c1a20', '#1d3534', '#5d7f58', '#d9c48c', '#f7e5c2'].map((c) => new THREE.Color(c))
const GROUND = ['#0d1712', '#1a2b1c', '#2f4a2a', '#56733b', '#8a9a4e', '#a9a85c'].map((c) => new THREE.Color(c))

const tmp = new THREE.Color()
const end = pathAt(PATH_LEN)

export function World() {
  const scene = useThree((s) => s.scene)
  const ground = useRef<THREE.MeshStandardMaterial>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const sun = useRef<THREE.DirectionalLight>(null!)
  const fireflies = useRef<THREE.Group>(null!)

  useFrame(() => {
    const f = clamp01(game.p / PATH_LEN)

    gradient(SKY, f, tmp)
    if (scene.background instanceof THREE.Color) scene.background.copy(tmp)
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(tmp)
      // la niebla se abre: cada vez ve más lejos
      scene.fog.near = 5 + f * 25
      scene.fog.far = 24 + f * 110
    }

    gradient(GROUND, f, ground.current.color)
    hemi.current.intensity = 0.35 + f * 1.2
    sun.current.intensity = 0.1 + f * 2.4

    // las luciérnagas acompañan a la elfa
    pathAt(game.p, fireflies.current.position)
  })

  return (
    <>
      <color attach="background" args={['#060a12']} />
      <fog attach="fog" args={['#060a12', 5, 24]} />
      <hemisphereLight ref={hemi} args={['#b9d4ff', '#2a3320', 0.35]} />
      {/* El "sol" viene desde la luz del final */}
      <directionalLight ref={sun} position={[end.x + 20, 45, end.z + 40]} intensity={0.1} color="#ffe2b8" />

      {/* Suelo del bosque */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, PATH_END / 2]}>
        <planeGeometry args={[260, PATH_END + 220]} />
        <meshStandardMaterial ref={ground} roughness={1} />
      </mesh>

      <group ref={fireflies}>
        <Sparkles count={90} scale={[18, 5, 26]} position={[0, 2, 6]} size={4} speed={0.25} color="#e9ff9a" />
      </group>
    </>
  )
}
