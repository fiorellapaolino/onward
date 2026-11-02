import { useMemo, useRef, type ComponentType } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { natureUrl } from '../game/config'
import { InstancedModel, placeMatrix, useModelParts } from '../components/instancing'
import { useGlowTexture } from '../components/TheLight'
import { BIN, BIN_SIZE, DEAD_TREES, HEAP_PAINT, HEAP_SLOTS, ISLAND_R, PLANT_MODELS, SCRAPS, TRAY_Z, YELLOW, scrapInfo, speciesInfo, type ScrapId } from './data'
import { COMPOST_TIME, getSoilTexture, j } from './garden'

/*
 * Lo que se ve: una maqueta vista desde arriba.
 *   - una plataforma de tierra con el bancal redondo en el medio (el jardín, seco al principio)
 *   - delante, la tabla con los restos; a la izquierda la compostera, a la derecha el contenedor amarillo
 */

export const PLATFORM_R = 11.8

// ── La cámara de maqueta ────────────────────────────────────────
export function DioramaCam() {
  const { camera, size } = useThree()
  const look = useMemo(() => new THREE.Vector3(0, 0, 2.2), [])
  useFrame(() => {
    const aspect = size.width / size.height
    // en vertical (móvil) se aleja para que quepa todo
    const dist = (aspect < 1 ? 27 / Math.max(0.5, aspect) * 0.62 : 25) / j.cam.zoom
    const pitch = 0.95
    const yaw = j.cam.yaw
    camera.position.set(look.x + Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, look.z + Math.cos(yaw) * Math.cos(pitch) * dist)
    camera.lookAt(look)
  })
  return null
}

// ── Luz y cielo: grises al principio, cálidos con el jardín ─────
const DUSK = new THREE.Color('#4a4f5c')
const DAY = new THREE.Color('#a8d3e4')
export function Sky() {
  const { scene } = useThree()
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const sun = useRef<THREE.DirectionalLight>(null!)
  const bg = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const r = j.richSmooth
    bg.copy(DUSK).lerp(DAY, Math.min(1, r * 1.2))
    scene.background = bg
    hemi.current.intensity = 1.1 + r * 0.9
    sun.current.intensity = 1.2 + r * 1.6
    sun.current.color.setHSL(0.11, 0.25 + r * 0.45, 0.85)
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#dfe6f0', '#5a4a3a', 1.2]} />
      <directionalLight ref={sun} position={[-8, 16, 6]} intensity={1.4} />
    </>
  )
}

// ── La plataforma y el bancal ───────────────────────────────────
export function Ground() {
  const soil = useMemo(() => getSoilTexture(), [])
  const rocks = useMemo(() => {
    const m: THREE.Matrix4[] = []
    const n = 34
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.03
      m.push(placeMatrix(Math.cos(a) * (ISLAND_R + 0.15), -0.05, Math.sin(a) * (ISLAND_R + 0.15), a * 3.1, 0.17 + (i % 4) * 0.025))
    }
    return m
  }, [])
  const pebbles = useMemo(() => {
    const m: THREE.Matrix4[] = []
    for (let i = 0; i < 60; i++) {
      const a = i * 2.39996
      const d = ISLAND_R + 0.8 + ((i * 37) % 30) / 10
      if (Math.abs(Math.sin(a) * d - TRAY_Z) < 1 && Math.abs(Math.cos(a) * d) < 4) continue
      m.push(placeMatrix(Math.cos(a) * d, 0, Math.sin(a) * d, a, 0.6 + (i % 5) * 0.15))
    }
    return m
  }, [])
  return (
    <>
      {/* la plataforma (un trozo de tierra flotando) */}
      <mesh position={[0, -0.6, 0]}>
        <cylinderGeometry args={[PLATFORM_R, PLATFORM_R - 0.4, 1.2, 64]} />
        <meshStandardMaterial color="#8a7760" roughness={1} />
      </mesh>
      <mesh position={[0, -2.6, 0]}>
        <cylinderGeometry args={[PLATFORM_R - 0.4, 4, 2.8, 48]} />
        <meshStandardMaterial color="#5e4a37" roughness={1} />
      </mesh>
      {/* el bancal: la tierra que se pinta */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <circleGeometry args={[ISLAND_R, 72]} />
        <meshStandardMaterial map={soil} roughness={1} />
      </mesh>
      <InstancedModel url={natureUrl('Rock_Medium_2')} matrices={rocks} />
      <InstancedModel url={natureUrl('Pebble_Round_1')} matrices={pebbles} />
    </>
  )
}

