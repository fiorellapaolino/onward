import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { BIRTH_TIME, RISE_TIME, LOOK_BACK_TIME, clamp01, damp, headingAt, pathAt, smoothstep } from '../game/config'
import { game } from '../game/state'
import { CLIPS, blendInto, cycleLength, duration, makeSample, sampleAt, sampleCycle } from '../game/anim'

/*
 * La elfa: personaje de Quaternius (CC0) con esqueleto profesional.
 *   - body.gltf   → cuerpo base (solo cabeza, cuello y manos; el resto lo tapa la ropa)
 *   - outfit.gltf → ropa "Ranger" sin capucha ni hombrera
 *   - hair.gltf   → peinado de moños
 * Las tres piezas comparten el mismo esqueleto: la ropa y el pelo se "atan" a los huesos del cuerpo.
 * Las orejas de elfa se añaden aquí, pegadas al hueso de la cabeza.
 * Animaciones: captura de movimiento de Mixamo traspasada a este esqueleto (game/anim.ts).
 */
const BASE = `${import.meta.env.BASE_URL}models/elf/`
const BODY_URL = BASE + 'body.gltf'
const OUTFIT_URL = BASE + 'outfit.gltf'
const HAIR_URL = BASE + 'hair.gltf'

const HEIGHT = 1.15 // altura de la elfa en el mundo
const MODEL_HEIGHT = 1.777 // altura del modelo original (metros)
const WS = HEIGHT / MODEL_HEIGHT

const HAIR_COLOR = '#c0683e' // castaño cobrizo
const SKIN_COLOR = '#a76e4d'

const pos = new THREE.Vector3()
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const TMP_V = new THREE.Vector3()
const TMP_Q = new THREE.Quaternion()
const TMP_Q2 = new THREE.Quaternion()
const TMP_Q3 = new THREE.Quaternion()

// Rebote suave al final de una animación (para el "nacer")
const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
const smooth = (t: number) => t * t * (3 - 2 * t)
const SIDE_TURN = Math.PI / 2 // al nacer mira hacia su izquierda: la cámara la ve de perfil

/** Velocidad con la que cada hueso alcanza su pose (más bajo = más retraso, más suelto). */
const LAG: Record<string, number> = { neck_01: 14, Head: 12, hand_l: 12, hand_r: 12 }

/** Gira un hueso alrededor de un eje expresado en el espacio del mundo. */
function rotateBoneWorld(bone: THREE.Object3D, axisWorld: THREE.Vector3, angle: number) {
  bone.parent!.getWorldQuaternion(TMP_Q2)
  TMP_Q.setFromAxisAngle(axisWorld, angle)
  // local' = padre⁻¹ · giro · padre · local
  TMP_Q3.copy(TMP_Q2).invert().multiply(TMP_Q).multiply(TMP_Q2)
  bone.quaternion.premultiply(TMP_Q3)
}

/** Oreja de elfa: hoja alargada que apunta hacia fuera, arriba y atrás. */
function makeEar(side: 1 | -1, material: THREE.Material) {
  const geo = new THREE.ConeGeometry(0.024, 0.11, 10, 1)
  geo.translate(0, 0.055, 0) // la base en el origen
  geo.scale(1, 1, 0.35) // aplanada como una hoja
  const ear = new THREE.Mesh(geo, material)
  // dirección: hacia fuera (x), arriba y un poco hacia atrás
  const dir = new THREE.Vector3(0.85 * side, 0.45, -0.3).normalize()
  ear.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  ear.position.set(0.078 * side, 1.635, -0.01)
  return ear
}

