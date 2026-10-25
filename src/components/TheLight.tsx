import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PATH_LEN, clamp01, headingAt, pathAt } from '../game/config'
import { game } from '../game/state'

/** Textura redonda que se desvanece hacia los bordes (para halos de luz). */
export function useGlowTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])
}

const LIGHT_S = PATH_LEN + 10
const lightPos = pathAt(LIGHT_S).add(new THREE.Vector3(0, 2.4, 0))

/**
 * La luz cálida al fondo del bosque. Se ve desde el principio (atraviesa la niebla)
 * y crece a medida que la elfa se acerca. Es lo que la llama hacia adelante.
 */
export function TheLight() {
  const tex = useGlowTexture()
  const halo = useRef<THREE.Sprite>(null!)
  const core = useRef<THREE.Sprite>(null!)
  const light = useRef<THREE.PointLight>(null!)

  useFrame(() => {
    const g = game
    const near = clamp01(1 - (LIGHT_S - g.p) / LIGHT_S) // 0 al empezar, 1 al llegar
    const end = g.phase === 'end' ? Math.max(0, g.phaseT - 10) : 0
    const breathe = 1 + Math.sin(g.time * 1.2) * 0.06
    halo.current.scale.setScalar((14 + near * 30 + end * 12) * breathe)
    core.current.scale.setScalar((3 + near * 4 + end * 2) * breathe)
    light.current.intensity = near * near * 60 + end * 20
  })

  return (
    <group position={lightPos}>
      <sprite ref={halo}>
        <spriteMaterial map={tex} color="#ffd9a0" transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} toneMapped={false} opacity={0.7} />
      </sprite>
      <sprite ref={core}>
        <spriteMaterial map={tex} color="#fff6e6" transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} toneMapped={false} />
      </sprite>
      <pointLight ref={light} color="#ffd9a0" distance={60} intensity={0} />
    </group>
  )
}

/*
 * Al llegar a la luz, aparecen otros caminos luminosos que salen del claro
 * hacia lejos: siempre hay un paso más.
 */
const DOTS = 60
const PATHS = 5

export function OtherPaths() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#fff0cc', transparent: true, opacity: 0, fog: false, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  )

  useLayoutEffect(() => {
    const start = pathAt(LIGHT_S)
    const base = headingAt(LIGHT_S)
    const dummy = new THREE.Object3D()
    for (let k = 0; k < PATHS; k++) {
      const dir = base + (k - (PATHS - 1) / 2) * 0.55
      for (let i = 0; i < DOTS; i++) {
        const d = 6 + i * 2.6
        const bend = Math.sin(i * 0.12 + k) * 0.25
        dummy.position.set(start.x + Math.sin(dir + bend) * d, 0.15 + i * 0.05, start.z + Math.cos(dir + bend) * d)
        dummy.scale.setScalar(0.18 + (i % 3) * 0.03)
        dummy.updateMatrix()
        ref.current.setMatrixAt(k * DOTS + i, dummy.matrix)
      }
    }
    ref.current.instanceMatrix.needsUpdate = true
  }, [])

  useFrame(() => {
    const end = game.phase === 'end' ? Math.max(0, game.phaseT - 10) : 0
    material.opacity = clamp01(end / 3) * 0.9
  })

  return (
    <instancedMesh ref={ref} args={[undefined, material, PATHS * DOTS]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 10]} />
    </instancedMesh>
  )
}
