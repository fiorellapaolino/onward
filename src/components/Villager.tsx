import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { clamp01 } from '../game/config'
import { game } from '../game/state'
import { CLIPS, makeSample, sampleAt } from '../game/anim'
import { ELDER, GIRL, MUSICIAN } from '../game/village'
import { GIFT, elfHand, giftSeedPos, inGiftScene } from '../game/gift'

/*
 * La gente de la aldea. Usan los personajes de Quaternius (CC0) con ropa de campesino,
 * en una pose fija (sentados) a la que se suman pequeños gestos: respirar, temblar, sollozar,
 * levantar la cabeza y mirar a la elfa cuando se acerca.
 *
 * Cada pose se ajustó con vistas previas (tools/girlpose.py): cada ajuste gira un hueso
 * alrededor de un eje "de la persona" (arriba, su izquierda, delante) en el espacio de ese hueso.
 */
const url = (p: string) => `${import.meta.env.BASE_URL}models/${p}.gltf`

type Axis = 'up' | 'left' | 'fwd'
type Rot = (bone: string, axis: Axis, angle: number) => void

type Spec = {
  parts: string[] // el primero es el cuerpo
  scale: number // tamaño en el mundo respecto al modelo original
  headScale: number
  ground: number // en su pose, lo más bajo del cuerpo está a esta altura (metros del modelo)
  lift?: number // altura extra en el mundo (p. ej. sentado en un taburete)
  hairColor: string
  pose: [string, Axis, number][]
  spot: { x: number; z: number; rot: number }
  /** Si devuelve false, no se ve (p. ej. la mujer de la música, escondida en su casa). */
  visible?: () => boolean
  /** Gestos de cada frame. near = 0..1 cuánto se ha acercado la elfa; yaw = hacia dónde está ella. */
  gestures: (rot: Rot, t: number, near: number, yaw: number) => void
}

// ── La niña: sentada en una piedra al pie de su árbol, con las manos en el regazo y la cabeza baja ──
const GIRL_SPEC: Spec = {
  parts: ['elf/body', 'girl/outfit', 'girl/hair'],
  scale: 0.95 / 1.777, // de pie mediría 0.95 m (la elfa mide 1.15)
  headScale: 1.18, // cabeza algo más grande: proporciones de niña
  ground: 0.422, // los pies en el suelo; la piedra (Village.tsx) queda justo bajo ella
  hairColor: '#a8703c', // castaño claro: resalta en la aldea gris
  pose: [
    ['thigh_l', 'left', -1.5],
    ['thigh_r', 'left', -1.5],
    ['calf_l', 'left', 1.5],
    ['calf_r', 'left', 1.5],
    ['thigh_l', 'fwd', -0.06], // rodillas juntas
    ['thigh_r', 'fwd', 0.06],
    ['spine_01', 'left', 0.18],
    ['spine_02', 'left', 0.12],
    ['neck_01', 'left', 0.3],
    ['Head', 'left', 0.35],
    ['upperarm_l', 'left', -0.35],
    ['upperarm_r', 'left', -0.35],
    ['upperarm_l', 'fwd', 0.2],
    ['upperarm_r', 'fwd', -0.2],
    ['lowerarm_l', 'fwd', -1.2],
    ['lowerarm_r', 'fwd', 1.2],
  ],
  spot: GIRL,
  gestures: (rot, _t, near, yaw) => {
    // (quieta: sin temblores ni sollozos)
    if (inGiftScene() || game.giftAt >= 0) {
      // la escena de la semilla: mira la semilla en sus manos, la sigue mientras sube y luego mira a la elfa
      const k = game.time - game.giftAt
      if (k < GIFT.LOOK_EACH) giftSeedPos(k, elfHand(TMP_A), TMP_B)
      else TMP_B.set(game.x, 1.05, game.z) // la cara de la elfa
      const dx = TMP_B.x - GIRL.x
      const dz = TMP_B.z - GIRL.z
      let ty = Math.atan2(dx, dz) - GIRL.rot
      ty = THREE.MathUtils.clamp(Math.atan2(Math.sin(ty), Math.cos(ty)), -1.2, 1.2)
      const tp = THREE.MathUtils.clamp(Math.atan2(GIRL_FACE - TMP_B.y, Math.max(0.2, Math.hypot(dx, dz))), -1.1, 0.9)
      LOOK.yaw += (ty - LOOK.yaw) * 0.08
      LOOK.pitch += (tp - LOOK.pitch) * 0.08
      // (la pose base tiene la cabeza agachada 0.65: se compensa para mirar a donde toca)
      rot('neck_01', 'left', LOOK.pitch * 0.45 - 0.3)
      rot('Head', 'left', LOOK.pitch * 0.55 - 0.35)
      rot('neck_01', 'up', LOOK.yaw * 0.4)
      rot('Head', 'up', LOOK.yaw * 0.6)
      // sorpresa: al soltarla se echa hacia atrás y levanta los brazos; después queda contenta, más erguida
      const wow = Math.max(0, Math.min(1, (k - GIFT.RELEASE) / 0.5))
      const fall = k < GIFT.LOOK_EACH ? 1 : Math.max(0, 1 - (k - GIFT.LOOK_EACH) / 1.5)
      rot('spine_01', 'left', -0.2 * wow)
      rot('upperarm_l', 'left', -0.9 * wow * fall)
      rot('upperarm_r', 'left', -0.9 * wow * fall)
      rot('upperarm_l', 'fwd', 0.3 * wow * fall)
      rot('upperarm_r', 'fwd', -0.3 * wow * fall)
      return
    }
    // la elfa se acerca: se endereza un poco, levanta la cabeza y la mira
    rot('spine_01', 'left', -0.15 * near)
    rot('neck_01', 'left', -0.3 * near)
    rot('Head', 'left', -0.5 * near)
    rot('neck_01', 'up', yaw * 0.4 * near)
    rot('Head', 'up', yaw * 0.5 * near)
  },
}
const GIRL_FACE = 0.64 // altura de su cara (sentada en la piedra)
const LOOK = { yaw: 0, pitch: 0.6 }
const TMP_A = new THREE.Vector3()
const TMP_B = new THREE.Vector3()

