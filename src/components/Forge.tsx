import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clamp01, heightAt, stoneLift } from '../game/config'
import { game } from '../game/state'
import { BELLOWS, COOL_STONE, FIRE_MOUTH, FORGE, FORGE_R, FORGE_SHADOW } from '../game/village'
import { useShadowTexture } from './SombraProto'
import { useGlowTexture } from './TheLight'

/*
 * La herrería: el horno con su fuego (más vivo cuanto más se aviva), el yunque con la barra al rojo
 * (la sostiene el herrero) y el fuelle (una piedra delante para pararse y apretar E).
 * Los puntos donde golpear brillan sobre el suelo, de a uno.
 */
const STONE = new THREE.MeshStandardMaterial({ color: '#6d6458', roughness: 0.95, flatShading: true })
const IRON = new THREE.MeshStandardMaterial({ color: '#2b2c30', roughness: 0.55, metalness: 0.6 })
const WOOD = new THREE.MeshStandardMaterial({ color: '#5b3d24', roughness: 0.9 })
const KEY_TMP = new THREE.Vector3()
const FORGE_BEAT = 0.75 // (igual que en GameLoop)
const FORGE_STRIKES = 5
const KEY_GOLD = new THREE.Color('#e0b25a')
const KEY_RED = new THREE.Color('#ff4a12')
const SHADOW_GEO = (() => {
  const g = new THREE.PlaneGeometry(1, 1)
  g.translate(0, 0.5, 0)
  g.rotateX(-Math.PI / 2) // tumbada: de los pies hacia -Z
  return g
})()
const LEATHER = new THREE.MeshStandardMaterial({ color: '#3e2a1c', roughness: 0.8 })

