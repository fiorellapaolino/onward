import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Clone, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clamp01, natureUrl, rng } from '../game/config'
import { game } from '../game/state'
import { BUDS, GROVE, PUDDLES, SEED_TREE, moments } from '../game/moments'
import { GIRL_TREE } from '../game/village'
import { GIFT, giftSeedPos } from '../game/gift'
import { DynamicModel, placeMatrix } from './instancing'
import { useGlowTexture } from './TheLight'

/*
 * Lo que se ve de los momentos de estar viva (la lógica está en game/moments.ts).
 */
export function Moments() {
  return (
    <>
      <SeedTree />
      <GirlSeeds />
      <Relay />
      <Puddles />
      <GroveFireflies />
      <Meadow />
    </>
  )
}

// ── La semilla que gira ─────────────────────────────────────────
const TREE_URL = natureUrl('CommonTree_2')
// la semilla del arce: un "nudo" marrón con UNA ala fina y nervada; al caer gira como una hélice
const seedMat = new THREE.MeshStandardMaterial({ color: '#d9bc84', roughness: 0.85, side: THREE.DoubleSide, emissive: '#ffcf7a', emissiveIntensity: 0, transparent: true, opacity: 0.95 })
const nutMat = new THREE.MeshStandardMaterial({ color: '#7b4f2a', roughness: 0.8 })
const veinMat = new THREE.MeshBasicMaterial({ color: '#a8854f', side: THREE.DoubleSide })
const WING = (() => {
  // forma del ala (en el plano XY, desde la semilla hacia +X): estrecha junto a la semilla,
  // más ancha hacia la punta, con el borde de abajo curvo y la punta redondeada
  const L = 0.17
  const sh = new THREE.Shape()
  sh.moveTo(0, 0.006)
  sh.bezierCurveTo(L * 0.35, 0.016, L * 0.75, 0.02, L * 0.95, 0.012)
  sh.quadraticCurveTo(L * 1.03, -0.004, L * 0.9, -0.03)
  sh.bezierCurveTo(L * 0.7, -0.05, L * 0.35, -0.04, 0, -0.008)
  sh.lineTo(0, 0.006)
  const g = new THREE.ShapeGeometry(sh, 10)
  g.rotateX(-Math.PI / 2) // tumbada (en el plano XZ)
  return g
})()
const VEINS = (() => {
  // dos o tres nervios finos que salen de la semilla hacia el borde del ala
  const g = new THREE.BufferGeometry()
  const pts: number[] = []
  const add = (x1: number, z1: number, x2: number, z2: number) => {
    const w = 0.0015
    pts.push(x1, 0.0008, z1 - w, x2, 0.0008, z2 - w, x2, 0.0008, z2 + w, x1, 0.0008, z1 - w, x2, 0.0008, z2 + w, x1, 0.0008, z1 + w)
  }
  add(0.01, 0, 0.16, -0.008)
  add(0.01, 0.002, 0.13, 0.03)
  add(0.01, 0.004, 0.09, 0.034)
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
})()

