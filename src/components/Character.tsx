import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { BIRTH_TIME, GATHER_TIME, RISE_TIME, JUMP_AIR, JUMP_CROUCH, JUMP_LAND, RUN_SPEED, clamp01, damp, smoothstep, heightAt, stoneLift } from '../game/config'
import { body as prayingBody, game, shadow, helpedLights } from '../game/state'
import { ELDER, GIRL, SMITH } from '../game/village'
import { GIFT, elfHand, giftSeedPos, inGiftScene, girlStand, STAND_STEP } from '../game/gift'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { MUSIC, musicLevel } from '../game/music'
import { TITLE_LAYER, titleState } from './TitleScene'
import { CLIPS, blendInto, cycleLength, jumpClipTime, makeSample, sampleAt, sampleCycle, turnAt } from '../game/anim'

/*
 * La elfa: personaje de Quaternius (CC0) con esqueleto profesional.
 *   - body.gltf   → cuerpo base (solo cabeza, cuello y manos; el resto lo tapa la ropa)
 *   - outfit.gltf → ropa "Ranger" sin capucha ni hombrera
 *   - hair.gltf   → peinado de moños
 * Las tres piezas comparten el mismo esqueleto: la ropa y el pelo se "atan" a los huesos del cuerpo.
 * Las orejas de elfa salen de estirar las del propio modelo (pointEars).
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

const X_AXIS = new THREE.Vector3(1, 0, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const TMP_V = new THREE.Vector3()
const TMP_V3 = new THREE.Vector3()
const TMP_P1 = new THREE.Vector3()
const TMP_P2 = new THREE.Vector3()
// cabeza al nacer: giro que la deja mirando al frente, cuánto gira a cada lado y cada cuántos segundos
const HEAD_FRONT = -0.55
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
// Desde acostada: hasta WAKE.STIR casi no se mueve; en WAKE.UP ya está de pie (segundos de la animación)
const WAKE = { STIR: 2.9, UP: 8.6 }
const TITLE_TURN = 0.5
const RUN_CADENCE_MAX = 1.25 // a lo sumo, un 25 % más rápido que la carrera original (más, parece que tiembla; menos, patina)
const JUMP_BLEND = 0.16 // segundos de mezcla entre un salto y el siguiente
const TITLE_ARM = 0.16
const TITLE_HEAD = -0.42
const TMP_FWD = new THREE.Vector3()
const SIDE_TURN = -Math.PI / 2 // al nacer mira hacia la derecha de la pantalla: la cámara la ve de perfil

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

/*
 * Orejas de elfa: se estira la oreja del propio modelo hasta que termina en punta.
 * (No se agrega ninguna pieza: es la misma piel, la misma textura y se mueve con la cabeza.)
 */
const EAR = { y: 1.655, z: -0.038, fromX: 0.07, toX: 0.089, inner: 0.018, outer: 0.046, length: 0.085, taper: 0.65 }
const EAR_DIR = new THREE.Vector3(0.72, 0.6, -0.35).normalize()
function pointEars(source: THREE.BufferGeometry) {
  const geo = source.clone()
  const pos = geo.attributes.position
  const moved: number[] = []
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const dist = Math.hypot(y - EAR.y, z - EAR.z)
    const t = smoothstep(EAR.fromX, EAR.toX, Math.abs(x)) * (1 - smoothstep(EAR.inner, EAR.outer, dist))
    if (t <= 0) continue
    // se afina hacia la punta y se estira hacia fuera, arriba y atrás
    const pull = EAR.length * t * t
    pos.setXYZ(
      i,
      x + Math.sign(x) * EAR_DIR.x * pull,
      y + (EAR.y - y) * EAR.taper * t + EAR_DIR.y * pull,
      z + (EAR.z - z) * EAR.taper * t + EAR_DIR.z * pull,
    )
    moved.push(i)
  }
  // solo cambia el sombreado de la oreja: en el resto se conservan las normales originales (sin costuras nuevas)
  const before = geo.attributes.normal.clone()
  geo.computeVertexNormals()
  const after = geo.attributes.normal
  const keep = new Set(moved)
  for (let i = 0; i < after.count; i++) if (!keep.has(i)) after.setXYZ(i, before.getX(i), before.getY(i), before.getZ(i))
  return geo
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
// Arrodillarse para escuchar: de la animación se salta la preparación (1,3 s) y se usa hasta el final, algo acelerada
/** Cuánto bajan sus ojos en cuclillas (metros): para mirar a la cara a quien tiene cerca. */
const CROUCH_EYE_DROP = 0.38
const KNEEL = { FROM: 1.3, LEN: 2.95, DOWN: 1.5, UP: 2, EYE_DROP: 0.36 }
const FACE = { girl: 0.64, elder: 0.76, smith: 1.22 }
const LOOK_DIST = { girl: 5.5, elder: 4.5 }

