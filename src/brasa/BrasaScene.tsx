import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clamp01, damp, natureUrl, rng, smoothstep } from '../game/config'
import { game } from '../game/state'
import { DynamicModel, InstancedModel, placeMatrix, type SetInstance } from '../components/instancing'
import { useGlowTexture } from '../components/TheLight'
import { LIFE, getLifeTexture } from '../simbolos/blooms'
import { Bonfire } from '../simbolos/Scene'
import { Ribbon } from '../simbolos/Ribbon'
import { pointAlong } from '../simbolos/proto'
import { BRIDGE, BRIDGE_HALF, CRACK_Z0, CRACK_Z1, FLOWERS, GROTTO_Z, HEARTH, HIDEOUT, MEMORY_FLIGHT, PATH_LIGHTS, PREV_PATH, RETURN_TIME, RING_R, RINGS, ROOTS_Z, b, emberLevel } from './brasaProto'

/*
 * Lo que se ve en la parte 1 (todo provisional: se reemplaza por modelos de artistas).
 * Noche sobre lava vieja con líquenes, el volcán dormido a lo lejos, estrellas,
 * la hoguera con la brasa, los círculos de hongos, las flores dormidas y los recuerdos.
 */

// ── Noche: cielo, niebla, luna ──
const SKY_NIGHT = new THREE.Color('#0b1022')
const SKY_WARM = new THREE.Color('#1a1830') // un poco más cálido a medida que despierta el bosque
const SKY_MIRROR = new THREE.Color('#231238') // visto a través de la obsidiana
const tmpC = new THREE.Color()

export function Night() {
  const { scene } = useThree()
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const life = useRef(0)
  useMemo(() => {
    scene.background = SKY_NIGHT.clone()
    scene.fog = new THREE.Fog(SKY_NIGHT.clone(), 10, 48)
  }, [scene])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const lit = RINGS.filter((r) => r.litAt >= 0).length / RINGS.length
    const target = (b.hasEmber ? 0.3 : 0) + lit * 0.4 + Math.min(1, b.memories / FLOWERS.length) * 0.3
    life.current += (target - life.current) * damp(0.6, dt)
    tmpC.copy(SKY_NIGHT).lerp(SKY_WARM, life.current).lerp(SKY_MIRROR, b.look * 0.8)
    ;(scene.background as THREE.Color).copy(tmpC)
    const fog = scene.fog as THREE.Fog
    fog.color.copy(tmpC)
    fog.far = 42 + life.current * 18
    hemi.current.intensity = 0.35 + life.current * 0.25
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#3a4a78', '#0c0b10', 0.35]} />
      {/* la luna */}
      <directionalLight position={[-14, 22, 30]} color="#9fb2e0" intensity={0.35} />
    </>
  )
}

/** Estrellas: puntos lejanos que no se ven afectados por la niebla. */
export function Stars() {
  const geo = useMemo(() => {
    const r = rng(101)
    const pos: number[] = []
    for (let i = 0; i < 700; i++) {
      const a = r() * Math.PI * 2
      const h = 0.08 + r() * 0.9 // solo por encima del horizonte
      const R = 300
      pos.push(Math.cos(a) * Math.cos(h) * R, Math.sin(h) * R, Math.sin(a) * Math.cos(h) * R + 30)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return g
  }, [])
  return (
    <points geometry={geo}>
      <pointsMaterial color="#dfe6ff" size={1.6} sizeAttenuation={false} fog={false} transparent opacity={0.85} />
    </points>
  )
}

/** El volcán dormido, siempre visible a lo lejos, con un brillo tenue en la cima. */
export function Volcano() {
  const tex = useGlowTexture()
  const glow = useRef<THREE.Sprite>(null!)
  useFrame(() => {
    glow.current.material.opacity = 0.35 + Math.sin(game.time * 0.4) * 0.08
  })
  return (
    <group position={[40, 0, 260]}>
      <mesh position={[0, 38, 0]}>
        <cylinderGeometry args={[16, 120, 76, 9, 1, true]} />
        <meshBasicMaterial color="#161a2b" fog={false} side={THREE.DoubleSide} />
      </mesh>
      <sprite ref={glow} position={[0, 78, 0]} scale={[70, 30, 1]}>
        <spriteMaterial map={tex} color="#ff6a2a" transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} toneMapped={false} />
      </sprite>
    </group>
  )
}

