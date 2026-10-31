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
  BRIDGE_HALF, BRIDGE_STONES, BRIDGE_TIME, CHASM_Z0, CHASM_Z1, DARK_Z0, DEMO_TIME, EARTH, END, FIRE, FIRES, HEARTH, WALL_OPEN, WALL_Z, ZONES,
  demoProgress, fireLitAt, hearthLitAt, pointAlong, proto, type Zone,
} from './proto'
import type { Pt } from './recognizer'

// ── Cielo, niebla y luz: apagados al principio, más cálidos a medida que el bosque revive ──
// Pasado el barranco, el bosque está oscuro hasta que se encienden las hogueras.
const SKY_DULL = new THREE.Color('#9aa0a6')
const SKY_ALIVE = new THREE.Color('#cfe0d8')
const SKY_END = new THREE.Color('#f3dfb8')
const SKY_DARK = new THREE.Color('#14161f')
const tmpC = new THREE.Color()

/** 0..1: cuánta oscuridad la rodea (en el bosque oscuro, mientras no haya fuego). */
export function darkness() {
  const t = game.time
  const inside = smoothstep(DARK_Z0 - 3, DARK_Z0 + 3, game.z)
  const lit = FIRE.solvedAt >= 0 ? smoothstep(FIRE.solvedAt + 0.8, FIRE.solvedAt + WALL_OPEN + 2.5, t) : 0
  return inside * (1 - lit)
}

