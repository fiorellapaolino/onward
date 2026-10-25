import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Clone, Sparkles, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { SHADOW_S, VILLAGE_R, VILLAGE_S, damp, natureUrl, pathAt, rng, sideAt } from '../game/config'
import { game, litFraction } from '../game/state'
import { BELLS, BELL_R, ELDER, GIRL, GIRL_TREE, LANTERNS, MUSICIAN, PLATES, PLATE_R, POLE, buildHuts, type Hut, type Lantern } from '../game/village'
import { useGlowTexture } from './TheLight'
import HOUSE_TYPES from '../game/houseTypes.json'

/*
 * La aldea: casas de entramado y piedra (Medieval Village MegaKit de Quaternius, CC0),
 * faroles apagados y una sombra que la cubre. A la salida, la sombra es tan espesa que no se puede pasar.
 * (Los faroles, el poste y la piedra están hechos con formas simples.)
 */

const TREE_URL = natureUrl('CommonTree_3')
const HOUSES_URL = `${import.meta.env.BASE_URL}models/village/houses.gltf`

// Materiales compartidos (sombreado plano: se ve "hecho a mano", como el resto del bosque)
const mats = {
  plaster: new THREE.MeshStandardMaterial({ color: '#d9c9a6', roughness: 0.95, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.9, flatShading: true }),
  darkWood: new THREE.MeshStandardMaterial({ color: '#4a3220', roughness: 0.9, flatShading: true }),
  thatch: new THREE.MeshStandardMaterial({ color: '#9a7a45', roughness: 1, flatShading: true }),
  thatchDark: new THREE.MeshStandardMaterial({ color: '#7d6136', roughness: 1, flatShading: true }),
  stone: new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 1, flatShading: true }),
}
const GLASS_OFF = new THREE.Color('#2a2833')
const GLASS_ON = new THREE.Color('#ffe2b0')


export function Village() {
  const huts = useMemo(buildHuts, [])
  const { scene: tree } = useGLTF(TREE_URL)
  const { materials } = useGLTF(HOUSES_URL)

  // las ventanas de las casas: oscuras mientras la sombra cubre la aldea; se encienden con los faroles
  const glass = materials.MI_WindowGlass as THREE.MeshStandardMaterial | undefined
  useFrame((_, rawDt) => {
    if (!glass) return
    const dt = Math.min(rawDt, 0.05)
    const on = litFraction()
    glass.emissive.set('#ffb45e')
    glass.emissiveIntensity += (on * 1.8 - glass.emissiveIntensity) * damp(1.5, dt)
    glass.color.lerpColors(GLASS_OFF, GLASS_ON, Math.min(1, on))
    glass.opacity = 0.3 + 0.65 * on
    glass.transparent = true
  })

  return (
    <group>
      {huts.map((h, i) => (
        <HouseMesh key={i} hut={h} />
      ))}
      {LANTERNS.map((l, i) => (
        <LanternPost key={i} lantern={l} index={i} />
      ))}

      {/* El anciano se sienta en un taburete; a su lado, su farol apagado (se enciende cuando despierta la luz) */}
      <group position={[ELDER.x, 0, ELDER.z]} rotation-y={ELDER.rot}>
        <mesh material={mats.wood} position={[0, 0.14, -0.05]}>
          <cylinderGeometry args={[0.2, 0.18, 0.28, 8]} />
        </mesh>
        <LanternLamp position={[0.45, 0, 0.1]} isLit={() => game.liftAt} />
      </group>

      {/* La piedra donde se sienta la niña (medio enterrada, detrás de sus piernas: solo bajo la cadera) */}
      <mesh material={mats.stone} position={[GIRL.x - Math.sin(GIRL.rot) * 0.13, 0, GIRL.z - Math.cos(GIRL.rot) * 0.13]} rotation-y={GIRL.rot} scale={[1.15, 0.97, 0.85]}>
        <dodecahedronGeometry args={[0.24, 1]} />
      </mesh>

      {/* Unas luciérnagas acompañan a la niña mientras llora: así se la ve desde el sendero */}
      <GirlFireflies />

      {/* El árbol de la niña */}
      <Clone object={tree} position={[GIRL_TREE.x, 0, GIRL_TREE.z]} rotation-y={GIRL_TREE.rot + 1.2} scale={1.45} />

      <Square />
      <StoneBells />
      <ShadowMist />
      <FearRing />
    </group>
  )
}