// ── El suelo: lava vieja, negra y agrietada, con manchas de líquenes ──
function makeLavaTexture() {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#1f1e24'
  ctx.fillRect(0, 0, S, S)
  const r = rng(8)
  for (let i = 0; i < 5000; i++) {
    const v = 26 + Math.floor(r() * 22)
    ctx.fillStyle = `rgba(${v},${v - 2},${v + 4},0.5)`
    ctx.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3)
  }
  // grietas
  ctx.strokeStyle = 'rgba(10,9,12,0.9)'
  ctx.lineWidth = 2
  for (let i = 0; i < 40; i++) {
    let x = r() * S
    let y = r() * S
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 60
      y += (r() - 0.5) * 60
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  // líquenes: la primera vida que volvió después del fuego
  for (let i = 0; i < 160; i++) {
    const x = r() * S
    const y = r() * S
    const rad = 3 + r() * 10
    ctx.fillStyle = r() < 0.5 ? 'rgba(110,128,92,0.55)' : 'rgba(150,160,120,0.45)'
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(18, 18)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function LavaGround() {
  const lava = useMemo(makeLavaTexture, [])
  const life = useMemo(getLifeTexture, [])
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 25]}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial map={lava} roughness={0.95} />
      </mesh>
      {/* donde pisó con luz, pasto */}
      <mesh rotation-x={-Math.PI / 2} position={[LIFE.cx, 0.012, LIFE.cz]} renderOrder={1}>
        <planeGeometry args={[LIFE.size, LIFE.size]} />
        <meshStandardMaterial map={life} transparent depthWrite={false} roughness={1} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </>
  )
}

// ── El bosque quemado alrededor: árboles secos, rocas y helechos ──
const TREES = ['DeadTree_1', 'DeadTree_2', 'DeadTree_3']
const ROCKS = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3']
const FERNS = ['Fern_1', 'Plant_7']

function scatterLayout() {
  const r = rng(52)
  const by = new Map<string, THREE.Matrix4[]>()
  const add = (m: string, mx: THREE.Matrix4) => {
    if (!by.has(m)) by.set(m, [])
    by.get(m)!.push(mx)
  }
  const clear = (x: number, z: number, pad: number) =>
    Math.abs(x - pathX(z)) < 6 + pad ||
    Math.hypot(x - HEARTH.x, z - HEARTH.z) < 5 ||
    RINGS.some((g) => Math.hypot(x - g.x, z - g.z) < 4.5) ||
    FLOWERS.some((f) => Math.hypot(x - f.x, z - f.z) < 2.5)
  for (let i = 0; i < 520; i++) {
    const x = (r() - 0.5) * 110
    const z = -30 + r() * 100
    if (clear(x, z, 3) || z > ROOTS_Z - 2) continue
    add(TREES[Math.floor(r() * 3)], placeMatrix(x, 0, z, r() * Math.PI * 2, 0.8 + r() * 0.8))
  }
  for (let i = 0; i < 160; i++) {
    const x = (r() - 0.5) * 60
    const z = -10 + r() * 72
    if (clear(x, z, 0)) continue
    add(ROCKS[Math.floor(r() * 3)], placeMatrix(x, -0.1, z, r() * Math.PI * 2, 0.4 + r() * 0.9))
  }
  for (let i = 0; i < 140; i++) {
    const x = (r() - 0.5) * 50
    const z = -6 + r() * 66
    if (clear(x, z, -2)) continue
    add(FERNS[Math.floor(r() * 2)], placeMatrix(x, 0, z, r() * Math.PI * 2, 0.5 + r() * 0.5))
  }
  return [...by.entries()]
}
/** El centro del claro a lo largo del recorrido (el camino serpentea entre los refugios). */
function pathX(z: number) {
  return Math.sin(z * 0.09) * 2.5
}

export function BurntForest() {
  const groups = useMemo(scatterLayout, [])
  return (
    <>
      {groups.map(([model, mats]) => (
        <InstancedModel key={model} url={natureUrl(model)} matrices={mats} />
      ))}
    </>
  )
}

/**
 * Las raíces: se cierran más si ella se acerca al escondite del miedo;
 * cuando el miedo se calma, las del centro se hunden en la tierra y abren el paso. Provisional: arcos oscuros.
 */