// ── Las plantas ─────────────────────────────────────────────────
const MAX_PLANTS = 700
const _m = new THREE.Matrix4()
const _m2 = new THREE.Matrix4()
const _c = new THREE.Color()

function easeOutBack(x: number) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

function GrowModel({ name, index }: { name: string; index: number }) {
  const parts = useModelParts(natureUrl(name))
  const refs = useRef<THREE.InstancedMesh[]>([])
  useFrame(() => {
    let n = 0
    const put = (x: number, y: number, z: number, rot: number, s: number, bright: number) => {
      if (n >= MAX_PLANTS) return
      placeMatrix(x, y, z, rot, s, _m)
      parts.forEach((part, k) => {
        const mesh = refs.current[k]
        if (!mesh) return
        mesh.setMatrixAt(n, _m2.multiplyMatrices(_m, part.matrix))
        mesh.setColorAt(n, _c.setScalar(bright))
      })
      n++
    }
    for (const p of j.plants) {
      if (p.model !== index || j.t < p.born) continue
      const sp = p.species
      const dur = sp === 'tree' ? 2.6 : sp === 'bush' ? 1.6 : 1.1
      const u = Math.min(1, (j.t - p.born) / dur)
      put(p.x, 0.03, p.z, p.rot + Math.sin(j.t * 1.3 + p.x) * 0.03, p.scale * Math.max(0.001, easeOutBack(u)), 1 + (1 - u) * 0.9)
    }
    // el montón de compost lleva encima una planta pequeña de lo que va a crecer
    j.heaps.forEach((h, i) => {
      if (!h) return
      const sp = speciesInfo(h.species)
      if (PLANT_INDEX_OF[sp.models[0].name] !== index) return
      const u = Math.min(1, (j.t - h.born) / 0.8)
      const sh = 0.45 + 0.55 * (h.left / HEAP_PAINT)
      const s0 = (sp.models[0].scale[0] + sp.models[0].scale[1]) / 2
      const mini = sp.id === 'tree' ? 0.32 : sp.id === 'bush' ? 0.6 : 0.85
      put(HEAP_SLOTS[i].x, 0.38 * sh, HEAP_SLOTS[i].z, j.t * 0.6, s0 * mini * easeOutBack(u), 1.15)
    })
    refs.current.forEach((mesh) => {
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
  })
  return (
    <>
      {parts.map((part, k) => (
        <instancedMesh
          key={k}
          ref={(el) => {
            if (el) {
              refs.current[k] = el
              if (!el.instanceColor) el.setColorAt(0, _c.setScalar(1))
            }
          }}
          args={[part.geometry, part.material, MAX_PLANTS]}
          frustumCulled={false}
        />
      ))}
    </>
  )
}
const PLANT_INDEX_OF: Record<string, number> = Object.fromEntries(PLANT_MODELS.map((n, i) => [n, i]))

export function Plants() {
  return (
    <>
      {PLANT_MODELS.map((name, i) => (
        <GrowModel key={name} name={name} index={i} />
      ))}
    </>
  )
}

// ── Los árboles secos del borde (reviven cuando el jardín crece) ─
export function DeadTrees() {
  const g = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    DEAD_TREES.forEach((d, i) => {
      const el = g.current[i]
      if (!el) return
      const gone = j.revived[i] >= 0 ? Math.min(1, (j.t - j.revived[i]) / 1.4) : 0
      el.scale.setScalar(0.2 * (1 - gone) + 0.0001)
      el.visible = gone < 1
    })
  })
  return (
    <>
      {DEAD_TREES.map((d, i) => (
        <group key={i} ref={(el) => (g.current[i] = el)} position={[d.x, 0, d.z]} rotation-y={i * 2.1}>
          <DeadTreeModel name={d.model} />
        </group>
      ))}
    </>
  )
}
function DeadTreeModel({ name }: { name: string }) {
  const { scene } = useGLTF(natureUrl(name))
  const c = useMemo(() => scene.clone(), [scene])
  return <primitive object={c} />
}

