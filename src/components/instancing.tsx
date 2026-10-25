import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

/*
 * Herramientas para dibujar muchas copias de un mismo modelo (árboles, hierba…)
 * de forma eficiente: una sola "InstancedMesh" por pieza del modelo.
 */

export type Part = {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  matrix: THREE.Matrix4 // posición de la pieza dentro del modelo
}

/** Devuelve las piezas (geometría + material) de un modelo glTF. */
export function useModelParts(url: string): Part[] {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    scene.updateMatrixWorld(true)
    const parts: Part[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        parts.push({
          geometry: mesh.geometry,
          material: mesh.material as THREE.Material,
          matrix: mesh.matrixWorld.clone(),
        })
      }
    })
    return parts
  }, [scene])
}

const tmp = new THREE.Matrix4()

/** Copias fijas de un modelo, una por cada matriz. */
export function InstancedModel({ url, matrices }: { url: string; matrices: THREE.Matrix4[] }) {
  const parts = useModelParts(url)
  return (
    <>
      {parts.map((part, i) => (
        <StaticPart key={i} part={part} matrices={matrices} />
      ))}
    </>
  )
}

function StaticPart({ part, matrices }: { part: Part; matrices: THREE.Matrix4[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = ref.current
    matrices.forEach((mx, i) => m.setMatrixAt(i, tmp.multiplyMatrices(mx, part.matrix)))
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [matrices, part])
  return <instancedMesh ref={ref} args={[part.geometry, part.material, matrices.length]} />
}

export type SetInstance = (i: number, matrix: THREE.Matrix4, brightness?: number) => void

/**
 * Copias de un modelo que cambian cada frame (aparecer, crecer, deshacerse).
 * `onFrame` recibe una función para colocar cada copia; el brillo > 1 la hace resplandecer.
 */
export function DynamicModel({ url, count, onFrame }: { url: string; count: number; onFrame: (set: SetInstance) => void }) {
  const parts = useModelParts(url)
  const refs = useRef<THREE.InstancedMesh[]>([])

  useFrame(() => {
    const set: SetInstance = (i, matrix, brightness = 1) => {
      parts.forEach((part, k) => {
        const mesh = refs.current[k]
        if (!mesh) return
        mesh.setMatrixAt(i, tmp.multiplyMatrices(matrix, part.matrix))
        mesh.setColorAt(i, _c.setScalar(brightness))
      })
    }
    onFrame(set)
    refs.current.forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
  })

  return (
    <>
      {parts.map((part, k) => (
        <instancedMesh
          key={k}
          ref={(el) => {
            if (el) refs.current[k] = el
          }}
          args={[part.geometry, part.material, count]}
          frustumCulled={false}
        />
      ))}
    </>
  )
}
const _c = new THREE.Color()

/** Convierte posición + giro + escala en una matriz. */
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()
export function placeMatrix(x: number, y: number, z: number, rotY: number, scale: number, out = new THREE.Matrix4()) {
  _p.set(x, y, z)
  _q.setFromEuler(_e.set(0, rotY, 0))
  _s.setScalar(scale)
  return out.compose(_p, _q, _s)
}