function GirlFireflies() {
  const ref = useRef<THREE.Group>(null!)
  useFrame(() => {
    // se van cuando ya habló con ella
    ref.current.visible = game.story === 'seek'
  })
  return (
    <group ref={ref} position={[GIRL.x, 0.7, GIRL.z]}>
      <Sparkles count={20} scale={[2, 1.4, 2]} size={9} speed={0.3} color="#ffe39a" />
    </group>
  )
}

/** Farol de la aldea: poste, brazo y lámpara. */
function LanternPost({ lantern, index }: { lantern: Lantern; index: number }) {
  return (
    <group position={[lantern.x, 0, lantern.z]}>
      <mesh material={mats.darkWood} position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 1.9, 6]} />
      </mesh>
      <mesh material={mats.darkWood} position={[0, 1.85, 0.16]}>
        <boxGeometry args={[0.05, 0.05, 0.36]} />
      </mesh>
      <LanternLamp position={[0, 1.42, 0.3]} isLit={() => game.lit[index] ?? -1} />
    </group>
  )
}

/**
 * Lámpara: vidrio oscuro cuando está apagada. Al encenderse da un destello,
 * el vidrio brilla cálido y un halo de luz la rodea.
 * isLit devuelve el momento en que se encendió (-1 = apagada).
 */
function LanternLamp({ position, isLit }: { position: [number, number, number]; isLit: () => number }) {
  const tex = useGlowTexture()
  const glass = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2a2833', roughness: 0.4, emissive: '#ffb45e', emissiveIntensity: 0 }),
    [],
  )
  const halo = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ffc77a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    [tex],
  )
  const sprite = useRef<THREE.Sprite>(null!)

  useFrame(() => {
    const at = isLit()
    if (at < 0 || game.time < at) {
      glass.emissiveIntensity = 0
      glass.color.copy(GLASS_OFF)
      halo.opacity = 0
      return
    }
    const t = game.time - at
    const pop = Math.max(0, 1 - t / 0.8) // destello al encenderse
    const flicker = 1 + Math.sin(game.time * 9 + at * 7) * 0.05 + Math.sin(game.time * 23 + at) * 0.03
    glass.emissiveIntensity = (2.2 + pop * 4) * flicker
    glass.color.copy(GLASS_ON)
    halo.opacity = Math.min(1, t * 3) * 0.75 * flicker
    sprite.current.scale.setScalar((1.6 + pop * 2.5) * flicker)
  })

  return (
    <group position={position}>
      <mesh material={glass} position={[0, 0.24, 0]}>
        <boxGeometry args={[0.18, 0.24, 0.18]} />
      </mesh>
      <mesh material={mats.darkWood} position={[0, 0.41, 0]}>
        <coneGeometry args={[0.16, 0.14, 4]} />
      </mesh>
      <mesh material={mats.darkWood} position={[0, 0.11, 0]}>
        <boxGeometry args={[0.2, 0.03, 0.2]} />
      </mesh>
      <sprite ref={sprite} material={halo} position={[0, 0.24, 0]} scale={1.6} />
    </group>
  )
}

/**
 * Una casa del kit (Medieval Village MegaKit de Quaternius, CC0), ya armada por tools/bake_houses.py.
 * Las copias comparten geometría y materiales con el original.
 */
function HouseMesh({ hut }: { hut: Hut }) {
  const { nodes } = useGLTF(HOUSES_URL)
  const t = HOUSE_TYPES[hut.type]
  return (
    <group position={[hut.x, 0, hut.z]} rotation-y={hut.rot} scale={hut.scale}>
      <Clone object={nodes['House_' + hut.type]} />
      {/* interior a oscuras: por las ventanas no se ve nada hasta que vuelve la luz */}
      <mesh material={INTERIOR} position={[0, 1.6, 0]}>
        <boxGeometry args={[t.hx * 2 - 0.7, 3.1, t.hz * 2 - 0.7]} />
      </mesh>
    </group>
  )
}
const INTERIOR = new THREE.MeshBasicMaterial({ color: '#120e0c' })