export function Atmosphere() {
  const { scene } = useThree()
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const sun = useRef<THREE.DirectionalLight>(null!)
  const life = useRef(0)
  const dark = useRef(0)
  useMemo(() => {
    scene.background = SKY_DULL.clone()
    scene.fog = new THREE.Fog(SKY_DULL.clone(), 14, 55)
  }, [scene])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const P = proto
    // cuánto ha revivido: un poco por caminar, más por cada símbolo, todo al final
    const target =
      Math.min(1, P.totalWalked / 150) * 0.35 + (EARTH.solvedAt >= 0 ? 0.2 : 0) + (FIRE.solvedAt >= 0 ? 0.25 : 0) + (P.endAt >= 0 ? 0.2 : 0)
    life.current += (target - life.current) * damp(0.8, dt)
    dark.current += (darkness() - dark.current) * damp(1.5, dt)
    const L = life.current
    const D = dark.current
    tmpC.copy(SKY_DULL).lerp(SKY_ALIVE, clamp01(L / 0.75))
    if (L > 0.75) tmpC.lerp(SKY_END, (L - 0.75) / 0.25)
    tmpC.lerp(SKY_DARK, D)
    ;(scene.background as THREE.Color).copy(tmpC)
    const fog = scene.fog as THREE.Fog
    fog.color.copy(tmpC)
    // (al final la cámara sube muy alto: la niebla se aleja para que se vea todo el camino)
    const up = P.endAt >= 0 ? smoothstep(P.endAt, P.endAt + 6, game.time) : 0
    fog.near = (14 - D * 11) + up * 90
    fog.far = (55 + L * 40) * (1 - D * 0.6) + up * 160
    hemi.current.intensity = (0.9 + L * 0.8) * (1 - D * 0.85)
    sun.current.intensity = (0.8 + L * 1.6) * (1 - D * 0.95)
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
  for (let i = 0; i < 640; i++) {
    const x = (r() - 0.5) * 110
    const z = -30 + r() * 125
    const dark = z > CHASM_Z1 + 1 // el bosque oscuro: los árboles se cierran sobre el camino
    const open =
      Math.abs(x) < (dark ? 4.5 : 12) || // el claro central (y el camino del bosque oscuro)
      ZONES.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + (zn === FIRE ? 4.5 : 5)) ||
      (z > CHASM_Z0 - 2.5 && z < CHASM_Z1 + 2.5) || // el barranco
      Math.hypot(x - END.x, z - END.z) < 7
    if (open) continue
    if (Math.abs(x) < 16 && !dark && r() < 0.5) continue // menos árboles cerca del claro
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

// ── Los círculos de dibujo: un anillo de luz en el suelo (aparece con su ser) ──
export function ZoneRings() {
  return (
    <>
      {ZONES.map((z) => (
        <ZoneRing key={z.id} z={z} />
      ))}
    </>
  )
}

function ZoneRing({ z }: { z: Zone }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame(() => {
    const t = game.time
    const on = z.spiritAt >= 0 ? smoothstep(z.spiritAt, z.spiritAt + 1.5, t) : 0
    const off = z.solvedAt >= 0 ? 1 - smoothstep(z.solvedAt + 1, z.solvedAt + 3, t) : 1
    const inside = proto.inZone === z.id ? 0.25 : 0
    mat.current.opacity = on * off * (0.35 + inside + Math.sin(t * 2) * 0.06)
  })
  return (
    <mesh rotation-x={-Math.PI / 2} position={[z.x, 0.03, z.z]} renderOrder={4}>
      <ringGeometry args={[z.r - 0.12, z.r, 96]} />
      <meshBasicMaterial ref={mat} color={z.color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
    </mesh>
  )
}

// ── Las cintas de luz: el símbolo de cada ser, el trazo de la elfa y su último intento ──
export function Drawings() {
  return (
    <>
      {ZONES.map((z) => (
        <DemoRibbon key={z.id} z={z} />
      ))}
      {/* lo que va dibujando la elfa dentro del círculo */}
      <Ribbon color="#fff0c8" width={0.2} y={0.05} get={() => ({ pts: proto.stroke, opacity: proto.inZone ? 0.75 : 0.4 })} />
      {/* el intento anterior: si salió bien se ilumina del color del ser; si no, se desvanece en azul */}
      <Ribbon
        color="#ffe2a0"
        width={0.34}
        y={0.06}
        get={() => {
          const P = proto
          const k = game.time - P.lastAt
          return { pts: P.lastStroke, opacity: P.lastOk ? Math.max(0, 1.2 - k / 3) : 0, color: P.lastColor }
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

/** El símbolo que dibuja el ser: brillante mientras lo dibuja, luego queda tenue como guía. */
function DemoRibbon({ z }: { z: Zone }) {
  const pts = useMemo<Pt[]>(() => [], [])
  return (
    <Ribbon
      color={z.color}
      width={0.26}
      get={() => {
        const t = game.time
        const p = demoProgress(z, t)
        if (p < 0) {
          const fade = z.solvedAt >= 0 ? 1 - clamp01((t - z.solvedAt) / 1.5) : 0
          return { pts: z.shape, opacity: fade * 0.3 }
        }
        pts.length = 0
        const n = Math.max(2, Math.floor(p * 90))
        for (let i = 0; i <= n; i++) pts.push(pointAlong(z.shape, (i / n) * p))
        const after = (t - z.demoAt - DEMO_TIME) / 2
        return { pts, opacity: p < 1 ? 0.95 : 0.95 - 0.7 * clamp01(after) }
      }}
    />
  )
}

// ── El puente: piedras que suben del barranco, una detrás de otra ──
const BRIDGE_MODEL = 'RockPath_Round_Wide'
const stoneM = new THREE.Matrix4()
export function Bridge() {
  const update = (set: SetInstance) => {
    const solvedAt = EARTH.solvedAt
    const t = game.time
    for (let i = 0; i < BRIDGE_STONES; i++) {
      const z = CHASM_Z0 - 0.4 + ((CHASM_Z1 - CHASM_Z0 + 0.8) * (i + 0.5)) / BRIDGE_STONES
      const start = solvedAt + 0.6 + (i / BRIDGE_STONES) * BRIDGE_TIME * 0.6
      const a = solvedAt >= 0 ? clamp01((t - start) / (BRIDGE_TIME * 0.45)) : 0
      const e = 1 - Math.pow(1 - a, 3)
      const y = -6 + e * 6 + Math.sin(t * 1.3 + i) * 0.015
      set(i, placeMatrix(0, y, z, i * 1.7, a > 0 ? 1.55 : 0.0001, stoneM), 1 + (1 - a) * 2)
    }
  }
  return <DynamicModel url={natureUrl(BRIDGE_MODEL)} count={BRIDGE_STONES} onFrame={update} />
}

// ── Los seres del bosque ──
//   tierra: una luz ámbar con piedritas que giran a su alrededor
//   fuego: una llama con chispas que suben y giran
const PEBBLES = 5
const SPARKS = 7
export function Spirits() {
  return (
    <>
      <Spirit z={EARTH} />
      <Spirit z={FIRE} />
    </>
  )
}

function Spirit({ z }: { z: Zone }) {
  const tex = useGlowTexture()
  const fire = z === FIRE
  const group = useRef<THREE.Group>(null!)
  const halo = useRef<THREE.Sprite>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const orbit = useRef<THREE.Group>(null!)
  const sparks = useRef<(THREE.Sprite | null)[]>([])
  const rest = useMemo(() => new THREE.Vector3(z.rest.x, z.rest.y, z.rest.z), [z])
  const target = useMemo(() => new THREE.Vector3(), [])
  const pebble = useGLTF(natureUrl('Pebble_Round_1'))
  const pebbleGeo = useMemo(() => {
    let geo: THREE.BufferGeometry | null = null
    pebble.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && !geo) geo = m.geometry
    })
    return geo ?? new THREE.IcosahedronGeometry(0.1, 0)
  }, [pebble])
  const sparkMat = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ffc06a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [tex],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = game.time
    const shown = z.spiritAt >= 0 ? clamp01((t - z.spiritAt) / 1.2) : 0
    group.current.visible = shown > 0.001
    if (!group.current.visible) return
    const p = demoProgress(z, t)
    if (z.solvedAt >= 0) {
      // celebra: sube y se adelanta en el camino, a esperarla
      const k = t - z.solvedAt
      if (fire) target.set(-1.6, 1.8 + Math.sin(k * 3) * 0.2, k < 2.5 ? z.z + 3 : END.z - 4)
      else target.set(1.6, 1.6 + Math.sin(k * 3) * 0.2, k < 2 ? z.z + 3 : CHASM_Z1 + 2)
    } else if (p >= 0 && p < 1) {
      const q = pointAlong(z.shape, p)
      target.set(q.x, 0.35, q.z) // baja al suelo para dibujar
    } else {
      target.copy(rest)
      target.y += Math.sin(t * 1.4) * 0.12
    }
    const drawing = p >= 0 && p < 1
    group.current.position.lerp(target, damp(drawing ? 14 : 2.5, dt))
    group.current.scale.setScalar(Math.max(0.001, shown))
    const glow = 1 + (drawing ? 0.4 : 0) + Math.sin(t * (fire ? 7 : 2.2)) * (fire ? 0.12 : 0.08)
    halo.current.scale.setScalar((fire ? 1.8 : 1.4) * glow)
    light.current.intensity = (fire ? 9 : 6) * glow * shown
    if (orbit.current) {
      orbit.current.rotation.y += dt * (drawing ? 4 : 1.5)
      orbit.current.rotation.x = Math.sin(t * 0.7) * 0.4
    }
    // las chispas suben dando vueltas y vuelven a empezar
    sparks.current.forEach((s, i) => {
      if (!s) return
      const k = (t * 0.7 + i / SPARKS) % 1
      const a = i * 2.4 + t * 2
      s.position.set(Math.cos(a) * (0.35 - k * 0.2), -0.1 + k * 0.9, Math.sin(a) * (0.35 - k * 0.2))
      s.scale.setScalar(0.16 * (1 - k))
    })
  })

  return (
    <group ref={group} position={rest} visible={false}>
      <sprite ref={halo}>
        <spriteMaterial map={tex} color={fire ? '#ff7a2a' : '#ffb85c'} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
      </sprite>
      <mesh scale={fire ? [1, 1.5, 1] : 1}>
        <icosahedronGeometry args={[0.14, 1]} />
        <meshBasicMaterial color={fire ? '#ffd27a' : '#ffe1a8'} toneMapped={false} fog={false} />
      </mesh>
      {fire ? (
        Array.from({ length: SPARKS }, (_, i) => (
          <sprite
            key={i}
            material={sparkMat}
            ref={(el) => {
              sparks.current[i] = el
            }}
          />
        ))
      ) : (
        <group ref={orbit}>
          {Array.from({ length: PEBBLES }, (_, i) => {
            const a = (i / PEBBLES) * Math.PI * 2
            return (
              <mesh key={i} geometry={pebbleGeo} position={[Math.cos(a) * 0.42, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.42]} scale={0.9}>
                <meshStandardMaterial color="#8a7a63" roughness={0.9} emissive="#3a2810" />
              </mesh>
            )
          })}
        </group>
      )}
      <pointLight ref={light} color={fire ? '#ff8a3a' : '#ffb85c'} distance={fire ? 9 : 7} intensity={0} />
    </group>
  )
}

// ── Las hogueras: un círculo de piedras con leños; encendidas, llamas que bailan ──
// (las luces son pocas y compartidas, y están siempre "encendidas" con intensidad 0:
//  así encender una hoguera no obliga a recompilar los materiales, que daría tirones)
const STONE = new THREE.DodecahedronGeometry(0.13, 0)
const STONE_MAT = new THREE.MeshStandardMaterial({ color: '#6b6660', roughness: 0.95 })
const LOG = new THREE.CylinderGeometry(0.06, 0.07, 0.75, 7)
const LOG_MAT = new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.9 })
const ASH_MAT = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 1 })
const FIRE_LIGHTS = [
  { x: FIRE.x, z: FIRE.z, fires: [0, 1, 2, 3, 4, 5], distance: 20 },
  { x: 0, z: 45, fires: [6, 7], distance: 14 },
  { x: 0, z: 52.7, fires: [8, 9], distance: 14 },
]

