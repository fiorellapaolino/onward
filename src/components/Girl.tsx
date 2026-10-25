import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { clamp01 } from '../game/config'
import { game } from '../game/state'
import { CLIPS, makeSample, sampleAt } from '../game/anim'
import { GIRL } from '../game/village'

/*
 * La niña de la aldea: el mismo cuerpo de Quaternius que la elfa, con ropa de campesina y pelo largo,
 * más pequeña y con la cabeza un poco más grande (proporciones de niña).
 * Está sentada al pie de su árbol abrazando sus rodillas, llorando.
 * Cuando la elfa se acerca, levanta la cabeza y la mira.
 *
 * La pose se ajustó con vistas previas (tools/girlpose.py): cada ajuste gira un hueso
 * alrededor de un eje "de la niña" (arriba, su izquierda, delante) en el espacio de ese hueso.
 */
const BODY_URL = `${import.meta.env.BASE_URL}models/elf/body.gltf`
const OUTFIT_URL = `${import.meta.env.BASE_URL}models/girl/outfit.gltf`
const HAIR_URL = `${import.meta.env.BASE_URL}models/girl/hair.gltf`

const HEIGHT = 0.8 // de pie mediría esto (la elfa mide 1.15)
const WS = HEIGHT / 1.777
const HEAD_SCALE = 1.18
const GROUND = 0.653 // en esta pose, lo más bajo del cuerpo está a esta altura (metros del modelo)
const HAIR_COLOR = '#4a2c1c'

type Axis = 'up' | 'left' | 'fwd'
// Sentada abrazando las rodillas, con la cabeza escondida
const POSE: [string, Axis, number][] = [
  ['thigh_l', 'left', -2.1],
  ['thigh_r', 'left', -2.1],
  ['calf_l', 'left', 2.5],
  ['calf_r', 'left', 2.5],
  ['spine_01', 'left', 0.25],
  ['spine_02', 'left', 0.2],
  ['neck_01', 'left', 0.35],
  ['Head', 'left', 0.45],
  ['upperarm_l', 'left', -1.2],
  ['upperarm_r', 'left', -1.2],
  ['upperarm_l', 'up', -0.1],
  ['upperarm_r', 'up', 0.1],
  ['lowerarm_l', 'fwd', -1.8],
  ['lowerarm_r', 'fwd', 1.8],
]

const TMP_Q = new THREE.Quaternion()

export function Girl() {
  const bodyG = useGLTF(BODY_URL)
  const outfitG = useGLTF(OUTFIT_URL)
  const hairG = useGLTF(HAIR_URL)
  const S = useMemo(() => ({ base: makeSample(), near: 0 }), [])
  const root = useRef<THREE.Group>(null!)

  const { model, bones, axes, posed } = useMemo(() => {
    // el cuerpo lo usa también la elfa: hay que clonarlo con su esqueleto
    const body = cloneSkinned(bodyG.scene)
    const outfit = cloneSkinned(outfitG.scene)
    const hair = cloneSkinned(hairG.scene)
    // (si la elfa ya se montó, su cuerpo lleva las orejas de elfa pegadas a la cabeza: la niña no)
    const extra: THREE.Object3D[] = []
    body.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh && (o.parent as THREE.Bone)?.isBone) extra.push(o)
    })
    extra.forEach((o) => o.removeFromParent())
    const model = new THREE.Group()
    model.add(body, outfit, hair)
    model.updateMatrixWorld(true)

    const bones: Record<string, THREE.Bone> = {}
    body.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone
    })
    for (const part of [outfit, hair]) {
      part.traverse((o) => {
        const m = o as THREE.SkinnedMesh
        if (!m.isSkinnedMesh) return
        const mapped = m.skeleton.bones.map((b) => bones[b.name] ?? b)
        m.bind(new THREE.Skeleton(mapped, m.skeleton.boneInverses), m.bindMatrix)
      })
    }
    model.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.frustumCulled = false
      const src = m.material as THREE.MeshStandardMaterial
      const mat = src.clone() // (el pelo de la elfa es cobrizo: no compartir material)
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace
      if (mat.name.startsWith('MI_Hair')) mat.color.set(HAIR_COLOR)
      m.material = mat
    })

    // ejes "de la niña" en el espacio de cada hueso, con el esqueleto en reposo
    const axes: Record<string, Record<Axis, THREE.Vector3>> = {}
    for (const [name, b] of Object.entries(bones)) {
      const inv = b.getWorldQuaternion(new THREE.Quaternion()).invert()
      axes[name] = {
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(inv),
        left: new THREE.Vector3(1, 0, 0).applyQuaternion(inv),
        fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(inv),
      }
    }

    // pose fija: primer frame de "estar de pie" + los ajustes de POSE
    const sample = sampleAt(CLIPS.idle, 0, makeSample())
    const posed: Record<string, THREE.Quaternion> = {}
    for (const [name, q] of Object.entries(sample.q)) if (q && bones[name]) posed[name] = q.clone()
    for (const [name, axis, angle] of POSE) {
      posed[name]?.multiply(TMP_Q.setFromAxisAngle(axes[name][axis], angle))
    }

    bones.Head?.scale.setScalar(HEAD_SCALE)
    model.scale.setScalar(WS)
    model.position.y = -GROUND * WS
    return { model, bones, axes, posed }
  }, [bodyG, outfitG, hairG])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game
    const t = g.time
    S.near += (g.girlNear - S.near) * (1 - Math.exp(-3 * dt))
    const near = S.near

    for (const [name, q] of Object.entries(posed)) bones[name].quaternion.copy(q)
    const rot = (name: string, axis: Axis, angle: number) => {
      const b = bones[name]
      if (b && angle) b.quaternion.multiply(TMP_Q.setFromAxisAngle(axes[name][axis], angle))
    }

    // respira
    rot('spine_02', 'left', 0.025 * Math.sin(t * 1.7))
    // sollozos: cada pocos segundos los hombros tiemblan (menos cuando la escuchan)
    const sobbing = g.story === 'help' ? 0.25 : g.story === 'talk' ? 0.4 : 1
    const burst = Math.pow(Math.max(0, Math.sin((t * Math.PI * 2) / 2.8)), 6)
    const shake = Math.sin(t * 24) * burst * sobbing
    rot('spine_03', 'left', 0.06 * shake)
    rot('Head', 'left', 0.04 * shake)

    // la elfa se acerca: se endereza un poco, levanta la cabeza y la mira
    const dx = g.x - GIRL.x
    const dz = g.z - GIRL.z
    let yaw = Math.atan2(dx, dz) - GIRL.rot
    yaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(yaw), Math.cos(yaw)), -1.1, 1.1)
    const up = clamp01(near)
    rot('spine_01', 'left', -0.15 * up)
    rot('neck_01', 'left', -0.3 * up)
    rot('Head', 'left', -0.5 * up)
    rot('neck_01', 'up', yaw * 0.4 * up)
    rot('Head', 'up', yaw * 0.5 * up)
  })

  return (
    <group ref={root} position={[GIRL.x, 0, GIRL.z]} rotation-y={GIRL.rot}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(OUTFIT_URL)
useGLTF.preload(HAIR_URL)