/*
 * La sombra: manchas oscuras que flotan sobre la aldea y un muro espeso a la salida.
 * Respiran despacio. Cuando la sombra deje pasar (más adelante), se desvanecen.
 */
type Blob = { x: number; y: number; z: number; size: number; phase: number; speed: number; wall: boolean }

function ShadowMist() {
  const tex = useGlowTexture()
  const blobs = useMemo(() => {
    const r = rng(666)
    const out: Blob[] = []
    const p = new THREE.Vector3()
    const sd = new THREE.Vector3()
    // muro a la salida: varias capas que cruzan todo el ancho del bosque
    for (let i = 0; i < 70; i++) {
      const s = SHADOW_S + r() * 7
      pathAt(s, p)
      sideAt(s, sd)
      const lat = (r() - 0.5) * 22
      out.push({ x: p.x + sd.x * lat, y: 0.4 + r() * 4.5, z: p.z + sd.z * lat, size: 3 + r() * 4, phase: r() * 6.28, speed: 0.2 + r() * 0.3, wall: true })
    }
    // sobre la aldea: nubarrones bajos
    const c = pathAt(VILLAGE_S)
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r()) * VILLAGE_R
      out.push({ x: c.x + Math.cos(a) * d, y: 6 + r() * 4, z: c.z + Math.sin(a) * d, size: 5 + r() * 6, phase: r() * 6.28, speed: 0.1 + r() * 0.15, wall: false })
    }
    return out
  }, [])

  const material = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#17141f', transparent: true, opacity: 0.8, depthWrite: false, fog: false }),
    [tex],
  )
  const refs = useRef<(THREE.Sprite | null)[]>([])
  const fade = useRef(1)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    fade.current += ((game.shadowOpen ? 0 : 1) - fade.current) * damp(0.8, dt)
    material.opacity = 0.8 * fade.current
    const t = game.time
    blobs.forEach((b, i) => {
      const s = refs.current[i]
      if (!s) return
      const breathe = 1 + Math.sin(t * b.speed * 2 + b.phase) * 0.12
      s.position.set(b.x + Math.sin(t * b.speed + b.phase) * 0.6, b.y + Math.sin(t * b.speed * 1.3 + b.phase) * 0.3, b.z)
      s.scale.setScalar(b.size * breathe)
    })
  })

  return (
    <>
      {blobs.map((b, i) => (
        <sprite key={i} ref={(el) => {
            refs.current[i] = el
          }} material={material} position={[b.x, b.y, b.z]} scale={b.size} />
      ))}
    </>
  )
}

/*
 * El miedo: cuando el anciano cuenta lo de la oscuridad, manchas de sombra rodean a la elfa
 * y se van cerrando. Si se queda (mantener E), se cierran sobre ella y toman su forma: su sombra.
 */
const RING = 22
function FearRing() {
  const tex = useGlowTexture()
  const material = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#120f1a', transparent: true, opacity: 0, depthWrite: false, fog: false }),
    [tex],
  )
  const refs = useRef<(THREE.Sprite | null)[]>([])
  const seeds = useMemo(() => {
    const r = rng(77)
    return Array.from({ length: RING }, (_, i) => ({ a: (i / RING) * Math.PI * 2 + r() * 0.3, y: 0.3 + r() * 2.2, size: 1.6 + r() * 1.8, ph: r() * 6.28 }))
  }, [])

  useFrame(() => {
    const g = game
    // al quedarse, la oscuridad se cierra sobre ella y toma su forma (nace su sombra)
    const gather = g.shadowOn ? Math.min(1, (g.time - g.shadowAt) / 1.2) : 0
    const show = g.fear * (1 - gather * gather)
    material.opacity = 0.85 * show
    const radius = (5.5 - 3.6 * g.fear) * (1 - g.courage * 0.35) * (1 - gather)
    seeds.forEach((sd, i) => {
      const s = refs.current[i]
      if (!s) return
      s.visible = show > 0.01
      const a = sd.a + g.time * 0.15
      const r = radius + Math.sin(g.time * 0.8 + sd.ph) * 0.4
      s.position.set(g.x + Math.cos(a) * r, sd.y + Math.sin(g.time * 0.6 + sd.ph) * 0.2, g.z + Math.sin(a) * r)
      s.scale.setScalar(sd.size * (1 + Math.sin(g.time * 1.1 + sd.ph) * 0.12))
    })
  })

  return (
    <>
      {seeds.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          material={material}
          visible={false}
        />
      ))}
    </>
  )
}

