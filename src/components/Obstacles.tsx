import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Clone, Sparkles, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { GATES, GATE_KINDS, OPEN_TIME, clamp01, headingAt, natureUrl, pathAt, rng } from '../game/config'
import { game } from '../game/state'
import { useGlowTexture } from './TheLight'

/*
 * Los cuatro obstáculos del sendero. Cada uno se abre con una herramienta:
 *   copa  → arroyo:    el agua se calma y emergen piedras para cruzar
 *   espada → ramas:     las ramas se apartan
 *   vara  → oscuridad: la oscuridad se disuelve en luces
 *   oro   → barranco:  la tierra crece y forma un puente
 */

/** Cuánto se ha abierto un obstáculo: 0 cerrado → 1 abierto. */
function openness(G: number) {
  const t = game.openedAt.get(G)
  if (t === undefined) return 0
  const x = clamp01((game.time - t) / OPEN_TIME)
  return x * x * (3 - 2 * x)
}

export function Obstacles() {
  return (
    <>
      {GATES.map((G, i) => {
        const p = pathAt(G)
        const h = headingAt(G)
        const kind = GATE_KINDS[i]
        return (
          <group key={G} position={p} rotation-y={h}>
            {kind === 'water' && <Water G={G} />}
            {kind === 'branches' && <Branches G={G} />}
            {kind === 'dark' && <Darkness G={G} />}
            {kind === 'chasm' && <Chasm G={G} />}
          </group>
        )
      })}
    </>
  )
}

// ── Arroyo ──────────────────────────────────────────────────────
function Water({ G }: { G: number }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null!)
  const stones = useRef<(THREE.Group | null)[]>([])
  const { scene: pebble } = useGLTF(natureUrl('RockPath_Round_Small_1'))
  const { scene: rock } = useGLTF(natureUrl('Rock_Medium_2'))

  useFrame(() => {
    const o = openness(G)
    mat.current.emissiveIntensity = 0.35 + Math.sin(game.time * 2) * 0.1 + o * 0.6
    mat.current.opacity = 0.8 - o * 0.15
    stones.current.forEach((s, i) => {
      if (!s) return
      const t = clamp01(o * 3 - i * 0.6) // emergen una tras otra
      s.position.y = -0.4 + t * 0.47
      s.scale.setScalar(0.9 * Math.max(0.001, t))
    })
  })

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
        <planeGeometry args={[18, 3.4]} />
        <meshStandardMaterial ref={mat} color="#3c6f86" emissive="#1b4b63" transparent opacity={0.8} roughness={0.1} metalness={0.1} />
      </mesh>
      {[-0.95, 0, 0.95].map((z, i) => (
        <group
          key={z}
          position={[(i - 1) * 0.15, -0.4, z]}
          ref={(el) => {
            stones.current[i] = el
          }}
        >
          <Clone object={pebble} />
        </group>
      ))}
      <group position={[-7, -0.3, 0.4]} scale={0.5}>
        <Clone object={rock} />
      </group>
      <group position={[6.5, -0.3, -0.6]} scale={0.45} rotation-y={2}>
        <Clone object={rock} />
      </group>
      <Sparkles count={30} scale={[10, 1, 3]} position={[0, 0.5, 0]} size={2} speed={0.2} color="#bfe8ff" />
    </>
  )
}

// ── Ramas ───────────────────────────────────────────────────────
function Branches({ G }: { G: number }) {
  const { scene: bush } = useGLTF(natureUrl('Bush_Common'))
  const { scene: fern } = useGLTF(natureUrl('Fern_1'))
  const items = useMemo(() => {
    const r = rng(G)
    return Array.from({ length: 9 }, (_, i) => ({
      x: -4 + i * 1,
      z: (r() - 0.5) * 0.8,
      s: 1.3 + r() * 0.5,
      rot: r() * Math.PI * 2,
      fern: i % 3 === 1,
    }))
  }, [G])
  const refs = useRef<(THREE.Group | null)[]>([])

  useFrame(() => {
    const o = openness(G)
    items.forEach((it, i) => {
      const g = refs.current[i]
      if (!g) return
      const dir = it.x === 0 ? (i % 2 ? 1 : -1) : Math.sign(it.x)
      g.position.x = it.x + dir * o * (4.5 - Math.abs(it.x) * 0.4)
      g.rotation.z = -dir * o * 0.5
      g.scale.setScalar(it.s * (it.fern ? 0.45 : 1) * (1 - o * 0.35))
    })
  })

  return (
    <>
      {items.map((it, i) => (
        <group
          key={i}
          position={[it.x, 0, it.z]}
          rotation-y={it.rot}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Clone object={it.fern ? fern : bush} />
        </group>
      ))}
    </>
  )
}

