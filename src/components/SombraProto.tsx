import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { damp, clamp01 } from '../game/config'
import { game } from '../game/state'
import { SITES, placeListener, sombra } from '../game/sombra'
import { useGlowTexture } from './TheLight'

/** La silueta de la sombra: cuerpo y cabeza, borrosos, de los pies (abajo) hacia lejos (arriba). */
export function useShadowTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 512
    const ctx = c.getContext('2d')!
    ctx.filter = 'blur(5px)'
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(52, 506)
    ctx.bezierCurveTo(30, 360, 28, 200, 44, 110)
    ctx.lineTo(84, 110)
    ctx.bezierCurveTo(100, 200, 98, 360, 76, 506)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(64, 64, 26, 44, 0, 0, Math.PI * 2)
    ctx.fill()
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])
}

const SHADOW_GEO = (() => {
  const g = new THREE.PlaneGeometry(1, 1)
  g.translate(0, 0.5, 0)
  g.rotateX(-Math.PI / 2) // tumbada: de los pies hacia -Z
  return g
})()

/** Su sombra oscura: siempre del lado contrario a la luz de lo que despertó. */
function GroundShadow() {
  const mesh = useRef<THREE.Mesh>(null!)
  const tex = useShadowTexture()
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#02030a', alphaMap: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.3 }), [tex])
  const life = useRef(0)
  const dir = useRef(new THREE.Vector2(0, 1))

  useFrame((_, dt) => {
    const g = game
    life.current += (sombra.count - life.current) * damp(0.8, dt)
    // la luz está en el centro de lo que despertó; antes de eso, una luz débil detrás, en el sendero
    let sx = 0
    let sz = 0
    let n = 0
    SITES.forEach((site, i) => {
      if (sombra.awakeAt[i] < 0) return
      sx += site.x
      sz += site.z
      n++
    })
    const wantX = n ? g.x - sx / n : 0
    const wantZ = n ? g.z - sz / n : 1
    const len = Math.hypot(wantX, wantZ) || 1
    const k = damp(1.5, dt)
    dir.current.x += (wantX / len - dir.current.x) * k
    dir.current.y += (wantZ / len - dir.current.y) * k
    const m = mesh.current
    m.position.set(g.x, 0.16, g.z) // (por encima de las piedras del camino)
    m.rotation.y = Math.atan2(-dir.current.x, -dir.current.y)
    m.scale.set(0.62 + life.current * 0.1, 1, 1 + life.current * 2.6)
    // late un poco cuando acaba de crecer, para inquietar
    const beat = Math.max(0, ...sombra.awakeAt.map((t) => (t < 0 ? 0 : 1 - clamp01((g.time - t) / 2))))
    mat.opacity = Math.min(0.92, 0.3 + life.current * 0.2 + beat * 0.15 * Math.abs(Math.sin(g.time * 4)))
  })

  return <mesh ref={mesh} geometry={SHADOW_GEO} material={mat} renderOrder={5} />
}

/** Un lugar dormido: apenas un brillo. Despierto: luz que ilumina el camino y queda atrás. */
function Site({ index }: { index: number }) {
  const site = SITES[index]
  const tex = useGlowTexture()
  const halo = useRef<THREE.Sprite>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const alive = useRef<THREE.Group>(null!)
  const pool = useRef<THREE.Mesh>(null)
  const haloMat = useMemo(() => new THREE.SpriteMaterial({ map: tex, color: site.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.1 }), [tex, site.color])
  const poolMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#07131d' }), [])
  const poolLit = useMemo(() => new THREE.Color(site.color), [site.color])

  useFrame(() => {
    const g = game
    const t = sombra.awakeAt[index]
    const k = t < 0 ? 0 : clamp01((g.time - t) / 2.5)
    const e = k * k * (3 - 2 * k)
    haloMat.opacity = t < 0 ? 0.1 + 0.05 * Math.sin(g.time * 1.3 + index) : 0.15 + 0.6 * e
    halo.current.scale.setScalar(1.6 + 8 * e)
    light.current.intensity = 70 * e
    alive.current.visible = t >= 0
    if (pool.current) poolMat.color.set('#07131d').lerp(poolLit, e * 0.85)
  })

  return (
    <group position={[site.x, 0, site.z]}>
      <sprite ref={halo} material={haloMat} position={[0, 1.2, 0]} />
      <pointLight ref={light} position={[0, 2.2, 0]} color={site.color} distance={26} intensity={0} />
      {site.kind === 'water' && (
        <mesh ref={pool} material={poolMat} rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
          <circleGeometry args={[1.5, 28]} />
        </mesh>
      )}
      <group ref={alive}>
        <Sparkles count={site.kind === 'crickets' ? 90 : 45} scale={[7, 4, 7]} position={[0, 1.6, 0]} size={5} speed={0.35} color={site.color} />
      </group>
    </group>
  )
}

export function SombraProto() {
  const camera = useThree((s) => s.camera)
  const fwd = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    camera.getWorldDirection(fwd)
    placeListener(camera.position.x, camera.position.y, camera.position.z, fwd.x, fwd.y, fwd.z)
  })
  return (
    <>
      <GroundShadow />
      {SITES.map((_, i) => (
        <Site key={i} index={i} />
      ))}
    </>
  )
}
