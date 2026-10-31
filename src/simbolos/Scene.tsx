import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clamp01, damp, natureUrl, rng, smoothstep } from '../game/config'
import { game } from '../game/state'
import { DynamicModel, InstancedModel, placeMatrix, type SetInstance } from '../components/instancing'
import { useGlowTexture } from '../components/TheLight'
import { BLOOM_MODELS, LIFE, MAX_PER_MODEL, blooms, getLifeTexture } from './blooms'
import { Ribbon } from './Ribbon'
import {
  BRIDGE_HALF, BRIDGE_STONES, BRIDGE_TIME, CHASM_Z0, CHASM_Z1, DEMO_TIME, END, TRIANGLE, ZONE,
  demoProgress, proto, trianglePoint,
} from './proto'
import type { Pt } from './recognizer'

// ── Cielo, niebla y luz: apagados al principio, más cálidos a medida que el bosque revive ──
const SKY_DULL = new THREE.Color('#9aa0a6')
const SKY_ALIVE = new THREE.Color('#cfe0d8')
const SKY_END = new THREE.Color('#f3dfb8')
const tmpC = new THREE.Color()

export function Atmosphere() {
  const { scene } = useThree()
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const sun = useRef<THREE.DirectionalLight>(null!)
  const life = useRef(0)
  useMemo(() => {
    scene.background = SKY_DULL.clone()
    scene.fog = new THREE.Fog(SKY_DULL.clone(), 14, 55)
  }, [scene])
  useFrame((_, dt) => {
    const P = proto
    // cuánto ha revivido: un poco por caminar, mucho por el símbolo, todo al final
    const target = Math.min(1, P.totalWalked / 120) * 0.4 + (P.solvedAt >= 0 ? 0.35 : 0) + (P.endAt >= 0 ? 0.25 : 0)
    life.current += (target - life.current) * damp(0.8, Math.min(dt, 0.05))
    const L = life.current
    tmpC.copy(SKY_DULL).lerp(SKY_ALIVE, clamp01(L / 0.75))
    if (L > 0.75) tmpC.lerp(SKY_END, (L - 0.75) / 0.25)
    ;(scene.background as THREE.Color).copy(tmpC)
    ;(scene.fog as THREE.Fog).color.copy(tmpC)
    // (al final la cámara sube muy alto: la niebla se aleja para que se vea todo el camino)
    const up = P.endAt >= 0 ? smoothstep(P.endAt, P.endAt + 6, game.time) : 0
    ;(scene.fog as THREE.Fog).near = 14 + up * 70
    ;(scene.fog as THREE.Fog).far = 55 + L * 40 + up * 120
    hemi.current.intensity = 0.9 + L * 0.8
    sun.current.intensity = 0.8 + L * 1.6
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#dfe6ea', '#4a4a40', 1]} />
      <directionalLight ref={sun} position={[12, 20, -6]} color="#fff1d8" intensity={1} />
    </>
  )
}

// ── El suelo: tierra seca y gris (con el barranco en medio) y, encima, el "mapa de vida" ──
function makeDryTexture() {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#8a8676'
  ctx.fillRect(0, 0, S, S)
  const r = rng(5)
  for (let i = 0; i < 4000; i++) {
    const v = 100 + Math.floor(r() * 60)
    ctx.fillStyle = `rgba(${v},${v - 4},${v - 18},${0.25 + r() * 0.3})`
    ctx.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 3)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(24, 24)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function Ground() {
  const dry = useMemo(makeDryTexture, [])
  const life = useMemo(getLifeTexture, [])
  const W = 140
  const nearLen = CHASM_Z0 + 60
  const farLen = 70
  return (
    <>
      {/* este lado del barranco */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, CHASM_Z0 - nearLen / 2]}>
        <planeGeometry args={[W, nearLen]} />
        <meshStandardMaterial map={dry} roughness={1} />
      </mesh>
      {/* el otro lado */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, CHASM_Z1 + farLen / 2]}>
        <planeGeometry args={[W, farLen]} />
        <meshStandardMaterial map={dry} roughness={1} />
      </mesh>
      {/* el fondo del barranco: oscuro y lejano */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -9, (CHASM_Z0 + CHASM_Z1) / 2]}>
        <planeGeometry args={[W, CHASM_Z1 - CHASM_Z0 + 2]} />
        <meshBasicMaterial color="#14151b" />
      </mesh>
      {/* paredes del barranco */}
      {[CHASM_Z0, CHASM_Z1].map((z, i) => (
        <mesh key={i} position={[0, -4.5, z]} rotation-y={i === 0 ? Math.PI : 0}>
          <planeGeometry args={[W, 9]} />
          <meshStandardMaterial color="#4a4639" roughness={1} />
        </mesh>
      ))}
      {/* donde pisó, pasto (encima de todo el suelo) */}
      <mesh rotation-x={-Math.PI / 2} position={[LIFE.cx, 0.012, LIFE.cz]} renderOrder={1}>
        <planeGeometry args={[LIFE.size, LIFE.size]} />
        <meshStandardMaterial map={life} transparent depthWrite={false} roughness={1} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </>
  )
}