// ── Oscuridad ───────────────────────────────────────────────────
function Darkness({ G }: { G: number }) {
  const tex = useGlowTexture()
  const clouds = useRef<(THREE.Sprite | null)[]>([])
  const lights = useRef<THREE.Group>(null!)
  const puffs = useMemo(() => {
    const r = rng(G + 1)
    return Array.from({ length: 7 }, (_, i) => ({ x: (i - 3) * 1.6, y: 1.2 + r() * 2, z: r() * 2.5, s: 5 + r() * 3 }))
  }, [G])

  useFrame(() => {
    const o = openness(G)
    puffs.forEach((pf, i) => {
      const sp = clouds.current[i]
      if (!sp) return
      const m = sp.material as THREE.SpriteMaterial
      m.opacity = 0.95 * (1 - o)
      sp.scale.setScalar(pf.s * (1 + o * 0.8) * (1 + Math.sin(game.time * 0.7 + i) * 0.05))
      sp.position.x = pf.x + Math.sin(game.time * 0.4 + i) * 0.2
    })
    lights.current.visible = o > 0.05
  })

  return (
    <>
      {puffs.map((pf, i) => (
        <sprite
          key={i}
          position={[pf.x, pf.y, pf.z]}
          ref={(el) => {
            clouds.current[i] = el
          }}
        >
          <spriteMaterial map={tex} color="#020306" transparent depthWrite={false} opacity={0.95} />
        </sprite>
      ))}
      <group ref={lights}>
        <Sparkles count={60} scale={[9, 4, 4]} position={[0, 2, 1]} size={5} speed={0.6} color="#fff1b8" />
      </group>
    </>
  )
}

// ── Barranco ────────────────────────────────────────────────────
function Chasm({ G }: { G: number }) {
  const { scene: slab } = useGLTF(natureUrl('RockPath_Round_Wide'))
  const { scene: rock } = useGLTF(natureUrl('Rock_Medium_1'))
  const bridge = useRef<(THREE.Group | null)[]>([])
  const PIECES = [-1.2, -0.4, 0.4, 1.2]

  useFrame(() => {
    const o = openness(G)
    bridge.current.forEach((b, i) => {
      if (!b) return
      const t = clamp01(o * 2.2 - i * 0.35) // la tierra crece de un borde al otro
      b.position.y = -0.6 + t * 0.66
      b.scale.setScalar(0.75 * Math.max(0.001, t))
    })
  })

  return (
    <>
      {/* El hueco: una franja oscura que cruza el bosque */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
        <planeGeometry args={[14, 3.2]} />
        <meshBasicMaterial color="#010203" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.011}>
        <planeGeometry args={[16, 4.2]} />
        <meshBasicMaterial color="#0d120c" transparent opacity={0.85} />
      </mesh>
      {[-6.5, -4, 3.8, 6.2].map((x, i) => (
        <group key={x} position={[x, -0.25, i % 2 ? 1.9 : -1.9]} scale={0.35} rotation-y={i}>
          <Clone object={rock} />
        </group>
      ))}
      {PIECES.map((z, i) => (
        <group
          key={z}
          position={[0, -0.6, z]}
          rotation-y={i * 1.3}
          ref={(el) => {
            bridge.current[i] = el
          }}
        >
          <Clone object={slab} />
        </group>
      ))}
    </>
  )
}