/** Una semilla de arce: el nudo y su ala, algo inclinada (por eso gira al caer). Mide unos 20 cm. */
function Samara({ refFn }: { refFn: (g: THREE.Group | null) => void }) {
  return (
    <group ref={refFn}>
      <group rotation={[0, 0, 0.18]}>
        <mesh material={nutMat} scale={[1.6, 0.8, 1]}>
          <sphereGeometry args={[0.016, 8, 6]} />
        </mesh>
        <mesh geometry={WING} material={seedMat} rotation-x={0.25} />
        <mesh geometry={VEINS} material={veinMat} rotation-x={0.25} />
      </group>
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
      o.scale.setScalar(1.2)
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
      s.scale.setScalar(1.5 * (1 - k * 0.8))
      seedMat.emissiveIntensity = 1.5 * (1 - k)
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
      s.scale.setScalar(1.5)
      seedMat.emissiveIntensity = u * 0.4
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

// ── Las semillas del árbol de la niña: la que baja a la mano de la elfa, la que lleva y la que le da ──
function GirlSeeds() {
  const refs = useRef<(THREE.Group | null)[]>([])
  const gift = useRef<THREE.Group | null>(null)
  const glow = useRef<THREE.Sprite>(null!)
  const tex = useGlowTexture()
  const glowMat = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ffd98a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    [tex],
  )
  const seeds = useMemo(() => {
    const r = rng(77)
    return Array.from({ length: 3 }, () => ({ a: r() * 6.28, d: 0.8 + r() * 1.8, period: 7 + r() * 4, off: r() * 10 }))
  }, [])

  useFrame(() => {
    const g = game
    const t = g.time
    // caen solas, girando (solo mientras la niña todavía no tiene la suya)
    seeds.forEach((sd, i) => {
      const o = refs.current[i]
      if (!o) return
      o.visible = g.giftAt < 0
      const u = ((t + sd.off) % sd.period) / sd.period
      const swirl = sd.a + u * 5
      o.position.set(GIRL_TREE.x + Math.cos(swirl) * sd.d, Math.max(0.02, 4.2 * (1 - u)), GIRL_TREE.z + Math.sin(swirl) * sd.d)
      o.rotation.set(0.3, t * 9 + i, 0)
      o.scale.setScalar(1.2)
    })
    const s = gift.current
    if (!s) return
    const hand = { x: g.x + Math.sin(g.yaw) * 0.22, y: 0.62 + g.jumpY, z: g.z + Math.cos(g.yaw) * 0.22 }
    let vis = true
    let gl = 0.5
    if (g.giftAt >= 0) {
      // se la da a la niña, ella la mira, la suelta y sube girando hacia el cielo (game/gift.ts)
      const k = t - g.giftAt
      giftSeedPos(k, hand, s.position)
      s.rotation.set(0.3, t * (k < GIFT.RELEASE ? 1.5 : 10), 0)
      vis = k < 11
      gl = 0.8 * Math.max(0, 1 - (k - 8) / 3)
    } else if (g.carrying) {
      s.position.set(hand.x, hand.y, hand.z)
      s.rotation.set(0.3, t * 2, 0)
      gl = 0.6 + Math.sin(t * 4) * 0.15
    } else if (g.giftSeedT >= 0) {
      const u = clamp01(g.giftSeedT / 4.2)
      const e = u * u * (3 - 2 * u)
      const swirl = u * 9
      const rad = 0.9 * (1 - e)
      s.position.set(hand.x + Math.cos(swirl) * rad, 4.3 + (hand.y - 4.3) * e, hand.z + Math.sin(swirl) * rad)
      s.rotation.set(0.3, t * 9 * (1 - u * 0.7), 0)
      gl = u * 0.5
    } else vis = false
    s.visible = vis
    s.scale.setScalar(1.5)
    glowMat.opacity = vis ? gl : 0
    glow.current.position.copy(s.position)
  })

  return (
    <group>
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
          gift.current = el
        }}
      />
      <sprite ref={glow} material={glowMat} scale={0.5} />
    </group>
  )
}

/*
 * "Cuando ayudas a alguien, ayudas a todos": la alegría de la persona ayudada
 * viaja como una luz hasta la siguiente.
 */
function Relay() {
  const tex = useGlowTexture()
  const mat = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ffe3a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    [tex],
  )
  const ref = useRef<THREE.Sprite>(null!)
  const trail = useRef<(THREE.Sprite | null)[]>([])
  useFrame(() => {
    const g = game
    const k = g.relayAt < 0 ? -1 : (g.time - g.relayAt) / 2.6
    const at = (u: number, out: THREE.Vector3) => {
      const e = u * u * (3 - 2 * u)
      return out.set(
        g.relayFrom.x + (g.relayTo.x - g.relayFrom.x) * e,
        0.8 + Math.sin(u * Math.PI) * 3,
        g.relayFrom.z + (g.relayTo.z - g.relayFrom.z) * e,
      )
    }
    const visible = k >= 0 && k < 1.3
    mat.opacity = visible ? (k < 1 ? 1 : 1 - (k - 1) / 0.3) : 0
    if (!visible) return
    at(Math.min(1, k), ref.current.position)
    ref.current.scale.setScalar(k < 1 ? 0.7 : 0.7 + (k - 1) * 6)
    trail.current.forEach((s, i) => {
      if (s) at(Math.max(0, Math.min(1, k) - (i + 1) * 0.04), s.position).setY(s.position.y)
    })
  })
  return (
    <group>
      <sprite ref={ref} material={mat} />
      {[0, 1, 2, 3, 4].map((i) => (
        <sprite
          key={i}
          ref={(el) => {
            trail.current[i] = el
          }}
          material={mat}
          scale={0.45 - i * 0.07}
        />
      ))}
    </group>
  )
}

// ── Charcos ─────────────────────────────────────────────────────
const DROPS = 14
const waterMat = new THREE.MeshStandardMaterial({ color: '#a8c8e2', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.85, emissive: '#3c5a74', emissiveIntensity: 0.3 })
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