// ── Árboles secos alrededor del claro, y rocas en los bordes del barranco ──
const TREES = ['DeadTree_1', 'DeadTree_2', 'DeadTree_3'] // (los retorcidos tienen hojas rojas: no encajan con un bosque dormido)
const ROCKS = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3']

function forestLayout() {
  const r = rng(31)
  const byModel = new Map<string, THREE.Matrix4[]>()
  const add = (model: string, m: THREE.Matrix4) => {
    if (!byModel.has(model)) byModel.set(model, [])
    byModel.get(model)!.push(m)
  }
  // árboles: un anillo irregular alrededor del claro (más denso hacia fuera)
  for (let i = 0; i < 420; i++) {
    const x = (r() - 0.5) * 110
    const z = -30 + r() * 95
    const open =
      Math.abs(x) < 12 + Math.max(0, z - 30) * 0.2 || // el claro central
      Math.hypot(x - ZONE.x, z - ZONE.z) < ZONE.r + 5 ||
      (z > CHASM_Z0 - 2.5 && z < CHASM_Z1 + 2.5) || // el barranco
      Math.hypot(x - END.x, z - END.z) < 7
    if (open) continue
    if (Math.abs(x) < 16 && r() < 0.5) continue // menos árboles cerca del claro
    const model = TREES[Math.floor(r() * TREES.length)]
    add(model, placeMatrix(x, 0, z, r() * Math.PI * 2, 0.9 + r() * 0.8))
  }
  // rocas al borde del barranco
  for (const edge of [CHASM_Z0, CHASM_Z1]) {
    for (let x = -40; x < 40; x += 1.6 + r() * 2) {
      if (Math.abs(x) < BRIDGE_HALF + 0.9) continue
      const z = edge + (edge === CHASM_Z0 ? -0.5 : 0.5) + (r() - 0.5) * 0.6
      add(ROCKS[Math.floor(r() * 3)], placeMatrix(x, -0.15, z, r() * Math.PI * 2, 0.5 + r() * 0.7))
    }
  }
  return [...byModel.entries()]
}

export function DeadForest() {
  const groups = useMemo(forestLayout, [])
  return (
    <>
      {groups.map(([model, matrices]) => (
        <InstancedModel key={model} url={natureUrl(model)} matrices={matrices} />
      ))}
    </>
  )
}

// ── Lo que florece a su paso ──
const tmpM = new THREE.Matrix4()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
const GROW = 0.9

export function Blooms() {
  const state = useMemo(() => BLOOM_MODELS.map(() => ({ init: false, done: 0 })), [])
  const update = (k: number) => (set: SetInstance) => {
    const st = state[k]
    const list = blooms[k]
    if (!st.init) {
      for (let i = 0; i < MAX_PER_MODEL; i++) set(i, ZERO)
      st.init = true
    }
    // solo se actualizan las que todavía están creciendo
    const t = game.time
    while (st.done < list.length && t - list[st.done].born > GROW + 0.3) st.done++
    for (let i = Math.max(0, st.done - 2); i < list.length; i++) {
      const b = list[i]
      const a = clamp01((t - b.born) / GROW)
      const grow = 1 - Math.pow(1 - a, 3)
      // al brotar, un brillo que se apaga
      set(i, placeMatrix(b.x, 0, b.z, b.rot, Math.max(0.0001, b.scale * grow), tmpM), 1 + (1 - a) * 2.2)
    }
  }
  return (
    <>
      {BLOOM_MODELS.map((m, k) => (
        <DynamicModel key={m} url={natureUrl(m)} count={MAX_PER_MODEL} onFrame={update(k)} />
      ))}
    </>
  )
}

// ── El círculo de dibujo: un anillo de luz en el suelo (aparece con el ser) ──
export function ZoneRing() {
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame(() => {
    const P = proto
    const t = game.time
    const on = P.spiritAt >= 0 ? smoothstep(P.spiritAt, P.spiritAt + 1.5, t) : 0
    const off = P.solvedAt >= 0 ? 1 - smoothstep(P.solvedAt + 1, P.solvedAt + 3, t) : 1
    const inside = P.inZone ? 0.25 : 0
    mat.current.opacity = on * off * (0.35 + inside + Math.sin(t * 2) * 0.06)
  })
  return (
    <mesh rotation-x={-Math.PI / 2} position={[ZONE.x, 0.03, ZONE.z]} renderOrder={4}>
      <ringGeometry args={[ZONE.r - 0.12, ZONE.r, 96]} />
      <meshBasicMaterial ref={mat} color="#ffd88a" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </mesh>
  )
}