// ── Los restos (dibujados con formas simples) ───────────────────
function Peel() {
  return (
    <group>
      {[0, 2.1, 4.2].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.11, 0.04, Math.sin(a) * 0.11]} rotation={[0, -a, 0.25]} scale={[0.2, 0.035, 0.07]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color="#f0c53a" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.035, 0.05, 0.1, 8]} />
        <meshStandardMaterial color="#7a5a26" />
      </mesh>
    </group>
  )
}
function Coffee() {
  return (
    <group>
      <mesh position={[0, 0.05, 0]} scale={[0.22, 0.09, 0.22]}>
        <sphereGeometry args={[1, 14, 8]} />
        <meshStandardMaterial color="#3e271a" roughness={1} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.25, 0.2, 0.05, 16, 1, true]} />
        <meshStandardMaterial color="#f2ece0" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
function GrassCut() {
  return (
    <group>
      {[...Array(9)].map((_, i) => (
        <mesh key={i} position={[((i * 7) % 5) * 0.04 - 0.08, 0.03 + (i % 3) * 0.02, ((i * 3) % 4) * 0.04 - 0.06]} rotation={[0, i * 0.7, 0]}>
          <boxGeometry args={[0.035, 0.02, 0.34]} />
          <meshStandardMaterial color={i % 2 ? '#74b33e' : '#5f9a35'} />
        </mesh>
      ))}
    </group>
  )
}
function Leaves() {
  return (
    <group>
      {['#c8692a', '#a9521f', '#d99a3a'].map((c, i) => (
        <mesh key={i} position={[(i - 1) * 0.09, 0.03 + i * 0.015, (i % 2) * 0.06 - 0.03]} rotation={[0, i * 1.3, 0]} scale={[0.17, 0.018, 0.1]}>
          <sphereGeometry args={[1, 10, 6]} />
          <meshStandardMaterial color={c} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}
function Cardboard() {
  return (
    <group>
      <mesh position={[0, 0.03, 0]} rotation-y={0.3}>
        <boxGeometry args={[0.38, 0.04, 0.3]} />
        <meshStandardMaterial color="#b48d5c" roughness={1} />
      </mesh>
      <mesh position={[0.05, 0.1, -0.12]} rotation={[0.9, 0.3, 0]}>
        <boxGeometry args={[0.36, 0.03, 0.16]} />
        <meshStandardMaterial color="#a27c4c" roughness={1} />
      </mesh>
    </group>
  )
}
function Egg() {
  return (
    <group>
      {[-0.08, 0.09].map((x, i) => (
        <mesh key={i} position={[x, 0.1, i * 0.05]} rotation={[i ? 0.4 : -0.3, 0, i ? -0.3 : 0.4]}>
          <sphereGeometry args={[0.11, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <meshStandardMaterial color="#f3ecdc" side={THREE.DoubleSide} roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}
function Bottle() {
  return (
    <group>
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.3, 14]} />
        <meshStandardMaterial color="#8fd2f2" transparent opacity={0.75} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.04, 0.1, 0.09, 14]} />
        <meshStandardMaterial color="#8fd2f2" transparent opacity={0.75} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.04, 10]} />
        <meshStandardMaterial color="#2a78c8" />
      </mesh>
    </group>
  )
}
function Can() {
  return (
    <group>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.24, 16]} />
        <meshStandardMaterial color="#c3c8cf" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.093, 0.093, 0.11, 16]} />
        <meshStandardMaterial color="#d2453a" metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  )
}
const SCRAP_MESH: Record<ScrapId, ComponentType> = {
  peel: Peel, coffee: Coffee, grass: GrassCut, leaves: Leaves, cardboard: Cardboard, egg: Egg, bottle: Bottle, can: Can,
}

