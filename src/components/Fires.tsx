import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { game } from '../game/state'
import { FIRES, HEARTH, fires, type Fire } from '../game/fires'
import { useGlowTexture } from './TheLight'
import { Ghost, PARTS, WOMAN, type GhostSpec } from './Memory'

/*
 * Las hogueras (game/fires.ts): un círculo de piedras con leños; encendidas, llamas que bailan y una luz cálida.
 * La brasa que lleva la elfa flota delante de su pecho y se va achicando.
 * Al encenderse cada una, aparece un recuerdo: figuras de luz dorada sentadas alrededor del fuego.
 */
const STONE = new THREE.DodecahedronGeometry(0.13, 0)
const STONE_MAT = new THREE.MeshStandardMaterial({ color: '#6b6660', roughness: 0.95 })
const LOG = new THREE.CylinderGeometry(0.06, 0.07, 0.75, 7)
const LOG_MAT = new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.9 })
const ASH_MAT = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 1 })

export function Fires() {
  return (
    <>
      {FIRES.map((f, i) => (
        <Bonfire key={i} f={f} i={i} />
      ))}
      {MEMORIES.map((m, i) => (
        <Ghost key={i} spec={m} />
      ))}
      <Ember />
    </>
  )
}

function Bonfire({ f, i }: { f: Fire; i: number }) {
  const tex = useGlowTexture()
  const flames = useMemo(
    () =>
      Array.from({ length: 5 }, (_, k) => ({
        mat: new THREE.SpriteMaterial({ map: tex, color: k % 2 ? '#ffb347' : '#ff7a2a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        ph: k * 1.7,
        x: (k - 2) * 0.07,
      })),
    [tex],
  )
  const refs = useRef<(THREE.Sprite | null)[]>([])
  const light = useRef<THREE.PointLight>(null!)
  const glow = useRef<THREE.Sprite>(null!)
  const glowMat = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ffb066', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [tex],
  )
  const stones = useMemo(() => Array.from({ length: 9 }, (_, k) => (k / 9) * Math.PI * 2), [])

  useFrame(() => {
    const t = game.time
    const at = fires.litAt[i]
    const k = at < 0 ? 0 : Math.min(1, (t - at) / 0.8)
    // al encenderse, un destello grande que baja
    const burst = at < 0 ? 0 : Math.max(0, 1 - (t - at) / 1.5)
    flames.forEach((fl, j) => {
      const s = refs.current[j]
      if (!s) return
      const flick = 0.8 + 0.2 * Math.sin(t * 9 + fl.ph) + 0.1 * Math.sin(t * 23 + fl.ph * 2)
      const h = (0.55 + 0.25 * Math.sin(t * 3 + fl.ph)) * k * (1 + burst)
      s.position.set(fl.x, 0.15 + h * 0.45, Math.sin(fl.ph) * 0.05)
      s.scale.set(0.45 * flick * k, h * 1.3 + 0.01, 1)
      fl.mat.opacity = 0.85 * k
    })
    glowMat.opacity = (0.35 + burst * 0.6) * k
    glow.current.scale.setScalar(2.4 + burst * 4)
    light.current.intensity = (6 + Math.sin(t * 11) * 0.8 + burst * 18) * k
    light.current.visible = k > 0 // (las luces apagadas no cuestan: así el juego va más ligero)
  })

  return (
    <group position={[f.x, 0, f.z]}>
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
      <pointLight ref={light} position={[0, 0.9, 0]} color="#ff9a4a" distance={13} decay={1.4} intensity={0} />
    </group>
  )
}

/** La brasa que lleva: delante de su pecho, se achica a medida que se apaga. */
function Ember() {
  const tex = useGlowTexture()
  const mat = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ff8a3a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [tex],
  )
  const core = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#fff0c0', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    [tex],
  )
  const a = useRef<THREE.Sprite>(null!)
  const b = useRef<THREE.Sprite>(null!)
  const light = useRef<THREE.PointLight>(null!)
  useFrame(() => {
    const g = game
    const e = fires.ember
    const low = e < 0.25 ? 0.5 + 0.5 * Math.sin(g.time * 14) : 1 // (casi apagada: titila)
    const x = g.x + Math.sin(g.yaw) * 0.32
    const z = g.z + Math.cos(g.yaw) * 0.32
    const y = 0.78 + g.jumpY + Math.sin(g.time * 2.4) * 0.03
    a.current.position.set(x, y, z)
    b.current.position.set(x, y, z)
    light.current.position.set(x, y + 0.1, z)
    const size = 0.12 + 0.3 * e
    a.current.scale.setScalar(size * 2.2)
    b.current.scale.setScalar(size * 0.7)
    mat.opacity = e > 0 ? 0.9 * low : 0
    core.opacity = e > 0 ? low : 0
    light.current.intensity = e > 0 ? (0.6 + 2.2 * e) * low : 0
    light.current.visible = e > 0
  })
  return (
    <>
      <sprite ref={a} material={mat} />
      <sprite ref={b} material={core} />
      <pointLight ref={light} color="#ff9a4a" distance={6} intensity={0} />
    </>
  )
}

// ── Los recuerdos: quién se sentó alrededor de cada fuego, hace mucho ──
// (se ven al encenderla, mientras ella está cerca)
const showAt = (i: number) => () => {
  const at = fires.litAt[i]
  if (at < 0) return 0
  const f = FIRES[i]
  const near = 1 - Math.max(0, Math.min(1, (Math.hypot(game.x - f.x, game.z - f.z) - 5) / 4))
  return Math.min(1, Math.max(0, (game.time - at - 0.8) / 1.5)) * near
}
const around = (i: number, a: number, r = 1.05) => {
  const f = FIRES[i]
  return { x: f.x + Math.cos(a) * r, z: f.z + Math.sin(a) * r, rot: Math.atan2(-Math.cos(a), -Math.sin(a)) }
}
const MEMORIES: GhostSpec[] = [
  // 1: una madre y una niña, juntas, calentándose las manos
  { parts: WOMAN, height: 1.08, kind: 'warm', ...around(1, 0.6), show: showAt(1) },
  { parts: PARTS, height: 0.8, kind: 'warm', ...around(1, 1.25, 0.95), off: 1, show: showAt(1) },
  // 2: una sola, sentada lejos del fuego, meciéndose
  { parts: PARTS, height: 1.0, kind: 'sit', ...around(2, 2.4, 1.6), off: 2, show: showAt(2) },
  // 3: varias alrededor del fuego (una fiesta, una despedida)
  { parts: WOMAN, height: 1.08, kind: 'sit', ...around(3, 0.3), off: 0.5, show: showAt(3) },
  { parts: PARTS, height: 1.0, kind: 'clap', ...around(3, 1.9, 1.3), off: 1.5, show: showAt(3) },
  { parts: PARTS, height: 0.85, kind: 'sit', ...around(3, 3.6), off: 2.5, show: showAt(3) },
  // el hogar de la niña: su familia, como era antes, alrededor de ese mismo fuego
  { parts: WOMAN, height: 1.08, kind: 'warm', ...around(HEARTH, 3.9, 1.1), off: 0.3, show: showAt(HEARTH) },
  { parts: WOMAN, height: 1.12, kind: 'sit', ...around(HEARTH, 5.0, 1.15), off: 1.1, show: showAt(HEARTH) },
]
