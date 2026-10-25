import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { BIRTH_TIME, RISE_TIME, LOOK_BACK_TIME, LOOK_TIME, clamp01, damp, headingAt, pathAt } from '../game/config'
import { game } from '../game/state'
import { rigElf, type BoneName, type Rig } from '../game/rig'

// Modelo: "Forest Enchantress" de Padarozhnik (CC BY 4.0) — ver CREDITS.md
// Versión optimizada para web (~40k triángulos, textura 1024).
// El esqueleto se le pone al cargar (ver game/rig.ts) y las animaciones se hacen aquí, con código.
const MODEL_URL = `${import.meta.env.BASE_URL}models/enchantress.glb`
const HEIGHT = 1.15 // altura de la elfa en el mundo
const LEG = 0.52 // largo de la pierna en el mundo (para calcular el paso)

const pos = new THREE.Vector3()

// Rebote suave al final de una animación (para el "nacer")
const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

const smooth = (t: number) => t * t * (3 - 2 * t)
const SIDE_TURN = Math.PI / 2 // al nacer mira hacia su izquierda: la cámara la ve de perfil

/** Postura del niño. Ángulos probados en una vista previa del modelo. */
const CHILD_POSE: Pose = {
  thighL: [-1.5, 0, 0],
  thighR: [-1.5, 0, 0],
  shinL: [2.9, 0, 0],
  shinR: [2.9, 0, 0],
  footL: [1.0, 0, 0],
  footR: [1.0, 0, 0],
  hips: [0, 0, 0],
  spine: [1.3, 0, 0],
  chest: [1.0, 0, 0],
  neck: [0.2, 0, 0],
  head: [0.1, 0, 0],
  upperArmL: [-3.4, 0, -0.2],
  upperArmR: [-3.4, 0, 0.2],
  foreArmL: [0, 0, 0],
  foreArmR: [0, 0, 0],
}
const CHILD_DROP = 0.606 * (HEIGHT / 1.99) // cuánto baja el cuerpo en esa postura (en metros)

/** Ángulos que se van suavizando hacia su objetivo (para que nada salte de golpe). */
type Pose = Partial<Record<BoneName, [number, number, number]>>