/*
 * La plaza: un poste alto con una polea. El gran farol cuelga casi en el suelo, apagado.
 * Dos cuerdas bajan hasta dos piedras redondas, una a cada lado del sendero.
 * Cada piedra pisada tensa su cuerda y brilla; con una sola, el farol apenas se levanta y vuelve a caer.
 * Con las dos a la vez, sube hasta arriba y se enciende.
 */
const POLE_H = 4.6
const ARM = 1.1 // el brazo de la polea sale hacia el lado del sendero
function Square() {
  const tex = useGlowTexture()
  const plateMats = useMemo(
    () => PLATES.map(() => new THREE.MeshStandardMaterial({ color: '#8f8b84', roughness: 0.9, flatShading: true, emissive: '#c9a4ff', emissiveIntensity: 0 })),
    [],
  )
  const ropeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b39a6e', roughness: 1 }), [])
  const lantern = useRef<THREE.Group>(null!)
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2833', emissive: '#ffb45e', emissiveIntensity: 0, roughness: 0.4 }), [])
  const halo = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ffc77a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    [tex],
  )
  const light = useRef<THREE.PointLight>(null!)
  const ropes = useRef<(THREE.Mesh | null)[]>([])
  const H = useRef({ h: 0, press: [0, 0] })

  // la punta del brazo (de donde cuelga el farol)
  const tip = useMemo(() => new THREE.Vector3(POLE.x, POLE_H, POLE.z + ARM), [])
  const up = new THREE.Vector3(0, 1, 0)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game
    const st = H.current
    const pressedN = g.plates.filter(Boolean).length
    // altura del farol: 0 en el suelo … 1 arriba
    const target = g.liftAt >= 0 ? 1 : pressedN * 0.12
    st.h += (target - st.h) * damp(g.liftAt >= 0 ? 1.2 : 4, dt)
    const y = 0.35 + st.h * (POLE_H - 1.0)
    lantern.current.position.set(tip.x, y, tip.z)
    lantern.current.rotation.z = Math.sin(g.time * 1.3) * 0.04 * (1 - st.h * 0.5)

    PLATES.forEach((pl, i) => {
      st.press[i] += ((g.plates[i] ? 1 : 0) - st.press[i]) * damp(8, dt)
      plateMats[i].emissiveIntensity = st.press[i] * 1.4 + (g.story === 'plates' ? 0.12 + 0.08 * Math.sin(g.time * 2 + i * 2) : 0)
      // cada cuerda va del farol a su piedra (se ve tensa cuando la pisan)
      const r = ropes.current[i]
      if (!r) return
      const from = new THREE.Vector3(tip.x, POLE_H, tip.z)
      const to = new THREE.Vector3(pl.x, 0.25 - st.press[i] * 0.06, pl.z)
      const mid = from.clone().add(to).multiplyScalar(0.5)
      const len = from.distanceTo(to)
      r.position.copy(mid)
      r.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize())
      r.scale.set(1, len, 1)
    })

    const on = g.liftAt >= 0 ? Math.min(1, (g.time - g.liftAt) / 1.2) : 0
    glass.emissiveIntensity = on * 3
    glass.color.lerpColors(GLASS_OFF, GLASS_ON, on)
    halo.opacity = on * 0.9
    light.current.intensity = on * 18
  })

  return (
    <group>
      {/* poste y brazo */}
      <mesh material={mats.darkWood} position={[POLE.x, POLE_H / 2, POLE.z]}>
        <cylinderGeometry args={[0.1, 0.16, POLE_H, 7]} />
      </mesh>
      <mesh material={mats.darkWood} position={[POLE.x, POLE_H - 0.05, POLE.z + ARM / 2]}>
        <boxGeometry args={[0.1, 0.1, ARM + 0.2]} />
      </mesh>
      <mesh material={mats.wood} position={[POLE.x, POLE_H - 0.05, POLE.z + ARM]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.14, 0.14, 0.08, 10]} />
      </mesh>
      {/* el gran farol */}
      <group ref={lantern}>
        <mesh material={glass} position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.24, 0.24, 0.5, 6]} />
        </mesh>
        <mesh material={mats.darkWood} position={[0, 0.7, 0]}>
          <coneGeometry args={[0.36, 0.28, 6]} />
        </mesh>
        <mesh material={mats.darkWood} position={[0, 0.08, 0]}>
          <cylinderGeometry args={[0.3, 0.26, 0.06, 6]} />
        </mesh>
        <sprite material={halo} position={[0, 0.35, 0]} scale={4} />
        <pointLight ref={light} position={[0, 0.35, 0]} color="#ffcf8a" distance={22} intensity={0} />
      </group>
      {/* piedras y cuerdas */}
      {PLATES.map((pl, i) => (
        <group key={i}>
          <mesh material={plateMats[i]} position={[pl.x, 0.06, pl.z]}>
            <cylinderGeometry args={[PLATE_R, PLATE_R + 0.08, 0.14, 12]} />
          </mesh>
          <mesh material={mats.darkWood} position={[pl.x, 0.2, pl.z]}>
            <cylinderGeometry args={[0.07, 0.09, 0.2, 6]} />
          </mesh>
          <mesh
            ref={(el) => {
              ropes.current[i] = el
            }}
            material={ropeMat}
          >
            <cylinderGeometry args={[0.018, 0.018, 1, 5]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/*
 * Las campanas de piedra: piedras planas en arco junto al sendero, delante de la casa de la música.
 * Al pisarlas suenan y brillan: dorado si la toca la elfa, violeta si la toca su sombra,
 * y un brillo blanco suave cuando suena la nota de la mujer que toca a escondidas.
 */
const BELL_COLORS = [new THREE.Color('#000000'), new THREE.Color('#ffcf7a'), new THREE.Color('#b79bff'), new THREE.Color('#dfe9ff')]
function StoneBells() {
  const tex = useGlowTexture()
  const parts = useMemo(
    () =>
      BELLS.map(() => ({
        mat: new THREE.MeshStandardMaterial({ color: '#9b958c', roughness: 0.9, flatShading: true, emissive: '#000000' }),
        halo: new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
      })),
    [tex],
  )
  const halos = useRef<(THREE.Sprite | null)[]>([])
  const glowWindow = useRef<THREE.PointLight>(null!)

  useFrame(() => {
    const g = game
    const active = g.story === 'music' || g.story === 'next'
    BELLS.forEach((_, i) => {
      const t = g.time - g.bellAt[i]
      const k = Math.max(0, 1 - t / 1.6)
      const by = g.bellBy[i]
      const { mat, halo } = parts[i]
      mat.emissive.copy(BELL_COLORS[by] ?? BELL_COLORS[1]).multiplyScalar(k * 1.4 + (active ? 0.05 : 0))
      halo.color.copy(BELL_COLORS[by] ?? BELL_COLORS[1])
      halo.opacity = k * 0.9
      const h = halos.current[i]
      if (h) h.scale.setScalar(0.8 + (1 - k) * 1.2)
    })
    // la ventana de la mujer brilla mientras toca (a escondidas) y del todo cuando sale
    const playing = BELLS.some((_, i) => g.bellBy[i] === 3 && g.time - g.bellAt[i] < 0.8)
    const target = g.freedAt >= 0 ? 6 : playing ? 3 : 0
    glowWindow.current.intensity += (target - glowWindow.current.intensity) * 0.08
  })

  return (
    <group>
      {BELLS.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]}>
          <mesh material={parts[i].mat} position={[0, 0.05, 0]} rotation-y={i * 1.3}>
            <cylinderGeometry args={[BELL_R, BELL_R + 0.06, 0.12, 9]} />
          </mesh>
          <sprite
            ref={(el) => {
              halos.current[i] = el
            }}
            material={parts[i].halo}
            position={[0, 0.25, 0]}
          />
        </group>
      ))}
      {/* luz cálida que sale de la casa de la música */}
      <pointLight ref={glowWindow} position={[MUSICIAN.x, 1.3, MUSICIAN.z]} color="#ffc98a" distance={7} intensity={0} />
    </group>
  )
}

useGLTF.preload(TREE_URL)
useGLTF.preload(HOUSES_URL)
