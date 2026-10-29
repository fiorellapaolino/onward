import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { rng } from '../game/config'
import { game } from '../game/state'
import { fearM, spiritLung } from '../game/fear'
import { useGlowTexture } from './TheLight'

/*
 * El miedo en el bosque (game/fear.ts):
 *   - un anillo de oscuridad alrededor de la elfa, que se cierra (fearM.R)
 *   - el ser de fuego: una llamita delante de ella que respira (crece y se achica);
 *     al terminar, vuela a su pecho y desaparece dentro de su luz
 */
const PUFFS = 64

export function FearMoment() {
  const tex = useGlowTexture()
  const dark = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#09080e', transparent: true, opacity: 0, depthWrite: false, fog: false }),
    [tex],
  )
  const flame = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ffb347', transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }),
    [tex],
  )
  const core = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#fff1c8', transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }),
    [tex],
  )
  const puffs = useMemo(() => {
    const r = rng(1313)
    return Array.from({ length: PUFFS }, (_, i) => ({ a: (i / PUFFS) * Math.PI * 2 + r() * 0.2, y: 0.2 + r() * 2.8, size: 1.8 + r() * 2.2, ph: r() * 6.28, out: r() * 1.5 }))
  }, [])
  const refs = useRef<(THREE.Sprite | null)[]>([])
  const spirit = useRef<THREE.Group>(null!)
  const flameS = useRef<THREE.Sprite>(null!)
  const coreS = useRef<THREE.Sprite>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const R = useRef(9)
  const show = useRef(0)
  const sp = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game
    const f = fearM
    const t = g.time
    // la oscuridad: aparece al empezar y, al terminar, se abre hacia afuera y se disuelve
    const target = f.on ? 1 : 0
    show.current += (target - show.current) * Math.min(1, dt * (f.on ? 1.2 : 0.8))
    R.current += ((f.on ? f.R : 14) - R.current) * Math.min(1, dt * (f.on ? 3 : 0.7))
    dark.opacity = 0.9 * show.current
    puffs.forEach((p, i) => {
      const s = refs.current[i]
      if (!s) return
      s.visible = show.current > 0.01
      if (!s.visible) return
      const a = p.a + t * 0.12
      const r = R.current + p.out + Math.sin(t * 0.9 + p.ph) * 0.3
      s.position.set(g.x + Math.cos(a) * r, p.y + Math.sin(t * 0.7 + p.ph) * 0.2, g.z + Math.sin(a) * r)
      s.scale.setScalar(p.size * (1 + Math.sin(t * 1.3 + p.ph) * 0.1))
    })

    // el ser de fuego
    const born = f.spiritAt >= 0 ? Math.min(1, (t - f.spiritAt) / 1.2) : 0
    const merge = f.done ? Math.min(1, (t - f.doneAt) / 1.6) : 0
    const vis = born * (1 - merge)
    spirit.current.visible = vis > 0.01
    if (!spirit.current.visible) {
      light.current.intensity = 0
      return
    }
    // delante de ella, a la altura del pecho; al final vuela hacia su pecho
    const d = 1.25 * (1 - merge * merge)
    // (un poco a un lado y en alto, para que se vea por encima de su hombro)
    const side = 0.6 * (1 - merge)
    sp.set(g.x + Math.sin(g.yaw) * d + Math.cos(g.yaw) * side, 1.55 + Math.sin(t * 2) * 0.06 * (1 - merge) - merge * 0.8, g.z + Math.cos(g.yaw) * d - Math.sin(g.yaw) * side)
    spirit.current.position.copy(sp)
    const lung = f.done ? 1 : spiritLung() // crece al inhalar, se achica al exhalar
    const size = 0.45 + lung * 0.7
    flameS.current.scale.set(size, size * 1.35, 1)
    coreS.current.scale.setScalar(size * 0.45)
    flame.opacity = 0.9 * vis
    core.opacity = vis
    light.current.intensity = (1.2 + lung * 2.2) * vis
  })

  return (
    <group>
      {puffs.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          material={dark}
          visible={false}
        />
      ))}
      <group ref={spirit} visible={false}>
        <sprite ref={flameS} material={flame} />
        <sprite ref={coreS} material={core} />
        <pointLight ref={light} color="#ffb357" distance={6} intensity={0} />
      </group>
    </group>
  )
}
