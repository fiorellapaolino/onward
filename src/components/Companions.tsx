import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RETURN_TIME, game } from '../game/state'
import { useGlowTexture } from './TheLight'

/*
 * "Cuando ayudas a alguien, también te ayudas a ti": no se dice, se ve.
 * Cuando la elfa ayuda a alguien, una luz sale de esa persona, vuela hasta ella
 * y entra en su pecho (su luz crece). Después se queda a su lado: una lucecita que gira
 * a su alrededor y la acompaña el resto del camino (y le ilumina el tramo oscuro del final).
 */
const MAX = 3
const TMP = new THREE.Vector3()

export function Companions() {
  const tex = useGlowTexture()
  const mat = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ffe0a0', transparent: true, depthWrite: false, toneMapped: false }),
    [tex],
  )
  const halo = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ffb84a', transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }),
    [tex],
  )
  const refs = useRef<{ core: THREE.Sprite | null; glow: THREE.Sprite | null; light: THREE.PointLight | null }[]>(
    Array.from({ length: MAX }, () => ({ core: null, glow: null, light: null })),
  )

  useFrame(() => {
    const g = game
    const t = g.time
    // el pecho de la elfa
    const chest = TMP.set(g.x, 0.75 + g.jumpY, g.z)
    refs.current.forEach((r, i) => {
      const ret = g.returns[i]
      const k = ret ? (t - ret.at) / RETURN_TIME : -1
      const on = !!ret && k >= 0 && g.phase !== 'intro'
      if (r.core) r.core.visible = on
      if (r.glow) r.glow.visible = on
      if (r.light) r.light.intensity = 0
      if (!on || !r.core || !r.glow || !r.light) return
      let x: number, y: number, z: number
      if (k < 1) {
        // vuela hacia ella en un arco, y entra en su pecho
        const e = k * k * (3 - 2 * k)
        x = ret.x + (chest.x - ret.x) * e
        z = ret.z + (chest.z - ret.z) * e
        y = ret.y + (chest.y - ret.y) * e + Math.sin(k * Math.PI) * 1.6
        r.core.scale.setScalar(0.45)
        r.glow.scale.setScalar(1.3)
      } else {
        // y se queda a su lado, girando despacio a su alrededor
        const a = t * 0.9 + i * ((Math.PI * 2) / MAX)
        const grow = Math.min(1, (k - 1) * 2) // (sale de su pecho y se abre)
        const rad = 0.75 * grow
        x = chest.x + Math.cos(a) * rad
        z = chest.z + Math.sin(a) * rad
        y = chest.y + 0.5 * grow + Math.sin(t * 1.7 + i) * 0.12
        r.core.scale.setScalar(0.22)
        r.glow.scale.setScalar(0.7)
        r.light.intensity = 1.6 * grow
      }
      r.core.position.set(x, y, z)
      r.glow.position.set(x, y, z)
      r.light.position.set(x, y, z)
    })
  })

  return (
    <group>
      {refs.current.map((r, i) => (
        <group key={i}>
          <sprite ref={(el) => (r.core = el)} material={mat} visible={false} />
          <sprite ref={(el) => (r.glow = el)} material={halo} visible={false} />
          <pointLight ref={(el) => (r.light = el)} color="#ffd79a" distance={7} intensity={0} />
        </group>
      ))}
    </group>
  )
}
