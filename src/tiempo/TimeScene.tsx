import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clamp01, damp, natureUrl, rng, smoothstep } from '../game/config'
import { game } from '../game/state'
import { DynamicModel, placeMatrix, type SetInstance } from '../components/instancing'
import { useGlowTexture } from '../components/TheLight'
import { LIFE, getLifeTexture } from '../simbolos/blooms'
import { makeDryTexture } from '../simbolos/Scene'
import { Ribbon } from '../simbolos/Ribbon'
import { pointAlong } from '../simbolos/proto'
import type { Pt } from '../simbolos/recognizer'
import { DEMO_TIME, END, RIVER_Z0, RIVER_Z1, SPIRAL, TIME, demoProgress, pastMix, tp } from './timeProto'

// ── Cielo y luz: gris en el presente; dorado y cálido en el pasado ──
const SKY_NOW = new THREE.Color('#9aa0a6')
const SKY_ALIVE = new THREE.Color('#cfe0d8')
const SKY_PAST = new THREE.Color('#f1d6a4')
const SKY_END = new THREE.Color('#f3dfb8')
const tmpC = new THREE.Color()

export function TimeAtmosphere() {
  const { scene } = useThree()
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const sun = useRef<THREE.DirectionalLight>(null!)
  const life = useRef(0)
  useMemo(() => {
    scene.background = SKY_NOW.clone()
    scene.fog = new THREE.Fog(SKY_NOW.clone(), 14, 55)
  }, [scene])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const P = tp
    const target = Math.min(1, P.totalWalked / 120) * 0.35 + (P.presentAt >= 0 ? 0.3 : 0) + (P.endAt >= 0 ? 0.35 : 0)
    life.current += (target - life.current) * damp(0.8, dt)
    const L = life.current
    const past = pastMix(game.time)
    tmpC.copy(SKY_NOW).lerp(SKY_ALIVE, clamp01(L / 0.65))
    if (L > 0.65) tmpC.lerp(SKY_END, (L - 0.65) / 0.35)
    tmpC.lerp(SKY_PAST, past)
    ;(scene.background as THREE.Color).copy(tmpC)
    const fog = scene.fog as THREE.Fog
    fog.color.copy(tmpC)
    const up = P.endAt >= 0 ? smoothstep(P.endAt, P.endAt + 6, game.time) : 0
    fog.near = 14 + past * 6 + up * 90
    fog.far = 55 + L * 30 + past * 20 + up * 160
    hemi.current.intensity = 0.9 + L * 0.8 + past * 0.6
    sun.current.intensity = 0.8 + L * 1.4 + past * 1.2
    sun.current.color.set(past > 0.5 ? '#ffd9a0' : '#fff1d8')
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#dfe6ea', '#4a4a40', 1]} />
      <directionalLight ref={sun} position={[12, 20, -6]} color="#fff1d8" intensity={1} />
    </>
  )
}

// ── El suelo y el "mapa de vida" (donde pisó, pasto) ──
export function TimeGround() {
  const dry = useMemo(makeDryTexture, [])
  const life = useMemo(getLifeTexture, [])
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 18]}>
        <planeGeometry args={[140, 140]} />
        <meshStandardMaterial map={dry} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[LIFE.cx, 0.012, LIFE.cz]} renderOrder={1}>
        <planeGeometry args={[LIFE.size, LIFE.size]} />
        <meshStandardMaterial map={life} transparent depthWrite={false} roughness={1} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </>
  )
}

