import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { BIRTH_TIME, GATHER_TIME, RISE_TIME, JUMP_AIR, JUMP_CROUCH, JUMP_LAND, clamp01, damp, smoothstep } from '../game/config'
import { game, shadow, helpedLights } from '../game/state'
import { fearM } from '../game/fear'
import { ELDER, GIRL } from '../game/village'
import { GIFT, elfHand, giftSeedPos, inGiftScene, girlStand, STAND_STEP } from '../game/gift'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
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
// cabeza al nacer: giro que la deja mirando al frente, cuánto gira a cada lado y cada cuántos segundos
const HEAD_FRONT = -0.55
const HEAD_SWAY = 0.55
const HEAD_PERIOD = 7
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

/** Gira un hueso alrededor de un eje expresado en su propio espacio (el de su pose de reposo). */
function rotateBoneLocal(bone: THREE.Object3D, axisLocal: THREE.Vector3, angle: number) {
  bone.quaternion.multiply(TMP_Q.setFromAxisAngle(axisLocal, angle))
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

// Material de su sombra: casi negra, con un leve brillo violeta y algo transparente
// Su "sombra" es clara: una figura de luz suave, blanca azulada y algo translúcida (su pasado, pero amable)
const SHADOW_MAT = new THREE.MeshStandardMaterial({
  color: '#e4ebf7',
  emissive: '#a9bde6',
  emissiveIntensity: 0.45,
  roughness: 1,
  transparent: true,
  opacity: 0.72,
  depthWrite: true,
})

const SHADOW_COLOR = new THREE.Color('#e4ebf7')
const SHADOW_EMISSIVE = new THREE.Color('#a9bde6')
const WARM_COLOR = new THREE.Color('#e9d6b8')
const WARM_EMISSIVE = new THREE.Color('#ffcf8a')

/** Su sombra (clara, de luz): el mismo personaje, que repite lo que ella hizo segundos antes (state.shadow). */
export const ShadowSelf = () => <Character echo />

const TMP_HAND = new THREE.Vector3()
const TMP_SEED = new THREE.Vector3()
const HIDE_ELF = new URLSearchParams(location.search).has('noelf')

// Altura de sus ojos y de la cara de cada persona de la aldea (sentados), en metros
const EYE_H = 1.05
const FACE = { girl: 0.64, elder: 0.76 }
const LOOK_DIST = { girl: 5.5, elder: 4.5 }

/** A quién mira: a quien la está hablando, o a la persona de la aldea más cercana (si está cerca). */
function whoToLookAt(x: number, z: number, talk: 'girl' | 'elder' | null) {
  // (después de la semilla está de pie: un paso adelante y la cara más alta)
  const st = girlStand()
  const girl = { x: GIRL.x + Math.sin(GIRL.rot) * STAND_STEP * st, z: GIRL.z + Math.cos(GIRL.rot) * STAND_STEP * st, h: FACE.girl + 0.2 * st }
  // en la escena de la semilla: mira la semilla y, al final, a la niña
  if (inGiftScene()) {
    const k = game.time - game.giftAt
    if (k < GIFT.LOOK_EACH) {
      giftSeedPos(k, elfHand(TMP_HAND), TMP_SEED)
      return { x: TMP_SEED.x, z: TMP_SEED.z, h: TMP_SEED.y }
    }
    return girl
  }
  const elder = { x: ELDER.x, z: ELDER.z, h: FACE.elder }
  if (talk === 'girl') return girl
  if (talk === 'elder') return elder
  const dg = Math.hypot(x - GIRL.x, z - GIRL.z)
  const de = Math.hypot(x - ELDER.x, z - ELDER.z)
  if (dg < LOOK_DIST.girl && dg <= de) return girl
  if (de < LOOK_DIST.elder) return elder
  return null
}

export function Character({ echo = false }: { echo?: boolean }) {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const anim = useRef({ tryLevel: 0, tryT: 0, phase: 0, move: 0, mago: 0, look: 0, lookT: 0, run: 0, yawRate: 0, prevYaw: 0, lookOn: false, atW: 0, atYaw: 0, atPitch: 0 })
  const S = useMemo(() => ({ base: makeSample(), tmp: makeSample(), tmp2: makeSample(), smooth: makeSample() }), [])

  const bodyG = useGLTF(BODY_URL)
  const outfitG = useGLTF(OUTFIT_URL)
  const hairG = useGLTF(HAIR_URL)

  // Montaje: cuerpo + ropa + pelo sobre un solo esqueleto, y orejas en la cabeza
  const { model, bones, axes } = useMemo(() => {
    // la sombra usa copias (los modelos originales son de la elfa).
    // La ropa y el pelo se copian sin su esqueleto: abajo se atan por nombre a los huesos del cuerpo copiado
    // (la elfa ya los ató a SU cuerpo, y SkeletonUtils no encontraría esos huesos dentro de la ropa)
    const [bodyS, outfitS, hairS] = echo
      ? [cloneSkinned(bodyG.scene), outfitG.scene.clone(), hairG.scene.clone()]
      : [bodyG.scene, outfitG.scene, hairG.scene]
    if (echo) {
      // (si la copia ya trae las orejas de la elfa, se quitan: se añaden abajo)
      const extra: THREE.Object3D[] = []
      bodyS.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh && (o.parent as THREE.Bone)?.isBone) extra.push(o)
      })
      extra.forEach((o) => o.removeFromParent())
    }
    const model = new THREE.Group()
    model.add(bodyS, outfitS, hairS)
    model.updateMatrixWorld(true)

    // huesos del cuerpo, por nombre
    const bones: Record<string, THREE.Bone> = {}
    bodyS.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone
    })

    // la ropa y el pelo pasan a usar los huesos del cuerpo
    for (const part of [outfitS, hairS]) {
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
      if (echo) {
        m.material = SHADOW_MAT
        m.renderOrder = 1
      }
    })

    // orejas de elfa pegadas al hueso de la cabeza
    const head = bones.Head
    const skin = echo ? SHADOW_MAT : new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.75 })
    const headInv = head.matrixWorld.clone().invert()
    for (const side of [1, -1] as const) {
      const ear = makeEar(side, skin)
      ear.updateMatrix()
      ear.matrix.premultiply(headInv) // de "modelo" a "cabeza"
      ear.matrix.decompose(ear.position, ear.quaternion, ear.scale)
      head.add(ear)
    }

    model.scale.setScalar(WS)
    // Ejes "de la elfa" (arriba, su izquierda, delante) expresados en el espacio de cada hueso,
    // para girar la cabeza en sus propios términos aunque esté inclinada o de costado
    const axesOf = (b: THREE.Bone) => {
      const inv = b.getWorldQuaternion(new THREE.Quaternion()).invert()
      return {
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(inv),
        left: new THREE.Vector3(1, 0, 0).applyQuaternion(inv), // el modelo mira a +Z: su izquierda es +X
        fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(inv),
      }
    }
    const axes = {
      head: axesOf(bones.Head),
      neck: axesOf(bones.neck_01),
      spine: axesOf(bones.spine_02),
      armL: axesOf(bones.upperarm_l),
      armR: axesOf(bones.upperarm_r),
      foreL: axesOf(bones.lowerarm_l),
      foreR: axesOf(bones.lowerarm_r),
    }

    return { model, bones, axes }
  }, [bodyG, outfitG, hairG, echo])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    if (HIDE_ELF && !echo) root.current.visible = false // (?noelf: para capturas de prueba)
    // (la sombra lee el pasado de la elfa; solo se ve cuando ya nació)
    const g = echo ? shadow : game
    const a = anim.current
    if (echo) {
      const born = game.shadowOn ? Math.min(1, (game.time - game.shadowAt) / 1.5) : 0
      root.current.visible = born > 0
      SHADOW_MAT.opacity = 0.72 * born
      // al final, después del abrazo, la sombra se vuelve luz cálida
      const warm = game.phase === 'end' ? clamp01((game.phaseT - 6) / 4) : 0
      SHADOW_MAT.emissive.copy(SHADOW_EMISSIVE).lerp(WARM_EMISSIVE, warm)
      SHADOW_MAT.emissiveIntensity = 0.45 + warm * 0.6
      SHADOW_MAT.color.copy(SHADOW_COLOR).lerp(WARM_COLOR, warm * 0.6)
      if (!born) return
    }

    // ── Posición y hacia dónde mira ─────────────────────────────
    root.current.position.set(g.x, 0, g.z)
    // Al empezar está de costado (la vemos de perfil); al incorporarse gira para mirar al camino
    // ya de pie, gira hacia el camino dando unos pasitos (no gira sobre sí misma como una estatua)
    const turning = !echo && g.phase === 'gather'
    const sideways = g.phase === 'intro' || g.phase === 'rise' ? 1 : turning ? 1 - smooth(clamp01(g.phaseT / GATHER_TIME)) : 0
    root.current.rotation.y = g.yaw + SIDE_TURN * sideways

    // ── Nacer: crece desde la luz ──────────────────────────────
    const birth = g.phase === 'intro' ? clamp01(g.phaseT / BIRTH_TIME) : 1
    root.current.scale.setScalar(Math.max(0.001, easeOutBack(birth)))

    // ── Pesos de cada animación ────────────────────────────────
    // en el aire no da pasos: las piernas las pone el salto
    const airborne = g.jumpT >= JUMP_CROUCH && g.jumpT < JUMP_CROUCH + JUMP_AIR
    const moveTarget = turning ? 0.85 * Math.sin(Math.PI * clamp01(g.phaseT / GATHER_TIME)) : airborne ? 0 : clamp01(g.speed / 0.6)
    a.move += (moveTarget - a.move) * damp(airborne ? 14 : turning ? 10 : 6, dt) // 0 quieta → 1 en marcha
    a.run += (smoothstep(1.5, 2.6, g.speed) - a.run) * damp(4, dt) // 0 camina → 1 corre

    // mirar alrededor: al empezar, y cuando se detiene a dudar (al 65%: el original gira mucho)
    // (con margen: se activa tras 1 s quieta y no se apaga hasta que de verdad camina, sin parpadeos)
    // (mientras escucha a alguien no mira alrededor: le mira a él; con miedo, mira a todos lados)
    // ¿hay alguien cerca a quien mirar? (la niña o el anciano, o con quien está hablando)
    const lookAt = !echo && g.phase === 'play' ? whoToLookAt(g.x, g.z, g.talk) : null
    if (g.phase === 'look' || (g.phase === 'play' && !g.talk && !lookAt && (g.idle > 1 || g.blocked || g.fear > 0.3))) a.lookOn = true
    else if (g.speed > 0.4 || g.phase !== 'play' || g.talk || lookAt) a.lookOn = false
    const lookTarget = a.lookOn ? 0.4 : 0
    a.look += (lookTarget - a.look) * damp(2.5, dt)
    if (a.look > 0.01) a.lookT += dt
    else a.lookT = 0

    // al nacer está de rodillas (inicio de "Standing Up"); al empezar se levanta con esa animación
    const standW =
      g.phase === 'intro'
        ? 1
        : g.phase === 'rise'
          ? 1 - smooth(clamp01((g.phaseT - RISE_TIME * 0.85) / (RISE_TIME * 0.15)))
          : g.phase === 'end'
            ? smooth(g.kneel) // al final: de rodillas frente a su sombra, y se levantan juntas
            : 0

    // pose del Mago: al terminar de incorporarse alza el brazo, hasta que agarra las herramientas
    // (alza el brazo justo cuando entran los graves en la canción)
    const magoTarget = 0 // (ya no alza el brazo: los elementos del Mago se quitaron)
    a.mago += (magoTarget - a.mago) * damp(g.phase === 'rise' ? 7 : 3, dt)

    // ── Ritmo del paso: los pies avanzan lo mismo que ella (sin patinar) ──
    const cycle = cycleLength(CLIPS.walk) + (cycleLength(CLIPS.run) - cycleLength(CLIPS.walk)) * a.run
    a.phase += (g.speed * dt) / cycle + (turning ? dt * 1.3 : 0) // (al girar: pasitos en el sitio)

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
      if (g.phase === 'intro') a.tryT = g.started ? smoothstep(3.5, MUSIC.RISE_AT, g.musicT) * STAND_BY_BASS : 0
      const total = duration(CLIPS.standup)
      const t = g.phase === 'end' ? g.kneelT : g.phase === 'rise' ? a.tryT + (g.phaseT / RISE_TIME) * (total - a.tryT) : a.tryT
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
    if (g.phase === 'end') base.q.Head?.multiply(TMP_Q.setFromAxisAngle(X_AXIS, -0.3 * clamp01((g.phaseT - 10) / 2)))

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
      // Mira despacio de un lado a otro: primero cabeza baja, luego la levanta y gira a derecha e izquierda.
      // (En la pose de rodillas la cabeza ya viene girada hacia la cámara: HEAD_FRONT la corrige al frente.
      //  Comprobado con una vista previa desde la cámara del juego.)
      const t = g.phase === 'intro' ? g.musicT : MUSIC.RISE_AT + g.phaseT
      const wake = smooth(clamp01((t - 0.8) / 2.2)) // 0 cabeza baja → 1 despierta
      const yaw = HEAD_FRONT + HEAD_SWAY * Math.sin(((t - 3) / HEAD_PERIOD) * Math.PI * 2) * wake
      const pitch = 0.4 * (1 - wake) + 0.06 * Math.sin(t * 0.9) * wake
      const roll = 0
      const fade = g.phase === 'rise' ? 1 - clamp01(g.phaseT / 0.8) : 1
      // Giros en los ejes de SU cabeza (su izquierda/derecha, arriba/abajo), sea cual sea su postura
      rotateBoneLocal(bones.neck_01, axes.neck.up, yaw * 0.4 * fade)
      rotateBoneLocal(bones.Head, axes.head.up, yaw * 0.6 * fade)
      rotateBoneLocal(bones.Head, axes.head.left, pitch * fade)
      if (roll) rotateBoneLocal(bones.Head, axes.head.fwd, roll * fade)
    }

    // Mira a la persona que tiene cerca: gira y baja la cabeza hacia su cara
    {
      let want = 0
      if (lookAt) {
        const dx = lookAt.x - g.x
        const dz = lookAt.z - g.z
        const yawRaw = Math.atan2(Math.sin(Math.atan2(dx, dz) - g.yaw), Math.cos(Math.atan2(dx, dz) - g.yaw))
        // si la persona queda detrás de ella, no se retuerce: deja de mirarla
        want = 1 - smoothstep(1.3, 1.9, Math.abs(yawRaw))
        const yawT = THREE.MathUtils.clamp(yawRaw, -1.3, 1.3)
        const pitchT = THREE.MathUtils.clamp(Math.atan2(EYE_H + g.jumpY - lookAt.h, Math.hypot(dx, dz)), inGiftScene() ? -0.95 : -0.2, 0.85)
        a.atYaw += (yawT - a.atYaw) * damp(4, dt)
        a.atPitch += (pitchT - a.atPitch) * damp(4, dt)
      }
      a.atW += (want - a.atW) * damp(3, dt)
      // sorpresa al ver subir la semilla: se echa un poco hacia atrás y se lleva las manos al pecho
      if (!echo && inGiftScene()) {
        const k = g.time - g.giftAt
        const wow = Math.max(0, Math.min(1, (k - GIFT.RELEASE) / 0.5)) * Math.max(0, Math.min(1, (GIFT.END - 0.5 - k) / 1))
        rotateBoneLocal(bones.spine_02, axes.spine.left, -0.14 * wow)
        rotateBoneLocal(bones.upperarm_l, axes.armL.left, -0.55 * wow)
        rotateBoneLocal(bones.upperarm_r, axes.armR.left, -0.55 * wow)
        rotateBoneLocal(bones.lowerarm_l, axes.foreL.up, -0.9 * wow)
        rotateBoneLocal(bones.lowerarm_r, axes.foreR.up, 0.9 * wow)
      }
      if (a.atW > 0.001) {
        const w = a.atW
        rotateBoneLocal(bones.neck_01, axes.neck.up, a.atYaw * 0.4 * w)
        rotateBoneLocal(bones.Head, axes.head.up, a.atYaw * 0.6 * w)
        rotateBoneLocal(bones.neck_01, axes.neck.left, a.atPitch * 0.45 * w)
        rotateBoneLocal(bones.Head, axes.head.left, a.atPitch * 0.55 * w)
      }
    }

    // De rodillas al final: la pose de "Standing Up" trae la cabeza girada; se corrige para que mire al frente
    if (g.phase === 'end' && g.kneel > 0.001) {
      const k = smooth(g.kneel)
      rotateBoneLocal(bones.neck_01, axes.neck.up, HEAD_FRONT * 0.4 * k)
      rotateBoneLocal(bones.Head, axes.head.up, HEAD_FRONT * 0.6 * k)
    }
    // El abrazo: brazos hacia delante, rodeando (al final, la elfa y su sombra)
    if (g.hug > 0.001) {
      const w = smooth(g.hug)
      rotateBoneLocal(bones.upperarm_l, axes.armL.left, -1.15 * w)
      rotateBoneLocal(bones.upperarm_r, axes.armR.left, -1.15 * w)
      rotateBoneLocal(bones.lowerarm_l, axes.foreL.fwd, -1.3 * w)
      rotateBoneLocal(bones.lowerarm_r, axes.foreR.fwd, 1.3 * w)
      rotateBoneLocal(bones.spine_02, axes.spine.left, 0.12 * w)
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
    // con miedo su luz casi se apaga; al quedarse (mantener E) crece, y al despertar estalla
    const dim = 1 - 0.6 * g.fear * (1 - g.courage)
    const awake = Math.max(0, 1 - (g.time - g.awakeAt) / 2.5)
    if (echo) {
      light.current.intensity = 0 // la sombra no da luz
      return
    }
    // cada persona a la que ayudó le devuelve luz: su luz es más fuerte y llega más lejos
    const helped = helpedLights()
    light.current.intensity = (1.2 + g.c * 3 + g.spark * 3 + helped * 3) * dim + g.courage * g.fear * 5 + g.pulse * 6 + birthFlash + awake * 14
    light.current.distance = 9 + helped * 5
    // el ser de fuego entró en su pecho: su luz es más grande desde entonces
    if (fearM.done) {
      const k = Math.min(1, (game.time - fearM.doneAt) / 1.6)
      light.current.intensity += 2.5 * k + 10 * Math.max(0, 1 - Math.abs(game.time - fearM.doneAt - 1.6) / 0.6)
      light.current.distance += 4 * k
    }
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