/** A quién mira: a quien la está hablando, o a la persona de la aldea más cercana (si está cerca). */
function whoToLookAt(x: number, z: number, talk: 'girl' | 'elder' | 'smith' | null) {
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
  if (talk === 'smith') return { x: SMITH.x, z: SMITH.z, h: FACE.smith }
  const dg = Math.hypot(x - GIRL.x, z - GIRL.z)
  const de = Math.hypot(x - ELDER.x, z - ELDER.z)
  if (false && dg < LOOK_DIST.girl && dg <= de) return girl // (sin la niña)
  if (de < LOOK_DIST.elder) return elder
  return null
}

export function Character({ echo = false }: { echo?: boolean }) {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const anim = useRef({ phase: 0, move: 0, mago: 0, look: 0, lookT: 0, run: 0, yawRate: 0, prevYaw: 0, lookOn: false, listenT: 0, lastJumpT: -1, oldJumpT: 0, oldJumpW: 0, atW: 0, atYaw: 0, atPitch: 0 })
  const S = useMemo(() => ({ base: makeSample(), tmp: makeSample(), tmp2: makeSample(), smooth: makeSample() }), [])

  const bodyG = useGLTF(BODY_URL)
  const outfitG = useGLTF(OUTFIT_URL)
  const hairG = useGLTF(HAIR_URL)

  // Montaje: cuerpo + ropa + pelo sobre un solo esqueleto
  const { model, bones, axes } = useMemo(() => {
    // el cuerpo siempre es una copia: la gente de la aldea usa el mismo modelo, y sus orejas no cambian.
    // La ropa y el pelo de la sombra se copian sin su esqueleto: abajo se atan por nombre a los huesos del cuerpo copiado
    // (la elfa ya los ató a SU cuerpo, y SkeletonUtils no encontraría esos huesos dentro de la ropa)
    const bodyS = cloneSkinned(bodyG.scene)
    const [outfitS, hairS] = echo ? [outfitG.scene.clone(), hairG.scene.clone()] : [outfitG.scene, hairG.scene]
    bodyS.traverse((o) => {
      const m = o as THREE.SkinnedMesh
      if (m.isSkinnedMesh) m.geometry = pointEars(m.geometry)
    })
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
      m.castShadow = !echo // (la figura de luz no proyecta sombra)
      if (!echo) m.layers.enable(TITLE_LAYER) // (es lo único que se ve en la pantalla de título)
      const mat = m.material as THREE.MeshStandardMaterial
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace
      // el pelo y las cejas vienen en gris: les damos color
      if (mat.name.startsWith('MI_Hair')) mat.color.set(HAIR_COLOR)
      if (echo) {
        m.material = SHADOW_MAT
        m.renderOrder = 1
      }
    })

    if (!echo) titleState.elfReady = true // (ya se la puede mostrar en el título)
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
    // (mientras el jugador maneja a su sombra, ella es su cuerpo: arrodillada en el altar)
    const g = echo ? shadow : game.plane ? prayingBody : game
    const a = anim.current
    if (echo) {
      const born = game.shadowOn ? Math.min(1, (game.time - game.shadowAt) / 1.5) : 0
      // al final entra en ella (la integró): se desvanece en su cuerpo
      const merged = game.phase === 'end' ? clamp01((game.phaseT - 8.6) / 0.9) : 0
      root.current.visible = born > 0 && merged < 1
      SHADOW_MAT.opacity = 0.72 * born * (1 - merged)
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
    const sideways = g.phase === 'intro' || g.phase === 'rise' ? 1 : turning ? 1 - turnAt(CLIPS.turn, g.phaseT) : 0
    // (en el título está de pie, apenas girada hacia la cámara)
    root.current.rotation.y = g.started ? g.yaw + SIDE_TURN * sideways : g.yaw + TITLE_TURN

    // ── Nacer: crece desde la luz ──────────────────────────────
    const birth = g.phase === 'intro' && g.started ? clamp01(g.phaseT / BIRTH_TIME) : 1
    root.current.scale.setScalar(Math.max(0.001, easeOutBack(birth)))

    // ── Pesos de cada animación ────────────────────────────────
    // en el aire no da pasos: las piernas las pone el salto
    const airborne = g.jumpT >= JUMP_CROUCH && g.jumpT < JUMP_CROUCH + JUMP_AIR
    const moveTarget = turning || airborne ? 0 : clamp01(g.speed / 0.6)
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
        ? g.started ? 1 : 0
        : g.phase === 'rise'
          ? 1 - smooth(clamp01((g.phaseT - RISE_TIME * 0.85) / (RISE_TIME * 0.15)))
          : smooth(g.kneel) // de rodillas: al quedarse con miedo, cuando nace su sombra, y al final frente a ella

    // pose del Mago: al terminar de incorporarse alza el brazo, hasta que agarra las herramientas
    // (alza el brazo justo cuando entran los graves en la canción)
    const magoTarget = 0 // (ya no alza el brazo: los elementos del Mago se quitaron)
    a.mago += (magoTarget - a.mago) * damp(g.phase === 'rise' ? 7 : 3, dt)

    // ── Ritmo del paso: los pies avanzan lo mismo que ella (sin patinar) ──
    // (corriendo más rápido que la captura, alarga el paso en vez de acelerar las piernas: si no, parece que tiembla)
    const runStride = Math.max(1, g.speed / ((CLIPS.run.speed ?? RUN_SPEED) * RUN_CADENCE_MAX))
    const cycle = cycleLength(CLIPS.walk) + (cycleLength(CLIPS.run) * runStride - cycleLength(CLIPS.walk)) * a.run
    a.phase += (g.speed * dt) / cycle

    // ── Mezcla ─────────────────────────────────────────────────
    const base = S.base
    // (en el título no se balancea: de cerca y de frente parece que se prepara para pelear; solo respira, más abajo)
    sampleAt(CLIPS.idle, g.started ? g.time : 0, base)
    if (a.look > 0.001) blendInto(base, sampleAt(CLIPS.look, a.lookT, S.tmp), a.look)
    if (a.move > 0.001) {
      const loco = sampleCycle(CLIPS.walk, a.phase, S.tmp)
      if (a.run > 0.001) blendInto(loco, sampleCycle(CLIPS.run, a.phase, S.tmp2), a.run)
      blendInto(base, loco, a.move)
    }
    // Al girar hacia el camino: solo piernas y cadera de "Left Turn 90"; brazos y torso siguen en reposo (sin gestos)
    if (turning) {
      const w = smooth(clamp01(Math.min(g.phaseT, GATHER_TIME - g.phaseT) / 0.15))
      sampleAt(CLIPS.turn, g.phaseT, S.tmp)
      for (const name of Object.keys(CLIPS.turn.bones)) base.q[name]?.slerp(S.tmp.q[name]!, w)
    }
    // Escuchar al anciano: se arrodilla a su altura; al terminar se levanta (la misma animación al revés)
    if (!echo) {
      const listening = g.talk === 'elder'
      const fast = g.speed > 0.3 ? 3 : 1 // (si se pone a caminar, se levanta enseguida)
      a.listenT = clamp01((a.listenT + (listening ? dt * KNEEL.DOWN : -dt * KNEEL.UP * fast)) / KNEEL.LEN) * KNEEL.LEN
      if (a.listenT > 0.001) blendInto(base, sampleAt(CLIPS.kneel, KNEEL.FROM + a.listenT, S.tmp), smooth(clamp01(a.listenT / 0.35)))
    }
    // El salto: captura de movimiento de Mixamo, ajustada al tiempo del juego (entra y sale suave)
    // (si vuelve a saltar apenas cae, el salto nuevo empieza mientras el anterior se desvanece: sin tirón)
    if (g.jumpT >= 0 && a.lastJumpT >= 0 && g.jumpT < a.lastJumpT - 0.01) {
      a.oldJumpT = a.lastJumpT
      a.oldJumpW = 1
    }
    a.lastJumpT = g.jumpT
    if (g.jumpT >= 0) {
      const inW = a.oldJumpW > 0 ? 1 : smooth(clamp01(g.jumpT / 0.05))
      const outW = 1 - smooth(clamp01((g.jumpT - JUMP_CROUCH - JUMP_AIR - JUMP_LAND + 0.14) / 0.14))
      blendInto(base, sampleAt(CLIPS.jump, jumpClipTime(g.jumpT), S.tmp), inW * outW)
    }
    if (a.oldJumpW > 0.001) {
      a.oldJumpT += dt
      a.oldJumpW = Math.max(0, a.oldJumpW - dt / JUMP_BLEND)
      blendInto(base, sampleAt(CLIPS.jump, jumpClipTime(a.oldJumpT), S.tmp), smooth(a.oldJumpW))
    }
    // Al quedarse con la oscuridad: en cuclillas ("Male Crouch Pose"); al nacer su sombra se levanta
    if (g.sit > 0.001) blendInto(base, sampleAt(CLIPS.crouch, 0, S.tmp), smooth(g.sit))
    if (!g.started) {
      const breath = Math.sin(g.time * 1.15)
      base.q.spine_02?.multiply(TMP_Q.setFromAxisAngle(X_AXIS, -0.018 * breath))
      base.q.neck_01?.multiply(TMP_Q.setFromAxisAngle(X_AXIS, 0.008 * breath))
    }
    if (standW > 0.001) {
      if (g.phase === 'intro' || g.phase === 'rise') {
        // Al nacer: acostada en el suelo. Respira hasta empezar a moverse, y al subir la música se levanta
        const lying = g.started ? WAKE.STIR * clamp01(g.musicT / MUSIC.RISE_AT) : 0
        const t = g.phase === 'rise' ? WAKE.STIR + (g.phaseT / RISE_TIME) * (WAKE.UP - WAKE.STIR) : lying
        blendInto(base, sampleAt(CLIPS.wake, t, S.tmp), standW)
      } else blendInto(base, sampleAt(CLIPS.standup, g.kneelT, S.tmp), standW)
    }
    // la fusión del final: reza de rodillas mientras su sombra entra en ella, y se levanta ("Praying")
    if (g.fuse > 0.001) blendInto(base, sampleAt(CLIPS.pray, g.fuseT, S.tmp), smooth(g.fuse))
    // la reverencia del final, frente a su sombra ("Quick Informal Bow")
    if (g.bow > 0.001) blendInto(base, sampleAt(CLIPS.bow, g.bowT, S.tmp), smooth(g.bow))
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

    root.current.position.y += g.jumpY + heightAt(g.z) + stoneLift(g.x, g.z)

    // En el título: brazos relajados junto al cuerpo y el rostro hacia la cámara
    if (!g.started) {
      root.current.updateMatrixWorld(true)
      const fwdT = TMP_FWD.set(0, 0, 1).applyQuaternion(root.current.quaternion)
      rotateBoneWorld(bones.upperarm_r, fwdT, TITLE_ARM)
      rotateBoneWorld(bones.upperarm_l, fwdT, -TITLE_ARM)
      rotateBoneLocal(bones.neck_01, axes.neck.up, TITLE_HEAD * 0.4)
      rotateBoneLocal(bones.Head, axes.head.up, TITLE_HEAD * 0.6)
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
        const pitchT = THREE.MathUtils.clamp(Math.atan2(EYE_H + g.jumpY - KNEEL.EYE_DROP * clamp01(a.listenT / KNEEL.LEN) - CROUCH_EYE_DROP * smooth(g.sit) - lookAt.h, Math.hypot(dx, dz)), inGiftScene() ? -0.95 : -0.2, 0.85)
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

    // De rodillas: la pose de "Standing Up" trae la cabeza girada; se corrige para que mire al frente
    if (g.phase !== 'intro' && g.phase !== 'rise' && g.kneel > 0.001) {
      const k = smooth(g.kneel) * (1 - smooth(g.fuse))
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
    const dim = 1 - 0.85 * g.fear * (1 - g.courage)
    const awake = Math.max(0, 1 - (g.time - g.awakeAt) / 2.5)
    if (echo) {
      return
    }
    // cada persona a la que ayudó le devuelve luz: su luz es más fuerte y llega más lejos
    const helped = helpedLights()
    // (al nacer el mundo está a oscuras: su propia luz deja verla en el suelo)
    const newborn = g.phase === 'intro' ? 1 : g.phase === 'rise' ? 1 - clamp01(g.phaseT / RISE_TIME) : 0
    light.current.intensity = (1.2 + g.c * 3 + g.spark * 3 + helped * 3) * dim + g.courage * g.fear * 5 + g.pulse * 6 + birthFlash + awake * 14 + newborn * 9
    light.current.distance = 9 + helped * 5
  })

  return (
    <group ref={root}>
      {/* su luz va por encima de la cabeza (si va delante de la cara, la "quema") */}
      {!echo && <pointLight ref={light} position={[0, 2.3, -0.3]} color="#ffdcae" distance={9} intensity={1.2} />}
      <group ref={body}>
        <primitive object={model} />
      </group>
    </group>
  )
}

useGLTF.preload(BODY_URL)
useGLTF.preload(OUTFIT_URL)
useGLTF.preload(HAIR_URL)