// ── El río: en el presente corta el camino; en el pasado todavía no existía ──
function makeWaterTexture() {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#5d86a3'
  ctx.fillRect(0, 0, S, S)
  const r = rng(12)
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(220,235,245,${0.08 + r() * 0.18})`
    ctx.fillRect(r() * S, r() * S, 8 + r() * 30, 1 + r() * 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(10, 1)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function River() {
  const tex = useMemo(makeWaterTexture, [])
  const mat = useRef<THREE.MeshStandardMaterial>(null!)
  const bed = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame((_, rawDt) => {
    tex.offset.x += Math.min(rawDt, 0.05) * 0.06
    const past = pastMix(game.time)
    mat.current.opacity = 0.92 * (1 - past)
    mat.current.visible = past < 0.99
    bed.current.opacity = 1 - past
  })
  const W = 140
  return (
    <>
      {/* el cauce: tierra húmeda, oscura */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, (RIVER_Z0 + RIVER_Z1) / 2]} renderOrder={2}>
        <planeGeometry args={[W, RIVER_Z1 - RIVER_Z0 + 0.8]} />
        <meshStandardMaterial ref={bed} color="#4a4a3c" roughness={1} transparent depthWrite={false} />
      </mesh>
      {/* el agua */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, (RIVER_Z0 + RIVER_Z1) / 2]} renderOrder={3}>
        <planeGeometry args={[W, RIVER_Z1 - RIVER_Z0]} />
        <meshStandardMaterial ref={mat} map={tex} roughness={0.25} metalness={0.1} transparent depthWrite={false} emissive="#1d3444" />
      </mesh>
    </>
  )
}

// ── El bosque en dos épocas: árboles secos (presente) y árboles jóvenes y verdes (pasado) ──
// Cuando cambia el tiempo, unos se encogen y los otros crecen, de a poco y desde cerca de ella hacia fuera.
const DEAD = ['DeadTree_1', 'DeadTree_2', 'DeadTree_3']
const YOUNG = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'Bush_Common_Flowers']
const RIVER_ROCKS = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3']

type Spot = { x: number; z: number; rot: number; s: number }
function treeSpots(seed: number, models: string[], count: number) {
  const r = rng(seed)
  const by = models.map(() => [] as Spot[])
  for (let i = 0; i < count; i++) {
    const x = (r() - 0.5) * 100
    const z = -28 + r() * 100
    const open =
      Math.abs(x) < 9 ||
      Math.hypot(x - TIME.x, z - TIME.z) < TIME.r + 5 ||
      (z > RIVER_Z0 - 1.5 && z < RIVER_Z1 + 1.5) ||
      Math.hypot(x - END.x, z - END.z) < 7
    if (open) continue
    if (Math.abs(x) < 14 && r() < 0.5) continue
    by[Math.floor(r() * models.length)].push({ x, z, rot: r() * Math.PI * 2, s: 0.9 + r() * 0.8 })
  }
  return by
}

const treeM = new THREE.Matrix4()
function EraTrees({ models, seed, count, past }: { models: string[]; seed: number; count: number; past: boolean }) {
  const spots = useMemo(() => treeSpots(seed, models, count), [models, seed, count])
  const update = (list: Spot[]) => (set: SetInstance) => {
    const m = pastMix(game.time)
    list.forEach((sp, i) => {
      // el cambio empieza cerca de ella y se extiende como una onda
      const d = Math.hypot(sp.x - game.x, sp.z - game.z)
      const local = clamp01(((past ? m : 1 - m) * 120 - d) / 30)
      const k = local * local * (3 - 2 * local)
      const glow = past ? 1 + (1 - k) * k * 3 : 1
      set(i, placeMatrix(sp.x, 0, sp.z, sp.rot, Math.max(0.0001, sp.s * k), treeM), glow)
    })
  }
  return (
    <>
      {models.map((model, i) => (
        <DynamicModel key={model} url={natureUrl(model)} count={Math.max(1, spots[i].length)} onFrame={update(spots[i])} />
      ))}
    </>
  )
}

export function Forests() {
  return (
    <>
      <EraTrees models={DEAD} seed={31} count={520} past={false} />
      <EraTrees models={YOUNG} seed={47} count={520} past />
    </>
  )
}

/** Rocas en las orillas (están en las dos épocas: así se reconoce que es el mismo lugar). */
export function Banks() {
  const update = (set: SetInstance) => {
    const r = rng(3)
    let i = 0
    for (const edge of [RIVER_Z0, RIVER_Z1]) {
      for (let x = -40; x < 40; x += 1.8 + r() * 2.2) {
        if (Math.abs(x) < 2.2) continue
        const z = edge + (edge === RIVER_Z0 ? -0.6 : 0.6) + (r() - 0.5) * 0.6
        set(i++, placeMatrix(x, -0.15, z, r() * Math.PI * 2, 0.45 + r() * 0.6, treeM))
      }
    }
  }
  return (
    <>
      {RIVER_ROCKS.map((m, k) => (
        <DynamicModel
          key={m}
          url={natureUrl(m)}
          count={60}
          onFrame={(set) => {
            // (cada modelo toma una de cada tres rocas)
            let n = 0
            update((i, mx) => {
              if (i % 3 === k) set(n++, mx)
            })
            for (; n < 60; n++) set(n, ZERO)
          }}
        />
      ))}
    </>
  )
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)

// ── La onda del tiempo: un anillo de luz que se expande desde ella al cambiar de época ──
export function TimeWave() {
  const mesh = useRef<THREE.Mesh>(null!)
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  const center = useRef(new THREE.Vector3())
  const lastStart = useRef(-1)
  useFrame(() => {
    const P = tp
    const t = game.time
    const start = P.presentAt >= 0 && t >= P.presentAt ? P.presentAt : P.pastAt
    if (start < 0 || t < start) {
      mat.current.opacity = 0
      return
    }
    if (start !== lastStart.current) {
      lastStart.current = start
      center.current.set(game.x, 0.08, game.z)
    }
    const k = (t - start) / 3
    mesh.current.position.copy(center.current)
    mesh.current.scale.setScalar(0.5 + k * 40)
    mat.current.opacity = Math.max(0, 0.8 * (1 - k))
  })
  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} renderOrder={5}>
      <ringGeometry args={[0.92, 1, 96]} />
      <meshBasicMaterial ref={mat} color={TIME.color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
    </mesh>
  )
}

// ── El círculo de dibujo y las cintas de luz ──
export function TimeRing() {
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame(() => {
    const P = tp
    const t = game.time
    const on = P.spiritAt >= 0 ? smoothstep(P.spiritAt, P.spiritAt + 1.5, t) : 0
    const off = P.solvedAt >= 0 ? 1 - smoothstep(P.solvedAt + 1, P.solvedAt + 3, t) : 1
    mat.current.opacity = on * off * (0.35 + (P.inside ? 0.25 : 0) + Math.sin(t * 2) * 0.06)
  })
  return (
    <mesh rotation-x={-Math.PI / 2} position={[TIME.x, 0.03, TIME.z]} renderOrder={4}>
      <ringGeometry args={[TIME.r - 0.12, TIME.r, 96]} />
      <meshBasicMaterial ref={mat} color={TIME.color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
    </mesh>
  )
}

export function TimeDrawings() {
  const pts = useMemo<Pt[]>(() => [], [])
  return (
    <>
      {/* la espiral que dibuja el ser */}
      <Ribbon
        color={TIME.color}
        width={0.26}
        get={() => {
          const t = game.time
          const P = tp
          const p = demoProgress(t)
          if (p < 0) {
            const fade = P.solvedAt >= 0 ? 1 - clamp01((t - P.solvedAt) / 1.5) : 0
            return { pts: SPIRAL, opacity: fade * 0.3 }
          }
          pts.length = 0
          const n = Math.max(2, Math.floor(p * 140))
          for (let i = 0; i <= n; i++) pts.push(pointAlong(SPIRAL, (i / n) * p))
          const after = (t - P.demoAt - DEMO_TIME) / 2
          return { pts, opacity: p < 1 ? 0.95 : 0.95 - 0.7 * clamp01(after) }
        }}
      />
      {/* lo que va dibujando ella */}
      <Ribbon color="#fff0c8" width={0.2} y={0.05} get={() => ({ pts: tp.stroke, opacity: tp.inside ? 0.75 : 0.4 })} />
      {/* el intento anterior: lila si salió bien, azul que se desvanece si no */}
      <Ribbon
        color={TIME.color}
        width={0.34}
        y={0.06}
        get={() => {
          const k = game.time - tp.lastAt
          return { pts: tp.lastStroke, opacity: tp.lastOk ? Math.max(0, 1.2 - k / 3) : 0 }
        }}
      />
      <Ribbon
        color="#8fb3d9"
        width={0.2}
        y={0.05}
        get={() => {
          const k = game.time - tp.lastAt
          return { pts: tp.lastStroke, opacity: tp.lastOk ? 0 : Math.max(0, 0.6 - k / 1.4) }
        }}
      />
    </>
  )
}

// ── El ser del tiempo: una luz lila con dos agujas que giran, como un reloj ──
export function TimeSpirit() {
  const tex = useGlowTexture()
  const group = useRef<THREE.Group>(null!)
  const halo = useRef<THREE.Sprite>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const hands = useRef<THREE.Group>(null!)
  const rest = useMemo(() => new THREE.Vector3(TIME.rest.x, TIME.rest.y, TIME.rest.z), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const P = tp
    const t = game.time
    const shown = P.spiritAt >= 0 ? clamp01((t - P.spiritAt) / 1.2) : 0
    group.current.visible = shown > 0.001
    if (!group.current.visible) return
    const p = demoProgress(t)
    if (P.solvedAt >= 0) {
      // la acompaña al pasado y la espera del otro lado del río
      const k = t - P.solvedAt
      target.set(-1.4, 1.6 + Math.sin(k * 3) * 0.2, k < 2.5 ? TIME.z + 3 : RIVER_Z1 + 3)
    } else if (p >= 0 && p < 1) {
      const q = pointAlong(SPIRAL, p)
      target.set(q.x, 0.35, q.z)
    } else {
      target.copy(rest)
      target.y += Math.sin(t * 1.4) * 0.12
    }
    const drawing = p >= 0 && p < 1
    group.current.position.lerp(target, damp(drawing ? 14 : 2.5, dt))
    group.current.scale.setScalar(Math.max(0.001, shown))
    const glow = 1 + (drawing ? 0.4 : 0) + Math.sin(t * 1.6) * 0.08
    halo.current.scale.setScalar(1.5 * glow)
    light.current.intensity = 6 * glow * shown
    // las agujas: una lenta y otra rápida (al revés mientras está en el pasado)
    const dir = pastMix(t) > 0.5 && P.presentAt < 0 ? -1 : 1
    const [slow, fast] = hands.current.children
    slow.rotation.y += dt * 0.8 * dir
    fast.rotation.y += dt * (drawing ? 7 : 3) * dir
  })
  return (
    <group ref={group} position={rest} visible={false}>
      <sprite ref={halo}>
        <spriteMaterial map={tex} color="#a990ff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
      </sprite>
      <mesh>
        <icosahedronGeometry args={[0.13, 1]} />
        <meshBasicMaterial color="#efe8ff" toneMapped={false} fog={false} />
      </mesh>
      <group ref={hands}>
        <group>
          <mesh position={[0.2, 0, 0]}>
            <boxGeometry args={[0.32, 0.03, 0.03]} />
            <meshBasicMaterial color="#e2d8ff" toneMapped={false} fog={false} />
          </mesh>
        </group>
        <group>
          <mesh position={[0, 0, 0.28]}>
            <boxGeometry args={[0.02, 0.02, 0.48]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} fog={false} />
          </mesh>
        </group>
      </group>
      <pointLight ref={light} color="#b9a4ff" distance={7} intensity={0} />
    </group>
  )
}

// ── La luz que espera al final ──
export function TimeGoal() {
  const tex = useGlowTexture()
  const halo = useRef<THREE.Sprite>(null!)
  const light = useRef<THREE.PointLight>(null!)
  useFrame(() => {
    const near = clamp01(1 - (Math.hypot(game.x - END.x, game.z - END.z) - 2) / 25)
    const b = 1 + Math.sin(game.time * 1.1) * 0.08
    halo.current.scale.setScalar((4 + near * 5) * b)
    light.current.intensity = 4 + near * 14
  })
  return (
    <group position={[END.x, 0.9, END.z]}>
      <sprite ref={halo}>
        <spriteMaterial map={tex} color="#ffd9a0" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} toneMapped={false} />
      </sprite>
      <pointLight ref={light} color="#ffd9a0" distance={14} intensity={4} />
    </group>
  )
}

// ── La cámara del final: sube hasta ver todo el camino (el tramo del pasado, en lila) ──
const camTarget = new THREE.Vector3(0, 46, 17.3)
const camLook = new THREE.Vector3(0, 0, 18)
export function TimeAerial() {
  const look = useRef<THREE.Vector3 | null>(null)
  const pos = useRef(new THREE.Vector3())
  useFrame(({ camera }, rawDt) => {
    const P = tp
    if (P.endAt < 0) {
      look.current = null
      return
    }
    const dt = Math.min(rawDt, 0.05)
    const k = game.time - P.endAt
    if (!look.current) {
      look.current = k > 8 ? camLook.clone() : new THREE.Vector3(game.x, 0.8, game.z)
      pos.current.copy(k > 8 ? camTarget : camera.position)
    }
    const rate = 0.25 + Math.min(k, 8) * 0.12
    pos.current.lerp(camTarget, damp(rate, dt))
    look.current.lerp(camLook, damp(rate * 1.4, dt))
    camera.position.copy(pos.current)
    camera.lookAt(look.current)
  })
  return null
}

;[...DEAD, ...YOUNG, ...RIVER_ROCKS].forEach((m) => useGLTF.preload(natureUrl(m)))