// ── Las cintas de luz: el triángulo del ser, el trazo de la elfa y su último intento ──
const demoPts: Pt[] = []
export function Drawings() {
  return (
    <>
      {/* el triángulo que dibuja el ser: brillante mientras lo dibuja, luego queda tenue como guía */}
      <Ribbon
        color="#ffcf7a"
        width={0.26}
        get={() => {
          const P = proto
          const t = game.time
          const p = demoProgress(t)
          if (p < 0 || P.solvedAt >= 0) {
            const fade = P.solvedAt >= 0 ? 1 - clamp01((t - P.solvedAt) / 1.5) : 0
            return { pts: TRIANGLE, opacity: fade * 0.3 }
          }
          demoPts.length = 0
          const n = Math.max(2, Math.floor(p * 90))
          for (let i = 0; i <= n; i++) demoPts.push(trianglePoint((i / n) * p))
          const after = (t - P.demoAt - DEMO_TIME) / 2
          return { pts: demoPts, opacity: p < 1 ? 0.95 : 0.95 - 0.7 * clamp01(after) }
        }}
      />
      {/* lo que va dibujando la elfa dentro del círculo */}
      <Ribbon color="#fff0c8" width={0.2} y={0.05} get={() => ({ pts: proto.stroke, opacity: proto.inZone ? 0.75 : 0.4 })} />
      {/* el intento anterior: si salió bien se ilumina; si no, se desvanece en azul */}
      <Ribbon
        color="#ffe2a0"
        width={0.34}
        y={0.06}
        get={() => {
          const P = proto
          const k = game.time - P.lastAt
          return { pts: P.lastStroke, opacity: P.lastOk ? Math.max(0, 1.2 - k / 3) : 0 }
        }}
      />
      <Ribbon
        color="#8fb3d9"
        width={0.2}
        y={0.05}
        get={() => {
          const P = proto
          const k = game.time - P.lastAt
          return { pts: P.lastStroke, opacity: P.lastOk ? 0 : Math.max(0, 0.6 - k / 1.4) }
        }}
      />
    </>
  )
}

// ── El puente: piedras que suben del barranco, una detrás de otra ──
const BRIDGE_MODEL = 'RockPath_Round_Wide'
const stoneM = new THREE.Matrix4()
export function Bridge() {
  const update = (set: SetInstance) => {
    const P = proto
    const t = game.time
    for (let i = 0; i < BRIDGE_STONES; i++) {
      const z = CHASM_Z0 - 0.4 + ((CHASM_Z1 - CHASM_Z0 + 0.8) * (i + 0.5)) / BRIDGE_STONES
      const start = P.solvedAt + 0.6 + (i / BRIDGE_STONES) * BRIDGE_TIME * 0.6
      const a = P.solvedAt >= 0 ? clamp01((t - start) / (BRIDGE_TIME * 0.45)) : 0
      const e = 1 - Math.pow(1 - a, 3)
      const y = -6 + e * 6 + Math.sin(t * 1.3 + i) * 0.015
      set(i, placeMatrix(0, y, z, i * 1.7, a > 0 ? 1.55 : 0.0001, stoneM), 1 + (1 - a) * 2)
    }
  }
  return <DynamicModel url={natureUrl(BRIDGE_MODEL)} count={BRIDGE_STONES} onFrame={update} />
}

