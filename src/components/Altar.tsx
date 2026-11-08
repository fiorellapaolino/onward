import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clamp01, heightAt, pathAt, stoneLift } from '../game/config'
import { game } from '../game/state'
import { ALTAR, MINERAL, PORTAL, STONES, STONE_R, stoneFallTime, VOID_FAR, VOID_HALF, VOID_NEAR, WISP_FROM, stoneAppearAt } from '../game/altar'
import { useGlowTexture } from './TheLight'
import { voidUniforms } from './instancing'

/*
 * El altar junto a los árboles, el cráter del meteorito, y lo que solo ve su yo oscuro:
 *   plane 1: algo que se mueve entre los árboles y el portal al que lleva.
 *   plane 2: el vacío, las piedras flotantes y el hierro de estrella.
 * El plano negativo es el mismo mundo de noche (filtro sobre la imagen, ver styles.css): el vacío es negro
 * y lo sobrenatural (las piedras, el hierro) brilla con luz propia.
 */
const STONE_MAT = new THREE.MeshStandardMaterial({ color: '#77706a', roughness: 0.95, flatShading: true })
const RUNE_MAT = new THREE.MeshBasicMaterial({ color: '#9fd8ff', toneMapped: false, transparent: true })
const CRATER_MAT = new THREE.MeshBasicMaterial({ color: '#0b0908', transparent: true, opacity: 0.55, depthWrite: false })
const ROCK_MAT = new THREE.MeshStandardMaterial({ color: '#3a3532', roughness: 1, flatShading: true })
const VOID_MAT = new THREE.MeshBasicMaterial({ color: '#000000', fog: false })
const FLOAT_MAT = new THREE.MeshBasicMaterial({ color: '#dfe9ff', toneMapped: false, fog: false })
const FLOAT_EDGE = new THREE.MeshBasicMaterial({ color: '#6f7fa8', fog: false })
const IRON_NEG = new THREE.MeshBasicMaterial({ color: '#c8f4ff', toneMapped: false, fog: false })
const IRON_MAT = new THREE.MeshStandardMaterial({ color: '#cfefff', emissive: '#8fd8ff', emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.5 })
const TMP = new THREE.Vector3()