/** Todos los restos que se ven: en la tabla, el que se arrastra y los que vuelan. */
const POOL = 20
export function Scraps() {
  const items = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    let n = 0
    const show = (id: ScrapId, x: number, y: number, z: number, s: number, spin: number) => {
      const g = items.current[n++]
      if (!g) return
      g.visible = true
      g.position.set(x, y, z)
      g.scale.setScalar(s)
      g.rotation.y = spin
      g.children.forEach((c, k) => (c.visible = SCRAPS[k].id === id))
    }
    j.slots.forEach((s, i) => {
      const d = j.drag
      if (d && d.kind === 'scrap' && d.slot === i) return
      if (s.back > j.t) return
      const u = Math.min(1, (j.t - Math.max(0, s.back)) / 0.35)
      const hint = j.hintScrap === i ? 1 + Math.sin(j.t * 6) * 0.08 : 1
      show(s.id, s.x, 0.12, s.z, 1.5 * easeOutBack(u) * hint, i * 0.9)
    })
    const d = j.drag
    if (d && d.kind === 'scrap') show(j.slots[d.slot].id, d.x, d.y, d.z, 1.75, j.t * 1.5)
    for (const f of j.flying) show(f.id, f.x, f.y, f.z, 1.5, f.t * 9)
    for (let k = n; k < POOL; k++) if (items.current[k]) items.current[k]!.visible = false
  })
  return (
    <>
      {/* la tabla */}
      <mesh position={[0, 0.06, TRAY_Z]}>
        <boxGeometry args={[SCRAPS.length * 0.8 + 0.5, 0.12, 1.0]} />
        <meshStandardMaterial color="#9b7048" roughness={0.9} />
      </mesh>
      {[...Array(POOL)].map((_, i) => (
        <group key={i} ref={(el) => (items.current[i] = el)} visible={false}>
          {SCRAPS.map((s) => {
            const M = SCRAP_MESH[s.id]
            return (
              <group key={s.id}>
                <M />
              </group>
            )
          })}
        </group>
      ))}
    </>
  )
}

// ── La compostera ───────────────────────────────────────────────
const WOOD = '#8b5a2b'
export function CompostBin() {
  const root = useRef<THREE.Group>(null!)
  const lid = useRef<THREE.Group>(null!)
  const fill = useRef<THREE.Mesh>(null!)
  const dots = useRef<(THREE.Mesh | null)[]>([])
  const glow = useRef<THREE.Sprite>(null!)
  const tex = useGlowTexture()
  useFrame(() => {
    const working = j.binWorkAt >= 0
    const wt = working ? j.t - j.binWorkAt : 0
    // la tapa se cierra mientras composta
    const target = working && wt < COMPOST_TIME ? 0 : -1.15
    lid.current.rotation.x += (target - lid.current.rotation.x) * 0.15
    // se sacude: al rechazar algo, y suave mientras composta
    const sh = Math.max(0, 1 - (j.t - j.binShakeAt) / 0.4)
    const work = working ? Math.sin(wt * 30) * 0.025 * Math.min(1, wt) : 0
    root.current.rotation.z = Math.sin(j.t * 50) * 0.08 * sh + work
    root.current.scale.setScalar(1 + (working ? Math.sin(wt * 9) * 0.02 : 0))
    // lo que hay dentro
    const lvl = working ? 3 : j.bin.length
    fill.current.position.y = 0.15 + lvl * 0.28
    fill.current.visible = lvl > 0
    for (let i = 0; i < BIN_SIZE; i++) {
      const m = dots.current[i]
      if (!m) continue
      const mat = m.material as THREE.MeshStandardMaterial
      const id = working ? null : j.bin[i]
      if (working) {
        mat.color.set('#ffe9a8')
        mat.emissive.set('#ffd36a')
        mat.emissiveIntensity = 0.6 + Math.sin(wt * 8 + i) * 0.4
      } else if (id) {
        mat.color.set(scrapInfo(id).color)
        mat.emissive.set(scrapInfo(id).color)
        mat.emissiveIntensity = 0.7
      } else {
        mat.color.set('#4a3a2a')
        mat.emissive.set('#000')
        mat.emissiveIntensity = 0
      }
    }
    // brilla cuando se le acerca un resto
    const d = j.drag
    const near = d && d.kind === 'scrap' ? Math.max(0, 1 - Math.hypot(d.x - BIN.x, d.z - BIN.z) / 2.2) : 0
    ;(glow.current.material as THREE.SpriteMaterial).opacity = near * 0.8 + (working ? 0.25 + Math.sin(wt * 6) * 0.15 : 0)
  })
  const plank = (y: number, k: number) => (
    <group key={k}>
      <mesh position={[0, y, 0.75]}>
        <boxGeometry args={[1.6, 0.26, 0.1]} />
        <meshStandardMaterial color={WOOD} roughness={0.9} />
      </mesh>
      <mesh position={[0, y, -0.75]}>
        <boxGeometry args={[1.6, 0.26, 0.1]} />
        <meshStandardMaterial color={WOOD} roughness={0.9} />
      </mesh>
      <mesh position={[0.75, y, 0]}>
        <boxGeometry args={[0.1, 0.26, 1.5]} />
        <meshStandardMaterial color={WOOD} roughness={0.9} />
      </mesh>
      <mesh position={[-0.75, y, 0]}>
        <boxGeometry args={[0.1, 0.26, 1.5]} />
        <meshStandardMaterial color={WOOD} roughness={0.9} />
      </mesh>
    </group>
  )
  return (
    <group position={[BIN.x, 0, BIN.z]}>
      <group ref={root}>
        {[0.15, 0.48, 0.81, 1.14].map(plank)}
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[1.45, 0.06, 1.45]} />
          <meshStandardMaterial color="#3b2a1c" />
        </mesh>
        <mesh ref={fill} position={[0, 0.3, 0]}>
          <boxGeometry args={[1.42, 0.1, 1.42]} />
          <meshStandardMaterial color="#4b3422" roughness={1} />
        </mesh>
        {/* las tres luces: cuántos restos lleva esta tanda */}
        {[...Array(BIN_SIZE)].map((_, i) => (
          <mesh key={i} ref={(el) => (dots.current[i] = el)} position={[(i - 1) * 0.42, 0.6, 0.82]}>
            <sphereGeometry args={[0.1, 12, 8]} />
            <meshStandardMaterial color="#4a3a2a" />
          </mesh>
        ))}
        <group ref={lid} position={[0, 1.28, -0.8]} rotation-x={-1.15}>
          <mesh position={[0, 0, 0.8]}>
            <boxGeometry args={[1.7, 0.1, 1.7]} />
            <meshStandardMaterial color="#6e4521" roughness={0.9} />
          </mesh>
        </group>
      </group>
      <sprite ref={glow} position={[0, 1.4, 0]} scale={[3.4, 3.4, 1]}>
        <spriteMaterial map={tex} color="#ffd98a" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  )
}

