import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Pt } from './recognizer'

/*
 * Una cinta de luz sobre el suelo que sigue una lista de puntos.
 * Se usa para el triángulo que dibuja el ser y para el trazo de la elfa.
 * (Las líneas de WebGL siempre miden 1 píxel; por eso es una tira de triángulos.)
 */
const MAX = 800

type Props = {
  /** Cada frame: los puntos y la opacidad (0 = invisible). */
  get: () => { pts: Pt[]; opacity: number; color?: string }
  color: string
  width?: number
  y?: number
}

export function Ribbon({ get, color, width = 0.22, y = 0.04 }: Props) {
  const mesh = useRef<THREE.Mesh>(null!)
  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const pos = new Float32Array(MAX * 2 * 3)
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    const idx: number[] = []
    for (let i = 0; i < MAX - 1; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geometry.setIndex(idx)
    geometry.setDrawRange(0, 0)
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    return { geometry, material }
  }, [color])

  useFrame(() => {
    const { pts, opacity, color: c } = get()
    material.opacity = opacity
    if (c) material.color.set(c)
    const n = Math.min(pts.length, MAX)
    mesh.current.visible = opacity > 0.005 && n > 1
    if (!mesh.current.visible) return
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(n - 1, i + 1)]
      let dx = b.x - a.x
      let dz = b.z - a.z
      const len = Math.hypot(dx, dz) || 1
      dx /= len
      dz /= len
      // perpendicular, y la cinta se afina en las puntas
      const taper = Math.min(1, i / 4, (n - 1 - i) / 4 + 0.35)
      const w = width * 0.5 * Math.max(0.25, taper)
      const p = pts[i]
      arr.set([p.x - dz * w, y, p.z + dx * w, p.x + dz * w, y, p.z - dx * w], i * 6)
    }
    attr.needsUpdate = true
    geometry.setDrawRange(0, (n - 1) * 6)
    geometry.computeBoundingSphere()
  })

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />
}