// ── El anciano: sentado en un taburete junto a su puerta a oscuras, encorvado, con las manos en las rodillas ──
const ELDER_SPEC: Spec = {
  parts: ['elder/body', 'elder/outfit', 'elder/hair', 'elder/beard'],
  scale: 1.2 / 1.85, // de pie mediría 1.2 m
  headScale: 1,
  ground: 0.454,
  hairColor: '#d8d4cc', // canas
  pose: [
    ['thigh_l', 'left', -1.5],
    ['thigh_r', 'left', -1.5],
    ['calf_l', 'left', 1.5],
    ['calf_r', 'left', 1.5],
    ['spine_01', 'left', 0.25],
    ['spine_02', 'left', 0.2],
    ['spine_03', 'left', 0.1],
    ['neck_01', 'left', 0.2],
    ['Head', 'left', 0.1],
    ['upperarm_l', 'left', -0.6],
    ['upperarm_r', 'left', -0.6],
    ['lowerarm_l', 'fwd', -0.9],
    ['lowerarm_r', 'fwd', 0.9],
  ],
  spot: ELDER,
  gestures: (rot, _t, near, yaw) => {
    // (quieto: sin temblores)
    // cabeza baja… hasta que la elfa se acerca; cuando vuelve la luz, la levanta del todo
    const lookUp = Math.max(near, game.lightAwake ? 1 : 0)
    rot('Head', 'left', 0.35 * (1 - lookUp) - 0.15 * lookUp)
    rot('spine_02', 'left', -0.1 * lookUp)
    rot('neck_01', 'up', yaw * 0.35 * near)
    rot('Head', 'up', yaw * 0.45 * near)
  },
}

// ── La mujer de la música: escondida en su casa; cuando se atreve, sale a su puerta y toca ──
const MUSICIAN_SPEC: Spec = {
  parts: ['elf/body', 'woman/outfit', 'woman/hair'],
  scale: 1.08 / 1.777,
  headScale: 1,
  ground: -0.025,
  hairColor: '#3b2418',
  pose: [
    // manos juntas delante (como sosteniendo una flauta)
    ['upperarm_l', 'left', -0.5],
    ['upperarm_r', 'left', -0.5],
    ['lowerarm_l', 'fwd', -1.1],
    ['lowerarm_r', 'fwd', 1.1],
  ],
  spot: MUSICIAN,
  visible: () => game.freedAt >= 0,
  gestures: (rot, t, near, yaw) => {
    // se mece despacio con su música, y mira a la elfa
    const sway = game.freedAt >= 0 ? Math.sin((t - game.freedAt) * 2.6) * 0.05 : 0
    rot('spine_01', 'fwd', sway)
    rot('Head', 'fwd', -sway * 0.8)
    rot('neck_01', 'up', yaw * 0.35 * near)
    rot('Head', 'up', yaw * 0.45 * near)
  },
}