export function Fires() {
  const lights = useRef<(THREE.PointLight | null)[]>([])
  const hearth = useRef<THREE.PointLight>(null!)
  useFrame(() => {
    const t = game.time
    const k = (at: number) => (at < 0 ? 0 : clamp01((t - at) / 0.8) + Math.max(0, 1 - (t - at) / 1.5))
    FIRE_LIGHTS.forEach((L, i) => {
      const l = lights.current[i]
      if (!l) return
      const sum = L.fires.reduce((acc, f) => acc + k(fireLitAt(f)), 0)
      l.intensity = sum * (i === 0 ? 4 : 6) * (1 + Math.sin(t * 11 + i) * 0.06)
    })
    hearth.current.intensity = k(hearthLitAt()) * 10 * (1 + Math.sin(t * 9) * 0.08)
  })
  return (
    <>
      {FIRES.map((f, i) => (
        <Bonfire key={i} x={f.x} z={f.z} litAt={() => fireLitAt(i)} />
      ))}
      <Bonfire x={HEARTH.x} z={HEARTH.z} litAt={hearthLitAt} />
      {FIRE_LIGHTS.map((L, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            lights.current[i] = el
          }}
          position={[L.x, 1.6, L.z]}
          color="#ff9a4a"
          distance={L.distance}
          decay={1.2}
          intensity={0}
        />
      ))}
      <pointLight ref={hearth} position={[HEARTH.x, 1.1, HEARTH.z]} color="#ffa95a" distance={12} decay={1.3} intensity={0} />
    </>
  )
}