// ── El contenedor amarillo (plástico y latas) ───────────────────
export function YellowBin() {
  const root = useRef<THREE.Group>(null!)
  const lid = useRef<THREE.Mesh>(null!)
  const glow = useRef<THREE.Sprite>(null!)
  const tex = useGlowTexture()
  useFrame(() => {
    const sh = Math.max(0, 1 - (j.t - j.yellowShakeAt) / 0.4)
    const got = Math.max(0, 1 - (j.t - j.yellowAt) / 0.5)
    root.current.rotation.z = Math.sin(j.t * 50) * 0.08 * sh
    root.current.scale.set(1 + got * 0.08, 1 - got * 0.06, 1 + got * 0.08)
    lid.current.rotation.x = -got * 0.5
    const d = j.drag
    const near = d && d.kind === 'scrap' ? Math.max(0, 1 - Math.hypot(d.x - YELLOW.x, d.z - YELLOW.z) / 2.2) : 0
    ;(glow.current.material as THREE.SpriteMaterial).opacity = near * 0.8 + got * 0.6
  })
  return (
    <group position={[YELLOW.x, 0, YELLOW.z]}>
      <group ref={root}>
        <mesh position={[0, 0.7, 0]}>
          <boxGeometry args={[1.3, 1.4, 1.1]} />
          <meshStandardMaterial color="#f2c230" roughness={0.6} />
        </mesh>
        <mesh ref={lid} position={[0, 1.45, 0]}>
          <boxGeometry args={[1.38, 0.12, 1.18]} />
          <meshStandardMaterial color="#d9a514" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.52, 0.1]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.28, 20]} />
          <meshStandardMaterial color="#3a3020" />
        </mesh>
      </group>
      <sprite ref={glow} position={[0, 1.4, 0]} scale={[3.4, 3.4, 1]}>
        <spriteMaterial map={tex} color="#fff0a0" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  )
}