export function Altar() {
  const glowTex = useGlowTexture()
  const rune = useRef<THREE.Mesh>(null!)
  const wisp = useRef<THREE.Group>(null!)
  const portal = useRef<THREE.Group>(null!)
  const neg = useRef<THREE.Group>(null!)
  const stones = useRef<THREE.Group>(null!)
  const mineral = useRef<THREE.Group>(null!)
  const carried = useRef<THREE.Group>(null!)
  const wispMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#e6f4ff', transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), [glowTex])
  const portalGlow = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#cfe9ff', transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), [glowTex])
  const ironGlowNeg = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#8fe3ff', transparent: true, opacity: 0.9, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending }), [glowTex])
  const ironGlow = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#9fdcff', transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), [glowTex])

  // el vacío: un rectángulo a lo ancho del sendero
  const voidGeo = useMemo(() => {
    const mid = (VOID_NEAR + VOID_FAR) / 2
    const g = new THREE.PlaneGeometry(VOID_HALF * 2, VOID_NEAR - VOID_FAR)
    g.rotateX(-Math.PI / 2)
    g.translate(pathAt(mid, TMP).x, Math.max(heightAt(VOID_NEAR), heightAt(VOID_FAR)) + 0.02, mid)
    return g
  }, [])
  useMemo(() => {
    const mid = (VOID_NEAR + VOID_FAR) / 2
    voidUniforms.uVoid.value.set(VOID_NEAR, VOID_FAR, pathAt(mid, TMP).x, VOID_HALF)
    voidUniforms.uVoidTop.value = Math.max(heightAt(VOID_NEAR), heightAt(VOID_FAR)) + 0.6
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

    // ── su estado oscuro: algo se mueve entre los árboles, del altar hacia el portal ──
    const dark = g.plane === 1
    wisp.current.visible = dark
    portal.current.visible = dark
    if (dark) {
      const u = ((t - g.planeAt) % 3.4) / 3.4
      const k = THREE.MathUtils.smoothstep(u, 0, 1)
      const x = WISP_FROM.x + (PORTAL.x - WISP_FROM.x) * k + Math.sin(u * Math.PI * 3) * 0.9
      const z = WISP_FROM.z + (PORTAL.z - WISP_FROM.z) * k
      wisp.current.position.set(x, heightAt(z) + 0.9 + Math.sin(t * 4) * 0.12, z)
      wispMat.opacity = Math.sin(u * Math.PI) * 0.95
      wisp.current.children.forEach((c, i) => {
        c.position.set(-Math.sin(u * Math.PI * 3 - i * 0.4) * 0.25 * i, -0.05 * i, 0.3 * i)
        c.scale.setScalar(0.5 - i * 0.12)
      })
      portal.current.rotation.z = t * 0.5
      portalGlow.opacity = 0.45 + 0.2 * Math.sin(t * 3)
    }

    // ── el plano negativo: el vacío, las piedras y el hierro ──
    const negative = g.plane === 2
    neg.current.visible = negative
    voidUniforms.uVoidOn.value = negative ? 1 : 0
    if (negative) {
      STONES.forEach((st, i) => {
        const s = stones.current.children[i]
        const rise = clamp01((t - stoneAppearAt(i)) / 0.4)
        const left = stoneFallTime(i) - t // (segundos hasta que cae)
        const shake = left > 0 && left < 0.6 ? (1 - left / 0.6) * 0.06 * Math.sin(t * 60) : 0
        const drop = left <= 0 ? left ** 2 * 9 : 0
        s.visible = rise > 0 && drop < 8
        s.position.set(st.x + shake, heightAt(st.z) + 0.04 - (1 - THREE.MathUtils.smoothstep(rise, 0, 1)) * 1.6 - drop, st.z)
        s.rotation.y = i * 1.3
      })
      const got = g.ironAt >= 0 ? clamp01((t - g.ironAt) / 0.8) : 0
      mineral.current.visible = got < 1
      mineral.current.position.set(MINERAL.x, heightAt(MINERAL.z) + 0.55 + Math.sin(t * 1.8) * 0.06 + got * 0.6, MINERAL.z)
      mineral.current.rotation.y = t * 0.8
      mineral.current.scale.setScalar(1 - got)
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
      {/* ── el altar: piedra vieja con una runa que late ── */}
      <group position={[ALTAR.x, heightAt(ALTAR.z), ALTAR.z]}>
        <mesh material={STONE_MAT} position={[0, 0.35, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.36, 0.48, 0.7, 7]} />
        </mesh>
        <mesh material={STONE_MAT} position={[0, 0.76, 0]} castShadow>
          <boxGeometry args={[0.95, 0.12, 0.62]} />
        </mesh>
        <mesh ref={rune} material={RUNE_MAT} position={[0, 0.83, 0]} rotation-x={-Math.PI / 2}>
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
      <group ref={portal} visible={false} position={[PORTAL.x, heightAt(PORTAL.z) + 1.0, PORTAL.z]} rotation-y={portalYaw}>
        <mesh>
          <torusGeometry args={[0.85, 0.05, 8, 40]} />
          <meshBasicMaterial color="#e8f6ff" toneMapped={false} />
        </mesh>
        <sprite material={portalGlow} scale={2.2} />
      </group>

      {/* ── el plano negativo ── */}
      <group ref={neg} visible={false}>
        <mesh geometry={voidGeo} material={VOID_MAT} renderOrder={1} />
        <group ref={stones}>
          {STONES.map((_, i) => (
            <group key={i}>
              {/* una roca flotante: la cara de arriba plana para pararse, y la punta hacia abajo */}
              <mesh material={FLOAT_MAT} position={[0, -0.08, 0]}>
                <cylinderGeometry args={[STONE_R, STONE_R * 0.85, 0.16, 8]} />
              </mesh>
              <mesh material={FLOAT_EDGE} position={[0, -0.5, 0]} rotation-x={Math.PI}>
                <coneGeometry args={[STONE_R * 0.85, 0.7, 8]} />
              </mesh>
            </group>
          ))}
        </group>
        <group ref={mineral}>
          <mesh material={IRON_NEG}>
            <octahedronGeometry args={[0.22, 0]} />
          </mesh>
          <sprite material={ironGlowNeg} scale={1.1} />
        </group>
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
