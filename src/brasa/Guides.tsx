import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { game, isTouch } from '../game/state'
import { useGlowTexture } from '../components/TheLight'
import type { Pt } from '../simbolos/recognizer'
import { BRIDGE, BRIDGE_RING, FEAR_RING, FLOWERS, HEARTH, HIDEOUT, PATH_LIGHTS, RINGS, WAIT_SPOT, b } from './brasaProto'

/*
 * El idioma visual común (para entender el juego sin leer):
 *   - DORADO que late  = se le puede dar luz (y te devuelve algo)
 *   - LILA que late    = solo existe en el espejo (míralo con el espejo)
 *   - VERDE AGUA       = refugio (ahí la brasa se recarga) — lo dan los círculos de hongos encendidos
 * Encima de lo más cercano aparece la tecla que hay que usar (sin palabras).
 * Columnas de chispas suben desde lo que espera: se ven de lejos, sin necesidad de oír a los grillos.
 */

type Target = { x: number; z: number; r: number; kind: 'gold' | 'lilac'; strong: number }

const GOLD = new THREE.Color('#ffcf7a')
const LILAC = new THREE.Color('#c8a8ff')

/** Todo lo que ahora mismo espera algo de ella. */
export function targets(): Target[] {
  const out: Target[] = []
  const t = game.time
  if (!game.started || !b.introDone || b.end.giveAt >= 0) return out
  // la recién nacida
  if (b.end.landAt >= 0 && t > b.end.landAt + 4) out.push({ x: WAIT_SPOT.x, z: WAIT_SPOT.z, r: 1.3, kind: 'gold', strong: 1 })
  // antes de tener la brasa: solo la brasa que espera en la hoguera
  if (!b.hasEmber) {
    if (b.emberLeft) out.push({ x: HEARTH.x, z: HEARTH.z, r: 1.1, kind: 'gold', strong: 1 })
    return out
  }
  FLOWERS.forEach((f) => {
    if (f.giftAt >= 0) return
    if (f.hidden) {
      if (b.hasMirror) out.push({ x: f.x, z: f.z, r: 0.9, kind: 'lilac', strong: 0.35 + b.look * 0.65 })
    } else out.push({ x: f.x, z: f.z, r: 0.9, kind: 'gold', strong: 1 })
  })
  RINGS.forEach((r, i) => {
    if (r.litAt >= 0 || i === FEAR_RING || i === BRIDGE_RING) return
    out.push({ x: r.x, z: r.z, r: 2.1, kind: 'gold', strong: 1 })
  })
  if (b.fear.calmAt < 0) PATH_LIGHTS.forEach((p) => p.litAt < 0 && out.push({ x: p.x, z: p.z, r: 0.9, kind: 'gold', strong: 1 }))
  // el espejo que sale de la tierra
  if (b.fear.mirrorUpAt >= 0 && !b.hasMirror && t > b.fear.mirrorUpAt + 1) out.push({ x: HIDEOUT.x, z: HIDEOUT.z - 1.2, r: 1, kind: 'lilac', strong: 1 })
  if (b.hasMirror && BRIDGE.litAt < 0) out.push({ x: BRIDGE.x, z: BRIDGE.z + 0.9, r: 1.6, kind: 'lilac', strong: 0.35 + b.look * 0.65 })
  const S = b.shadow
  if (S.appearAt >= 0 && S.lightAt < 0 && b.look > 0.3) out.push({ x: S.pos.x, z: S.pos.z, r: 0.9, kind: 'lilac', strong: b.look })
  return out
}

// ── Anillos que laten en el suelo ──
const MAX = 16
export function Beckons() {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const mats = useMemo(
    () => Array.from({ length: MAX }, () => new THREE.MeshBasicMaterial({ color: GOLD.clone(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false })),
    [],
  )
  useFrame(() => {
    const list = targets()
    const t = game.time
    for (let i = 0; i < MAX; i++) {
      const m = refs.current[i]
      if (!m) continue
      const g = list[i]
      if (!g) {
        m.visible = false
        continue
      }
      m.visible = true
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.2 + i)
      m.position.set(g.x, 0.05, g.z)
      m.scale.setScalar(g.r * (1 + pulse * 0.18))
      mats[i].color.copy(g.kind === 'gold' ? GOLD : LILAC)
      mats[i].opacity = (0.4 + pulse * 0.5) * g.strong
    }
  })
  return (
    <>
      {mats.map((mat, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          material={mat}
          rotation-x={-Math.PI / 2}
          renderOrder={6}
          visible={false}
        >
          <ringGeometry args={[0.86, 1, 48]} />
        </mesh>
      ))}
    </>
  )
}