export function RootWall() {
  const roots = useMemo(() => {
    const r = rng(77)
    return Array.from({ length: 30 }, (_, i) => {
      const x = i < 6 ? (i - 2.5) * 1.1 : (r() - 0.5) * 34 // las primeras 6 tapan el paso del centro
      return { x, z: ROOTS_Z + r() * 2.5, rad: 1.2 + r() * 2.2, tube: 0.12 + r() * 0.16, rot: r() * Math.PI, tilt: (r() - 0.5) * 0.6, center: Math.abs(x) < 3.6 }
    })
  }, [])
  const refs = useRef<(THREE.Mesh | null)[]>([])
  useFrame(() => {
    const F = b.fear
    const t = game.time
    const open = F.openAt >= 0 ? smoothstep(F.openAt, F.openAt + 2.5, t) : 0
    roots.forEach((rt, i) => {
      const m = refs.current[i]
      if (!m) return
      // se cierran: se juntan y se aprietan, con un temblor
      const shake = F.tight > 0.05 ? Math.sin(t * 23 + i) * 0.03 * F.tight : 0
      const squeeze = rt.center ? F.tight * 0.35 : F.tight * 0.12
      m.position.set(rt.x * (1 - squeeze * 0.5) + shake, rt.center ? -open * (rt.rad + 0.6) : 0, rt.z)
      m.scale.set(1 + squeeze, 1 + squeeze * 0.6, 1 + squeeze)
    })
  })
  return (
    <group>
      {roots.map((t, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          position={[t.x, 0, t.z]}
          rotation={[t.tilt, t.rot, 0]}
        >
          <torusGeometry args={[t.rad, t.tube, 6, 14, Math.PI]} />
          <meshStandardMaterial color="#2a2018" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// ── Las luces del camino: hongos pequeños que se encienden para que el miedo se anime a salir ──
const pathM = new THREE.Matrix4()
export function PathLights() {
  const tex = useGlowTexture()
  const glows = useRef<(THREE.Sprite | null)[]>([])
  const spots = useMemo(
    () =>
      PATH_LIGHTS.flatMap((p, pi) =>
        Array.from({ length: 4 }, (_, k) => {
          const a = (k / 4) * Math.PI * 2 + pi
          return { pi, x: p.x + Math.cos(a) * 0.55, z: p.z + Math.sin(a) * 0.55, rot: k * 1.3 + pi, s: 0.45 + (k % 2) * 0.15 }
        }),
      ),
    [],
  )
  const update = (set: SetInstance) => {
    const t = game.time
    spots.forEach((sp, i) => {
      const at = PATH_LIGHTS[sp.pi].litAt
      const on = at >= 0 ? clamp01((t - at) / 0.6) : 0
      set(i, placeMatrix(sp.x, 0, sp.z, sp.rot, sp.s, pathM), 0.4 + on * 2.2)
    })
  }
  useFrame(() => {
    const t = game.time
    PATH_LIGHTS.forEach((p, i) => {
      const s = glows.current[i]
      if (!s) return
      const on = p.litAt >= 0 ? clamp01((t - p.litAt) / 0.6) : 0
      s.material.opacity = 0.05 + on * 0.5
      s.scale.setScalar(1.6 + on * 1.4 + Math.sin(t * 2 + i) * 0.1 * on)
    })
  })
  return (
    <>
      <DynamicModel url={natureUrl('Mushroom_Common')} count={spots.length} onFrame={update} />
      {PATH_LIGHTS.map((p, i) => (
        <sprite
          key={i}
          ref={(el) => {
            glows.current[i] = el
          }}
          position={[p.x, 0.25, p.z]}
        >
          <spriteMaterial map={tex} color="#ffd8a0" transparent opacity={0.05} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      ))}
    </>
  )
}

/**
 * El ser del miedo (tierra). Provisional: una piedra redonda y oscura con ojos de luz.
 * Escondido, solo se le ven los ojos entre las raíces (y se esconden si ella se acerca).
 * Al calmarse, se enciende por dentro con luz ámbar y le giran piedritas alrededor.
 */
const PEBBLES = 5
export function FearBeing() {
  const tex = useGlowTexture()
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Mesh>(null!)
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3b342c', roughness: 1, flatShading: true, emissive: '#ff9a3c', emissiveIntensity: 0 }), [])
  const eyes = useRef<THREE.Group>(null!)
  const eyeMat = useMemo(() => new THREE.SpriteMaterial({ map: tex, color: '#ffe2a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [tex])
  const orbit = useRef<THREE.Group>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const lastX = useRef(HIDEOUT.x)
  const lastZ = useRef(HIDEOUT.z)
  const heading = useRef(Math.PI)
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const F = b.fear
    const t = game.time
    const calm = F.calmAt >= 0 ? clamp01((t - F.calmAt) / 1.5) : 0
    const out = F.progress > 0.05 || F.calmAt >= 0
    group.current.position.set(F.pos.x, 0, F.pos.z)
    // mira hacia donde va (o hacia ella, si está quieto)
    const dx = F.pos.x - lastX.current
    const dz = F.pos.z - lastZ.current
    const want = Math.hypot(dx, dz) > 0.002 ? Math.atan2(dx, dz) : Math.atan2(game.x - F.pos.x, game.z - F.pos.z)
    heading.current += Math.atan2(Math.sin(want - heading.current), Math.cos(want - heading.current)) * damp(5, dt)
    group.current.rotation.y = heading.current
    lastX.current = F.pos.x
    lastZ.current = F.pos.z
    // escondido: el cuerpo no se ve (está entre las raíces); asomándose: aparece, encogido
    body.current.visible = out
    const shrink = 1 - F.tight * 0.35
    const hop = out && calm < 1 && Math.hypot(dx, dz) > 0.002 ? Math.abs(Math.sin(t * 9)) * 0.08 : 0
    body.current.position.y = 0.32 * shrink + hop + calm * Math.sin(t * 2) * 0.05
    body.current.scale.set(0.42 * shrink, 0.36 * shrink, 0.42 * shrink)
    bodyMat.emissiveIntensity = calm * 0.22
    // los ojos: parpadean; se apagan si se asusta
    const blink = Math.sin(t * 0.9) > 0.97 ? 0 : 1
    eyeMat.opacity = (1 - F.tight) * blink * (b.hasEmber ? 0.95 : 0.4)
    eyes.current.position.y = body.current.position.y + 0.08
    orbit.current.visible = calm > 0.01
    orbit.current.rotation.y += dt * 1.5
    orbit.current.scale.setScalar(Math.max(0.001, calm))
    light.current.intensity = calm * 2.5
  })
  return (
    <group ref={group}>
      <mesh ref={body} material={bodyMat} visible={false}>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
      <group ref={eyes} position={[0, 0.4, 0.38]}>
        <sprite material={eyeMat} position={[-0.11, 0, 0]} scale={[0.14, 0.14, 1]} />
        <sprite material={eyeMat} position={[0.11, 0, 0]} scale={[0.14, 0.14, 1]} />
      </group>
      <group ref={orbit} position={[0, 0.45, 0]} visible={false}>
        {Array.from({ length: PEBBLES }, (_, i) => {
          const a = (i / PEBBLES) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.cos(a) * 0.55, Math.sin(a * 2) * 0.1, Math.sin(a) * 0.55]}>
              <dodecahedronGeometry args={[0.06, 0]} />
              <meshStandardMaterial color="#8a7a63" roughness={0.9} emissive="#3a2810" />
            </mesh>
          )
        })}
      </group>
      <pointLight ref={light} position={[0, 0.8, 0]} color="#ffb85c" distance={6} intensity={0} />
    </group>
  )
}

/** El espejo de obsidiana: sale de la tierra, girando despacio, hasta que ella lo toma. Provisional: disco negro brillante con marco de piedra. */
export function MirrorPickup() {
  const tex = useGlowTexture()
  const group = useRef<THREE.Group>(null!)
  const glow = useRef<THREE.Sprite>(null!)
  useFrame(() => {
    const F = b.fear
    const t = game.time
    const up = F.mirrorUpAt >= 0 ? smoothstep(F.mirrorUpAt, F.mirrorUpAt + 1.6, t) : 0
    group.current.visible = up > 0 && !b.hasMirror
    group.current.position.set(HIDEOUT.x, -0.6 + up * 1.7 + Math.sin(t * 1.5) * 0.05, HIDEOUT.z - 1.2)
    group.current.rotation.y = t * 0.6
    glow.current.material.opacity = 0.25 + up * 0.35
  })
  return (
    <group ref={group} visible={false}>
      <mesh rotation-x={0}>
        <circleGeometry args={[0.32, 24]} />
        <meshStandardMaterial color="#07070b" metalness={0.7} roughness={0.08} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.34, 0.05, 6, 24]} />
        <meshStandardMaterial color="#4a4038" roughness={0.9} />
      </mesh>
      <sprite ref={glow} scale={[1.6, 1.6, 1]}>
        <spriteMaterial map={tex} color="#b9a4ff" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </group>
  )
}

// ── El camino del jugador anterior: un rastro dorado tenue que lleva a la hoguera ──
export function PrevTrail() {
  return (
    <Ribbon
      color="#ffd77a"
      width={0.22}
      y={0.035}
      get={() => ({ pts: PREV_PATH, opacity: (b.hasEmber ? 0.12 : 0.32) + Math.sin(game.time * 1.3) * 0.05 })}
    />
  )
}

// ── La hoguera: casi apagada, con la brasa esperando; al tomarla, revive un poco (es refugio) ──
export function Hearth() {
  const tex = useGlowTexture()
  const ember = useRef<THREE.Sprite>(null!)
  const ghost = useRef<THREE.Group>(null!)
  const ghostMats = useMemo(
    () => [0, 1].map(() => new THREE.SpriteMaterial({ map: tex, color: '#ffd98a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })),
    [tex],
  )
  const light = useRef<THREE.PointLight>(null!)
  useFrame(() => {
    const t = game.time
    // la brasa que espera: late despacio
    const waiting = !b.hasEmber
    ember.current.visible = waiting
    ember.current.scale.setScalar(0.7 + Math.sin(t * 2.2) * 0.12)
    light.current.intensity = waiting ? 2.5 + Math.sin(t * 2.2) * 0.6 : b.pickAt >= 0 ? 6 * clamp01((t - b.pickAt) / 1.5) : 0
    // la elfa dorada (el jugador anterior): aparece un instante al tomar la brasa y se desvanece
    const k = b.pickAt >= 0 ? (t - b.pickAt) / 3.5 : -1
    const a = k >= 0 && k < 1 ? Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k) : 0
    ghost.current.visible = a > 0.01
    ghost.current.position.y = 0.2 + Math.max(0, k) * 1.2
    ghostMats.forEach((m) => (m.opacity = a * 0.9))
  })
  return (
    <group>
      <Bonfire x={HEARTH.x} z={HEARTH.z} litAt={() => (b.pickAt >= 0 ? b.pickAt + 0.5 : -1)} />
      <sprite ref={ember} position={[HEARTH.x, 0.35, HEARTH.z]}>
        <spriteMaterial map={tex} color="#ff9a3c" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <pointLight ref={light} position={[HEARTH.x, 1, HEARTH.z]} color="#ff9a4a" distance={12} decay={1.3} intensity={0} />
      {/* provisional: la figura dorada (se reemplazará por la elfa en dorado) */}
      <group ref={ghost} position={[HEARTH.x + 1.3, 0, HEARTH.z + 0.6]} visible={false}>
        <sprite material={ghostMats[0]} position={[0, 0.85, 0]} scale={[0.9, 2.1, 1]} />
        <sprite material={ghostMats[1]} position={[0, 1.75, 0]} scale={[0.6, 0.6, 1]} />
      </group>
    </group>
  )
}

// ── Los círculos de hongos: apagados, casi no se ven; encendidos, brillan (son refugio) ──
const MUSH = 8
const mushM = new THREE.Matrix4()
export function MushroomRings() {
  const tex = useGlowTexture()
  const lights = useRef<(THREE.PointLight | null)[]>([])
  const glows = useRef<(THREE.Sprite | null)[]>([])
  const spots = useMemo(() => {
    const r = rng(19)
    return RINGS.flatMap((g, gi) =>
      Array.from({ length: MUSH }, (_, k) => {
        const a = (k / MUSH) * Math.PI * 2 + r() * 0.3
        return { gi, x: g.x + Math.cos(a) * RING_R, z: g.z + Math.sin(a) * RING_R, rot: r() * 6.3, s: 0.7 + r() * 0.5 }
      }),
    )
  }, [])
  const update = (set: SetInstance) => {
    const t = game.time
    spots.forEach((sp, i) => {
      const at = RINGS[sp.gi].litAt
      const on = at >= 0 ? clamp01((t - at) / 0.8) : 0
      const burst = at >= 0 ? Math.max(0, 1 - (t - at) / 1.2) : 0
      set(i, placeMatrix(sp.x, 0, sp.z, sp.rot, sp.s * (1 + burst * 0.3), mushM), 0.45 + on * 1.8 + burst * 2)
    })
  }
  useFrame(() => {
    const t = game.time
    RINGS.forEach((g, i) => {
      const on = g.litAt >= 0 ? clamp01((t - g.litAt) / 0.8) : 0
      const l = lights.current[i]
      if (l) l.intensity = on * (4 + Math.sin(t * 1.7 + i) * 0.4)
      const s = glows.current[i]
      if (s) {
        s.material.opacity = 0.06 + on * 0.45
        s.scale.setScalar(4 + on * 2)
      }
    })
  })
  return (
    <>
      <DynamicModel url={natureUrl('Mushroom_Common')} count={spots.length} onFrame={update} />
      {RINGS.map((g, i) => (
        <group key={i}>
          <sprite
            ref={(el) => {
              glows.current[i] = el
            }}
            position={[g.x, 0.3, g.z]}
          >
            <spriteMaterial map={tex} color="#9fe0c8" transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
          <pointLight
            ref={(el) => {
              lights.current[i] = el
            }}
            position={[g.x, 0.8, g.z]}
            color="#9fe0c8"
            distance={8}
            decay={1.4}
            intensity={0}
          />
        </group>
      ))}
    </>
  )
}

// ── Las flores dormidas: oscuras y cerradas; al darles luz, se abren ──
const flowerM = new THREE.Matrix4()
export function DormantFlowers() {
  const tex = useGlowTexture()
  const glows = useRef<(THREE.Sprite | null)[]>([])
  const update = (set: SetInstance) => {
    const t = game.time
    FLOWERS.forEach((f, i) => {
      const k = f.giftAt >= 0 ? clamp01((t - f.giftAt) / 1.4) : 0
      const e = 1 - Math.pow(1 - k, 3)
      // las ocultas solo existen en el espejo (hasta que se les da luz)
      const seen = f.hidden && f.giftAt < 0 ? b.look : 1
      set(i, placeMatrix(f.x, 0, f.z, i * 1.9, Math.max(0.0001, (0.35 + e * 0.85) * seen), flowerM), (0.3 + e * 1.5 + (k > 0 && k < 1 ? (1 - k) * 2 : 0)) * (f.hidden && f.giftAt < 0 ? 2.2 : 1))
    })
  }
  useFrame(() => {
    const t = game.time
    FLOWERS.forEach((f, i) => {
      const s = glows.current[i]
      if (!s) return
      const done = f.giftAt >= 0 ? clamp01((t - f.giftAt) / 1.4) : 0
      // dormida: un brillo muy tenue que respira (para encontrarla); abierta: cálida
      const seen = f.hidden && f.giftAt < 0 ? b.look : 1
      s.material.opacity = (done > 0 ? 0.35 * done : b.hasEmber ? 0.12 + Math.sin(t * 1.5 + i) * 0.05 : 0.04) * seen + (f.hidden && f.giftAt < 0 ? b.look * 0.25 : 0)
      s.material.color.set(done > 0 ? '#ffd6a0' : f.hidden ? '#c9a6ff' : '#b8c8ff')
      s.scale.setScalar(1.4 + done * 1.2)
    })
  })
  return (
    <>
      <DynamicModel url={natureUrl('Flower_3_Group')} count={FLOWERS.length} onFrame={update} />
      {FLOWERS.map((f, i) => (
        <sprite
          key={i}
          ref={(el) => {
            glows.current[i] = el
          }}
          position={[f.x, 0.45, f.z]}
        >
          <spriteMaterial map={tex} color="#b8c8ff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      ))}
    </>
  )
}

// ── La brasa en sus manos, la chispa que vuelve y los recuerdos que llegan ──
const tmpV = new THREE.Vector3()
export function EmberAndSparks() {
  const tex = useGlowTexture()
  const ember = useRef<THREE.Group>(null!)
  const halo = useRef<THREE.Sprite>(null!)
  const core = useRef<THREE.Sprite>(null!)
  const spark = useRef<THREE.Sprite>(null!)
  const mems = useRef<(THREE.Sprite | null)[]>([])
  useFrame(() => {
    const t = game.time
    const lvl = emberLevel()
    // la brasa: delante de ella, a la altura de las manos
    ember.current.visible = b.hasEmber && b.outAt < 0
    ember.current.position.set(game.x + Math.sin(game.yaw) * 0.35, 0.95, game.z + Math.cos(game.yaw) * 0.35)
    const weak = lvl < 0.3 ? (Math.sin(t * 17) * 0.5 + 0.5) * (0.3 - lvl) * 2 : 0 // parpadea cuando se apaga
    const give = Math.max(0, 1 - (t - b.giveAt) / 0.6)
    halo.current.scale.setScalar(0.35 + lvl * 0.9 * (1 - weak * 0.6) + give * 1.4)
    halo.current.material.opacity = 0.5 + lvl * 0.4
    core.current.scale.setScalar(0.12 + lvl * 0.14)
    // la chispa que vuela al último refugio cuando se apaga
    const k = b.outAt >= 0 ? clamp01((t - b.outAt) / RETURN_TIME) : -1
    spark.current.visible = k >= 0
    if (k >= 0) {
      const e = smoothstep(0, 1, k)
      tmpV.set(
        b.outFrom.x + (b.lastRefuge.x - b.outFrom.x) * e,
        1 + Math.sin(Math.PI * e) * 2.5,
        b.outFrom.z + (b.lastRefuge.z - b.outFrom.z) * e,
      )
      spark.current.position.copy(tmpV)
    }
    // los recuerdos: de la flor hacia ella, en un arco
    for (let i = 0; i < 4; i++) {
      const s = mems.current[i]
      if (!s) continue
      const m = b.memFlights[i]
      if (!m || t < m.at) {
        s.visible = false
        continue
      }
      const e = smoothstep(0, 1, (t - m.at) / MEMORY_FLIGHT)
      s.visible = true
      s.position.set(m.from.x + (game.x - m.from.x) * e, 0.6 + Math.sin(Math.PI * e) * 1.6 + e * 0.4, m.from.z + (game.z - m.from.z) * e)
      s.scale.setScalar(0.5 + Math.sin(t * 9) * 0.06)
    }
  })
  return (
    <>
      <group ref={ember} visible={false}>
        <sprite ref={halo}>
          <spriteMaterial map={tex} color="#ff9a3c" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
        <sprite ref={core}>
          <spriteMaterial map={tex} color="#fff0c0" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      </group>
      <sprite ref={spark} scale={[0.5, 0.5, 1]} visible={false}>
        <spriteMaterial map={tex} color="#ffb060" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
      </sprite>
      {Array.from({ length: 4 }, (_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            mems.current[i] = el
          }}
          visible={false}
        >
          <spriteMaterial map={tex} color="#ffe6b0" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
        </sprite>
      ))}
    </>
  )
}

// ── Luciérnagas: pocas en la oscuridad, muchas alrededor de lo encendido ──
const FLIES = 90
export function Fireflies() {
  const tex = useGlowTexture()
  const pts = useRef<THREE.Points>(null!)
  const data = useMemo(() => {
    const r = rng(33)
    return Array.from({ length: FLIES }, (_, i) => ({ home: i % (RINGS.length + 1), ph: r() * 6.3, rad: 0.8 + r() * 2.8, h: 0.4 + r() * 1.6, sp: 0.3 + r() * 0.5 }))
  }, [])
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(FLIES * 3), 3))
    return g
  }, [])
  useFrame(() => {
    const t = game.time
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    data.forEach((f, i) => {
      const home = f.home === 0 ? { x: HEARTH.x, z: HEARTH.z, on: true } : { ...RINGS[f.home - 1], on: RINGS[f.home - 1].litAt >= 0 }
      // las de un círculo apagado están casi quietas y bajas, escondidas
      const k = home.on ? 1 : 0.25
      const a = f.ph + t * f.sp
      pos.setXYZ(i, home.x + Math.cos(a) * f.rad * (0.6 + k * 0.6), (home.on ? f.h : 0.15) + Math.sin(t * 1.3 + f.ph) * 0.25 * k, home.z + Math.sin(a * 1.3) * f.rad * (0.6 + k * 0.6))
    })
    pos.needsUpdate = true
    ;(pts.current.material as THREE.PointsMaterial).opacity = 0.7 + Math.sin(t * 3) * 0.15
  })
  return (
    <points ref={pts} geometry={geo} frustumCulled={false}>
      <pointsMaterial map={tex} color="#d8ff9a" size={0.22} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  )
}

