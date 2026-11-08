import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clamp01, heightAt, pathAt, stoneLift } from '../game/config'
import { game } from '../game/state'
import { ALTAR, MINERAL, PORTAL, WISP_FROM } from '../game/altar'
import { useGlowTexture } from './TheLight'
import { setHum } from '../game/sfx'

/*
 * El altar junto a los árboles, el cráter del meteorito, y lo que solo ve su yo oscuro:
 *   plane 1: algo que se mueve entre los árboles y el círculo de hadas al que lleva (entrar en él lleva al vacío).
 *   plane 2: el vacío, las piedras flotantes y el hierro de estrella (ver Abyss.tsx).
 * El plano negativo es el mismo mundo de noche (filtro sobre la imagen, ver styles.css).
 */
/** El altar: "Free Ritual Stone" (CGTrader), con las texturas achicadas para la web. Mide 0,91 m de alto. */
const ALTAR_URL = `${import.meta.env.BASE_URL}models/altar/ritual_stone.glb`
const ALTAR_SCALE = 1.15
const ALTAR_TOP = 0.91 * ALTAR_SCALE
const RUNE_MAT = new THREE.MeshBasicMaterial({ color: '#9fd8ff', toneMapped: false, transparent: true })
const CRATER_MAT = new THREE.MeshBasicMaterial({ color: '#0b0908', transparent: true, opacity: 0.55, depthWrite: false })
const ROCK_MAT = new THREE.MeshStandardMaterial({ color: '#3a3532', roughness: 1, flatShading: true })
const IRON_MAT = new THREE.MeshStandardMaterial({ color: '#cfefff', emissive: '#8fd8ff', emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.5 })
const TMP = new THREE.Vector3()
// el círculo de hadas: hongos que brillan en anillo, lucecitas que giran adentro
const CAP_MAT = new THREE.MeshBasicMaterial({ color: '#c4f4ff', toneMapped: false })
const STEM_MAT = new THREE.MeshBasicMaterial({ color: '#eefcff', toneMapped: false })
const RING_R = 0.95
const MUSHROOMS = (() => {
  const out: { a: number; r: number; s: number }[] = []
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * Math.PI * 2 + Math.sin(i * 7.3) * 0.12
    out.push({ a, r: RING_R + Math.sin(i * 3.1) * 0.07, s: 0.8 + ((i * 37) % 10) / 16 })
  }
  return out
})()
const MOTES = 10
const easeOutBack = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2)
const TMP_COLOR = new THREE.Color('#c4f4ff')

