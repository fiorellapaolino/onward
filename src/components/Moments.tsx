import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Clone, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clamp01, natureUrl, rng } from '../game/config'
import { game } from '../game/state'
import { BUDS, GROVE, PUDDLES, SEED_TREE, moments } from '../game/moments'
import { DynamicModel, placeMatrix } from './instancing'
import { useGlowTexture } from './TheLight'

/*
 * Lo que se ve de los momentos de estar viva (la lógica está en game/moments.ts).
 */
export function Moments() {
  return (
    <>
      <SeedTree />
      <Puddles />
      <GroveFireflies />
      <Meadow />
    </>
  )
}

// ── La semilla que gira ─────────────────────────────────────────
const TREE_URL = natureUrl('CommonTree_2')
const seedMat = new THREE.MeshStandardMaterial({ color: '#d9b26a', roughness: 0.8, side: THREE.DoubleSide, emissive: '#ffcf7a', emissiveIntensity: 0 })

/** Una semilla con alas (como las del arce): dos alitas planas que la hacen girar al caer. */
function Samara({ refFn }: { refFn: (g: THREE.Group | null) => void }) {
  return (
    <group ref={refFn}>
      <mesh material={seedMat}>
        <sphereGeometry args={[0.022, 8, 6]} />
      </mesh>
      <mesh material={seedMat} position={[0.075, 0.005, 0]} rotation={[0.25, 0, 0.12]}>
        <planeGeometry args={[0.14, 0.045]} />
      </mesh>
      <mesh material={seedMat} position={[-0.075, 0.005, 0]} rotation={[-0.25, 0, -0.12]}>
        <planeGeometry args={[0.14, 0.045]} />
      </mesh>
    </group>
  )
}

const AMBIENT = 4 // semillas que caen solas, una y otra vez
function SeedTree() {
  const { scene } = useGLTF(TREE_URL)
  const refs = useRef<(THREE.Group | null)[]>([])
  const guided = useRef<THREE.Group | null>(null)
  const glow = useRef<THREE.Sprite>(null!)
  const tex = useGlowTexture()
  const glowMat = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ffd98a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    [tex],
  )
  const seeds = useMemo(() => {
    const r = rng(55)
    return Array.from({ length: AMBIENT }, () => ({ a: r() * 6.28, d: 0.6 + r() * 2, period: 6 + r() * 4, off: r() * 10 }))
  }, [])

  useFrame(() => {
    const g = game
    const t = g.time
    seeds.forEach((sd, i) => {
      const o = refs.current[i]
      if (!o) return
      const u = ((t + sd.off) % sd.period) / sd.period // 0 arriba → 1 en el suelo
      const y = 4.6 * (1 - u)
      const swirl = sd.a + u * 5
      o.position.set(SEED_TREE.x + Math.cos(swirl) * sd.d * (0.4 + u * 0.6), Math.max(0.02, y), SEED_TREE.z + Math.sin(swirl) * sd.d * (0.4 + u * 0.6))
      o.rotation.set(0.3, t * 9 + i, 0) // gira como una hélice
    })

    // la que baja a su mano
    const s = guided.current
    if (!s) return
    const m = moments
    const done = m.done.seed
    const hand = { x: g.x + Math.sin(g.yaw) * 0.22, y: 0.62, z: g.z + Math.cos(g.yaw) * 0.22 }
    if (done !== undefined) {
      // brilla en su mano y entra en su pecho
      const k = clamp01((t - done) / 1.2)
      s.visible = k < 1
      s.position.set(hand.x + (g.x - hand.x) * k, hand.y + 0.05 * k, hand.z + (g.z - hand.z) * k)
      s.scale.setScalar(1 - k * 0.8)
      seedMat.emissiveIntensity = 2 * (1 - k)
      glowMat.opacity = 0.9 * (1 - k)
      glow.current.position.copy(s.position)
    } else if (m.seedT >= 0) {
      const u = clamp01(m.seedT / 4.2)
      const e = u * u * (3 - 2 * u)
      const swirl = u * 9
      const rad = 0.9 * (1 - e)
      s.visible = true
      s.position.set(hand.x + Math.cos(swirl) * rad, 4.5 + (hand.y - 4.5) * e, hand.z + Math.sin(swirl) * rad)
      s.rotation.set(0.3, t * 9 * (1 - u * 0.7), 0)
      s.scale.setScalar(1.4)
      seedMat.emissiveIntensity = u * 0.6
      glowMat.opacity = u * 0.5
      glow.current.position.copy(s.position)
    } else {
      s.visible = false
      glowMat.opacity = 0
    }
  })

  return (
    <group>
      <Clone object={scene} position={[SEED_TREE.x, 0, SEED_TREE.z]} scale={1.5} rotation-y={0.7} />
      {seeds.map((_, i) => (
        <Samara
          key={i}
          refFn={(el) => {
            refs.current[i] = el
          }}
        />
      ))}
      <Samara
        refFn={(el) => {
          guided.current = el
        }}
      />
      <sprite ref={glow} material={glowMat} scale={0.5} />
    </group>
  )
}