function Bonfire({ x, z, litAt }: { x: number; z: number; litAt: () => number }) {
  const tex = useGlowTexture()
  const flames = useMemo(
    () =>
      Array.from({ length: 5 }, (_, k) => ({
        mat: new THREE.SpriteMaterial({ map: tex, color: k % 2 ? '#ffb347' : '#ff7a2a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }),
        ph: k * 1.7 + x,
        x: (k - 2) * 0.07,
      })),
    [tex, x],
  )
  const refs = useRef<(THREE.Sprite | null)[]>([])
  const glow = useRef<THREE.Sprite>(null!)
  const glowMat = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ffb066', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }),
    [tex],
  )
  const stones = useMemo(() => Array.from({ length: 9 }, (_, k) => (k / 9) * Math.PI * 2), [])

  useFrame(() => {
    const t = game.time
    const at = litAt()
    const k = at < 0 || t < at ? 0 : Math.min(1, (t - at) / 0.8)
    // al encenderse, un destello grande que baja
    const burst = k > 0 ? Math.max(0, 1 - (t - at) / 1.5) : 0
    flames.forEach((fl, j) => {
      const s = refs.current[j]
      if (!s) return
      const flick = 0.8 + 0.2 * Math.sin(t * 9 + fl.ph) + 0.1 * Math.sin(t * 23 + fl.ph * 2)
      const h = (0.55 + 0.25 * Math.sin(t * 3 + fl.ph)) * k * (1 + burst)
      s.position.set(fl.x, 0.15 + h * 0.45, Math.sin(fl.ph) * 0.05)
      s.scale.set(0.45 * flick * k + 0.001, h * 1.3 + 0.001, 1)
      fl.mat.opacity = 0.85 * k
    })
    glowMat.opacity = (0.35 + burst * 0.6) * k
    glow.current.scale.setScalar(2.4 + burst * 4)
  })

  return (
    <group position={[x, 0, z]}>
      {stones.map((a, k) => (
        <mesh key={k} geometry={STONE} material={STONE_MAT} position={[Math.cos(a) * 0.42, 0.06, Math.sin(a) * 0.42]} rotation={[a, a * 2, 0]} />
      ))}
      <mesh geometry={LOG} material={LOG_MAT} position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0.5]} />
      <mesh geometry={LOG} material={LOG_MAT} position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, -0.7]} />
      <mesh material={ASH_MAT} position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.32, 16]} />
      </mesh>
      {flames.map((fl, j) => (
        <sprite
          key={j}
          ref={(el) => {
            refs.current[j] = el
          }}
          material={fl.mat}
        />
      ))}
      <sprite ref={glow} material={glowMat} position={[0, 0.5, 0]} />
    </group>
  )
}

