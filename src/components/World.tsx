import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { PATH_LEN, clamp01, gradient } from '../game/config'
import { game } from '../game/state'
import { Ground } from './Ground'

// Versión iluminada (de día). La oscuridad del principio se añadirá más adelante.
// El bosque cambia a medida que avanza: mañana fresca → luz verde entre las hojas → luz dorada
const SKY = ['#bcd9e6', '#c4dfe2', '#cfe4d6', '#e4e6c4', '#f6e3b8', '#fbeacb'].map((c) => new THREE.Color(c))
// tinte que se aplica sobre la textura del pasto (blanco = color original)
const GROUND = ['#f2f7ee', '#ffffff', '#ffffff', '#fffbe8', '#fff4d6', '#ffefcc'].map((c) => new THREE.Color(c))

const tmp = new THREE.Color()

export function World() {
  const scene = useThree((s) => s.scene)
  const ground = useRef<THREE.MeshStandardMaterial>(null)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const sun = useRef<THREE.DirectionalLight>(null!)
  const fireflies = useRef<THREE.Group>(null!)
  const fogOpen = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const f = clamp01(game.pMax / PATH_LEN) // lo más lejos que llegó: la luz no retrocede

    gradient(SKY, f, tmp)
    if (scene.background instanceof THREE.Color) scene.background.copy(tmp)
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(tmp)
      // la niebla se abre: cada vez ve más lejos
      // al nacer hay niebla espesa; cuando entran los graves en la canción, se abre de golpe
      const open = game.phase !== 'intro' ? 1 : 0
      fogOpen.current += (open - fogOpen.current) * Math.min(1, dt * (open ? 0.9 : 5))
      const o = fogOpen.current
      scene.fog.near = (2 + o * 23) + f * 20
      scene.fog.far = (12 + o * 98) + f * 60
    }

    if (ground.current) gradient(GROUND, f, ground.current.color)
    hemi.current.intensity = 1.6 + f * 0.4
    sun.current.intensity = 2.6 + f * 0.8

    // las luciérnagas acompañan a la elfa
    fireflies.current.position.set(game.x, 0, game.z)
  })

  return (
    <>
      <color attach="background" args={['#bcd9e6']} />
      <fog attach="fog" args={['#bcd9e6', 25, 110]} />
      <hemisphereLight ref={hemi} args={['#e6f2ff', '#5a6b3a', 1.6]} />
      <ambientLight intensity={0.35} />
      {/* El sol viene de detrás de la cámara y desde arriba, para que la elfa y los árboles se vean iluminados de frente */}
      <directionalLight ref={sun} position={[25, 50, -35]} intensity={2.6} color="#fff1d6" />

      {/* Suelo del bosque: pasto con textura y sendero de tierra */}
      <Ground tintRef={ground} />

      <group ref={fireflies}>
        <Sparkles count={90} scale={[18, 5, 26]} position={[0, 2, 6]} size={4} speed={0.25} color="#e9ff9a" />
      </group>
    </>
  )
}