// ── El ser de la tierra: una luz ámbar con piedritas que giran a su alrededor ──
const PEBBLES = 5
const spiritRest = new THREE.Vector3(ZONE.x + ZONE.r + 0.8, 1.1, ZONE.z + 1.5)
const spiritTarget = new THREE.Vector3()
export function EarthSpirit() {
  const tex = useGlowTexture()
  const group = useRef<THREE.Group>(null!)
  const halo = useRef<THREE.Sprite>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const pebbles = useRef<THREE.Group>(null!)
  const pebble = useGLTF(natureUrl('Pebble_Round_1'))
  const pebbleGeo = useMemo(() => {
    let geo: THREE.BufferGeometry | null = null
    pebble.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && !geo) geo = m.geometry
    })
    return geo ?? new THREE.IcosahedronGeometry(0.1, 0)
  }, [pebble])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const P = proto
    const t = game.time
    const shown = P.spiritAt >= 0 ? clamp01((t - P.spiritAt) / 1.2) : 0
    group.current.visible = shown > 0.001
    if (!group.current.visible) return
    const p = demoProgress(t)
    if (P.solvedAt >= 0) {
      // celebra: sube y se va al otro lado del barranco, a esperarla
      const k = t - P.solvedAt
      spiritTarget.set(1.6, 1.6 + Math.sin(k * 3) * 0.2, k < 2 ? ZONE.z + 3 : CHASM_Z1 + 2)
    } else if (p >= 0 && p < 1) {
      const q = trianglePoint(p)
      spiritTarget.set(q.x, 0.35, q.z) // baja al suelo para dibujar
    } else {
      spiritTarget.copy(spiritRest)
      spiritTarget.y += Math.sin(t * 1.4) * 0.12
    }
    const drawing = p >= 0 && p < 1 && P.solvedAt < 0
    group.current.position.lerp(spiritTarget, damp(drawing ? 14 : 2.5, dt))
    group.current.scale.setScalar(Math.max(0.001, shown))
    const glow = 1 + (drawing ? 0.4 : 0) + Math.sin(t * 2.2) * 0.08
    halo.current.scale.setScalar(1.4 * glow)
    light.current.intensity = 6 * glow * shown
    pebbles.current.rotation.y += dt * (drawing ? 4 : 1.5)
    pebbles.current.rotation.x = Math.sin(t * 0.7) * 0.4
  })

  return (
    <group ref={group} position={spiritRest}>
      <sprite ref={halo}>
        <spriteMaterial map={tex} color="#ffb85c" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <mesh>
        <icosahedronGeometry args={[0.14, 1]} />
        <meshBasicMaterial color="#ffe1a8" toneMapped={false} />
      </mesh>
      <group ref={pebbles}>
        {Array.from({ length: PEBBLES }, (_, i) => {
          const a = (i / PEBBLES) * Math.PI * 2
          return (
            <mesh key={i} geometry={pebbleGeo} position={[Math.cos(a) * 0.42, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.42]} scale={0.9}>
              <meshStandardMaterial color="#8a7a63" roughness={0.9} emissive="#3a2810" />
            </mesh>
          )
        })}
      </group>
      <pointLight ref={light} color="#ffb85c" distance={7} intensity={0} />
    </group>
  )
}

// ── Al final: la luz cálida donde la espera la elfa recién nacida (provisional: una luz que respira) ──
export function Waiting() {
  const tex = useGlowTexture()
  const halo = useRef<THREE.Sprite>(null!)
  const core = useRef<THREE.Sprite>(null!)
  const light = useRef<THREE.PointLight>(null!)
  useFrame(() => {
    const t = game.time
    const near = clamp01(1 - (Math.hypot(game.x - END.x, game.z - END.z) - 2) / 30)
    const b = 1 + Math.sin(t * 1.1) * 0.08
    halo.current.scale.setScalar((5 + near * 6) * b)
    core.current.scale.setScalar(1.2 * b)
    light.current.intensity = 4 + near * 18
  })
  return (
    <group position={[END.x, 0.9, END.z]}>
      <sprite ref={halo}>
        <spriteMaterial map={tex} color="#ffd9a0" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} toneMapped={false} />
      </sprite>
      <sprite ref={core}>
        <spriteMaterial map={tex} color="#fff6e6" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <pointLight ref={light} color="#ffd9a0" distance={16} intensity={4} />
    </group>
  )
}

// ── La cámara del final: sube despacio hasta ver todo el camino desde arriba ──
const camTarget = new THREE.Vector3(0, 44, 14.5)
const camLook = new THREE.Vector3(0, 0, 15.2)
export function AerialCam() {
  const look = useRef<THREE.Vector3 | null>(null)
  useFrame(({ camera }, rawDt) => {
    const P = proto
    if (P.endAt < 0) {
      look.current = null
      return
    }
    const dt = Math.min(rawDt, 0.05)
    const k = game.time - P.endAt
    if (!look.current) {
      // empieza mirando a la elfa (o, si ya pasó el tiempo, directamente desde arriba)
      look.current = k > 8 ? camLook.clone() : new THREE.Vector3(game.x, 0.8, game.z)
      if (k > 8) camera.position.copy(camTarget)
    }
    // arranca despacio y va subiendo cada vez más rápido
    const rate = 0.25 + Math.min(k, 8) * 0.12
    camera.position.lerp(camTarget, damp(rate, dt))
    look.current.lerp(camLook, damp(rate * 1.4, dt))
    camera.lookAt(look.current)
  })
  return null
}

;[...TREES, ...ROCKS, ...BLOOM_MODELS, BRIDGE_MODEL, 'Pebble_Round_1'].forEach((m) => useGLTF.preload(natureUrl(m)))