export function Forge() {
  const glowTex = useGlowTexture()
  const fireLight = useRef<THREE.PointLight>(null!)
  const mouth = useRef<THREE.MeshBasicMaterial>(null!)
  const glow = useRef<THREE.Sprite>(null!)
  const bar = useRef<THREE.Group>(null!)
  const barMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3330', roughness: 0.6, metalness: 0.4, emissive: '#ff6a1a', emissiveIntensity: 0 }), [])
  const plateMat = useMemo(() => [0].map(() => new THREE.MeshStandardMaterial({ color: '#8f8b84', roughness: 0.9, flatShading: true, emissive: '#ffb45e', emissiveIntensity: 0 })), [])
  const hammer = useRef<THREE.Group>(null!)
  const glowMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#ff9a3c', transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), [glowTex])
  const spark = useRef<THREE.Sprite>(null!)
  const key = useRef<THREE.Group>(null!)
  const keyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e0b25a', roughness: 0.35, metalness: 0.8, emissive: '#ffb347', emissiveIntensity: 0.6 }), [])
  const keyGlowMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#ffd08a', transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), [glowTex])
  const shadowTex = useShadowTexture()
  const shadowMesh = useRef<THREE.Mesh>(null!)
  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#03040a', alphaMap: shadowTex, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 }), [shadowTex])
  const steam = useRef<THREE.Group>(null!)
  const steamMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#e8eef2', transparent: true, opacity: 0, depthWrite: false }), [glowTex])
  const sparkMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#ffd28a', transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), [glowTex])

  useFrame(() => {
    const g = game
    const t = g.time
    const heat = g.forgeHeat
    const flicker = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3)
    // cada vez que aviva el fuelle, una llamarada: la boca del horno se enciende y el brillo crece
    const puff = Math.max(0, 1 - (t - g.forgePumpAt) / 0.6)
    fireLight.current.intensity = (1.5 + heat * 9 + puff * 8) * flicker
    mouth.current.color.setHSL(0.06 + heat * 0.05 + puff * 0.03, 1, Math.min(0.9, 0.25 + heat * 0.4 + puff * 0.3))
    glow.current.scale.setScalar((0.9 + heat * 1.6 + puff * 1.4) * flicker)
    glowMat.opacity = Math.min(1, 0.35 + heat * 0.55 + puff * 0.4)

    // el hierro al rojo en el yunque: se dobla un poco con cada martillazo, hasta ser la llave
    const onAnvil = g.story === 'forgeBend' || g.story === 'forging'
    bar.current.visible = onAnvil
    barMat.emissiveIntensity = onAnvil ? 2.2 + 0.3 * Math.sin(t * 4) : 0
    const bend = g.forgeHits / FORGE_STRIKES
    bar.current.children.forEach((seg, i) => (seg.rotation.y = (i - 1) * 0.45 * bend))
    bar.current.scale.setScalar(1 - 0.35 * bend)

    // el martillo del herrero: sube y baja sobre el hierro (un golpe cada FORGE_BEAT)
    const forging = g.story === 'forging'
    hammer.current.visible = false // (el martillo ahora lo lleva el herrero en la mano: ver Villager)
    if (forging) {
      const k = g.time - g.forgingAt - 0.55
      const u = k < 0 ? 0 : (k % FORGE_BEAT) / FORGE_BEAT // 0 = recién golpeó … 1 = va a golpear
      const lift = k < 0 ? clamp01((k + 0.55) / 0.55) : u < 0.7 ? Math.sin((u / 0.7) * Math.PI * 0.5) : 1 - (u - 0.7) / 0.3
      hammer.current.rotation.x = 0.55 - 1.6 * lift // (0.55: la cabeza cae justo sobre el hierro)
    }

    // la piedra del fuelle brilla suave cuando es útil; más cuando ella la pisa
    const atBellows = Math.hypot(g.x - BELLOWS.x, g.z - BELLOWS.z) < FORGE_R
    plateMat[0].emissiveIntensity = g.story === 'forgeFire' ? 0.15 + 0.1 * Math.sin(t * 2) + (atBellows ? 0.35 : 0) : 0

    // su sombra en el suelo: la luz del horno la proyecta hacia adelante (solo cerca del fuego)
    {
      const ux = g.x - FIRE_MOUTH.x
      const uz = g.z - FIRE_MOUTH.z
      const d = Math.hypot(ux, uz)
      const near = 1 - THREE.MathUtils.smoothstep(d, 3.2, 5.5)
      const strength = near * Math.min(1, 0.7 + heat * 0.5) * (1 - clamp01(g.jumpY * 2))
      shadowMat.opacity = d > 0.3 ? strength * (g.story === 'keyHot' ? 0.92 : 0.7) : 0
      shadowMesh.current.visible = shadowMat.opacity > 0.01
      if (shadowMesh.current.visible) {
        shadowMesh.current.position.set(g.x, heightAt(g.z) + stoneLift(g.x, g.z) + 0.045, g.z)
        shadowMesh.current.rotation.y = Math.atan2(-ux, -uz)
        shadowMesh.current.scale.set(FORGE_SHADOW.half * 2.4, 1, FORGE_SHADOW.len)
      }
    }

    // la llave: al rojo sobre la piedra al terminar de forjarla; se enfría bajo su sombra; después va con ella hasta el portal
    const k0 = key.current
    const cool = g.story === 'keyHot' ? g.keyCool : 1
    keyMat.color.copy(KEY_RED).lerp(KEY_GOLD, cool)
    keyMat.emissive.copy(KEY_RED).lerp(KEY_GOLD, cool)
    if (g.story === 'keyHot' || g.story === 'forgeDone' || g.story === 'keyReady') {
      k0.visible = true
      // tendida sobre la piedra; cuando ya está fría flota un poco, para que se vea que se puede tomar
      const lift = g.story === 'keyReady' ? 0.25 + Math.sin(t * 2) * 0.03 : 0.07
      k0.position.set(COOL_STONE.x, heightAt(COOL_STONE.z) + lift, COOL_STONE.z)
      if (g.story === 'keyReady') k0.rotation.set(0, t * 1.2, 0)
      else k0.rotation.set(-Math.PI / 2, 0, FORGE.rot)
    } else if (g.story === 'key') {
      k0.visible = true
      // flota a su lado, a la altura del pecho, y la sigue con un poco de retraso
      const side = 0.38
      const want = KEY_TMP.set(g.x + Math.cos(g.yaw) * side, heightAt(g.z) + stoneLift(g.x, g.z) + 0.85 + Math.sin(t * 2.4) * 0.05 + g.jumpY, g.z - Math.sin(g.yaw) * side)
      k0.position.lerp(want, 0.18)
      k0.rotation.set(0.2, t * 1.6, 0)
    } else k0.visible = false
    keyMat.emissiveIntensity = (0.6 + 0.3 * Math.sin(t * 3)) * (1 + 2.5 * (1 - cool))
    keyGlowMat.opacity = k0.visible ? 0.45 + 0.15 * Math.sin(t * 3) : 0
    keyGlowMat.color.set(cool < 1 ? '#ff7a3a' : '#ffd08a')

    // vapor: mientras su sombra la cubre, sube de la llave
    const steaming = g.story === 'keyHot' && t - g.keyShadeAt < 0.25
    steamMat.opacity += ((steaming ? 0.35 * (1 - g.keyCool * 0.5) : 0) - steamMat.opacity) * 0.15
    steam.current.position.set(COOL_STONE.x, heightAt(COOL_STONE.z) + 0.15, COOL_STONE.z)
    steam.current.children.forEach((c, i) => {
      const u = (t * 0.7 + i / 3) % 1
      c.position.set(Math.sin(t * 1.3 + i * 2) * 0.08, u * 0.7, Math.cos(t + i) * 0.06)
      c.scale.setScalar(0.15 + u * 0.35)
    })

    // chispazo en cada golpe
    const k = clamp01((t - g.forgeHitAt) / 0.5)
    sparkMat.opacity = g.forgeHitAt > 0 ? (1 - k) * 0.95 : 0
    spark.current.scale.setScalar(0.4 + k * 1.4)
  })

  const bel = useMemo(() => {
    const c = Math.cos(-FORGE.rot)
    const s = Math.sin(-FORGE.rot)
    const dx = BELLOWS.x - FORGE.x
    const dz = BELLOWS.z - FORGE.z
    return { lx: dx * c + dz * s, lz: -dx * s + dz * c }
  }, [])

  return (
    <>
    {/* su sombra, proyectada por el fuego del horno */}
    <mesh ref={shadowMesh} geometry={SHADOW_GEO} material={shadowMat} visible={false} renderOrder={1} />
    {/* la piedra baja donde se enfría la llave */}
    <mesh material={STONE} position={[COOL_STONE.x, heightAt(COOL_STONE.z) + 0.005, COOL_STONE.z]} rotation-y={FORGE.rot} receiveShadow>
      <cylinderGeometry args={[0.42, 0.48, 0.06, 9]} />
    </mesh>
    <group ref={steam}>
      {[0, 1, 2].map((i) => (
        <sprite key={i} material={steamMat} />
      ))}
    </group>
    {/* la llave forjada (en el mundo: va de la piedra a la mano de la elfa) */}
    <group ref={key} visible={false} scale={1.3}>
      <mesh material={keyMat} position={[0, 0.1, 0]}>
        <torusGeometry args={[0.065, 0.018, 8, 18]} />
      </mesh>
      <mesh material={keyMat} position={[0, -0.06, 0]}>
        <boxGeometry args={[0.024, 0.2, 0.024]} />
      </mesh>
      <mesh material={keyMat} position={[0.03, -0.13, 0]}>
        <boxGeometry args={[0.045, 0.022, 0.022]} />
      </mesh>
      <mesh material={keyMat} position={[0.025, -0.09, 0]}>
        <boxGeometry args={[0.032, 0.02, 0.022]} />
      </mesh>
      <sprite material={keyGlowMat} scale={0.45} />
    </group>
    <group position={[FORGE.x, 0, FORGE.z]} rotation-y={FORGE.rot}>
      {/* ── el horno: base de piedra, boca encendida y chimenea ── */}
      <mesh material={STONE} position={[0, 0.55, -2]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 1.1, 1.3]} />
      </mesh>
      <mesh material={STONE} position={[0, 1.6, -2.15]} castShadow>
        <boxGeometry args={[1.1, 1.0, 0.9]} />
      </mesh>
      <mesh material={STONE} position={[0, 2.9, -2.25]} castShadow>
        <boxGeometry args={[0.55, 1.8, 0.55]} />
      </mesh>
      <mesh position={[0, 0.7, -1.34]}>
        <planeGeometry args={[0.75, 0.42]} />
        <meshBasicMaterial ref={mouth} color="#ff7a1a" toneMapped={false} />
      </mesh>
      <sprite ref={glow} position={[0, 0.75, -1.25]} material={glowMat} />
      <pointLight ref={fireLight} position={[0, 1.0, -1.0]} color="#ff9a4a" distance={7} decay={1.6} />

      {/* ── el yunque: tronco y bloque de hierro con su cuerno ── */}
      <mesh material={WOOD} position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.6, 10]} />
      </mesh>
      <mesh material={IRON} position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[0.7, 0.22, 0.32]} />
      </mesh>
      <mesh material={IRON} position={[0.45, 0.72, 0]} rotation-z={-Math.PI / 2} castShadow>
        <coneGeometry args={[0.1, 0.32, 8]} />
      </mesh>
      {/* la barra al rojo, en tres tramos (se dobla con cada golpe) */}
      <group ref={bar} position={[0, 0.85, 0]}>
        {[-1, 0, 1].map((i) => (
          <mesh key={i} material={barMat} position={[i * 0.32, 0, 0]}>
            <boxGeometry args={[0.34, 0.06, 0.06]} />
          </mesh>
        ))}
      </group>
      <sprite ref={spark} position={[0, 0.95, 0]} material={sparkMat} />

      {/* ── el fuelle, junto al horno, y su piedra para pararse ── */}
      <mesh material={LEATHER} position={[bel.lx * 0.55, 0.45, bel.lz - 0.6]} castShadow>
        <boxGeometry args={[0.55, 0.32, 0.8]} />
      </mesh>
      <mesh material={WOOD} position={[bel.lx * 0.55, 0.65, bel.lz - 0.6]}>
        <boxGeometry args={[0.6, 0.05, 0.85]} />
      </mesh>
      <mesh material={plateMat[0]} position={[bel.lx, 0.07, bel.lz]} receiveShadow>
        <cylinderGeometry args={[FORGE_R, FORGE_R + 0.08, 0.14, 12]} />
      </mesh>

      {/* ── el martillo del herrero (gira desde su mano, sobre el yunque) ── */}
      <group ref={hammer} position={[0.15, 1.15, -0.55]} visible={false}>
        <mesh material={WOOD} position={[0, 0, 0.32]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.022, 0.022, 0.55, 6]} />
        </mesh>
        <mesh material={IRON} position={[0, -0.02, 0.6]}>
          <boxGeometry args={[0.1, 0.1, 0.18]} />
        </mesh>
      </group>
    </group>
    </>
  )
}
