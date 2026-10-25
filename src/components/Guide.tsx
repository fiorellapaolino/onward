import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PATH_LEN, damp, pathAt } from '../game/config'
import { game } from '../game/state'
import { ELDER, GIRL, PLATES, SEED_SPOT } from '../game/village'
import { inGiftScene } from '../game/gift'
import { useGlowTexture } from './TheLight'

/*
 * La lucecita guía: una pequeña luz que va siempre un poco por delante de la elfa,
 * hacia lo siguiente que importa (la niña, el círculo bajo su árbol, el anciano, la plaza, el camino).
 * Así el jugador sabe adónde ir sin leer nada.
 *
 * Cada vez que aparece algo nuevo que hacer, la luz se adelanta, vuela hasta allí y se queda
 * flotando un momento (una pausa: "mira, es aquí"), y después vuelve a acompañarla.
 */
type Target = { key: string; x: number; z: number; y: number; near: number } | null

function currentTarget(): Target {
  const g = game
  if (g.phase !== 'play' || g.talk || inGiftScene()) return null
  switch (g.story) {
    case 'seek':
      return { key: 'girl', x: GIRL.x, z: GIRL.z, y: 1.1, near: 2.2 }
    case 'seed':
      if (g.giftAt >= 0) return null
      return g.carrying
        ? { key: 'give', x: GIRL.x, z: GIRL.z, y: 1.1, near: 1.6 }
        : { key: 'spot', x: SEED_SPOT.x, z: SEED_SPOT.z, y: 0.9, near: 0.9 }
    case 'help':
      return { key: 'elder', x: ELDER.x, z: ELDER.z, y: 1.3, near: 2.2 }
    case 'plates': {
      if (g.time - g.shadowAt < 3) return null // (primero, que vea nacer a su sombra)
      const i = g.plates[0] ? 1 : 0
      return { key: 'plate' + i, x: PLATES[i].x, z: PLATES[i].z, y: 0.8, near: 0.7 }
    }
    case 'next':
      if (!g.shadowOpen) return null // (mira cómo se enciende la aldea)
      return { key: 'onward', x: pathAt(PATH_LEN).x, z: PATH_LEN, y: 1.5, near: 0 }
    default:
      return null // (con miedo: no hay adónde ir, hay que quedarse)
  }
}

const TMP = new THREE.Vector3()
const WANT = new THREE.Vector3()
const TRAIL = 7

export function Guide() {
  const tex = useGlowTexture()
  const core = useRef<THREE.Sprite>(null!)
  const halo = useRef<THREE.Sprite>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const trail = useRef<(THREE.Sprite | null)[]>([])
  const mats = useMemo(
    () => ({
      core: new THREE.SpriteMaterial({ map: tex, color: '#fffaf0', transparent: true, opacity: 0, depthWrite: false }),
      halo: new THREE.SpriteMaterial({ map: tex, color: '#ffc95e', transparent: true, opacity: 0, depthWrite: false }),
      trail: new THREE.SpriteMaterial({ map: tex, color: '#ffe7b0', transparent: true, opacity: 0, depthWrite: false }),
    }),
    [tex],
  )
  const s = useRef({ pos: new THREE.Vector3(), key: '', shownAt: -99, vis: 0, init: false, hist: [] as THREE.Vector3[] })

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game
    const st = s.current
    const tg = currentTarget()
    if (!st.init) {
      st.init = true
      st.pos.set(g.x, 1.4, g.z)
      for (let i = 0; i < TRAIL * 2; i++) st.hist.push(st.pos.clone())
    }
    // algo nuevo que hacer: la luz vuela hasta allí y espera un momento (una pausa para mostrarlo)
    if (tg && tg.key !== st.key) {
      st.key = tg.key
      st.shownAt = g.time
    }
    if (!tg) st.key = ''

    const t = g.time
    let show = 0
    if (tg) {
      const d = Math.hypot(tg.x - g.x, tg.z - g.z)
      const showing = t - st.shownAt < 3.2 && d > 4 && d < 26 // vuela allí y se queda flotando
      if (showing) {
        WANT.set(tg.x, tg.y + 0.3, tg.z)
      } else if (d > 8 && tg.z - g.z > 6) {
        // lejos y hacia delante: va unos pasos por delante, siguiendo el sendero
        const p = pathAt(Math.min(g.z + 3.4, tg.z), TMP)
        WANT.set(p.x + Math.sin(t * 0.7) * 0.5, 1.35, p.z)
      } else {
        // cerca: entre ella y el sitio, invitándola a acercarse
        const k = Math.min(2.6, Math.max(0, d - tg.near)) / Math.max(d, 1e-3)
        WANT.set(g.x + (tg.x - g.x) * k, 1.25, g.z + (tg.z - g.z) * k)
        if (d < tg.near + 0.6) WANT.set(tg.x, tg.y + 0.4, tg.z) // ya llegó: se queda encima, suave
      }
      // si ya está ahí, la luz se aparta y se atenúa (no estorba)
      show = d < tg.near + 0.6 ? 0.35 : 1
    } else {
      WANT.set(g.x, 1.5, g.z)
    }
    WANT.y += Math.sin(t * 2.1) * 0.12
    st.pos.lerp(WANT, damp(t - st.shownAt < 3.2 ? 1.6 : 2.4, dt))
    st.vis += (show - st.vis) * damp(2, dt)

    // la estela: las últimas posiciones
    st.hist.unshift(st.hist.pop()!.copy(st.pos))
    const v = st.vis
    // late suave, y más fuerte mientras muestra el sitio nuevo
    const beat = 0.75 + 0.25 * Math.sin(t * 3.2) + (t - st.shownAt < 3.2 ? 0.3 : 0)
    core.current.position.copy(st.pos)
    halo.current.position.copy(st.pos)
    light.current.position.copy(st.pos)
    mats.core.opacity = v * 0.95
    mats.halo.opacity = v * 0.55 * beat
    mats.trail.opacity = v * 0.5
    halo.current.scale.setScalar(1.1 * beat)
    light.current.intensity = v * 0.9
    trail.current.forEach((o, i) => {
      if (!o) return
      const h = st.hist[Math.min(st.hist.length - 1, (i + 1) * 2 - 1)] ?? st.pos
      o.position.copy(h)
      o.scale.setScalar(0.3 * (1 - (i + 1) / (TRAIL + 1)))
    })
    core.current.visible = halo.current.visible = v > 0.01
    trail.current.forEach((o) => o && (o.visible = v > 0.01))
  })

  return (
    <group>
      <sprite ref={core} material={mats.core} scale={0.38} />
      <sprite ref={halo} material={mats.halo} scale={0.9} />
      {Array.from({ length: TRAIL }, (_, i) => (
        <sprite key={i} ref={(el) => (trail.current[i] = el)} material={mats.trail} />
      ))}
      <pointLight ref={light} color="#ffdca0" distance={5} intensity={0} />
    </group>
  )
}
