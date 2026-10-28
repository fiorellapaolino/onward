import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { damp } from '../game/config'
import { game } from '../game/state'
import { ELDER, GIRL } from '../game/village'

/*
 * Los trozos de espejo de obsidiana que sostiene la gente de la aldea.
 * Cada uno mira el suyo: ahí solo ve su pasado. Cuando la elfa lo ayuda,
 * baja el espejo (lo deja apoyado en el suelo, a su lado) y levanta la vista al camino.
 */

// un trozo irregular de piedra negra, fino, con los bordes partidos
const SHARD_GEO = (() => {
  const s = new THREE.Shape()
  const pts: [number, number][] = [
    [0, 0.11],
    [0.055, 0.075],
    [0.07, 0.01],
    [0.04, -0.06],
    [0.01, -0.09],
    [-0.05, -0.065],
    [-0.072, 0.0],
    [-0.04, 0.07],
  ]
  s.moveTo(...pts[0])
  for (const p of pts.slice(1)) s.lineTo(...p)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 })
  g.center()
  return g
})()
// obsidiana: negra, muy pulida (brilla como agua oscura)
const OBSIDIAN = new THREE.MeshStandardMaterial({ color: '#0a0b10', roughness: 0.06, metalness: 0.55, emissive: '#1a2240', emissiveIntensity: 0.25 })

type Holder = {
  // dónde lo sostiene (en sus manos, mirándolo) y dónde lo deja (en el suelo, a su lado)
  hold: { x: number; y: number; z: number; tilt: number }
  rest: { x: number; z: number }
  rot: number
  scale: number
  freed: () => boolean
}

const fwdOf = (p: { x: number; z: number; rot: number }, d: number, side = 0) => ({
  x: p.x + Math.sin(p.rot) * d + Math.cos(p.rot) * side,
  z: p.z + Math.cos(p.rot) * d - Math.sin(p.rot) * side,
})

const HOLDERS: Holder[] = [
  {
    // la niña: en el regazo, inclinado hacia su cara
    hold: { ...fwdOf(GIRL, 0.24), y: 0.52, tilt: -0.9 },
    rest: fwdOf(GIRL, 0.15, -0.45),
    rot: GIRL.rot,
    scale: 1,
    freed: () => game.giftAt >= 0,
  },
  {
    // el anciano: entre las manos, sobre las rodillas
    hold: { ...fwdOf(ELDER, 0.36), y: 0.62, tilt: -0.8 },
    rest: fwdOf(ELDER, 0.2, 0.55),
    rot: ELDER.rot,
    scale: 1.25,
    freed: () => game.liftAt >= 0,
  },
]

export function Shards() {
  return (
    <>
      {HOLDERS.map((h, i) => (
        <Shard key={i} h={h} />
      ))}
    </>
  )
}

function Shard({ h }: { h: Holder }) {
  const ref = useRef<THREE.Mesh>(null!)
  const k = useRef(0) // 0 en sus manos → 1 en el suelo
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    k.current += ((h.freed() ? 1 : 0) - k.current) * damp(0.8, dt)
    const u = k.current
    const e = u * u * (3 - 2 * u)
    // de sus manos al suelo, apoyado de pie contra nada: tumbado mirando al cielo
    tmp.set(h.hold.x + (h.rest.x - h.hold.x) * e, h.hold.y + (0.02 - h.hold.y) * e + Math.sin(u * Math.PI) * 0.08, h.hold.z + (h.rest.z - h.hold.z) * e)
    ref.current.position.copy(tmp)
    ref.current.rotation.set(h.hold.tilt + (-Math.PI / 2 - h.hold.tilt) * e, h.rot + Math.PI, 0, 'YXZ')
    ref.current.scale.setScalar(h.scale)
  })
  return <mesh ref={ref} geometry={SHARD_GEO} material={OBSIDIAN} />
}