export function Altar() {
  const glowTex = useGlowTexture()
  const { scene: altarScene } = useGLTF(ALTAR_URL)
  const altarModel = useMemo(() => {
    const m = altarScene.clone(true)
    m.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    return m
  }, [altarScene])
  const rune = useRef<THREE.Mesh>(null!)
  const wisp = useRef<THREE.Group>(null!)
  const portal = useRef<THREE.Group>(null!)
  const motes = useRef<THREE.Group>(null!)
  const carried = useRef<THREE.Group>(null!)
  const wispMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#e6f4ff', transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), [glowTex])
  const ringGlow = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTex, color: '#9fe6ff', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), [glowTex])
  const moteMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#e8fbff', transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), [glowTex])
  const mistMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#cfeaff', transparent: true, opacity: 0.15, depthWrite: false, toneMapped: false }), [glowTex])
  // cuándo cambió de plano y desde cuál (para animar lo que aparece y lo que se va)
  const planeFx = useRef({ prev: 0, left: 0, at: -99 })
  const ironGlow = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#9fdcff', transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), [glowTex])

  const altarYaw = useMemo(() => {
    const p = pathAt(ALTAR.z, new THREE.Vector3())
    return Math.atan2(p.x - ALTAR.x, p.z - ALTAR.z)
  }, [])
  const portalYaw = useMemo(() => {
    const a = pathAt(PORTAL.z - 1, new THREE.Vector3())
    const b = pathAt(PORTAL.z + 1, new THREE.Vector3())
    return Math.atan2(b.x - a.x, b.z - a.z)
  }, [])

  useFrame(() => {
    const g = game
    const t = g.time
    // el filtro del plano (oscuro / negativo) va en la página: ver styles.css
    const plane = String(g.plane)
    if (document.documentElement.dataset.plane !== plane) document.documentElement.dataset.plane = plane
    // la runa del altar late mientras hay que buscarlo; se enciende al rezar
    const praying = g.prayAt >= 0 ? clamp01((t - g.prayAt) / 1.2) : 0
    RUNE_MAT.opacity = g.story === 'altar' ? 0.35 + 0.25 * Math.sin(t * 2.2) + 0.4 * praying : 0.12
    rune.current.rotation.z = t * 0.3

    // ── al cambiar de plano, lo de antes se va de a poco y lo nuevo aparece de a poco ──
    const fx = planeFx.current
    if (g.plane !== fx.prev) {
      fx.left = fx.prev
      fx.prev = g.plane
      fx.at = t
    }
    const since = t - fx.at

    // ── su estado oscuro: algo se mueve entre los árboles y termina dando vueltas en el círculo de hadas ──
    const dark = g.plane === 1
    // el círculo brota (hongos de a uno, alrededor) y se marchita al entrar en él
    const ringOpen = dark ? clamp01(since / 1.6) : 0
    const ringClose = !dark && fx.left === 1 ? 1 - clamp01(since / 0.7) : 0
    const ringK = dark ? ringOpen : ringClose
    wisp.current.visible = dark
    portal.current.visible = dark || ringClose > 0
    if (portal.current.visible) {
      portal.current.children.forEach((c, i) => {
        if (i === 0 || i > MUSHROOMS.length) return // (el resplandor y las lucecitas van aparte)
        const m = MUSHROOMS[i - 1]
        const grow = dark ? easeOutBack(clamp01(ringOpen * 1.6 - ((i - 1) / MUSHROOMS.length) * 0.6)) : ringClose
        c.scale.setScalar(Math.max(0.001, m.s * grow))
      })
    }
    // cuanto más cerca, más brilla y más se oye
    const near = dark ? 1 - THREE.MathUtils.smoothstep(Math.hypot(g.x - PORTAL.x, g.z - PORTAL.z), 1, 7) : 0
    setHum(dark ? 0.15 + 0.85 * near : 0)
    if (dark) {
      const u = ((t - g.planeAt) % 4.6) / 4.6
      let x: number
      let z: number
      let y: number
      if (u < 0.55) {
        // viaja entre los árboles, desde el altar
        const k = THREE.MathUtils.smoothstep(u / 0.55, 0, 1)
        x = WISP_FROM.x + (PORTAL.x - WISP_FROM.x) * k + Math.sin(u * Math.PI * 4) * 0.8 * (1 - k)
        z = WISP_FROM.z + (PORTAL.z - WISP_FROM.z) * k
        y = 0.9
      } else {
        // y gira dentro del círculo, bajando
        const k = (u - 0.55) / 0.45
        const a = k * Math.PI * 3
        x = PORTAL.x + Math.sin(a) * 0.55 * (1 - k * 0.5)
        z = PORTAL.z + Math.cos(a) * 0.55 * (1 - k * 0.5)
        y = 0.9 - 0.5 * k
      }
      wisp.current.position.set(x, heightAt(z) + y + Math.sin(t * 4) * 0.08, z)
      wispMat.opacity = Math.min(1, u * 6) * Math.min(1, (1 - u) * 5) * 0.95
      wisp.current.children.forEach((c, i) => {
        c.position.set(-Math.sin(u * Math.PI * 3 - i * 0.4) * 0.2 * i, -0.04 * i, 0.22 * i)
        c.scale.setScalar(0.5 - i * 0.12)
      })
      const glow = 0.35 + 0.65 * near
      CAP_MAT.color.setScalar(0.55 + 0.45 * glow).multiply(TMP_COLOR)
      ringGlow.opacity = (0.25 + 0.4 * near) * (0.85 + 0.15 * Math.sin(t * 2)) * ringK
      mistMat.opacity = (0.06 + 0.1 * near) * ringK
      motes.current.children.forEach((c, i) => {
        const sp = 0.25 + (i % 4) * 0.08
        const a = t * sp * (i % 2 ? 1 : -1) + i * 1.9
        const r = 0.2 + ((i * 0.37) % 0.6)
        const h = 0.1 + (((t * 0.15 + i * 0.13) % 1) * 1.1)
        c.position.set(Math.sin(a) * r, h, Math.cos(a) * r)
        c.scale.setScalar(0.07 + 0.05 * Math.sin(t * 3 + i))
      })
      moteMat.opacity = (0.5 + 0.5 * near) * ringK
    } else if (ringClose > 0) {
      ringGlow.opacity = 0.65 * ringClose
      mistMat.opacity = 0.16 * ringClose
      moteMat.opacity = ringClose
    }

    // el hierro de estrella va con ella hasta el herrero
    const c = carried.current
    c.visible = g.story === 'starIron' && !g.plane
    if (c.visible) {
      const side = 0.38
      TMP.set(g.x + Math.cos(g.yaw) * side, heightAt(g.z) + stoneLift(g.x, g.z) + 0.85 + Math.sin(t * 2.4) * 0.05 + g.jumpY, g.z - Math.sin(g.yaw) * side)
      c.position.lerp(TMP, 0.18)
      c.rotation.y = t * 1.4
    }
  })

  const rocks = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + 0.4
        const r = 0.95 + (i % 2) * 0.25
        return { x: MINERAL.x + Math.cos(a) * r, z: MINERAL.z + Math.sin(a) * r, s: 0.16 + (i % 3) * 0.07, rot: i * 1.7 }
      }),
    [],
  )

  return (
    <>
      {/* ── el altar: piedra ritual vieja con una runa que late encima ── */}
      <group position={[ALTAR.x, heightAt(ALTAR.z), ALTAR.z]} rotation-y={altarYaw}>
        <primitive object={altarModel} scale={ALTAR_SCALE} />
        <mesh ref={rune} material={RUNE_MAT} position={[0, ALTAR_TOP + 0.015, 0]} rotation-x={-Math.PI / 2}>
          <torusGeometry args={[0.18, 0.018, 6, 24]} />
        </mesh>
      </group>

      {/* ── el cráter del meteorito: aquí cayó (en el mundo de la luz, vacío) ── */}
      <mesh material={CRATER_MAT} position={[MINERAL.x, heightAt(MINERAL.z) + 0.03, MINERAL.z]} rotation-x={-Math.PI / 2} renderOrder={1}>
        <circleGeometry args={[1.25, 20]} />
      </mesh>
      {rocks.map((r, i) => (
        <mesh key={i} material={ROCK_MAT} position={[r.x, heightAt(r.z) + r.s * 0.4, r.z]} rotation={[r.rot, r.rot * 0.7, 0]} scale={r.s} castShadow>
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
      ))}

      {/* ── su estado oscuro ── */}
      <group ref={wisp} visible={false}>
        {[0, 1, 2].map((i) => (
          <sprite key={i} material={wispMat} />
        ))}
      </group>
      {/* el círculo de hadas: entrar en él lleva al vacío */}
      <group ref={portal} visible={false} position={[PORTAL.x, heightAt(PORTAL.z), PORTAL.z]} rotation-y={portalYaw}>
        <mesh material={ringGlow} position={[0, 0.03, 0]} rotation-x={-Math.PI / 2} renderOrder={2}>
          <planeGeometry args={[3.4, 3.4]} />
        </mesh>
        {MUSHROOMS.map((m, i) => (
          <group key={i} position={[Math.sin(m.a) * m.r, 0, Math.cos(m.a) * m.r]} scale={m.s} rotation-y={m.a}>
            <mesh material={STEM_MAT} position={[0, 0.045, 0]}>
              <cylinderGeometry args={[0.018, 0.025, 0.09, 6]} />
            </mesh>
            <mesh material={CAP_MAT} position={[0, 0.09, 0]}>
              <sphereGeometry args={[0.055, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
          </group>
        ))}
        <group ref={motes}>
          {Array.from({ length: MOTES }, (_, i) => (
            <sprite key={i} material={moteMat} />
          ))}
        </group>
        <sprite material={mistMat} position={[0, 0.6, 0]} scale={[2.6, 1.6, 1]} />
      </group>

      {/* el hierro de estrella, con ella (en el mundo de la luz) */}
      <group ref={carried} visible={false}>
        <mesh material={IRON_MAT}>
          <octahedronGeometry args={[0.09, 0]} />
        </mesh>
        <sprite material={ironGlow} scale={0.45} />
      </group>
    </>
  )
}

useGLTF.preload(ALTAR_URL)