// ── El muro de sombra: una niebla negra y espesa que corta el camino hasta que hay fuego ──
const WALL_PUFFS = 46
export function ShadowWall() {
  const tex = useGlowTexture()
  const mat = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#07080d', transparent: true, opacity: 0.9, depthWrite: false, fog: false }),
    [tex],
  )
  const puffs = useMemo(() => {
    const r = rng(9)
    return Array.from({ length: WALL_PUFFS }, () => ({ x: (r() - 0.5) * 30, y: 0.4 + r() * 3.2, z: WALL_Z + 0.4 + r() * 2.2, s: 3 + r() * 3, ph: r() * 6 }))
  }, [])
  const refs = useRef<(THREE.Sprite | null)[]>([])
  useFrame(() => {
    const t = game.time
    const open = FIRE.solvedAt >= 0 ? smoothstep(FIRE.solvedAt + 1, FIRE.solvedAt + WALL_OPEN + 0.5, t) : 0
    mat.opacity = 0.92 * (1 - open)
    puffs.forEach((p, i) => {
      const s = refs.current[i]
      if (!s) return
      s.visible = open < 0.999
      // la sombra respira y, al abrirse, se retira hacia los lados y hacia arriba
      const side = Math.sign(p.x || 1)
      s.position.set(p.x + Math.sin(t * 0.4 + p.ph) * 0.4 + side * open * 8, p.y + open * 2, p.z)
      s.scale.setScalar(p.s * (1 + Math.sin(t * 0.6 + p.ph) * 0.08) * (1 - open * 0.5))
    })
  })
  return (
    <>
      {puffs.map((p, i) => (
        <sprite
          key={i}
          material={mat}
          ref={(el) => {
            refs.current[i] = el
          }}
        />
      ))}
    </>
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
const camTarget = new THREE.Vector3(0, 68, 26.3)
const camLook = new THREE.Vector3(0, 0, 27)
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
