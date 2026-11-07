import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { PATH_END, PATH_LEN, pathAt, SHADOW_S, VILLAGE_R, VILLAGE_S, clamp01, distToVillage, gradient, smoothstep, RISE_TIME } from '../game/config'
import { game, helpedLights, litFraction } from '../game/state'
import { MUSIC } from '../game/music'
import { debugMode } from '../game/debug'
import { sombraMode } from '../game/sombra'
import { Ground } from './Ground'
import { SUN_DIR, Scenery, skyState } from './Scenery'
import { aliveAt } from '../game/fires'

// Versión iluminada (de día). La oscuridad del principio se añadirá más adelante.
// El bosque cambia a medida que avanza: mañana fresca → luz verde entre las hojas → luz dorada
// (el cielo de verdad está en Scenery.tsx: este color es el de la neblina del horizonte, a lo lejos)
const SKY = ['#d3d3c8', '#d6d3c4', '#dcd4be', '#e2d4b8', '#e8d6b4', '#efdcc0'].map((c) => new THREE.Color(c))
// tinte que se aplica sobre la textura del pasto (blanco = color original)
const GROUND = ['#f2f7ee', '#ffffff', '#ffffff', '#fffbe8', '#fff4d6', '#ffefcc'].map((c) => new THREE.Color(c))

// la sombra de la aldea apaga los colores: cielo gris, luz débil
const GLOOM_SKY = new THREE.Color('#646a76')
const GLOOM_GROUND = new THREE.Color('#9a9c9e')
// sin chispa el mundo está algo apagado (menos color); cada momento vivido se lo devuelve
const DULL_SKY = new THREE.Color('#b7bcc0')
const DULL_GROUND = new THREE.Color('#c9cdc4')

const tmp = new THREE.Color()

// al nacer todo está a oscuras: solo se ve la luz de la elfa. Al ponerse de pie, el mundo se ilumina.
const NIGHT = new THREE.Color('#06080f')
const MEMORY_SKY = new THREE.Color('#f6d9a2')
const NIGHT_GROUND = new THREE.Color('#1a1d24')

/** Cuánto se ha despertado el mundo: 0 a oscuras (recién nacida) → 1 de día. */
function wakeTarget() {
  const g = game
  if (debugMode) return 1
  if (g.phase === 'intro') return g.started ? 0.1 * smoothstep(0.3, MUSIC.RISE_AT, g.musicT) : 0
  if (g.phase === 'rise') return 0.1 + 0.9 * smoothstep(RISE_TIME * 0.3, RISE_TIME, g.phaseT)
  return 1
}

/*
 * El bosque oscuro después de la aldea: el último tramo antes del claro está a oscuras.
 * Solo se ve lo que ilumina su luz… y las luces de la gente a la que ayudó, que van con ella.
 * (0 = de día, 1 = en lo más oscuro). Al llegar al claro del final vuelve la luz.
 */
function darkStretch() {
  const g = game
  if (g.phase !== 'play' && g.phase !== 'end') return 0
  return smoothstep(SHADOW_S + 1, SHADOW_S + 7, g.z) * (1 - smoothstep(PATH_LEN - 19, PATH_LEN - 13, g.z))
}

// un grupo de luciérnagas cada 24 m del sendero
const FIREFLY_SPOTS = Array.from({ length: Math.ceil((PATH_END + 30) / 24) }, (_, i) => pathAt(i * 24 - 6))

const SHADOW_SIZE = 1536
const SHADOW_TEXEL = 60 / SHADOW_SIZE // (el mapa de sombras cubre 60 m)
const SUN_FWD = SUN_DIR.clone().normalize()
const SUN_RIGHT = new THREE.Vector3(0, 1, 0).cross(SUN_FWD).normalize()
const SUN_UP = SUN_FWD.clone().cross(SUN_RIGHT).normalize()
const _sun = new THREE.Vector3()

