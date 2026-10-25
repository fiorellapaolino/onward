import { useFrame } from '@react-three/fiber'
import {
  BIRTH_TIME, GATES, GATE_HOLD, GATHER_TIME, LOOK_BACK_TIME, LOOK_TIME,
  GATE_STOP, PATH_LEN, PATH_END, TOOL_DELAY, TOOL_FLY, TOOL_TO_GATE, smoothstep, damp,
} from './config'
import { game, input, setUi, type Phase } from './state'

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

    // ── Mirar atrás (nunca retrocede) ───────────────────────────
    if (input.backPressed && g.lookBack <= 0 && (g.phase === 'play' || g.phase === 'look')) {
      g.lookBack = LOOK_BACK_TIME
    }
    input.backPressed = false
    g.lookBack = Math.max(0, g.lookBack - dt)

    // ── Fases ───────────────────────────────────────────────────
    switch (g.phase) {
      case 'intro':
        // Nace; cuando el jugador empieza, agarra las herramientas
        if (g.phaseT > BIRTH_TIME * 0.8 && g.loaded && input.forward) {
          setPhase('gather')
          setUi({ title: false })
        }
        break

      case 'gather':
        if (g.phaseT >= GATHER_TIME) setPhase('look')
        break

      case 'look':
        if (g.phaseT >= LOOK_TIME) setPhase('play')
        break

      case 'play': {
        const f = g.p / PATH_LEN
        // La confianza máxima crece a medida que subes: al principio duda, al final corre
        const cMax = 0.25 + 0.75 * smoothstep(0, 0.7, f)
        const forward = input.forward && g.lookBack === 0
        if (forward) g.c += (cMax - g.c) * dt * 0.6
        else g.c = Math.max(0, g.c - dt * 0.06)

        const target = forward ? 0.9 + 3.4 * g.c : 0 // metros por segundo
        g.speed += (target - g.speed) * damp(5, dt)

        // ¿Hay un obstáculo más adelante?
        const closed = GATES.find((G) => !g.opened.has(G))
        const maxP = Math.min(closed !== undefined ? closed - GATE_STOP : Infinity, PATH_LEN)
        g.p = Math.min(g.p + g.speed * dt, maxP)
        g.blocked = closed !== undefined && g.p >= closed - GATE_STOP - 0.001

        if (g.blocked && closed !== undefined) {
          g.speed = 0
          const sending = g.tools.some((t) => t.state === 'toGate')
          if (forward && !sending) g.gateHold += dt
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
        }

        if (g.p >= PATH_LEN - 0.01) setPhase('end')
        break
      }

      case 'end': {
        // Llega arriba… y descubre que hay más camino. Sigue corriendo.
        g.blocked = false
        g.c += (1 - g.c) * dt
        g.speed += (3.2 - g.speed) * damp(2, dt)
        g.p = Math.min(g.p + g.speed * dt, PATH_END - 4)
        // "Siempre hay un paso más."
        if (g.phaseT > 2.5 && g.phaseT <= 8) setUi({ msg: 'There is always one more step.' })
        if (g.phaseT > 8) setUi({ fade: true, msg: null })
        if (g.phaseT > 10) setUi({ final: true })
        break
      }
    }

    g.idle = g.speed < 0.15 ? g.idle + dt : 0
    g.walkPhase += g.speed * 2.2 * dt
  }, -1)

  return null
}
