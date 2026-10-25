import { useFrame } from '@react-three/fiber'
import {
  BIRTH_TIME, RISE_TIME, GATES, GATE_HOLD, GATHER_TIME, LOOK_TIME, PATH_HALF_WIDTH,
  GATE_STOP, PATH_LEN, JUMP_AIR, JUMP_CROUCH, JUMP_HEIGHT, JUMP_LAND, RUN_SPEED, WALK_SPEED, PATH_END, TOOL_DELAY, TOOL_FLY, TOOL_TO_GATE,
  smoothstep, damp, headingAt, pathAt, tangentAt,
} from './config'
import * as THREE from 'three'
import { game, input, setUi, type Phase } from './state'

const MOVE = new THREE.Vector3()
const TMP = new THREE.Vector3()
const TMP2 = new THREE.Vector3()

function setPhase(phase: Phase) {
  game.phase = phase
  game.phaseT = 0
}

/** Toda la lógica del juego. No dibuja nada; corre antes que el resto cada frame. */
export function GameLoop() {
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game
    g.time += dt
    g.phaseT += dt
    g.pulse = Math.max(0, g.pulse - dt * 1.5)

    // ── Herramientas ────────────────────────────────────────────
    g.tools.forEach((tool, k) => {
      if (tool.state === 'around' && g.phase === 'gather' && g.phaseT >= k * TOOL_DELAY) {
        tool.state = 'flyingIn'
        tool.t = 0
      }
      tool.t += dt
      if (tool.state === 'flyingIn' && tool.t >= TOOL_FLY) {
        tool.state = 'carried'
        g.pulse = 1
      }
      if (tool.state === 'toGate' && tool.t >= TOOL_TO_GATE) {
        tool.state = 'used'
        g.opened.add(tool.gate) // la herramienta abre el paso
        g.openedAt.set(tool.gate, g.time)
        g.c = Math.min(1, g.c + 0.15) // y le da un empujón de confianza
        g.pulse = 1
        setUi({ msg: null })
      }
    })

    input.backPressed = false

    // ── Fases ───────────────────────────────────────────────────
    switch (g.phase) {
      case 'intro':
        // al empezar está en el inicio del sendero, mirando hacia delante
        g.x = pathAt(0, TMP).x
        g.z = 0
        g.yaw = headingAt(0)
        // Nace de rodillas y, cuando el bosque ya cargó, se levanta sola
        // (el jugador toma el control cuando ella ya está de pie)
        if (!g.loaded) g.phaseT = 0 // espera a que todo esté cargado para empezar
        if (g.phaseT > BIRTH_TIME * 0.9) setPhase('rise')
        break

      case 'rise':
        if (g.phaseT >= RISE_TIME) setPhase('gather')
        break

      case 'gather':
        if (g.phaseT >= GATHER_TIME) setPhase('look')
        break

      case 'look':
        if (g.phaseT >= LOOK_TIME) setPhase('play')
        break

      case 'play': {
        const f = g.pMax / PATH_LEN
        // La confianza máxima crece a medida que avanza: al principio duda, al final va decidida
        const cMax = 0.25 + 0.75 * smoothstep(0, 0.7, f)

        // ── Dirección relativa a la cámara ──
        // W/↑ = hacia donde mira la cámara · S/↓ = hacia la cámara · A/D = a los lados
        const fIn = (input.forward ? 1 : 0) - (input.backward ? 1 : 0)
        const sIn = (input.right ? 1 : 0) - (input.left ? 1 : 0)
        const cy = input.camYaw
        MOVE.set(Math.sin(cy) * fIn - Math.cos(cy) * sIn, 0, Math.cos(cy) * fIn + Math.sin(cy) * sIn)
        const moving = MOVE.lengthSq() > 0.01
        if (moving) MOVE.normalize()
        if (moving) setUi({ title: false }) // el título se va al dar el primer paso
        if (moving) g.c += (cMax - g.c) * dt * 0.6
        else g.c = Math.max(0, g.c - dt * 0.06)

        // caminar (algo más rápido con la confianza) o correr manteniendo Tab
        const target = moving ? (input.run ? RUN_SPEED + 0.4 * g.c : WALK_SPEED + 0.45 * g.c) : 0
        g.speed += (target - g.speed) * damp(5, dt)

        // gira suavemente hacia donde camina (por el camino más corto)
        if (moving) {
          const want = Math.atan2(MOVE.x, MOVE.z)
          const diff = Math.atan2(Math.sin(want - g.yaw), Math.cos(want - g.yaw))
          g.yaw += diff * damp(9, dt)
        }
        // avanza hacia donde mira (así gira en curva, no de golpe)
        g.x += Math.sin(g.yaw) * g.speed * dt
        g.z += Math.cos(g.yaw) * g.speed * dt

        // ── Límites: no sale del bosque, no vuelve más atrás del inicio, y los obstáculos cortan el paso ──
        const closed = GATES.find((G) => !g.opened.has(G))
        const maxZ = Math.min(closed !== undefined ? closed - GATE_STOP : Infinity, PATH_LEN)
        g.z = THREE.MathUtils.clamp(g.z, -3, maxZ)
        const cx = pathAt(g.z, TMP).x
        g.x = THREE.MathUtils.clamp(g.x, cx - PATH_HALF_WIDTH, cx + PATH_HALF_WIDTH)
        g.p = g.z
        g.pMax = Math.max(g.pMax, g.p)

        // empuja contra un obstáculo: se queda delante y duda
        const pushing = moving && MOVE.z > 0.3
        g.blocked = closed !== undefined && g.z >= maxZ - 0.001 && maxZ < PATH_LEN
        if (g.blocked && pushing) g.speed = Math.min(g.speed, 0.2)

        if (g.blocked && closed !== undefined) {
          const sending = g.tools.some((t) => t.state === 'toGate')
          if (pushing && !sending) g.gateHold += dt
          else if (!sending) g.gateHold = Math.max(0, g.gateHold - dt)
          // "Sigue adelante."
          if (g.gateHold > 0.5 || sending) setUi({ msg: 'Keep going.' })

          if (g.gateHold >= GATE_HOLD && !sending) {
            g.gateHold = 0
            const tool = g.tools.find((t) => t.state === 'carried')
            if (tool) {
              tool.state = 'toGate'
              tool.t = 0
              tool.gate = closed
            } else {
              g.opened.add(closed)
              g.openedAt.set(closed, g.time)
              setUi({ msg: null })
            }
          }
        } else {
          g.gateHold = 0
          if (!g.tools.some((t) => t.state === 'toGate')) setUi({ msg: null })
        }

        if (g.z >= PATH_LEN - 0.01) setPhase('end')
        break
      }

      case 'end': {
        // Llega arriba… y descubre que hay más camino. Sigue corriendo.
        g.blocked = false
        g.c += (1 - g.c) * dt
        g.speed += (2.8 - g.speed) * damp(2, dt)
        // sigue el sendero sola, hacia la luz
        const t = tangentAt(g.z, TMP)
        const want = Math.atan2(t.x, t.z)
        g.yaw += Math.atan2(Math.sin(want - g.yaw), Math.cos(want - g.yaw)) * damp(3, dt)
        g.x += Math.sin(g.yaw) * g.speed * dt
        g.z = Math.min(g.z + Math.cos(g.yaw) * g.speed * dt, PATH_END - 4)
        g.x += (pathAt(g.z, TMP2).x - g.x) * damp(1, dt)
        g.p = g.z
        g.pMax = Math.max(g.pMax, g.p)
        // "Siempre hay un paso más."
        if (g.phaseT > 2.5 && g.phaseT <= 8) setUi({ msg: 'There is always one more step.' })
        if (g.phaseT > 8) setUi({ fade: true, msg: null })
        if (g.phaseT > 10) setUi({ final: true })
        break
      }
    }

    // ── Salto (Espacio) ─────────────────────────────────────────
    if (input.jumpPressed && g.jumpT < 0 && (g.phase === 'play' || g.phase === 'end')) g.jumpT = 0
    input.jumpPressed = false
    if (g.jumpT >= 0) {
      g.jumpT += dt
      const t = (g.jumpT - JUMP_CROUCH) / JUMP_AIR // 0..1 en el aire
      g.jumpY = t > 0 && t < 1 ? 4 * JUMP_HEIGHT * t * (1 - t) : 0
      if (g.jumpT > JUMP_CROUCH + JUMP_AIR + JUMP_LAND) g.jumpT = -1
    } else g.jumpY = 0

    g.idle = g.speed < 0.15 && g.jumpT < 0 ? g.idle + dt : 0
  }, -1)

  return null
}