/** Los bordes de la pantalla se oscurecen cuando la brasa se está apagando (sin números en pantalla). */
export function Vignette() {
  useFrame(() => {
    const el = document.getElementById('vignette')
    if (!el) return
    const lvl = emberLevel()
    const v = b.hasEmber ? Math.max(0, 1 - lvl * 1.6) : 0.55
    el.style.opacity = String(b.outAt >= 0 ? 1 : v)
  })
  return null
}

// ── Parte 3: la grieta de lava vieja y el puente que solo existe en el espejo ──
export function Crack() {
  const tex = useGlowTexture()
  const lava = useRef<THREE.MeshStandardMaterial>(null!)
  const glows = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ x: (i - 6.5) * 2.6 + Math.sin(i * 7.3) * 0.8, z: CRACK_Z0 + 0.6 + ((i * 37) % 23) / 10 })), [])
  useFrame(() => {
    lava.current.emissiveIntensity = 0.55 + Math.sin(game.time * 0.9) * 0.15
  })
  const W = 140
  const D = CRACK_Z1 - CRACK_Z0
  return (
    <group>
      {/* el fondo de la grieta: oscuro, con un resplandor rojo muy apagado */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, (CRACK_Z0 + CRACK_Z1) / 2]} renderOrder={2}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial ref={lava} color="#0a0606" emissive="#5a1606" emissiveIntensity={0.55} roughness={1} />
      </mesh>
      {glows.map((g, i) => (
        <sprite key={i} position={[g.x, 0.2, g.z]} scale={[2.6, 1.2, 1]}>
          <spriteMaterial map={tex} color="#ff5a1e" transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      ))}
    </group>
  )
}

