import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { BIRTH_TIME, RISE_TIME, LOOK_BACK_TIME, clamp01, damp, headingAt, pathAt, smoothstep } from '../game/config'
import { game } from '../game/state'
import { rigElf, type BoneName, type Rig } from '../game/rig'
import { CLIPS, blendInto, cycleLength, duration, makeSample, sampleAt, sampleCycle, type Sample } from '../game/anim'

// Modelo: "Forest Enchantress" de Padarozhnik (CC BY 4.0) — ver CREDITS.md
// Versión optimizada para web (~40k triángulos, textura 1024).
// El esqueleto se le pone al cargar (ver game/rig.ts).
// Animaciones: captura de movimiento de Mixamo traspasada a su esqueleto (ver game/anim.ts),
// mezcladas aquí según lo que esté haciendo, más la postura del niño y la pose del Mago.
const MODEL_URL = `${import.meta.env.BASE_URL}models/enchantress.glb`
const HEIGHT = 1.15 // altura de la elfa en el mundo
const MODEL_TO_WORLD = HEIGHT / 1.99 // el modelo original mide 1.99 unidades

const pos = new THREE.Vector3()

// Rebote suave al final de una animación (para el "nacer")
const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
const smooth = (t: number) => t * t * (3 - 2 * t)
const SIDE_TURN = Math.PI / 2 // al nacer mira hacia su izquierda: la cámara la ve de perfil

type Euler3 = [number, number, number]
const toQuat = (e: Euler3) => new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]))

/** Postura del niño (balasana). Ángulos probados en una vista previa del modelo. */
const CHILD_POSE: Partial<Record<BoneName, Euler3>> = {
  hips: [0, 0, 0],
  spine: [1.3, 0, 0],
  chest: [1.0, 0, 0],
  neck: [0.2, 0, 0],
  head: [0.1, 0, 0],
  thighL: [-1.5, 0, 0],
  thighR: [-1.5, 0, 0],
  shinL: [2.9, 0, 0],
  shinR: [2.9, 0, 0],
  footL: [1.0, 0, 0],
  footR: [1.0, 0, 0],
  upperArmL: [-3.4, 0, -0.2],
  upperArmR: [-3.4, 0, 0.2],
  foreArmL: [0, 0, 0],
  foreArmR: [0, 0, 0],
  handL: [0, 0, 0],
  handR: [0, 0, 0],
}
const CHILD_DROP = 0.606 // cuánto baja la cadera en esa postura (unidades del modelo)

/** Pose del Mago: brazo derecho en alto, el izquierdo hacia abajo y algo abierto. */
const MAGO_POSE: Partial<Record<BoneName, Euler3>> = {
  upperArmR: [-0.25, 0, -2.2],
  foreArmR: [-0.15, 0, 0],
  handR: [0, 0, 0],
  upperArmL: [0.1, 0, -0.15],
  foreArmL: [0, 0, 0],
}

function poseSample(pose: Partial<Record<BoneName, Euler3>>, offsetY = 0): Sample {
  const s = makeSample()
  for (const [name, e] of Object.entries(pose)) {
    s.q[name as BoneName] = toQuat(e as Euler3)
  }
  s.offset.set(0, offsetY, 0)
  return s
}
const CHILD = poseSample(CHILD_POSE, -CHILD_DROP)
const MAGO = poseSample(MAGO_POSE)

/** Velocidad con la que cada hueso alcanza su pose (más bajo = más retraso, más suelto). */
const LAG: Partial<Record<BoneName, number>> = {
  neck: 12,
  head: 8,
  foreArmL: 14,
  foreArmR: 14,
  handL: 10,
  handR: 10,
}

const X_AXIS = new THREE.Vector3(1, 0, 0)
const TMP_V = new THREE.Vector3()
const TMP_Q = new THREE.Quaternion()

