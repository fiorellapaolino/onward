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

/**
 * El vacío del plano negativo (ver Altar.tsx): ahí no se dibuja lo que está bajo (hierba, flores, piedras del camino).
 * x = z cercana, y = z lejana, z = centro x, w = medio ancho; top = altura hasta la que se esconde; on = 1 en el plano negativo.
 */
export const voidUniforms = {
  uVoid: { value: new THREE.Vector4(0, 0, 0, 0) },
  uVoidTop: { value: 0 },
  uVoidOn: { value: 0 },
}
export function hideInVoid(mat: THREE.Material) {
  if (mat.userData.voidHook) return
  mat.userData.voidHook = true
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer)
    Object.assign(shader.uniforms, voidUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVoidW;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 voidP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          voidP = instanceMatrix * voidP;
        #endif
        vVoidW = (modelMatrix * voidP).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVoidW;\nuniform vec4 uVoid;\nuniform float uVoidTop;\nuniform float uVoidOn;')
      .replace(
        'void main() {',
        `void main() {
        // (el borde del pozo, irregular: el suelo sobresale un poco, como tierra rota)
        float voidLip = fract(sin(floor(vVoidW.x * 2.7) * 12.9898) * 43758.5453) * 0.28;
        if (uVoidOn > 0.5 && vVoidW.z < uVoid.x - voidLip && vVoidW.z > uVoid.y + voidLip && abs(vVoidW.x - uVoid.z) < uVoid.w && vVoidW.y < uVoidTop) discard;`,
      )
  }
  mat.customProgramCacheKey = () => 'void-hook'
  mat.needsUpdate = true
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
        // hojas y flores recortadas (alphaTest): con antialiasing en el borde, no titilan de lejos al moverse
        const mat = mesh.material as THREE.MeshStandardMaterial
        if (mat.alphaTest > 0 && !mat.alphaToCoverage) {
          mat.alphaToCoverage = true
          mat.needsUpdate = true
        }
        if (mat.map && mat.map.anisotropy < 4) mat.map.anisotropy = 4
        hideInVoid(mat)
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
export function InstancedModel({ url, matrices, castShadow = false, receiveShadow = false }: { url: string; matrices: THREE.Matrix4[]; castShadow?: boolean; receiveShadow?: boolean }) {
  const parts = useModelParts(url)
  return (
    <>
      {parts.map((part, i) => (
        <StaticPart key={i} part={part} matrices={matrices} castShadow={castShadow} receiveShadow={receiveShadow} />
      ))}
    </>
  )
}

function StaticPart({ part, matrices, castShadow, receiveShadow }: { part: Part; matrices: THREE.Matrix4[]; castShadow: boolean; receiveShadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = ref.current
    matrices.forEach((mx, i) => m.setMatrixAt(i, tmp.multiplyMatrices(mx, part.matrix)))
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [matrices, part])
  return <instancedMesh ref={ref} args={[part.geometry, part.material, matrices.length]} castShadow={castShadow} receiveShadow={receiveShadow} />
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
          receiveShadow
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
