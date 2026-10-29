import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { pathAt, rng, sideAt } from '../game/config'
import { game } from '../game/state'
import { useGlowTexture } from './TheLight'

/*
 * La oscuridad que la persigue por detrás en el bosque oscuro: una masa de humo negro
 * que avanza por el sendero detrás de ella (game.chaseZ). Como la elfa nunca se da vuelta,
 * solo se la ve en el espejo… y se la oye acercarse.
 */
type Puff = { lat: number; back: number; y: number; size: number; phase: number; speed: number }

export function DarkChase() {
  const tex = useGlowTexture()
  const puffs = useMemo(() => {
    const r = rng(4242)
    return Array.from({ length: 46 }, (): Puff => ({
      lat: (r() - 0.5) * 9,
      back: r() * 4,
      y: 0.3 + r() * 3.2,
      size: 1.6 + r() * 2.6,
      phase: r() * 6.28,
      speed: 0.3 + r() * 0.5,
    }))
  }, [])
  const material = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#0b0a12', transparent: true, opacity: 0, depthWrite: false, fog: false }),
    [tex],
  )
  const refs = useRef<(THREE.Sprite | null)[]>([])
  const P = useMemo(() => new THREE.Vector3(), [])
  const S = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const g = game
    const on = g.chaseZ >= 0 && g.phase === 'play'
    material.opacity = on ? 0.85 : 0
    if (!on) return
    const t = g.time
    puffs.forEach((p, i) => {
      const s = refs.current[i]
      if (!s) return
      // (el frente avanza hacia ella, con lenguas de humo que se adelantan y vuelven)
      const z = g.chaseZ - p.back + Math.sin(t * p.speed * 1.7 + p.phase) * 0.6
      pathAt(z, P)
      sideAt(z, S)
      s.position.set(P.x + S.x * p.lat, p.y + Math.sin(t * p.speed + p.phase) * 0.25, P.z + S.z * p.lat)
      s.scale.setScalar(p.size * (1 + Math.sin(t * p.speed * 2 + p.phase) * 0.12))
    })
  })

  return (
    <>
      {puffs.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          material={material}
        />
      ))}
    </>
  )
}