// ── Columnas de chispas: suben desde lo que espera (se ven de lejos) ──
const PER = 7
export function Beacons() {
  const tex = useGlowTexture()
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX * PER * 3), 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(MAX * PER * 3), 3))
    return g
  }, [])
  useFrame(() => {
    const list = targets()
    const t = game.time
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const col = geo.getAttribute('color') as THREE.BufferAttribute
    for (let i = 0; i < MAX; i++) {
      const g = list[i]
      for (let k = 0; k < PER; k++) {
        const n = i * PER + k
        if (!g) {
          pos.setXYZ(n, 0, -999, 0)
          continue
        }
        const life = (t * 0.45 + k / PER + i * 0.13) % 1 // sube y vuelve a empezar
        const a = k * 2.3 + t * 0.8
        pos.setXYZ(n, g.x + Math.cos(a) * 0.25, 0.2 + life * 4.5, g.z + Math.sin(a) * 0.25)
        const c = g.kind === 'gold' ? GOLD : LILAC
        const fade = Math.sin(Math.PI * life) * g.strong
        col.setXYZ(n, c.r * fade, c.g * fade, c.b * fade)
      }
    }
    pos.needsUpdate = true
    col.needsUpdate = true
  })
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial map={tex} vertexColors size={0.55} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
    </points>
  )
}

// ── La tecla, encima de lo que se puede hacer ahora (sin palabras) ──
const v = new THREE.Vector3()
function place(el: HTMLElement | null, p: Pt | null, y: number, camera: THREE.Camera, size: { width: number; height: number }) {
  if (!el) return
  if (!p) {
    el.classList.remove('show')
    return
  }
  v.set(p.x, y, p.z).project(camera)
  if (v.z > 1) {
    el.classList.remove('show')
    return
  }
  el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`
  el.classList.add('show')
}

/** Lo que se puede ver con el espejo cerca (para mostrar la tecla del espejo). */
function mirrorTarget(): Pt | null {
  if (!b.hasMirror || b.look > 0.4) return null
  const g = game
  const near = (p: Pt, d: number) => Math.hypot(g.x - p.x, g.z - p.z) < d
  // la primera vez, sobre ella
  if (!b.lookedOnce && g.time - b.mirrorAt > 3.5) return { x: g.x, z: g.z }
  const S = b.shadow
  if (S.appearAt >= 0 && S.lightAt < 0) return { x: g.x, z: g.z }
  if (BRIDGE.litAt < 0 && near(BRIDGE, 7)) return { x: BRIDGE.x, z: BRIDGE.z + 0.9 }
  const f = FLOWERS.find((fl) => fl.hidden && fl.giftAt < 0 && near(fl, 6))
  return f ? { x: f.x, z: f.z } : null
}

export function ActionIcons() {
  useFrame(({ camera, size }) => {
    const n = b.near
    let p: Pt | null = null
    if (n) {
      const S = b.shadow
      p = n.kind === 'ring' ? RINGS[n.i] : n.kind === 'path' ? PATH_LIGHTS[n.i] : n.kind === 'bridge' ? { x: BRIDGE.x, z: BRIDGE.z + 0.9 } : n.kind === 'shadow' ? S.pos : n.kind === 'newborn' ? WAIT_SPOT : FLOWERS[n.i]
    }
    place(document.getElementById('icon-give'), p, n?.kind === 'ring' ? 1.2 : 1.6, camera, size)
    place(document.getElementById('icon-mirror'), p ? null : mirrorTarget(), 2.3, camera, size)
    // en el móvil, los botones también laten cuando sirven
    document.querySelector('.touch-btn.jump')?.classList.toggle('beckon', !!p)
    document.querySelector('.touch-btn.mirror')?.classList.toggle('beckon', !p && !!mirrorTarget())
  })
  return null
}

/** (para el HTML: qué dibujar en el ícono) */
export const giveGlyph = isTouch ? '✦' : 'E'