// ── Charcos ─────────────────────────────────────────────────────
const DROPS = 14
const waterMat = new THREE.MeshStandardMaterial({ color: '#7d9cb8', roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.8 })
const ringMat = new THREE.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
const dropMat = new THREE.MeshBasicMaterial({ color: '#dff0ff', transparent: true, opacity: 0.9 })
function Puddles() {
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const drops = useRef<(THREE.Mesh | null)[]>([])
  const dirs = useMemo(() => {
    const r = rng(9)
    return Array.from({ length: DROPS }, () => ({ a: r() * 6.28, v: 1 + r() * 1.4, up: 2.2 + r() * 1.6 }))
  }, [])

  useFrame(() => {
    const g = game
    const m = moments
    // el último chapuzón: anillo que se abre y gotas que saltan
    const last = Math.max(...m.splashAt)
    const t = g.time - last
    PUDDLES.forEach((p, i) => {
      const r = rings.current[i]
      if (!r) return
      const tt = g.time - m.splashAt[i]
      const k = clamp01(tt / 0.9)
      r.visible = tt < 0.9
      r.scale.setScalar(0.2 + k * p.r * 1.3)
      ;(r.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k)
      r.position.set(m.splashX, 0.03, m.splashZ)
    })
    drops.current.forEach((d, i) => {
      if (!d) return
      const dd = dirs[i]
      d.visible = t < 0.6
      if (!d.visible) return
      d.position.set(m.splashX + Math.cos(dd.a) * dd.v * t, 0.05 + dd.up * t - 9 * t * t, m.splashZ + Math.sin(dd.a) * dd.v * t)
    })
  })

  return (
    <group>
      {PUDDLES.map((p, i) => (
        <group key={i}>
          <mesh material={waterMat} position={[p.x, 0.018, p.z]} rotation-x={-Math.PI / 2} scale={[1, 0.78, 1]}>
            <circleGeometry args={[p.r, 24]} />
          </mesh>
          <mesh
            ref={(el) => {
              rings.current[i] = el
            }}
            material={ringMat.clone()}
            rotation-x={-Math.PI / 2}
            visible={false}
          >
            <ringGeometry args={[0.85, 1, 28]} />
          </mesh>
        </group>
      ))}
      {dirs.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            drops.current[i] = el
          }}
          material={dropMat}
          visible={false}
        >
          <sphereGeometry args={[0.025, 6, 4]} />
        </mesh>
      ))}
    </group>
  )
}