export function World() {
  const scene = useThree((s) => s.scene)
  const ground = useRef<THREE.MeshStandardMaterial>(null)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const sun = useRef<THREE.DirectionalLight>(null!)
  const sunTarget = useMemo(() => new THREE.Object3D(), [])
  const fogOpen = useRef(0)
  const gloomRef = useRef(0)
  const ambient = useRef<THREE.AmbientLight>(null!)
  const wake = useRef(debugMode ? 1 : 0)
  const dark = useRef(0)
  const asleep = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const f = clamp01(game.pMax / PATH_LEN) // lo más lejos que llegó: la luz no retrocede

    // ¿cuánto la cubre la sombra de la aldea? (0 lejos → 1 dentro; pasada la aldea, sigue a oscuras)
    const inside = game.z > VILLAGE_S ? 1 : 1 - smoothstep(VILLAGE_R - 3, VILLAGE_R + 22, distToVillage(game.x, game.z))
    const gloomTarget = game.shadowOpen ? 0 : inside * (1 - 0.6 * litFraction()) // los faroles la apartan
    gloomRef.current += (gloomTarget - gloomRef.current) * Math.min(1, dt * 1.2)
    const gl = gloomRef.current * (1 - game.memory) * 0.35 // (en el recuerdo no hay sombra; la aldea apenas se apaga)

    // amanece despacio (unos 3 s), nunca de golpe
    const wt = wakeTarget()
    wake.current += (wt - wake.current) * Math.min(1, dt * (wt > wake.current ? 0.9 : 4))
    const w = wake.current
    // el tramo oscuro del final (más suave que la noche del nacimiento)
    const dk = darkStretch()
    dark.current += (dk - dark.current) * Math.min(1, dt * 1.5)
    if (debugMode) dark.current = dk // (en las pruebas, sin esperar)
    // el bosque está apagado: solo revive cerca de las hogueras encendidas (game/fires.ts)
    const inForest = 1 - smoothstep(VILLAGE_S - VILLAGE_R - 12, VILLAGE_S - VILLAGE_R - 2, game.z)
    // (sin hogueras: el bosque no está apagado; en el prototipo ?sombra, sí: es de noche y la luz la pone lo que despierta)
    const asleepT = sombraMode ? 0.85 : 0 * inForest * aliveAt(game.x, game.z)
    asleep.current += (asleepT - asleep.current) * Math.min(1, dt * 1.2)
    if (debugMode) asleep.current = asleepT // (en las pruebas, sin esperar)
    const night = Math.max(1 - w, dark.current * 0.85, asleep.current)
    skyState.night = night

    // el sol sigue a la elfa (para que sus sombras siempre estén definidas alrededor de ella)
    // (avanza de a un píxel exacto del mapa de sombras: si no, todas las sombras tiemblan al caminar)
    _sun.set(game.x, 0, game.z)
    const along = _sun.dot(SUN_FWD)
    const across = Math.round(_sun.dot(SUN_RIGHT) / SHADOW_TEXEL) * SHADOW_TEXEL
    const high = Math.round(_sun.dot(SUN_UP) / SHADOW_TEXEL) * SHADOW_TEXEL
    sunTarget.position.copy(SUN_RIGHT).multiplyScalar(across).addScaledVector(SUN_UP, high).addScaledVector(SUN_FWD, along)
    sun.current.position.copy(sunTarget.position).addScaledVector(SUN_DIR, 90)

    const dull = (1 - Math.min(1, game.spark * 1.4)) * (1 - game.memory)
    gradient(SKY, f, tmp)
    tmp.lerp(DULL_SKY, dull * 0.45)
    tmp.lerp(GLOOM_SKY, gl * 0.8)
    tmp.lerp(NIGHT, night)
    tmp.lerp(NIGHT, asleep.current * 0.6) // (el bosque apagado, más oscuro: la mezcla lineal queda gris si no)
    tmp.lerp(MEMORY_SKY, game.memory * 0.55) // el recuerdo: cálido, dorado
    if (scene.background instanceof THREE.Color) scene.background.copy(tmp)
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(tmp)
      // la niebla se abre: cada vez ve más lejos
      // al nacer hay niebla espesa; cuando entran los graves en la canción (ella ya camina), se abre de golpe
      const open = game.started && game.musicT >= MUSIC.BASS_IN ? 1 : 0
      fogOpen.current += (open - fogOpen.current) * Math.min(1, dt * (open ? 0.9 : 5))
      const o = fogOpen.current
      skyState.haze = 1 - o // (con niebla espesa no se ven ni el cielo ni las montañas)
      skyState.hazeColor.copy(tmp)
      scene.fog.near = ((2 + o * 70) + f * 20) * (1 - 0.5 * gl)
      scene.fog.far = ((12 + o * 240) + f * 60) * (1 - 0.45 * gl)
      // a oscuras apenas se ve alrededor de ella
      scene.fog.near *= 0.3 + 0.7 * w
      scene.fog.far = scene.fog.far * (0.45 + 0.55 * w)
      // en el tramo oscuro se ve tan lejos como llega su luz: más lejos cuanta más gente ayudó
      const sight = 6 + helpedLights() * 6
      scene.fog.near = THREE.MathUtils.lerp(scene.fog.near, 1, dark.current)
      scene.fog.far = THREE.MathUtils.lerp(scene.fog.far, sight, dark.current)
    }

    if (ground.current) gradient(GROUND, f, ground.current.color).lerp(DULL_GROUND, dull * 0.35).lerp(GLOOM_GROUND, gl * 0.7).lerp(NIGHT_GROUND, night * 0.9)
    hemi.current.intensity = (1.2 + f * 0.1) * (1 - 0.45 * gl)
    sun.current.intensity = (4.9 + f * 0.4) * (1 - 0.6 * gl)
    const lightW = Math.min(w, 1 - dark.current * 0.85, 1 - asleep.current * 0.9)
    hemi.current.intensity *= 0.04 + 0.96 * lightW
    sun.current.intensity *= lightW * lightW
    ambient.current.intensity = 0.16 * (0.2 + 0.8 * lightW)

  })

  return (
    <>
      <color attach="background" args={['#bcd9e6']} />
      <fog attach="fog" args={['#bcd9e6', 25, 110]} />
      <Scenery />
      <hemisphereLight ref={hemi} args={['#9fc0ea', '#6d5a3c', 0.95]} />
      <ambientLight ref={ambient} intensity={0.16} />
      {/* El sol: bajo, dorado, detrás y a la derecha de la cámara. Da las sombras largas y marcadas */}
      <primitive object={sunTarget} />
      <directionalLight
        ref={sun}
        target={sunTarget}
        intensity={4.4}
        color="#ffd09a"
        castShadow
        shadow-mapSize={[SHADOW_SIZE, SHADOW_SIZE]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={5}
        shadow-camera-far={190}
        shadow-intensity={0.84}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />

      {/* Suelo del bosque: pasto con textura y sendero de tierra */}
      <Ground tintRef={ground} />

      {/* Luciérnagas quietas en su sitio a lo largo del sendero (no siguen a la elfa) */}
      {FIREFLY_SPOTS.map((p, i) => (
        <Sparkles key={i} count={14} scale={[18, 5, 26]} position={[p.x, 2, p.z]} size={4} speed={0.25} color="#e9ff9a" />
      ))}
    </>
  )
}