export function Character() {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const anim = useRef({ phase: 0, move: 0, mago: 0, look: 0 })

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
      g.phase === 'intro' ? 1 : g.phase === 'rise' ? 1 - smooth(clamp01((g.phaseT - RISE_TIME * 0.35) / (RISE_TIME * 0.6))) : 0
    root.current.rotation.y = headingAt(g.p) + turn + SIDE_TURN * sideways

    // ── Nacer: crece desde la luz ──────────────────────────────
    const birth = g.phase === 'intro' ? clamp01(g.phaseT / BIRTH_TIME) : 1
    root.current.scale.setScalar(Math.max(0.001, easeOutBack(birth)))

    // ── Ritmo del paso ─────────────────────────────────────────
    const c = g.c
    a.move += (clamp01(g.speed / 0.7) - a.move) * damp(6, dt) // 0 quieta → 1 caminando
    const stride = 0.8 + 0.7 * c // metros por ciclo completo (dos pasos)
    a.phase += (g.speed * dt * Math.PI * 2) / stride
    const m = a.move
    const ph = a.phase
    const sin = Math.sin(ph)
    const cos = Math.cos(ph)

    // ── Mezclas de "estados" ───────────────────────────────────
    // Postura del niño: al nacer está acurrucada; al empezar se incorpora poco a poco
    const childW =
      g.phase === 'intro' ? 1 : g.phase === 'rise' ? 1 - smooth(clamp01(g.phaseT / (RISE_TIME * 0.7))) : 0
    // Pose del Mago: al terminar de incorporarse alza el brazo, hasta que agarra las herramientas
    const magoTarget = (g.phase === 'rise' && g.phaseT > RISE_TIME * 0.55) || (g.phase === 'gather' && g.phaseT < 1.6) ? 1 : 0
    a.mago += (magoTarget - a.mago) * damp(3, dt)

    let lookTarget = 0
    if (g.phase === 'look') lookTarget = Math.sin((g.phaseT / LOOK_TIME) * Math.PI * 2) * 0.75
    else if (g.phase === 'play' && (g.idle > 0.6 || g.blocked)) lookTarget = Math.sin(g.time * 1.3) * 0.7
    a.look += (lookTarget - a.look) * damp(5, dt)

    const breathe = Math.sin(g.time * 1.7)

    // ── Pose de este frame ─────────────────────────────────────
    const A = (0.32 + 0.38 * c) * m // amplitud de las piernas
    const knee = (0.45 + 0.75 * c) * m // cuánto doblan las rodillas
    const armSwing = A * (0.8 + 0.4 * c)
    const elbow = 0.12 + (0.25 + 0.6 * c) * m
    // El modelo tiene los brazos abiertos (pose en A): los acercamos al cuerpo.
    // Al correr se pegan un poco más.
    const ARMS_IN = 0.45
    const tuck = ARMS_IN + 0.1 * c * m

    const pose: Pose = {
      hips: [0, 0.06 * A * sin, 0],
      spine: [0.04 + 0.2 * c * m, -0.08 * A * sin, 0],
      chest: [0.015 * breathe, -0.12 * armSwing * sin + a.look * 0.25, 0],
      neck: [0, a.look * 0.35, 0],
      head: [(g.phase === 'end' ? -0.3 : 0.12 * (1 - c) * (1 - m)) - 0.1 * c * m, a.look * 0.6, 0],
      thighL: [-A * sin, 0, 0],
      thighR: [A * sin, 0, 0],
      shinL: [0.05 + knee * Math.max(0, cos), 0, 0],
      shinR: [0.05 + knee * Math.max(0, -cos), 0, 0],
      footL: [-0.25 * A * sin, 0, 0],
      footR: [0.25 * A * sin, 0, 0],
      upperArmL: [armSwing * sin, 0, -tuck + 0.02 * breathe],
      upperArmR: [-armSwing * sin, 0, tuck - 0.02 * breathe],
      foreArmL: [-elbow, 0, 0],
      foreArmR: [-elbow, 0, 0],
    }

    // Pose del Mago: brazo derecho en alto, el izquierdo hacia abajo y afuera
    if (a.mago > 0.001) {
      const k = a.mago
      const blend = (b: BoneName, t: [number, number, number]) => {
        const cur = pose[b] ?? [0, 0, 0]
        pose[b] = [cur[0] + (t[0] - cur[0]) * k, cur[1] + (t[1] - cur[1]) * k, cur[2] + (t[2] - cur[2]) * k]
      }
      blend('upperArmR', [-0.25, 0, -2.2 + 0.05 * breathe])
      blend('foreArmR', [-0.15, 0, 0])
      blend('upperArmL', [0.1, 0, -0.15])
      blend('foreArmL', [0, 0, 0])
      blend('head', [-0.12, 0, 0])
    }

    // Postura del niño (balasana): de rodillas, sentada sobre los talones,
    // torso doblado hacia adelante y brazos estirados por delante
    if (childW > 0.001) {
      const breath = 0.04 * breathe
      for (const [b, t] of Object.entries(CHILD_POSE) as [BoneName, [number, number, number]][]) {
        const cur = pose[b] ?? [0, 0, 0]
        const tb: [number, number, number] = b === 'spine' ? [t[0] + breath, t[1], t[2]] : t
        pose[b] = [cur[0] + (tb[0] - cur[0]) * childW, cur[1] + (tb[1] - cur[1]) * childW, cur[2] + (tb[2] - cur[2]) * childW]
      }
    }

    const k = g.phase === 'intro' ? 1 : damp(14, dt)
    for (const [name, r] of Object.entries(pose) as [BoneName, [number, number, number]][]) {
      const bone = rig.bones[name]
      bone.rotation.x += (r[0] - bone.rotation.x) * k
      bone.rotation.y += (r[1] - bone.rotation.y) * k
      bone.rotation.z += (r[2] - bone.rotation.z) * k
    }

    // Al abrir las piernas la cadera baja un poco; al correr, rebota
    const drop = LEG * (1 - Math.cos(A * sin)) + 0.035 * c * m * Math.abs(cos)
    const childDrop = CHILD_DROP * childW
    body.current.position.y += (-drop - childDrop + 0.004 * breathe - body.current.position.y) * damp(20, dt)

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
