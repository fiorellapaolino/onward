import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { BIRTH_TIME, LOOK_BACK_TIME, LOOK_TIME, STEP_ANGLE, clamp01, damp, spiralAt } from '../game/config'
import { game } from '../game/state'

// Modelo: "Forest Enchantress" de Padarozhnik (CC BY 4.0) — ver CREDITS.md
// Versión optimizada para web (~50k triángulos, textura 1024).
// TODAVÍA NO TIENE ESQUELETO: por ahora se mueve entera (rebote, inclinación, giros).
// Cuando pase por Mixamo, aquí se conectan las animaciones de caminar/correr.
const MODEL_URL = `${import.meta.env.BASE_URL}models/enchantress.glb`
const HEIGHT = 1.15 // altura de la elfa en el mundo

const pos = new THREE.Vector3()

// Rebote suave al final de una animación (para el "nacer")
const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export function Character() {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const light = useRef<THREE.PointLight>(null!)

  const { scene } = useGLTF(MODEL_URL)

  // Copia del modelo, escalada para que mida HEIGHT y con los pies en el suelo
  const model = useMemo(() => {
    const s = scene.clone(true)
    const box = new THREE.Box3().setFromObject(s)
    const scale = HEIGHT / (box.max.y - box.min.y)
    s.scale.setScalar(scale)
    s.position.y = -box.min.y * scale
    s.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial
        mat.roughness = 0.85
        mat.metalness = 0
      }
    })
    return s
  }, [scene])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game
    const k = damp(8, dt)

    // ── Posición y hacia dónde mira ─────────────────────────────
    spiralAt(g.p, pos)
    root.current.position.copy(pos)
    let turn = 0
    if (g.lookBack > 0) {
      // Se gira a mirar atrás… y vuelve a mirar adelante
      const t = 1 - g.lookBack / LOOK_BACK_TIME
      turn = Math.sin(t * Math.PI) * Math.PI * 0.85
    }
    root.current.rotation.y = -g.p * STEP_ANGLE + turn

    // ── Nacer: crece desde la luz ──────────────────────────────
    const birth = g.phase === 'intro' ? clamp01(g.phaseT / BIRTH_TIME) : 1
    root.current.scale.setScalar(Math.max(0.001, easeOutBack(birth)))

    // ── Caminar / correr (provisional, sin esqueleto) ──────────
    const moving = g.speed > 0.15
    const bob = moving ? Math.abs(Math.sin(g.walkPhase)) * (0.02 + 0.08 * g.c) : Math.sin(g.time * 1.6) * 0.006
    body.current.position.y += (bob - body.current.position.y) * damp(20, dt)
    const lean = moving ? g.c * 0.18 : 0
    body.current.rotation.x += (lean - body.current.rotation.x) * k
    // balanceo lateral al caminar
    const sway = moving ? Math.sin(g.walkPhase) * 0.05 : 0
    body.current.rotation.z += (sway - body.current.rotation.z) * damp(12, dt)

    // ── Mirar a los costados cuando duda (gira el cuerpo, sin cabeza todavía)
    let look = 0
    if (g.phase === 'look') {
      look = Math.sin((g.phaseT / LOOK_TIME) * Math.PI * 2) * 0.5
    } else if (g.phase === 'play' && (g.idle > 0.6 || g.blocked)) {
      look = Math.sin(g.time * 1.4) * 0.45
    }
    body.current.rotation.y += (look - body.current.rotation.y) * damp(4, dt)

    // ── Su luz: crece con la confianza y destella en momentos clave
    const birthFlash = g.phase === 'intro' ? (1 - birth) * 25 : 0
    light.current.intensity = 2 + g.c * 6 + g.pulse * 12 + birthFlash
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