// ── Luciérnagas del bosquecillo ────────────────────────────────
const FLIES = 36
function GroveFireflies() {
  const tex = useGlowTexture()
  const mat = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#eaff9a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    [tex],
  )
  const refs = useRef<(THREE.Sprite | null)[]>([])
  const light = useRef<THREE.PointLight>(null!)
  const flies = useMemo(() => {
    const r = rng(31)
    return Array.from({ length: FLIES }, () => ({
      home: { x: GROVE.x + (r() - 0.5) * 5, y: 0.4 + r() * 1.8, z: GROVE.z + (r() - 0.5) * 5 },
      orbit: 0.55 + r() * 0.8,
      h: 0.4 + r() * 1.3,
      speed: 0.6 + r() * 0.9,
      ph: r() * 6.28,
      delay: r() * 0.5,
    }))
  }, [])

  useFrame(() => {
    const g = game
    const c = moments.calm
    flies.forEach((f, i) => {
      const s = refs.current[i]
      if (!s) return
      // cada una se acerca a su ritmo
      const k = clamp01((c - f.delay) / (1 - f.delay))
      const kk = k * k * (3 - 2 * k)
      const t = g.time * f.speed + f.ph
      const hx = f.home.x + Math.sin(t * 0.7) * 0.4
      const hy = f.home.y + Math.sin(t * 1.1) * 0.2
      const hz = f.home.z + Math.cos(t * 0.6) * 0.4
      const ox = g.x + Math.cos(t) * f.orbit
      const oy = f.h + Math.sin(t * 1.7) * 0.15 + g.jumpY
      const oz = g.z + Math.sin(t) * f.orbit
      s.position.set(hx + (ox - hx) * kk, hy + (oy - hy) * kk, hz + (oz - hz) * kk)
      s.scale.setScalar(0.18 + 0.06 * Math.sin(t * 3))
    })
    // la luz de las luciérnagas: en el bosquecillo, o con ella cuando la siguen
    light.current.position.set(GROVE.x + (g.x - GROVE.x) * c, 1, GROVE.z + (g.z - GROVE.z) * c)
    light.current.intensity = 1.5 + c * 1.5
  })

  return (
    <group>
      {flies.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          material={mat}
        />
      ))}
      <pointLight ref={light} color="#d8ff8a" distance={5} intensity={1.5} />
    </group>
  )
}

// ── El prado de flores cerradas ────────────────────────────────
const budMat = new THREE.MeshStandardMaterial({ color: '#7f9c5a', roughness: 0.8, emissive: '#ffb6d9', emissiveIntensity: 0.08 })
const m4 = new THREE.Matrix4()
function Meadow() {
  const budRefs = useRef<(THREE.Mesh | null)[]>([])
  const onFrame = (set: (i: number, mx: THREE.Matrix4, b?: number) => void) => {
    const g = game
    BUDS.forEach((b, i) => {
      const at = moments.openAt[i]
      const k = at < 0 ? 0 : clamp01((g.time - at) / 0.6)
      // crece con un pequeño rebote
      const pop = k <= 0 ? 0 : 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2)
      placeMatrix(b.x, 0, b.z, b.hue * 6.28, Math.max(0.0001, pop * b.s * 0.32), m4)
      set(i, m4, 1 + (1 - k) * 2)
    })
    budRefs.current.forEach((r, i) => {
      if (!r) return
      const at = moments.openAt[i]
      r.visible = at < 0 || g.time - at < 0.25
      r.scale.setScalar(at < 0 ? 1 + Math.sin(g.time * 2 + i) * 0.06 : 1 - (g.time - at) * 4)
    })
  }
  return (
    <group>
      <DynamicModel url={natureUrl('Flower_3_Group')} count={BUDS.length} onFrame={onFrame} />
      {BUDS.map((b, i) => (
        <mesh
          key={i}
          ref={(el) => {
            budRefs.current[i] = el
          }}
          material={budMat}
          position={[b.x, 0.12 * b.s, b.z]}
          scale={1}
        >
          <sphereGeometry args={[0.07 * b.s, 7, 6]} />
        </mesh>
      ))}
    </group>
  )
}

useGLTF.preload(TREE_URL)