const TMP_Q = new THREE.Quaternion()

export const Musician = () => <Villager spec={MUSICIAN_SPEC} />
export const Girl = () => <Villager spec={GIRL_SPEC} nearKey="girlNear" />
export const Elder = () => <Villager spec={ELDER_SPEC} nearKey="elderNear" />

function Villager({ spec, nearKey }: { spec: Spec; nearKey?: 'girlNear' | 'elderNear' }) {
  const gltfs = useGLTF(spec.parts.map(url))
  const S = useMemo(() => ({ near: 0, yaw: 0 }), [])
  const root = useRef<THREE.Group>(null!)

  const { model, bones, axes, posed } = useMemo(() => {
    // los cuerpos se comparten (la elfa usa el mismo): hay que clonarlos con su esqueleto
    const [body, ...rest] = gltfs.map((g) => cloneSkinned(g.scene))
    // (si la elfa ya se montó, su cuerpo lleva las orejas de elfa pegadas a la cabeza: aquí no)
    const extra: THREE.Object3D[] = []
    body.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh && (o.parent as THREE.Bone)?.isBone) extra.push(o)
    })
    extra.forEach((o) => o.removeFromParent())

    const model = new THREE.Group()
    model.add(body, ...rest)
    model.updateMatrixWorld(true)

    const bones: Record<string, THREE.Bone> = {}
    body.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone
    })
    // la ropa y el pelo pasan a usar los huesos del cuerpo
    for (const part of rest) {
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
      const mat = (m.material as THREE.MeshStandardMaterial).clone() // (cada uno con su color de pelo)
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace
      if (mat.name.startsWith('MI_Hair')) mat.color.set(spec.hairColor)
      m.material = mat
    })

    // ejes "de la persona" en el espacio de cada hueso, con el esqueleto en reposo
    const axes: Record<string, Record<Axis, THREE.Vector3>> = {}
    for (const [name, b] of Object.entries(bones)) {
      const inv = b.getWorldQuaternion(new THREE.Quaternion()).invert()
      axes[name] = {
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(inv),
        left: new THREE.Vector3(1, 0, 0).applyQuaternion(inv),
        fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(inv),
      }
    }

    // pose fija: primer frame de "estar de pie" + los ajustes
    const sample = sampleAt(CLIPS.idle, 0, makeSample())
    const posed: Record<string, THREE.Quaternion> = {}
    for (const [name, q] of Object.entries(sample.q)) if (q && bones[name]) posed[name] = q.clone()
    for (const [name, axis, angle] of spec.pose) posed[name]?.multiply(TMP_Q.setFromAxisAngle(axes[name][axis], angle))

    bones.Head?.scale.setScalar(spec.headScale)
    model.scale.setScalar(spec.scale)
    model.position.y = -spec.ground * spec.scale + (spec.lift ?? 0)
    return { model, bones, axes, posed }
  }, [gltfs, spec])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game
    if (spec.visible) {
      root.current.visible = spec.visible()
      if (!root.current.visible) return
    }
    const nearT = nearKey ? g[nearKey] : Math.hypot(g.x - spec.spot.x, g.z - spec.spot.z) < 5 ? 1 : 0
    S.near += (nearT - S.near) * (1 - Math.exp(-3 * dt))

    for (const [name, q] of Object.entries(posed)) bones[name].quaternion.copy(q)
    const rot: Rot = (name, axis, angle) => {
      const b = bones[name]
      if (b && angle) b.quaternion.multiply(TMP_Q.setFromAxisAngle(axes[name][axis], angle))
    }
    // hacia dónde está la elfa, desde su punto de vista (positivo = a su izquierda)
    let yaw = Math.atan2(g.x - spec.spot.x, g.z - spec.spot.z) - spec.spot.rot
    yaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(yaw), Math.cos(yaw)), -1.1, 1.1)
    S.yaw += (yaw - S.yaw) * (1 - Math.exp(-2.5 * dt)) // (gira la cabeza despacio, sin saltos)
    spec.gestures(rot, g.time, clamp01(S.near), S.yaw)
  })

  return (
    <group ref={root} position={[spec.spot.x, 0, spec.spot.z]} rotation-y={spec.spot.rot}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(GIRL_SPEC.parts.map(url))
useGLTF.preload(ELDER_SPEC.parts.map(url))
useGLTF.preload(MUSICIAN_SPEC.parts.map(url))
