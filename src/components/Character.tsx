import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BIRTH_TIME, LOOK_BACK_TIME, LOOK_TIME, STEP_ANGLE, clamp01, damp, spiralAt } from '../game/config'
import { game } from '../game/state'

const SKIN = '#f4ecdf'
const SCARF = '#d9774a'
const pos = new THREE.Vector3()

// Rebote suave al final de una animación (para el "nacer")
const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/**
 * La personita: sin rasgos, expresiva por cómo se mueve.
 * Mirando hacia +Z = hacia adelante. Su izquierda es +X.
 */
export function Character() {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const armL = useRef<THREE.Group>(null!)
  const armR = useRef<THREE.Group>(null!)
  const legL = useRef<THREE.Group>(null!)
  const legR = useRef<THREE.Group>(null!)
  const light = useRef<THREE.PointLight>(null!)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game
    const k = damp(8, dt)

    // ── Posición sobre la espiral y hacia dónde mira ───────────
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

    // ── Caminar / correr ───────────────────────────────────────
    const moving = g.speed > 0.15
    const bob = moving ? Math.abs(Math.sin(g.walkPhase)) * (0.03 + 0.12 * g.c) : 0
    body.current.position.y += (bob - body.current.position.y) * damp(20, dt)
    const lean = moving ? g.c * 0.3 : 0 // se inclina hacia adelante cuando corre
    body.current.rotation.x += (lean - body.current.rotation.x) * k

    const swing = moving ? Math.sin(g.walkPhase) * (0.35 + 0.6 * g.c) : 0
    legL.current.rotation.x += (swing - legL.current.rotation.x) * damp(20, dt)
    legR.current.rotation.x += (-swing - legR.current.rotation.x) * damp(20, dt)

    // Brazos: pose del Mago al principio (un brazo arriba, el otro hacia abajo y afuera)
    const magician = g.phase === 'intro' || g.phase === 'gather'
    const armRX = magician ? -2.7 : -swing * 0.8
    const armLX = magician ? 0 : swing * 0.8
    const armLZ = magician ? 0.35 : 0.08
    armR.current.rotation.x += (armRX - armR.current.rotation.x) * k
    armL.current.rotation.x += (armLX - armL.current.rotation.x) * k
    armL.current.rotation.z += (armLZ - armL.current.rotation.z) * k

    // ── Cabeza: mira a los costados cuando duda ────────────────
    let headY = 0
    if (g.phase === 'look') {
      headY = Math.sin((g.phaseT / LOOK_TIME) * Math.PI * 2) * 0.9 // izquierda, derecha, al frente
    } else if (g.phase === 'play' && (g.idle > 0.6 || g.blocked)) {
      headY = Math.sin(g.time * 1.4) * 0.9
    }
    // Al final, levanta la mirada hacia el horizonte
    const headX = g.phase === 'end' ? -0.35 : g.phase === 'intro' ? -0.15 : 0
    head.current.rotation.y += (headY - head.current.rotation.y) * damp(5, dt)
    head.current.rotation.x += (headX - head.current.rotation.x) * damp(3, dt)

    // ── Su luz: crece con la confianza y destella en momentos clave
    const birthFlash = g.phase === 'intro' ? (1 - birth) * 25 : 0
    light.current.intensity = 2 + g.c * 6 + g.pulse * 12 + birthFlash
  })

  return (
    <group ref={root}>
      <pointLight ref={light} position={[0, 1.1, 0.3]} color="#ffcf8a" distance={9} intensity={2} />
      <group ref={body}>
        {/* Torso */}
        <mesh position={[0, 0.52, 0]}>
          <capsuleGeometry args={[0.17, 0.3, 8, 16]} />
          <meshStandardMaterial color={SKIN} roughness={0.6} />
        </mesh>
        {/* Bufanda */}
        <mesh position={[0, 0.76, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.13, 0.045, 8, 24]} />
          <meshStandardMaterial color={SCARF} roughness={0.7} />
        </mesh>
        {/* Cabeza */}
        <group ref={head} position={[0, 0.92, 0]}>
          <mesh>
            <sphereGeometry args={[0.17, 24, 24]} />
            <meshStandardMaterial color={SKIN} roughness={0.6} />
          </mesh>
        </group>
        {/* Brazos (el pivote está en el hombro) */}
        <group ref={armL} position={[0.21, 0.66, 0]}>
          <mesh position={[0, -0.12, 0]}>
            <capsuleGeometry args={[0.05, 0.2, 6, 10]} />
            <meshStandardMaterial color={SKIN} roughness={0.6} />
          </mesh>
        </group>
        <group ref={armR} position={[-0.21, 0.66, 0]}>
          <mesh position={[0, -0.12, 0]}>
            <capsuleGeometry args={[0.05, 0.2, 6, 10]} />
            <meshStandardMaterial color={SKIN} roughness={0.6} />
          </mesh>
        </group>
        {/* Piernas (el pivote está en la cadera) */}
        <group ref={legL} position={[0.08, 0.32, 0]}>
          <mesh position={[0, -0.15, 0]}>
            <capsuleGeometry args={[0.06, 0.18, 6, 10]} />
            <meshStandardMaterial color={SKIN} roughness={0.6} />
          </mesh>
        </group>
        <group ref={legR} position={[-0.08, 0.32, 0]}>
          <mesh position={[0, -0.15, 0]}>
            <capsuleGeometry args={[0.06, 0.18, 6, 10]} />
            <meshStandardMaterial color={SKIN} roughness={0.6} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
