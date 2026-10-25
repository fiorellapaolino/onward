import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { BIRTH_TIME, RISE_TIME, JUMP_AIR, JUMP_CROUCH, JUMP_LAND, clamp01, damp, smoothstep } from '../game/config'
import { game } from '../game/state'
import { MUSIC, musicLevel } from '../game/music'
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

const X_AXIS = new THREE.Vector3(1, 0, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const TMP_V = new THREE.Vector3()
const TMP_V3 = new THREE.Vector3()
const TMP_V4 = new THREE.Vector3()
const TMP_P1 = new THREE.Vector3()
const TMP_P2 = new THREE.Vector3()
// cuánto se mueven los gestos de la cabeza al nacer (1 = los ángulos de HEAD_KEYS)
const HEAD_SCALE = 0.5
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
// momento de "Standing Up" (segundos) en el que ya está casi de pie: ahí llega cuando entran los graves
const STAND_BY_BASS = 3.0
const SIDE_TURN = Math.PI / 2 // al nacer mira hacia su izquierda: la cámara la ve de perfil

/*
 * Gestos de la cabeza al nacer: [segundo de la canción, giro (izq +), inclinación (abajo +), ladeo]
 * Entre un punto y el siguiente se pasa suavemente.
 */
const HEAD_KEYS: [number, number, number, number][] = [
  // (al nacer está de costado: giro negativo = mira hacia delante, al sendero; positivo = hacia la cámara)
  [0, 0, 0.45, 0], // cabeza baja: acaba de nacer
  [1.5, 0, 0.4, 0],
  [3.2, -0.1, 0.05, 0], // la levanta despacio
  [4.4, -0.7, -0.05, 0.05], // mira hacia delante, al bosque
  [5.4, -0.65, 0, 0.28], // ladea la cabeza: ¿qué es esto?
  [5.9, -0.2, -0.2, 0.1], // aparece el primer elemento: lo mira
  [7.2, 0.25, 0, -0.05], // un vistazo al otro lado
  [8.2, -0.4, 0.05, -0.25], // vuelve a mirar delante, confundida
  [9.2, -0.1, 0.5, 0], // se mira las manos
  [9.7, -0.3, -0.25, 0], // otro elemento: levanta la vista
  [11.5, -0.6, -0.1, 0.12], // mira el sendero
  [13.6, 0.15, -0.3, -0.08], // otro elemento
  [15.5, -0.5, 0.1, 0.1],
  [17.6, -0.3, -0.3, 0], // el último elemento
  [19.5, -0.4, -0.2, 0], // mira hacia delante: va a levantarse
  [21.5, 0, -0.1, 0],
]
const smoothT = (t: number) => t * t * (3 - 2 * t)
function headGesture(t: number): [number, number, number] {
  const k = HEAD_KEYS
  if (t <= k[0][0]) return [k[0][1], k[0][2], k[0][3]]
  for (let i = 0; i < k.length - 1; i++) {
    if (t < k[i + 1][0]) {
      const u = smoothT((t - k[i][0]) / (k[i + 1][0] - k[i][0]))
      return [k[i][1] + (k[i + 1][1] - k[i][1]) * u, k[i][2] + (k[i + 1][2] - k[i][2]) * u, k[i][3] + (k[i + 1][3] - k[i][3]) * u]
    }
  }
  const l = k[k.length - 1]
  return [l[1], l[2], l[3]]
}

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
  const anim = useRef({ tryLevel: 0, tryT: 0, phase: 0, move: 0, mago: 0, look: 0, lookT: 0, run: 0, yawRate: 0, prevYaw: 0, lookOn: false })
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
    root.current.position.set(g.x, 0, g.z)
    // Al empezar está de costado (la vemos de perfil); al incorporarse gira para mirar al camino
    const sideways =
      g.phase === 'intro' ? 1 : g.phase === 'rise' ? 1 - smooth(clamp01((g.phaseT - RISE_TIME * 0.45) / (RISE_TIME * 0.5))) : 0
    root.current.rotation.y = g.yaw + SIDE_TURN * sideways

    // ── Nacer: crece desde la luz ──────────────────────────────
    const birth = g.phase === 'intro' ? clamp01(g.phaseT / BIRTH_TIME) : 1
    root.current.scale.setScalar(Math.max(0.001, easeOutBack(birth)))

    // ── Pesos de cada animación ────────────────────────────────
    // en el aire no da pasos: las piernas las pone el salto
    const airborne = g.jumpT >= JUMP_CROUCH && g.jumpT < JUMP_CROUCH + JUMP_AIR
    a.move += ((airborne ? 0 : clamp01(g.speed / 0.6)) - a.move) * damp(airborne ? 14 : 6, dt) // 0 quieta → 1 en marcha
    a.run += (smoothstep(1.5, 2.6, g.speed) - a.run) * damp(4, dt) // 0 camina → 1 corre

    // mirar alrededor: al empezar, y cuando se detiene a dudar (al 65%: el original gira mucho)
    // (con margen: se activa tras 1 s quieta y no se apaga hasta que de verdad camina, sin parpadeos)
    if (g.phase === 'look' || (g.phase === 'play' && (g.idle > 1 || g.blocked))) a.lookOn = true
    else if (g.speed > 0.4 || g.phase !== 'play') a.lookOn = false
    const lookTarget = a.lookOn ? 0.65 : 0
    a.look += (lookTarget - a.look) * damp(2.5, dt)
    if (a.look > 0.01) a.lookT += dt
    else a.lookT = 0

    // al nacer está de rodillas (inicio de "Standing Up"); al empezar se levanta con esa animación
    const standW =
      g.phase === 'intro' ? 1 : g.phase === 'rise' ? 1 - smooth(clamp01((g.phaseT - RISE_TIME * 0.85) / (RISE_TIME * 0.15))) : 0

    // pose del Mago: al terminar de incorporarse alza el brazo, hasta que agarra las herramientas
    // (alza el brazo justo cuando entran los graves en la canción)
    const magoTarget = (g.phase === 'rise' && g.phaseT > 0.15) || (g.phase === 'gather' && g.phaseT < 1.6) ? 1 : 0
    a.mago += (magoTarget - a.mago) * damp(g.phase === 'rise' ? 7 : 3, dt)

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
      // De rodillas, en cada frase de la canción intenta levantarse un poco y vuelve a bajar
      // (usa el principio de "Standing Up"); con los graves se levanta del todo desde donde esté.
      const level = g.started ? musicLevel(g.musicT) : 0
      a.tryLevel += (level - a.tryLevel) * damp(3.5, dt)
      // 0–8 s de rodillas; de 8 s hasta que entran los graves se va levantando poco a poco, sin volver atrás
      if (g.phase === 'intro') a.tryT = g.started ? smoothstep(8, MUSIC.BASS_IN, g.musicT) * STAND_BY_BASS : 0
      const total = duration(CLIPS.standup)
      const t = g.phase === 'rise' ? a.tryT + (g.phaseT / RISE_TIME) * (total - a.tryT) : a.tryT
      blendInto(base, sampleAt(CLIPS.standup, t, S.tmp), standW)
      // respira de rodillas al ritmo de las frases de la canción (inhala cuando la música sube)
      if (g.phase === 'intro') {
        const level = g.started ? musicLevel(g.musicT) : 0.3 + 0.2 * Math.sin(g.time * 1.2)
        // con cada frase levanta un poco el pecho y la cabeza, como quien se asoma, y vuelve a bajar
        const lift = a.tryLevel
        base.q.spine_02?.multiply(TMP_Q.setFromAxisAngle(X_AXIS, 0.04 - 0.1 * lift))
        base.q.neck_01?.multiply(TMP_Q.setFromAxisAngle(X_AXIS, 0.06 - 0.12 * lift))
      }
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

    // Peso del cuerpo: se ladea un poco hacia dentro en las curvas del sendero (muy suavizado, sin tirones)
    const dYaw = Math.atan2(Math.sin(g.yaw - a.prevYaw), Math.cos(g.yaw - a.prevYaw))
    a.prevYaw = g.yaw
    a.yawRate += (dYaw / Math.max(dt, 1e-3) - a.yawRate) * damp(3, dt) // radianes por segundo, suavizado
    if (!snap && a.move > 0.01) {
      root.current.updateMatrixWorld(true)
      const fwd = TMP_V3.copy(Z_AXIS).applyQuaternion(root.current.quaternion)
      rotateBoneWorld(bones.pelvis, fwd, THREE.MathUtils.clamp(-a.yawRate * 0.1, -0.06, 0.06) * a.move)
    }

    // ── Salto en zancada: se agacha, en el aire abre las piernas (una delante y otra detrás)
    //    con los brazos al revés, y amortigua al caer ──
    if (g.jumpT >= 0) {
      const jt = g.jumpT
      const inAir = jt >= JUMP_CROUCH && jt < JUMP_CROUCH + JUMP_AIR
      const air = clamp01((jt - JUMP_CROUCH) / JUMP_AIR)
      const prep = jt < JUMP_CROUCH ? jt / JUMP_CROUCH : 0
      const land = jt >= JUMP_CROUCH + JUMP_AIR ? 1 - smooth(clamp01((jt - JUMP_CROUCH - JUMP_AIR) / JUMP_LAND)) : 0
      const split = inAir ? Math.sin(Math.min(1, air * 1.6) * Math.PI * 0.5) * (1 - smooth(clamp01((air - 0.75) / 0.25)) * 0.6) : 0
      const c = Math.max(prep, land * 0.8)
      root.current.updateMatrixWorld(true)
      const right = TMP_V4.copy(X_AXIS).applyQuaternion(root.current.quaternion)
      // pierna izquierda adelante, derecha atrás
      rotateBoneWorld(bones.thigh_l, right, -(0.5 * c + 1.15 * split))
      rotateBoneWorld(bones.thigh_r, right, -0.5 * c + 0.75 * split)
      rotateBoneWorld(bones.calf_l, right, 0.95 * c + 0.35 * split)
      rotateBoneWorld(bones.calf_r, right, 0.95 * c + 1.0 * split)
      rotateBoneWorld(bones.spine_01, right, 0.3 * c + 0.12 * split)
      // brazos al revés que las piernas, abiertos
      rotateBoneWorld(bones.upperarm_l, right, 0.3 * c + 0.7 * split)
      rotateBoneWorld(bones.upperarm_r, right, 0.3 * c - 0.9 * split)
      root.current.position.y -= 0.11 * c // (en root: se recalcula cada frame, no se acumula)
    }
    root.current.position.y += g.jumpY

    // De rodillas, acaba de nacer y no entiende nada: mira a su alrededor, ladea la cabeza,
    // se mira las manos… (coreografía de la cabeza sincronizada con la canción)
    if ((g.phase === 'intro' && g.started) || g.phase === 'rise') {
      const t = g.phase === 'intro' ? g.musicT : MUSIC.BASS_IN + g.phaseT
      const [yaw, pitch, roll] = headGesture(t)
      const fade = g.phase === 'rise' ? 1 - clamp01(g.phaseT / 0.6) : 1
      root.current.updateMatrixWorld(true)
      const right = TMP_V4.copy(X_AXIS).applyQuaternion(root.current.quaternion)
      const fwd = TMP_V3.copy(Z_AXIS).applyQuaternion(root.current.quaternion)
      // girar sobre el eje de su propio cuello (no el vertical del mundo: está inclinada y la retorcería)
      bones.neck_01.getWorldPosition(TMP_P1)
      bones.Head.getWorldPosition(TMP_P2)
      const neckUp = TMP_P2.sub(TMP_P1).normalize()
      const k = HEAD_SCALE * fade
      rotateBoneWorld(bones.neck_01, neckUp, yaw * 0.4 * k)
      rotateBoneWorld(bones.Head, neckUp, yaw * 0.6 * k)
      rotateBoneWorld(bones.Head, right, pitch * k)
      rotateBoneWorld(bones.Head, fwd, roll * k)
    }

    // Pose del Mago: el brazo derecho se alza hacia el cielo y el izquierdo se abre un poco hacia abajo
    if (a.mago > 0.001) {
      root.current.updateMatrixWorld(true)
      const fwd = TMP_V.copy(Z_AXIS).applyQuaternion(root.current.quaternion)
      rotateBoneWorld(bones.upperarm_r, fwd, -2.5 * a.mago)
      rotateBoneWorld(bones.upperarm_l, fwd, 0.25 * a.mago)
    }

    // ── Su luz: crece con la confianza y destella en momentos clave
    const birthFlash = g.phase === 'intro' ? (1 - birth) * 8 + (g.started ? musicLevel(g.musicT) * 3 : 0) : 0
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