const STONES = 5
export function MirrorBridge() {
  const tex = useGlowTexture()
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0b0a10', metalness: 0.6, roughness: 0.12, transparent: true, opacity: 0, emissive: '#7a5cff', emissiveIntensity: 0.6 }), [])
  const glow = useRef<THREE.Sprite>(null!)
  const stones = useMemo(
    () => Array.from({ length: STONES }, (_, i) => ({ z: CRACK_Z0 - 0.1 + ((CRACK_Z1 - CRACK_Z0 + 0.2) * (i + 0.5)) / STONES, rot: i * 1.7, s: 0.62 + (i % 2) * 0.08 })),
    [],
  )
  useFrame(() => {
    const t = game.time
    const real = BRIDGE.litAt >= 0 ? clamp01((t - BRIDGE.litAt) / 1.2) : 0
    // en el espejo se ve como un fantasma lila; al darle luz, se vuelve obsidiana de verdad
    mat.opacity = Math.max(real, b.look * 0.7)
    mat.emissiveIntensity = (1 - real) * 0.7 + Math.max(0, 1 - (t - BRIDGE.litAt) / 2) * (BRIDGE.litAt >= 0 ? 1.2 : 0)
    mat.depthWrite = real > 0.9
    glow.current.material.opacity = (1 - real) * b.look * 0.5 + (BRIDGE.litAt >= 0 ? Math.max(0, 1 - (t - BRIDGE.litAt) / 2.5) * 0.8 : 0)
  })
  return (
    <group position={[BRIDGE.x, 0, 0]}>
      {stones.map((st, i) => (
        <mesh key={i} material={mat} position={[0, 0.05, st.z]} rotation={[0, st.rot, 0]} scale={[BRIDGE_HALF * st.s * 1.6, 0.18, 0.7]}>
          <dodecahedronGeometry args={[0.5, 0]} />
        </mesh>
      ))}
      <sprite ref={glow} position={[0, 0.4, (CRACK_Z0 + CRACK_Z1) / 2]} scale={[3.5, 4.5, 1]}>
        <spriteMaterial map={tex} color="#b9a4ff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </group>
  )
}