// ── Los montones de compost listos ──────────────────────────────
export function Heaps() {
  const heaps = useRef<(THREE.Group | null)[]>([])
  const tex = useGlowTexture()
  useFrame(() => {
    HEAP_SLOTS.forEach((_, i) => {
      const g = heaps.current[i]
      if (!g) return
      const h = j.heaps[i]
      g.visible = !!h
      if (!h) return
      const u = Math.min(1, (j.t - h.born) / 0.6)
      const left = 0.45 + 0.55 * (h.left / HEAP_PAINT)
      g.scale.setScalar(easeOutBack(u) * left)
      const d = j.drag
      const held = d && d.kind === 'paint' && d.heap === i
      const glow = g.children[1] as THREE.Sprite
      const mat = glow.material as THREE.SpriteMaterial
      mat.color.set(speciesInfo(h.species).tint)
      mat.opacity = 0.55 + Math.sin(j.t * 3 + i) * 0.2 + (held ? 0.3 : 0)
    })
  })
  return (
    <>
      {HEAP_SLOTS.map((s, i) => (
        <group key={i} ref={(el) => (heaps.current[i] = el)} position={[s.x, 0, s.z]} visible={false}>
          <mesh position={[0, 0.05, 0]} scale={[0.75, 0.42, 0.75]}>
            <sphereGeometry args={[1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#3d2a1b" roughness={1} />
          </mesh>
          <sprite position={[0, 0.3, 0]} scale={[2.6, 2.6, 1]}>
            <spriteMaterial map={tex} transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        </group>
      ))}
    </>
  )
}

// ── El compost que se lleva en la mano mientras se pinta ────────
export function Brush() {
  const g = useRef<THREE.Group>(null!)
  const tex = useGlowTexture()
  useFrame(() => {
    const d = j.drag
    g.current.visible = !!d && d.kind === 'paint'
    if (!d || d.kind !== 'paint') return
    const h = j.heaps[d.heap]
    if (!h) return
    g.current.position.set(d.x, d.on ? 0.25 : 0.7, d.z)
    const s = 0.4 + 0.6 * (h.left / HEAP_PAINT)
    g.current.scale.setScalar(s)
    const spr = g.current.children[1] as THREE.Sprite
    ;(spr.material as THREE.SpriteMaterial).color.set(speciesInfo(h.species).tint)
  })
  return (
    <group ref={g} visible={false}>
      <mesh scale={[0.45, 0.28, 0.45]}>
        <sphereGeometry args={[1, 14, 8]} />
        <meshStandardMaterial color="#3d2a1b" roughness={1} />
      </mesh>
      <sprite scale={[2, 2, 1]}>
        <spriteMaterial map={tex} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  )
}

// ── Pistas sin palabras: puntos de luz que van de aquí a allá ───
const HINT_DOTS = 14
export function Hints() {
  const dots = useRef<(THREE.Sprite | null)[]>([])
  const tex = useGlowTexture()
  const a = useMemo(() => new THREE.Vector3(), [])
  const b = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const hint = currentHint()
    j.hintScrap = hint?.scrap ?? -1
    dots.current.forEach((s, i) => {
      if (!s) return
      s.visible = !!hint
      if (!hint) return
      a.set(hint.from.x, 0.4, hint.from.z)
      b.set(hint.to.x, hint.toY, hint.to.z)
      const u = (i / HINT_DOTS + j.t * 0.35) % 1
      s.position.lerpVectors(a, b, u)
      s.position.y += Math.sin(u * Math.PI) * 2.2
      const fade = Math.min(1, (j.t - hint.since) / 0.8)
      ;(s.material as THREE.SpriteMaterial).opacity = Math.sin(u * Math.PI) * 0.9 * fade
      s.scale.setScalar(0.5 + Math.sin(u * Math.PI) * 0.25)
    })
  })
  return (
    <>
      {[...Array(HINT_DOTS)].map((_, i) => (
        <sprite key={i} ref={(el) => (dots.current[i] = el)} visible={false}>
          <spriteMaterial map={tex} color="#ffe39a" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </>
  )
}

/** Qué pista toca ahora (si el jugador lleva un rato sin hacer nada útil). */
function currentHint() {
  if (!j.started || j.drag) return null
  const idle = j.t - j.lastAction
  const heap = j.heaps.findIndex((h) => !!h)
  if (heap >= 0 && idle > 2.5) {
    // del montón al jardín
    const since = j.lastAction + 2.5
    const s = HEAP_SLOTS[heap]
    return { from: s, to: { x: -1.5, z: 1.5 }, toY: 0.2, since, scrap: -1 }
  }
  if (j.binWorkAt < 0 && heap < 0 && idle > (j.dropped === 0 ? 1.5 : 5)) {
    // de la tabla a la compostera (señala un resto que sí se composta)
    const order = [0, 3, 5, 1, 4, 2]
    const scrap = order[(j.bin.length + Math.floor(j.dropped / 3)) % order.length]
    const s = j.slots[scrap]
    return { from: s, to: BIN, toY: 1.4, since: j.lastAction + (j.dropped === 0 ? 1.5 : 5), scrap }
  }
  return null
}
