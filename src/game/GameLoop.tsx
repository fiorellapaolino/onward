import { useFrame } from '@react-three/fiber'
import {
  RISE_TIME, GATHER_TIME, LOOK_TIME, PATH_HALF_WIDTH, SHADOW_S, TALK_DIST,
  PATH_LEN, JUMP_AIR, JUMP_BOOST, JUMP_CROUCH, JUMP_HEIGHT, JUMP_LAND, RUN_SPEED, WALK_SPEED, PATH_END, TOOL_ABSORB, TOOL_DELAY, TOOL_FLY,
  smoothstep, damp, headingAt, pathAt, tangentAt,
} from './config'
import * as THREE from 'three'
import { game, input, setUi, type Phase } from './state'
import { MUSIC, musicTime } from './music'
import { COLLIDERS, ELDER, GIRL, LANTERNS } from './village'
import {
  AWAKE_MSG, ELDER_LINES, FEAR_MSG, GIRL_LINES, GOAL_HELP, LIT_MSG, PROMPT_LISTEN, PROMPT_STAY, SHADOW_BLOCK, goalLanterns,
} from './story'
import { applyDebug, debugMode } from './debug'

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

    if (g.lit.length !== LANTERNS.length) g.lit = LANTERNS.map(() => -1)
    applyDebug() // (?at=… en la dirección: empezar directamente en un punto, para probar)

    // ── Música del nacimiento ───────────────────────────────────
    const prevMusic = g.musicT
    if (!debugMode) g.musicT = musicTime()
    // un destello en cada frase en la que aparece un elemento
    for (const t of MUSIC.ELEMENT_TIMES) if (prevMusic < t && g.musicT >= t) g.pulse = 1
    // la música se corta: silencio, y aparece el título
    if (prevMusic < MUSIC.CUT && g.musicT >= MUSIC.CUT) setUi({ title: true })
    if (g.musicT >= MUSIC.CUT + 5.5 && g.musicT < MUSIC.CUT + 6) setUi({ title: false })

    // ── Elementos del Mago ──────────────────────────────────────
    // al incorporarse vuelan a ella; cuando empieza a caminar entran en su pecho y desaparecen
    // (la magia queda dormida dentro: se despertará ayudando a otros)
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
      if (tool.state === 'carried' && g.phase === 'play' && g.phaseT >= 1 + k * 0.25) {
        tool.state = 'absorbing'
        tool.t = 0
      }
      if (tool.state === 'absorbing' && tool.t >= TOOL_ABSORB) {
        tool.state = 'inside'
        g.pulse = 0.7
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
        // Nace de rodillas y respira con la música; cuando entran los graves, se levanta sola
        // (el jugador toma el control cuando ella ya está de pie)
        if (!g.started) g.phaseT = 0 // espera al clic de inicio
        if (g.musicT >= MUSIC.RISE_AT) setPhase('rise')
        break

      case 'rise':
        if (g.phaseT >= RISE_TIME) setPhase('gather')
        break

      case 'gather':
        if (g.phaseT >= GATHER_TIME) setPhase('look')
        break

      case 'look':
        if (g.phaseT >= LOOK_TIME) {
          setPhase('play')
          setUi({ hint: true }) // ahora le toca al jugador: se muestran los controles
        }
        break

      case 'play': {
        // Escuchando a alguien: la elfa se queda quieta mirándole; E / Espacio / clic pasa a la siguiente frase
        if (g.talk) {
          const who = g.talk === 'girl' ? GIRL : ELDER
          const lines = g.talk === 'girl' ? GIRL_LINES : ELDER_LINES
          g.speed += (0 - g.speed) * damp(8, dt)
          const want = Math.atan2(who.x - g.x, who.z - g.z)
          g.yaw += Math.atan2(Math.sin(want - g.yaw), Math.cos(want - g.yaw)) * damp(5, dt)
          if (g.talk === 'girl') g.girlNear += (1 - g.girlNear) * damp(1.5, dt)
          else g.elderNear += (1 - g.elderNear) * damp(1.5, dt)
          g.lineT += dt
          const next = (input.interact || input.jumpPressed) && g.lineT > 0.35
          input.jumpPressed = false // (Espacio no salta mientras escucha)
          if (next) {
            g.line++
            g.lineT = 0
            if (g.line < lines.length) setUi({ say: lines[g.line] })
            else {
              const was = g.talk
              g.talk = null
              setUi({ say: null })
              if (was === 'girl') {
                // terminó de contar: ahora hay que ayudar a la aldea
                g.story = 'help'
                g.c = Math.min(1, g.c + 0.15)
                g.pulse = 0.8
                setUi({ goal: GOAL_HELP })
              } else {
                // el anciano tiene miedo… y la oscuridad se acerca también a ella
                g.story = 'fear'
                g.courage = 0
                setUi({ msg: FEAR_MSG })
              }
            }
          }
          break
        }
        const f = g.pMax / PATH_LEN
        // La confianza máxima crece a medida que avanza: al principio duda, al final va decidida
        const cMax = 0.25 + 0.75 * smoothstep(0, 0.7, f)

        // ── Dirección relativa a la cámara ──
        // W/↑ = hacia donde mira la cámara · S/↓ = hacia la cámara · A/D = a los lados
        // (en el móvil, la palanca táctil suma lo mismo que las teclas)
        const fIn = THREE.MathUtils.clamp((input.forward ? 1 : 0) - (input.backward ? 1 : 0) - input.joyY, -1, 1)
        const sIn = THREE.MathUtils.clamp((input.right ? 1 : 0) - (input.left ? 1 : 0) + input.joyX, -1, 1)
        const cy = input.camYaw
        MOVE.set(Math.sin(cy) * fIn - Math.cos(cy) * sIn, 0, Math.cos(cy) * fIn + Math.sin(cy) * sIn)
        const moving = MOVE.lengthSq() > 0.04 // (con la palanca, un toque mínimo no la mueve)
        if (moving) MOVE.normalize()
        if (moving && g.phaseT > 4) setUi({ hint: false }) // los controles se van tras los primeros pasos
        if (moving) g.c += (cMax - g.c) * dt * 0.6
        else g.c = Math.max(0, g.c - dt * 0.06)

        // caminar (algo más rápido con la confianza) o correr manteniendo Tab
        const target = moving ? (input.run || input.runToggle ? RUN_SPEED + 0.4 * g.c : WALK_SPEED + 0.45 * g.c) : 0
        g.speed += (target - g.speed) * damp(5, dt)

        // gira suavemente hacia donde camina (por el camino más corto)
        if (moving) {
          const want = Math.atan2(MOVE.x, MOVE.z)
          const diff = Math.atan2(Math.sin(want - g.yaw), Math.cos(want - g.yaw))
          g.yaw += diff * damp(9, dt)
        }
        // avanza hacia donde mira (así gira en curva, no de golpe)
        // y en el aire el salto la impulsa: recorre más que caminando
        const airborne = g.jumpT >= JUMP_CROUCH && g.jumpT < JUMP_CROUCH + JUMP_AIR
        const air = airborne ? Math.sin(((g.jumpT - JUMP_CROUCH) / JUMP_AIR) * Math.PI) : 0
        const step = airborne ? g.speed + JUMP_BOOST * (0.6 + 0.4 * air) : g.speed
        g.x += Math.sin(g.yaw) * step * dt
        g.z += Math.cos(g.yaw) * step * dt

        // ── Límites: no sale del bosque, no vuelve más atrás del inicio, y la sombra corta el paso ──
        const maxZ = g.shadowOpen ? PATH_LEN : SHADOW_S - 1.2
        g.z = THREE.MathUtils.clamp(g.z, -3, maxZ)
        const cx = pathAt(g.z, TMP).x
        g.x = THREE.MathUtils.clamp(g.x, cx - PATH_HALF_WIDTH, cx + PATH_HALF_WIDTH)
        // no atraviesa las casas, ni a la gente, ni los faroles
        for (const c of COLLIDERS) {
          const cdx = g.x - c.x
          const cdz = g.z - c.z
          const cd = Math.hypot(cdx, cdz)
          if (cd < c.r && cd > 1e-4) {
            g.x = c.x + (cdx / cd) * c.r
            g.z = c.z + (cdz / cd) * c.r
          }
        }
        const gd = Math.hypot(g.x - GIRL.x, g.z - GIRL.z)
        g.p = g.z
        g.pMax = Math.max(g.pMax, g.p)

        // empuja contra la sombra: duda, y un texto lo explica
        g.blocked = !g.shadowOpen && g.z >= maxZ - 0.05
        if (g.blocked && moving && MOVE.z > 0.3) {
          g.speed = Math.min(g.speed, 0.2)
          setUi({ msg: SHADOW_BLOCK })
        } else if (g.z < maxZ - 2 && g.story !== 'fear' && g.time - g.awakeAt > 4) setUi({ msg: null })

        // ── La gente de la aldea ──
        g.girlNear += ((gd < 6 ? 1 : 0) - g.girlNear) * damp(1.5, dt)
        const ed = Math.hypot(g.x - ELDER.x, g.z - ELDER.z)
        g.elderNear += ((ed < 5 ? 1 : 0) - g.elderNear) * damp(1.5, dt)
        const startTalk = (who: 'girl' | 'elder', lines: string[]) => {
          g.talk = who
          g.line = 0
          g.lineT = 0
          setUi({ prompt: null, hint: false, msg: null, say: lines[0] })
        }
        // a quién puede escuchar ahora (la niña primero; el anciano después de ella)
        const listen = g.story === 'seek' && gd < TALK_DIST ? 'girl' : g.story === 'help' && ed < TALK_DIST ? 'elder' : null
        if (g.story === 'seek' || g.story === 'help') setUi({ prompt: listen ? PROMPT_LISTEN : null, hold: -1 })
        if (listen && input.interact) startTalk(listen, listen === 'girl' ? GIRL_LINES : ELDER_LINES)

        // ── El miedo: la oscuridad la rodea. Si se queda (mantener E, quieta), despierta su luz ──
        if (g.story === 'fear') {
          g.fear += (1 - g.fear) * damp(0.7, dt)
          const staying = input.hold && g.speed < 0.4
          g.courage = staying ? Math.min(1, g.courage + dt / 2.6) : Math.max(0, g.courage - dt / 1.5)
          setUi({ prompt: PROMPT_STAY, hold: Math.round(g.courage * 40) / 40 })
          if (g.courage >= 1) {
            g.story = 'lanterns'
            g.lightAwake = true
            g.awakeAt = g.time
            g.pulse = 1
            g.c = Math.min(1, g.c + 0.2)
            setUi({ prompt: null, hold: -1, msg: AWAKE_MSG })
          }
        } else g.fear += (0 - g.fear) * damp(1.2, dt)

        // ── Los faroles: con su luz despierta, se encienden al pasar a su lado ──
        if (g.story === 'lanterns') {
          if (g.time - g.awakeAt > 3.5) setUi({ msg: null })
          LANTERNS.forEach((l, i) => {
            if (g.lit[i] < 0 && Math.hypot(g.x - l.x, g.z - l.z) < 1.7) {
              g.lit[i] = g.time
              g.pulse = Math.max(g.pulse, 0.5)
            }
          })
          const n = g.lit.filter((t) => t >= 0).length
          setUi({ goal: goalLanterns(n, LANTERNS.length) })
          if (n === LANTERNS.length) {
            g.story = 'next'
            g.pulse = 1
            g.c = Math.min(1, g.c + 0.15)
            setUi({ goal: GOAL_HELP, msg: LIT_MSG })
            g.awakeAt = g.time // (para quitar el mensaje después)
          }
        }
        if (g.story === 'next' && g.time - g.awakeAt > 4) setUi({ msg: null })

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

    input.interact = false

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