/** La entrada a la Gruta de obsidiana (parte 4). Provisional: un arco de bloques negros brillantes. */
export function GrottoGate() {
  const blocks = useMemo(() => {
    const out: { x: number; y: number; s: number; r: number }[] = []
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI
      out.push({ x: Math.cos(a) * 3.2, y: Math.sin(a) * 3.6, s: 0.7 + ((i * 13) % 5) / 10, r: i * 0.9 })
    }
    return out
  }, [])
  return (
    <group position={[0, 0, GROTTO_Z]}>
      {blocks.map((k, i) => (
        <mesh key={i} position={[k.x, k.y, 0]} rotation={[k.r, k.r * 0.7, 0]} scale={k.s}>
          <dodecahedronGeometry args={[0.8, 0]} />
          <meshStandardMaterial color="#0d0c12" metalness={0.55} roughness={0.15} />
        </mesh>
      ))}
    </group>
  )
}

/** Mientras mira por el espejo: el borde de la pantalla se vuelve obsidiana y aparece su reflejo. */
export function MirrorView() {
  useFrame(() => {
    const el = document.getElementById('mirror-view')
    if (!el) return
    el.style.opacity = String(b.look)
    const n = b.memories
    el.className = `mirror-view${n >= 1 ? ' m1' : ''}${n >= 2 ? ' m2' : ''}${n >= 3 ? ' m3' : ''}${n >= 5 ? ' m4' : ''}`
  })
  return null
}

/** (para el rastro dorado: un punto a lo largo del camino anterior) */
export const prevPathPoint = (t: number) => pointAlong(PREV_PATH, t)

;[...TREES, ...ROCKS, ...FERNS, 'Mushroom_Common', 'Flower_3_Group'].forEach((m) => useGLTF.preload(natureUrl(m)))