export function Character() {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const anim = useRef({ phase: 0, move: 0, mago: 0, look: 0, lookT: 0, run: 0 })
  const S = useMemo(() => ({ base: makeSample(), tmp: makeSample(), tmp2: makeSample(), smooth: makeSample() }), [])

  const bodyG = useGLTF(BODY_URL)
  const outfitG = useGLTF(OUTFIT_URL)
  const hairG = useGLTF(HAIR_URL)

  // Montaje: cuerpo + ropa + pelo sobre un solo esqueleto, y orejas en la cabeza
  const { model, bones } = useMemo(() => {
    const model = new THREE.Group()
    model.add(bodyG.scene, outfitG.scene, hairG.scene)
    model.updateMatrixWorld(true)

    // huesos del cuerpo, por nombre
    const bones: Record<string, THREE.Bone> = {}
    bodyG.scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone
    })

    // la ropa y el pelo pasan a usar los huesos del cuerpo
    for (const part of [outfitG.scene, hairG.scene]) {
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
      const mat = m.material as THREE.MeshStandardMaterial
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace
      // el pelo y las cejas vienen en gris: les damos color
      if (mat.name.startsWith('MI_Hair')) mat.color.set(HAIR_COLOR)
    })

    // orejas de elfa pegadas al hueso de la cabeza
    const head = bones.Head
    const skin = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.75 })
    const headInv = head.matrixWorld.clone().invert()
    for (const side of [1, -1] as const) {
      const ear = makeEar(side, skin)
      ear.updateMatrix()
      ear.matrix.premultiply(headInv) // de "modelo" a "cabeza"
      ear.matrix.decompose(ear.position, ear.quaternion, ear.scale)
      head.add(ear)
    }

    model.scale.setScalar(WS)
    return { model, bones }
  }, [bodyG, outfitG, hairG])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game
    const a = anim.current

    // ── Posición y hacia dónde mira ─────────────────────────────
    pathAt(g.p, pos)
    root.current.position.copy(pos)
    let turn = 0
    if (g.lookBack > 0) {
      // Se gira a mirar atrás… y vuelve a mirar adelante
      const t = 1 - g.lookBack / LOOK_BACK_TIME
      turn = Math.sin(t * Math.PI) * Math.PI * 0.85
    }
    // Al empezar está de costado (la vemos de perfil); al incorporarse gira para mirar al camino
    const sideways =
      g.phase === 'intro' ? 1 : g.phase === 'rise' ? 1 - smooth(clamp01((g.phaseT - RISE_TIME * 0.45) / (RISE_TIME * 0.5))) : 0
    root.current.rotation.y = headingAt(g.p) + turn + SIDE_TURN * sideways

    // ── Nacer: crece desde la luz ──────────────────────────────
    const birth = g.phase === 'intro' ? clamp01(g.phaseT / BIRTH_TIME) : 1
    root.current.scale.setScalar(Math.max(0.001, easeOutBack(birth)))

    // ── Pesos de cada animación ────────────────────────────────
    a.move += (clamp01(g.speed / 0.6) - a.move) * damp(6, dt) // 0 quieta → 1 en marcha
    a.run += (smoothstep(1.5, 2.6, g.speed) - a.run) * damp(4, dt) // 0 camina → 1 corre

    // mirar alrededor: al empezar, y cuando se detiene a dudar (al 65%: el original gira mucho)
    const lookTarget = g.phase === 'look' || (g.phase === 'play' && (g.idle > 0.6 || g.blocked)) ? 0.65 : 0
    a.look += (lookTarget - a.look) * damp(3, dt)
    if (a.look > 0.01) a.lookT += dt
    else a.lookT = 0

    // al nacer está de rodillas (inicio de "Standing Up"); al empezar se levanta con esa animación
    const standW =
      g.phase === 'intro' ? 1 : g.phase === 'rise' ? 1 - smooth(clamp01((g.phaseT - RISE_TIME * 0.85) / (RISE_TIME * 0.15))) : 0

    // pose del Mago: al terminar de incorporarse alza el brazo, hasta que agarra las herramientas
    const magoTarget = (g.phase === 'rise' && g.phaseT > RISE_TIME * 0.8) || (g.phase === 'gather' && g.phaseT < 1.6) ? 1 : 0
    a.mago += (magoTarget - a.mago) * damp(3, dt)

    // ── Ritmo del paso: los pies avanzan lo mismo que ella (sin patinar) ──
    const cycle = cycleLength(CLIPS.walk) + (cycleLength(CLIPS.run) - cycleLength(CLIPS.walk)) * a.run
    a.phase += (g.speed * dt) / cycle

    // ── Mezcla ─────────────────────────────────────────────────
    const base = S.base
    sampleAt(CLIPS.idle, g.time, base)
    if (a.look > 0.001) blendInto(base, sampleAt(CLIPS.look, a.lookT, S.tmp), a.look)
    if (a.move > 0.001) {
      const loco = sampleCycle(CLIPS.walk, a.phase, S.tmp)
      if (a.run > 0.001) blendInto(loco, sampleCycle(CLIPS.run, a.phase, S.tmp2), a.run)
      blendInto(base, loco, a.move)
    }
    if (standW > 0.001) {
      const t = g.phase === 'rise' ? (g.phaseT / RISE_TIME) * duration(CLIPS.standup) : 0
      blendInto(base, sampleAt(CLIPS.standup, t, S.tmp), standW)
      // respira mientras espera de rodillas
      if (g.phase === 'intro') base.q.spine_02?.multiply(TMP_Q.setFromAxisAngle(X_AXIS, Math.sin(g.time * 1.7) * 0.03))
    }
    // al final levanta la mirada hacia la luz
    if (g.phase === 'end') base.q.Head?.multiply(TMP_Q.setFromAxisAngle(X_AXIS, -0.3 * clamp01(g.phaseT / 2)))

    // ── Aplicar a los huesos (cabeza y manos con algo de retraso) ──
    const snap = g.phase === 'intro'
    // (se suaviza en una copia aparte, para que la pose del Mago no se acumule frame a frame)
    for (const [name, q] of Object.entries(base.q)) {
      const bone = bones[name]
      const sm = S.smooth.q[name]
      if (!bone || !q || !sm) continue
      sm.slerp(q, snap ? 1 : damp(LAG[name] ?? 20, dt))
      bone.quaternion.copy(sm)
    }
    body.current.position.lerp(TMP_V.copy(base.offset).multiplyScalar(WS), snap ? 1 : damp(20, dt))

    // Pose del Mago: el brazo derecho se alza hacia el cielo y el izquierdo se abre un poco hacia abajo
    if (a.mago > 0.001) {
      root.current.updateMatrixWorld(true)
      const fwd = TMP_V.copy(Z_AXIS).applyQuaternion(root.current.quaternion)
      rotateBoneWorld(bones.upperarm_r, fwd, -2.5 * a.mago)
      rotateBoneWorld(bones.upperarm_l, fwd, 0.25 * a.mago)
    }

    // ── Su luz: crece con la confianza y destella en momentos clave
    const birthFlash = g.phase === 'intro' ? (1 - birth) * 8 : 0
    light.current.intensity = 1.2 + g.c * 3 + g.pulse * 6 + birthFlash
  })

  return (
    <group ref={root}>
      {/* su luz va por encima de la cabeza (si va delante de la cara, la "quema") */}
      <pointLight ref={light} position={[0, 2.3, -0.3]} color="#ffdcae" distance={9} intensity={1.2} />
      <group ref={body}>
        <primitive object={model} />
      </group>
    </group>
  )
}

useGLTF.preload(BODY_URL)
useGLTF.preload(OUTFIT_URL)
useGLTF.preload(HAIR_URL)
