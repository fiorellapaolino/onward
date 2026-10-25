import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Clone, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { SHADOW_S, VILLAGE_R, VILLAGE_S, damp, natureUrl, pathAt, rng, sideAt } from '../game/config'
import { game } from '../game/state'
import { GIRL_TREE, buildHuts, buildLanterns, type Hut } from '../game/village'
import { useGlowTexture } from './TheLight'

/*
 * La aldea: casitas redondas con techo de paja, faroles apagados y una sombra
 * que la cubre. A la salida, la sombra es tan espesa que no se puede pasar.
 * (Las casas y faroles están hechos con formas simples, no con modelos.)
 */

const TREE_URL = natureUrl('CommonTree_3')

// Materiales compartidos (sombreado plano: se ve "hecho a mano", como el resto del bosque)
const mats = {
  plaster: new THREE.MeshStandardMaterial({ color: '#d9c9a6', roughness: 0.95, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.9, flatShading: true }),
  darkWood: new THREE.MeshStandardMaterial({ color: '#4a3220', roughness: 0.9, flatShading: true }),
  thatch: new THREE.MeshStandardMaterial({ color: '#9a7a45', roughness: 1, flatShading: true }),
  thatchDark: new THREE.MeshStandardMaterial({ color: '#7d6136', roughness: 1, flatShading: true }),
  stone: new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 1, flatShading: true }),
  // ventanas y faroles: apagados (más adelante se encenderán con la magia de la elfa)
  glassOff: new THREE.MeshStandardMaterial({ color: '#2a2833', roughness: 0.4, emissive: '#ffb45e', emissiveIntensity: 0 }),
}

export function Village() {
  const huts = useMemo(buildHuts, [])
  const lanterns = useMemo(buildLanterns, [])
  const { scene: tree } = useGLTF(TREE_URL)

  return (
    <group>
      {huts.map((h, i) => (
        <HutMesh key={i} hut={h} />
      ))}
      {lanterns.map((l, i) => (
        <group key={i} position={[l.x, 0, l.z]}>
          <mesh material={mats.darkWood} position={[0, 0.95, 0]}>
            <cylinderGeometry args={[0.05, 0.07, 1.9, 6]} />
          </mesh>
          <mesh material={mats.darkWood} position={[0, 1.85, 0.16]}>
            <boxGeometry args={[0.05, 0.05, 0.36]} />
          </mesh>
          <mesh material={mats.glassOff} position={[0, 1.66, 0.3]}>
            <boxGeometry args={[0.18, 0.24, 0.18]} />
          </mesh>
          <mesh material={mats.darkWood} position={[0, 1.83, 0.3]}>
            <coneGeometry args={[0.16, 0.14, 4]} />
          </mesh>
        </group>
      ))}

      {/* El árbol de la niña */}
      <Clone object={tree} position={[GIRL_TREE.x, 0, GIRL_TREE.z]} rotation-y={GIRL_TREE.rot + 1.2} scale={1.45} />

      <ShadowMist />
    </group>
  )
}

/** Una casita: base de piedra, paredes encaladas con vigas, techo cónico de paja, puerta y ventana. */
function HutMesh({ hut }: { hut: Hut }) {
  const { tilt, roofH, beams } = useMemo(() => {
    const r = rng(hut.seed)
    return {
      tilt: (r() - 0.5) * 0.08,
      roofH: 1.9 + r() * 0.6,
      beams: Array.from({ length: 8 }, (_, k) => (k / 8) * Math.PI * 2 + Math.PI / 8),
    }
  }, [hut.seed])
  const R = 1.5
  const WALL = 1.7
  return (
    <group position={[hut.x, 0, hut.z]} rotation-y={hut.rot} scale={hut.scale}>
      <mesh material={mats.stone} position={[0, 0.12, 0]}>
        <cylinderGeometry args={[R + 0.12, R + 0.18, 0.24, 14]} />
      </mesh>
      <mesh material={mats.plaster} position={[0, 0.24 + WALL / 2, 0]}>
        <cylinderGeometry args={[R, R, WALL, 14]} />
      </mesh>
      {beams.map((a, k) => (
        <mesh key={k} material={mats.wood} position={[Math.sin(a) * (R + 0.02), 0.24 + WALL / 2, Math.cos(a) * (R + 0.02)]} rotation-y={a}>
          <boxGeometry args={[0.13, WALL, 0.08]} />
        </mesh>
      ))}
      {/* viga alrededor, bajo el techo */}
      <mesh material={mats.wood} position={[0, 0.24 + WALL - 0.08, 0]}>
        <cylinderGeometry args={[R + 0.06, R + 0.06, 0.16, 14]} />
      </mesh>
      {/* techo de paja en dos capas, algo torcido */}
      <group position={[0, 0.24 + WALL, 0]} rotation={[tilt, 0, tilt * 0.7]}>
        <mesh material={mats.thatch} position={[0, roofH / 2 - 0.1, 0]}>
          <coneGeometry args={[R + 0.6, roofH, 12]} />
        </mesh>
        <mesh material={mats.thatchDark} position={[0, -0.12, 0]}>
          <cylinderGeometry args={[R + 0.55, R + 0.68, 0.22, 12]} />
        </mesh>
        <mesh material={mats.darkWood} position={[0, roofH - 0.05, 0]}>
          <cylinderGeometry args={[0.04, 0.06, 0.4, 5]} />
        </mesh>
      </group>
      {/* puerta, mirando al sendero */}
      <mesh material={mats.darkWood} position={[0, 0.24 + 0.62, R - 0.02]}>
        <boxGeometry args={[0.72, 1.24, 0.12]} />
      </mesh>
      <mesh material={mats.wood} position={[0, 0.24 + 1.28, R + 0.02]}>
        <boxGeometry args={[0.9, 0.1, 0.12]} />
      </mesh>
      {/* ventana a un lado */}
      <group rotation-y={1.1}>
        <mesh material={mats.glassOff} position={[0, 0.24 + 1.0, R - 0.01]}>
          <boxGeometry args={[0.42, 0.38, 0.06]} />
        </mesh>
        <mesh material={mats.wood} position={[0, 0.24 + 1.0, R + 0.03]}>
          <boxGeometry args={[0.06, 0.44, 0.06]} />
        </mesh>
      </group>
    </group>
  )
}

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

useGLTF.preload(TREE_URL)
