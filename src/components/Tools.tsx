import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BIRTH_TIME, TOOL_FLY, TOOL_TO_GATE, clamp01, pathAt } from '../game/config'
import { game } from '../game/state'

/*
 * Las cuatro herramientas del Mago: copa, espada, vara y oro.
 * 1. Flotan alrededor de la personita cuando nace.
 * 2. Al empezar, vuelan a ella una por una y la acompañan girando.
 * 3. En cada obstáculo, una vuela hasta él y le abre paso.
 * Mensaje: ya tienes lo que necesitas para seguir adelante.
 */

const player = new THREE.Vector3()
const around = new THREE.Vector3()
const carried = new THREE.Vector3()
const gatePos = new THREE.Vector3()
const ease = (t: number) => t * t * (3 - 2 * t)

function aroundPos(k: number, out: THREE.Vector3) {
  // Círculo amplio alrededor de donde nace, de cara a la cámara
  const a = k * (Math.PI / 2) + Math.PI / 4 + game.time * 0.25
  pathAt(0, player)
  return out.set(
    player.x + Math.cos(a) * 0.9,
    player.y + 0.7 + Math.sin(game.time * 1.3 + k) * 0.08,
    player.z + Math.sin(a) * 0.9,
  )
}

function carriedPos(k: number, out: THREE.Vector3) {
  // Círculo pequeño que la acompaña mientras sube
  const a = k * (Math.PI / 2) + game.time * 1.2
  player.set(game.x, 0, game.z)
  return out.set(
    player.x + Math.cos(a) * 0.45,
    player.y + 0.85 + Math.sin(game.time * 2 + k) * 0.05,
    player.z + Math.sin(a) * 0.45,
  )
}

export function Tools() {
  const refs = useRef<THREE.Group[]>([])
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffd98a',
        emissive: '#ffb347',
        emissiveIntensity: 1.4,
        roughness: 0.4,
        metalness: 0.3,
      }),
    [],
  )

  useFrame(() => {
    const g = game
    g.tools.forEach((tool, k) => {
      const obj = refs.current[k]
      if (!obj) return
      let scale = 1

      switch (tool.state) {
        case 'around': {
          aroundPos(k, obj.position)
          // aparecen un poco después de que nace
          // aparecen poco a poco desde que nace (sin saltos al pasar de una fase a otra)
          const since = g.phase === 'intro' ? g.phaseT : g.phase === 'rise' ? BIRTH_TIME * 0.9 + g.phaseT : 99
          scale = clamp01((since - 0.3) / 1.2)
          break
        }
        case 'flyingIn': {
          const t = ease(clamp01(tool.t / TOOL_FLY))
          aroundPos(k, around)
          carriedPos(k, carried)
          obj.position.copy(around).lerp(carried, t)
          obj.position.y += Math.sin(t * Math.PI) * 0.3
          scale = 1 - t * 0.45
          break
        }
        case 'carried': {
          carriedPos(k, obj.position)
          scale = 0.55
          break
        }
        case 'toGate': {
          const t = ease(clamp01(tool.t / TOOL_TO_GATE))
          carriedPos(k, carried)
          pathAt(tool.gate, gatePos)
          gatePos.y += 0.9
          obj.position.copy(carried).lerp(gatePos, t)
          obj.position.y += Math.sin(t * Math.PI) * 0.8
          scale = 0.55 + t * 0.9
          break
        }
        case 'used':
          scale = 0
          break
      }

      obj.scale.setScalar(Math.max(0.001, scale))
      obj.rotation.y = g.time * 0.8 + k
    })
  })

  const set = (k: number) => (el: THREE.Group | null) => {
    if (el) refs.current[k] = el
  }

  return (
    <>
      {/* Copa */}
      <group ref={set(0)}>
        <mesh material={material} position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.1, 0.05, 0.14, 20]} />
        </mesh>
        <mesh material={material} position={[0, -0.06, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.1, 8]} />
        </mesh>
        <mesh material={material} position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.015, 20]} />
        </mesh>
      </group>

      {/* Espada */}
      <group ref={set(1)}>
        <mesh material={material} position={[0, 0.07, 0]}>
          <boxGeometry args={[0.035, 0.32, 0.01]} />
        </mesh>
        <mesh material={material} position={[0, -0.1, 0]}>
          <boxGeometry args={[0.14, 0.025, 0.025]} />
        </mesh>
        <mesh material={material} position={[0, -0.16, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.1, 8]} />
        </mesh>
      </group>

      {/* Vara */}
      <group ref={set(2)} rotation={[0, 0, 0.3]}>
        <mesh material={material}>
          <cylinderGeometry args={[0.018, 0.018, 0.38, 8]} />
        </mesh>
        <mesh material={material} position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.04, 12, 12]} />
        </mesh>
      </group>

      {/* Oro (pentáculo: moneda con estrella grabada, aquí un disco con un aro) */}
      <group ref={set(3)}>
        <mesh material={material} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.02, 5]} />
        </mesh>
        <mesh material={material}>
          <torusGeometry args={[0.13, 0.012, 6, 30]} />
        </mesh>
      </group>
    </>
  )
}
