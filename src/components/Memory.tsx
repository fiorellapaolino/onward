import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { CLIPS, cycleLength, makeSample, sampleAt, sampleCycle } from '../game/anim'
import { game } from '../game/state'
import { GIRL_TREE, buildHuts } from '../game/village'
import { GIRL_DIST, GIRL_S, GIRL_SIDE, besidePath } from '../game/config'
import { useGlowTexture } from './TheLight'

/*
 * El recuerdo de lo perdido: cuando la niña cuenta cómo era antes ("…cómo era antes",
 * "antes atrapaba las semillas…"), por un momento se ve: la aldea con color y luz cálida,
 * y figuras de luz jugando — ella misma de pequeña girando bajo su árbol con los brazos abiertos,
 * otros niños corriendo en ronda, una mujer que da palmas. Al terminar de hablar, se desvanece
 * y todo vuelve a ser gris. (game.memory: 0 = ahora, 1 = el recuerdo)
 */
const url = (p: string) => `${import.meta.env.BASE_URL}models/${p}.gltf`
export const PARTS = ['elf/body', 'girl/outfit', 'girl/hair']
export const WOMAN = ['elf/body', 'woman/outfit', 'woman/hair']
const BODY_H = 1.777 // altura del modelo original

// material de las figuras del recuerdo: luz cálida, medio transparente
const GHOST_MAT = new THREE.MeshStandardMaterial({
  color: '#ffe3b3',
  emissive: '#ffb347',
  emissiveIntensity: 1.3,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  roughness: 1,
})

export type Kind = 'spin' | 'run' | 'clap' | 'sit' | 'warm'
// show: cuánto se ve (0..1); si no se pasa, sigue al recuerdo de la niña (game.memory)
export type GhostSpec = { parts: string[]; height: number; kind: Kind; x: number; z: number; r?: number; off?: number; speed?: number; rot?: number; show?: () => number }

// dónde juega cada uno (alrededor del árbol de la niña, y una mujer junto a una casa)
const RING = besidePath(GIRL_S + 5.5, GIRL_SIDE, GIRL_DIST + 1.6)
const SPIN = besidePath(GIRL_S - 1.6, GIRL_SIDE, GIRL_DIST + 1.0)
const HUT = buildHuts()[1]
const GHOSTS: GhostSpec[] = [
  // ella, más pequeña, girando con los brazos abiertos mirando caer las semillas
  { parts: PARTS, height: 0.8, kind: 'spin', x: SPIN.x, z: SPIN.z },
  // dos niños corriendo en ronda
  { parts: PARTS, height: 0.85, kind: 'run', x: RING.x, z: RING.z, r: 1.6, off: 0, speed: 0.55 },
  { parts: PARTS, height: 0.9, kind: 'run', x: RING.x, z: RING.z, r: 1.6, off: Math.PI, speed: 0.55 },
  // una mujer en su puerta, dando palmas
  { parts: WOMAN, height: 1.08, kind: 'clap', x: HUT.x + Math.sin(HUT.rot) * (HUT.hz + 0.9), z: HUT.z + Math.cos(HUT.rot) * (HUT.hz + 0.9), rot: HUT.rot },
]

type Axis = 'up' | 'left' | 'fwd'

export function Memory() {
  return (
    <>
      {GHOSTS.map((g, i) => (
        <Ghost key={i} spec={g} />
      ))}
      <MemorySeeds />
    </>
  )
}