export function Character() {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const anim = useRef({ phase: 0, move: 0, mago: 0, look: 0, lookT: 0, run: 0 })
  // muelles del pelo y la falda: [ángulo x, velocidad x, ángulo z, velocidad z]
  const springs = useRef<Record<string, [number, number, number, number]>>({})
  // muestras reutilizables (para no crear objetos cada frame)
  const S = useMemo(() => ({ base: makeSample(), tmp: makeSample(), tmp2: makeSample() }), [])

  const { scene } = useGLTF(MODEL_URL)

  // Copia del modelo con esqueleto, escalada para que mida HEIGHT y con los pies en el suelo
  const { model, rig } = useMemo(() => {
    const s = scene.clone(true)
    let rig = null as Rig | null
    s.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh && !rig) {
        // Al optimizarlo se quedó sin "normales" (hacia dónde mira cada cara): las recalculamos
        const geo = mesh.geometry.clone()
        if (!geo.getAttribute('normal')) geo.computeVertexNormals()
        const old = mesh.material as THREE.MeshBasicMaterial
        if (old.map) old.map.colorSpace = THREE.SRGBColorSpace
        const material = new THREE.MeshStandardMaterial({ map: old.map, roughness: 0.8, metalness: 0, side: THREE.DoubleSide })
        rig = rigElf(new THREE.Mesh(geo, material))
        rig.mesh.position.copy(mesh.position)
        rig.mesh.quaternion.copy(mesh.quaternion)
        rig.mesh.scale.copy(mesh.scale)
        mesh.parent!.add(rig.mesh)
        mesh.visible = false
      }
    })
    const box = new THREE.Box3().setFromObject(s)
    const scale = HEIGHT / (box.max.y - box.min.y)
    s.scale.setScalar(scale)
    s.position.y = -box.min.y * scale
    return { model: s, rig: rig! }
  }, [scene])

  /** Muelle amortiguado: el hueso tiende al objetivo, se pasa un poco y vuelve. */
  const spring = (name: BoneName, tx: number, tz: number, stiff: number, dampK: number, dt: number) => {
    const st = (springs.current[name] ??= [0, 0, 0, 0])
    const steps = 2 // dos pasos pequeños por frame: más estable
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      st[1] += (stiff * (tx - st[0]) - dampK * st[1]) * h
      st[0] += st[1] * h
      st[3] += (stiff * (tz - st[2]) - dampK * st[3]) * h
      st[2] += st[3] * h
    }
    rig.bones[name].rotation.set(st[0], 0, st[2])
  }

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
    a.run += (smoothstep(1.4, 2.4, g.speed) - a.run) * damp(4, dt) // 0 camina → 1 corre

    // mirar alrededor: al empezar, y cuando se detiene a dudar
    const lookTarget = g.phase === 'look' || (g.phase === 'play' && (g.idle > 0.6 || g.blocked)) ? 1 : 0
    a.look += (lookTarget - a.look) * damp(3, dt)
    if (a.look > 0.01) a.lookT += dt
    else a.lookT = 0

    // postura del niño al nacer → se incorpora con la animación "Standing Up"
    const childW = g.phase === 'intro' ? 1 : g.phase === 'rise' ? 1 - smooth(clamp01(g.phaseT / 0.8)) : 0
    const standW = g.phase === 'rise' ? 1 - smooth(clamp01((g.phaseT - RISE_TIME * 0.85) / (RISE_TIME * 0.15))) : 0

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
      const t = (g.phaseT / RISE_TIME) * duration(CLIPS.standup)
      blendInto(base, sampleAt(CLIPS.standup, t, S.tmp), standW)
    }
    if (childW > 0.001) {
      blendInto(base, CHILD, childW)
      // respira en la postura del niño
      base.q.spine?.multiply(TMP_Q.setFromAxisAngle(X_AXIS, Math.sin(g.time * 1.7) * 0.04 * childW))
    }
    if (a.mago > 0.001) {
      for (const [name, q] of Object.entries(MAGO.q)) {
        if (q) base.q[name as BoneName]?.slerp(q, a.mago)
      }
    }
    // al final levanta la mirada hacia la luz
    if (g.phase === 'end') base.q.head?.multiply(TMP_Q.setFromAxisAngle(X_AXIS, -0.3 * clamp01(g.phaseT / 2)))

    // ── Aplicar a los huesos (algunos con algo de retraso, para que el movimiento "arrastre") ──
    for (const [name, q] of Object.entries(base.q) as [BoneName, THREE.Quaternion][]) {
      const bone = rig.bones[name]
      if (!bone) continue
      const k = g.phase === 'intro' ? 1 : damp(LAG[name] ?? 20, dt)
      bone.quaternion.slerp(q, k)
    }
    body.current.position.lerp(TMP_V.copy(base.offset).multiplyScalar(MODEL_TO_WORLD), g.phase === 'intro' ? 1 : damp(20, dt))

    // ── Pelo de la espalda y falda: muelles que reaccionan al movimiento ──
    const c = g.c
    const m = a.move
    const sec = 1 - childW // en la postura del niño se quedan quietos
    const thighL = rig.bones.thighL.rotation.x
    const thighR = rig.bones.thighR.rotation.x
    const hipRoll = rig.bones.hips.rotation.z
    const bounce = Math.sin(a.phase * Math.PI * 4) * m
    spring('hairBack', (0.05 * c * m + 0.03 * bounce) * sec, -hipRoll * 0.6 * sec, 70, 7, dt)
    spring('skirtF', Math.max(-0.5, Math.min(thighL, thighR) * 0.55) * sec, 0, 140, 10, dt)
    spring('skirtB', (Math.min(0.5, Math.max(thighL, thighR) * 0.6) + 0.12 * a.run * m) * sec, 0, 140, 10, dt)
    spring('skirtL', 0.03 * bounce * sec, (0.05 + 0.08 * bounce + hipRoll) * sec, 120, 9, dt)
    spring('skirtR', 0.03 * bounce * sec, (-0.05 - 0.08 * bounce + hipRoll) * sec, 120, 9, dt)

    // ── Su luz: crece con la confianza y destella en momentos clave
    const birthFlash = g.phase === 'intro' ? (1 - birth) * 25 : 0
    light.current.intensity = 2 + c * 6 + g.pulse * 12 + birthFlash
  })

  return (
    <group ref={root}>
      <pointLight ref={light} position={[0, 1.3, 0.6]} color="#ffdcae" distance={9} intensity={2} />
      <group ref={body}>
        <primitive object={model} />
      </group>
    </group>
  )
}

useGLTF.preload(MODEL_URL)