export function Ghost({ spec }: { spec: GhostSpec }) {
  const gltfs = useGLTF(spec.parts.map(url))
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const { model, bones, axes, sample, mat } = useMemo(() => {
    const mat = spec.show ? GHOST_MAT.clone() : GHOST_MAT // (con su propio "show", su propio material)
    const [b, ...rest] = gltfs.map((g) => cloneSkinned(g.scene))
    const extra: THREE.Object3D[] = []
    b.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh && (o.parent as THREE.Bone)?.isBone) extra.push(o)
    })
    extra.forEach((o) => o.removeFromParent())
    const model = new THREE.Group()
    model.add(b, ...rest)
    model.updateMatrixWorld(true)
    const bones: Record<string, THREE.Bone> = {}
    b.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone
    })
    for (const part of rest)
      part.traverse((o) => {
        const m = o as THREE.SkinnedMesh
        if (!m.isSkinnedMesh) return
        m.bind(new THREE.Skeleton(m.skeleton.bones.map((x) => bones[x.name] ?? x), m.skeleton.boneInverses), m.bindMatrix)
      })
    model.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.frustumCulled = false
      m.material = mat
    })
    const axes: Record<string, Record<Axis, THREE.Vector3>> = {}
    for (const [name, bn] of Object.entries(bones)) {
      const inv = bn.getWorldQuaternion(new THREE.Quaternion()).invert()
      axes[name] = {
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(inv),
        left: new THREE.Vector3(1, 0, 0).applyQuaternion(inv),
        fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(inv),
      }
    }
    if (spec.height < 1) bones.Head?.scale.setScalar(1.18)
    return { model, bones, axes, sample: makeSample(), mat }
  }, [gltfs, spec])
  const s = spec.height / BODY_H
  const Q = useMemo(() => new THREE.Quaternion(), [])

  useFrame(() => {
    const m = spec.show ? spec.show() : game.memory
    if (spec.show) mat.opacity = 0.7 * m
    root.current.visible = m > 0.01
    if (!root.current.visible) return
    const t = game.time
    const rot = (name: string, axis: Axis, a: number) => {
      const b = bones[name]
      if (b && a) b.quaternion.multiply(Q.setFromAxisAngle(axes[name][axis], a))
    }
    let x = spec.x
    let z = spec.z
    let yaw = spec.rot ?? 0
    if (spec.kind === 'run') {
      // corren en ronda (sentido antihorario), con el ciclo de correr
      const a = t * (spec.speed ?? 0.5) + (spec.off ?? 0)
      x = spec.x + Math.cos(a) * (spec.r ?? 2)
      z = spec.z + Math.sin(a) * (spec.r ?? 2)
      yaw = Math.atan2(-Math.sin(a), Math.cos(a)) // tangente del círculo
      const speed = (spec.speed ?? 0.5) * (spec.r ?? 2) // m/s
      sampleCycle(CLIPS.run, (t * speed) / (cycleLength(CLIPS.run) * s * 1.6) + (spec.off ?? 0), sample)
    } else sampleAt(CLIPS.idle, t + (spec.off ?? 0), sample)
    for (const [name, q] of Object.entries(sample.q)) if (q && bones[name]) bones[name].quaternion.copy(q)
    body.current.position.copy(sample.offset).multiplyScalar(spec.kind === 'run' ? s : 0)
    if (spec.kind === 'spin') {
      // gira despacio con los brazos abiertos, mirando arriba
      yaw = t * 1.6
      rot('upperarm_l', 'fwd', 1.1)
      rot('upperarm_r', 'fwd', -1.1)
      rot('neck_01', 'left', -0.25)
      rot('Head', 'left', -0.35)
    }
    if (spec.kind === 'clap') {
      // palmas: las manos se juntan y se separan delante del pecho
      const c = 0.5 + 0.5 * Math.sin(t * 7)
      rot('upperarm_l', 'left', -0.9)
      rot('upperarm_r', 'left', -0.9)
      rot('upperarm_l', 'fwd', -0.15 * c)
      rot('upperarm_r', 'fwd', 0.15 * c)
      rot('lowerarm_l', 'fwd', -1.4 - 0.3 * c)
      rot('lowerarm_r', 'fwd', 1.4 + 0.3 * c)
      rot('spine_01', 'fwd', 0.05 * Math.sin(t * 3.5))
    }
    let y = 0
    if (spec.kind === 'sit' || spec.kind === 'warm') {
      // sentados en el suelo alrededor del fuego, con las rodillas dobladas
      rot('thigh_l', 'left', -1.5)
      rot('thigh_r', 'left', -1.5)
      rot('calf_l', 'left', 1.6)
      rot('calf_r', 'left', 1.6)
      rot('spine_01', 'left', 0.15)
      y = -0.45 * spec.height
      if (spec.kind === 'warm') {
        // las manos hacia el fuego, calentándose
        rot('upperarm_l', 'left', -0.9)
        rot('upperarm_r', 'left', -0.9)
        rot('lowerarm_l', 'fwd', -0.5)
        rot('lowerarm_r', 'fwd', 0.5)
      } else {
        // las manos en las rodillas, se mece un poco
        rot('upperarm_l', 'left', -0.5)
        rot('upperarm_r', 'left', -0.5)
        rot('lowerarm_l', 'fwd', -1.0)
        rot('lowerarm_r', 'fwd', 1.0)
        rot('spine_01', 'fwd', 0.05 * Math.sin(t * 1.2 + (spec.off ?? 0)))
      }
    }
    root.current.position.set(x, y, z)
    root.current.rotation.y = yaw
  })

  return (
    <group ref={root} visible={false}>
      <group ref={body}>
        <primitive object={model} scale={s} />
      </group>
    </group>
  )
}

// semillas doradas cayendo en el recuerdo, y una luz cálida sobre el árbol
function MemorySeeds() {
  const tex = useGlowTexture()
  const mat = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, color: '#ffd98a', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    [tex],
  )
  const refs = useRef<(THREE.Sprite | null)[]>([])
  const light = useRef<THREE.PointLight>(null!)
  const seeds = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ a: i * 2.4, d: 0.5 + ((i * 37) % 10) / 4, p: 4 + (i % 5), o: i * 0.7 })), [])
  useFrame(() => {
    const m = game.memory
    // el material de las figuras también sigue al recuerdo
    GHOST_MAT.opacity = 0.7 * m
    mat.opacity = 0.9 * m
    light.current.intensity = 6 * m
    const t = game.time
    seeds.forEach((sd, i) => {
      const o = refs.current[i]
      if (!o) return
      o.visible = m > 0.01
      const u = ((t + sd.o) % sd.p) / sd.p
      const a = sd.a + u * 6
      o.position.set(GIRL_TREE.x + Math.cos(a) * sd.d, 4.4 * (1 - u) + 0.1, GIRL_TREE.z + Math.sin(a) * sd.d)
    })
  })
  return (
    <group>
      {seeds.map((_, i) => (
        <sprite key={i} ref={(el) => (refs.current[i] = el)} material={mat} scale={0.18} />
      ))}
      <pointLight ref={light} position={[GIRL_TREE.x, 3, GIRL_TREE.z]} color="#ffcf8a" distance={22} intensity={0} />
    </group>
  )
}

useGLTF.preload(PARTS.map(url))
useGLTF.preload(WOMAN.map(url))
