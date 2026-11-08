import { useFrame } from '@react-three/fiber'
import { clamp01, RISE_TIME, GATHER_TIME, LOOK_TIME, PATH_HALF_WIDTH, SHADOW_S, TALK_DIST, PATH_LEN, JUMP_AIR, JUMP_BOOST, JUMP_CROUCH, JUMP_HEIGHT, JUMP_LAND, RUN_SPEED, WALK_SPEED, PATH_END, smoothstep, damp, headingAt, pathAt, sideAt, tangentAt, STAIR_END, STAIR_Z0, STREET_HALF, streetToWorld, worldToStreet } from './config'
import * as THREE from 'three'
import { BORN, ECHO_DELAY, RETURN_TIME, body, game, input, setUi, shadow, trail, type Phase } from './state'
import { altarLocks, fallDrop, updateAltar } from './altar'
import { MUSIC, musicTime, playThemeAgain } from './music'
import { CLIPS, duration } from './anim'
import { BELLS, BELL_R, BELLOWS, BOXES, COLLIDERS, ELDER, FORGE_R, GIRL, LANTERNS, MELODY, MUSICIAN, PLATES, PLATE_R, POLE, SMITH, ANVIL, ANVIL_R, COOL_STONE, shadowCovers } from './village'
import { NOTES, bell, chord, flute, heartbeat, hiss, voice } from './sfx'
import {
  ELDER_LINES, ELF_WORDS, FEAR_MSG, GIRL_LINES, GOAL_HELP, GOAL_SEED, GOAL_LANTERN, GOAL_MUSIC, LIT_MSG, MUSIC_DONE, MUSIC_HINT, PROMPT_LISTEN, PROMPT_STAY, SHADOW_BLOCK, SHADOW_MSG,
  SMITH_LINES, SMITH_THANKS, SMITH_EARLY, GOAL_SMITH, PROMPT_WARMER, PROMPT_RIGHT, PROMPT_TOO_HOT, GOAL_FIRE, GOAL_BEND, BEND_MSG, HOT_MSG, GATE_MSG, GOAL_KEY, PROMPT_PUMP, PROMPT_FORGE, PROMPT_TAKE, GOAL_TAKE, SMITH_HOT, GOAL_COOL, PROMPT_COOL, SMITH_ALTAR, SMITH_IRON, GOAL_ALTAR,
} from './story'
import { applyDebug, debugFF, debugMode, debugPause, debugStay } from './debug'
import { MEMORY_LINES } from './story'
import { updateMoments } from './moments'
import { SOMBRA_END, sombraMode, updateSombra } from './sombra'
import { fires } from './fires'
import { GIFT, inGiftScene } from './gift'

const MOVE = new THREE.Vector3()
const TMP = new THREE.Vector3()
const TMP2 = new THREE.Vector3()

/** Dónde nace (metro del sendero): cerca de la aldea, para empezar enseguida con el anciano. */
export const START_Z = 36
let jumpBuf = 0 // Espacio pulsado hace poco: salta en cuanto pueda (no se pierde la pulsación)
let blockMsg = false // se está mostrando "la sombra es demasiado espesa"
let nextBeat = 0 // cuándo suena el próximo latido (con el miedo)

function setPhase(phase: Phase) {
  game.phase = phase
  game.phaseT = 0
}

/** Toda la lógica del juego. No dibuja nada; corre antes que el resto cada frame. */
export function GameLoop() {
  useFrame((_, rawDt) => {
    // (?ff=T: adelanta el juego T segundos de golpe, para las capturas; con &pause se queda ahí)
    if (debugPause && game.started && ffLeft <= 0) return
    step(rawDt)
    if (ffLeft > 0 && game.started) for (; ffLeft > 0; ffLeft -= 0.05) step(0.05)
  }, -1)

  return null
}

let ffLeft = debugFF
/** La reverencia del final, más lenta que la captura (si no, no hay sentimiento). */
const BOW_SPEED = 0.62

/** Un paso del juego (dt en segundos). */
/** Las frases de quien habla (el herrero tiene dos: el encargo y el agradecimiento). */
function linesOf(who: 'girl' | 'elder' | 'smith' | null) {
  if (who === 'girl') return GIRL_LINES
  if (who === 'smith') return game.story === 'forgeDone' ? SMITH_THANKS : game.story === 'keyHot' ? SMITH_HOT : game.story === 'smith' ? SMITH_LINES : game.story === 'altar' ? SMITH_ALTAR : game.story === 'starIron' ? SMITH_IRON : SMITH_EARLY
  return ELDER_LINES
}

/*
 * La herrería, paso a paso:
 *   forgeFire  parada sobre el fuelle, cada E aviva el fuego; se apaga solo. Hay que tenerlo en su punto un rato.
 *   forgeBend  el hierro al rojo espera en el yunque: con E, el herrero se pone a trabajar.
 *   forging    el herrero martilla (golpes, chispas) y el hierro se vuelve una llave.
 *   keyHot     la llave quema, sobre una piedra delante del yunque: el fuego está detrás de ella,
 *              y su sombra tiene que caer sobre la llave para enfriarla.
 *   forgeDone  el herrero habla; keyReady: ella toma la llave con E.
 */
const FORGE_GOOD = [0.45, 0.9] // el fuego en su punto (margen ancho)
const FORGE_HOT = 0.97
const FORGE_PUMP = 0.13 // cuánto aviva cada E
const PUMP_GAP = 0.35 // segundos entre bombeos (el fuelle tiene que volver a llenarse)
const FORGE_COOL = 0.06 // cuánto baja por segundo
const FORGE_HOLD = 3 // segundos en su punto para que esté listo
const FORGE_BEAT = 0.75 // segundos entre martillazos
const FORGE_STRIKES = 5
const COOL_TIME = 2.6 // segundos de sombra para que se enfríe
let hotShown = false
let nextHiss = 0
let smithQuiet = false // ya le dijo que vuelva más tarde: no insistir hasta que se aleje
function updateForge(dt: number, startTalk: (who: 'smith', lines: string[]) => void) {
  const g = game
  const onIt = (p: { x: number; z: number }, r: number, who: { x: number; z: number; jumpY: number }) => Math.hypot(who.x - p.x, who.z - p.z) < r && who.jumpY < 0.15
  if (g.story === 'forgeFire') {
    const atBellows = onIt(BELLOWS, FORGE_R, g)
    g.forgeHeat = Math.max(0.05, g.forgeHeat - FORGE_COOL * dt)
    if (atBellows && input.interact && g.time - g.forgePumpAt > PUMP_GAP) {
      g.forgeHeat = Math.min(1, g.forgeHeat + FORGE_PUMP)
      g.forgePumpAt = g.time // (llamarada en el horno)
      flute(180 + g.forgeHeat * 220, 0.22, 0.6) // el soplido del fuelle
    }
    const good = g.forgeHeat > FORGE_GOOD[0] && g.forgeHeat < FORGE_GOOD[1]
    const hot = g.forgeHeat > FORGE_HOT
    if (hot !== hotShown) {
      hotShown = hot
      setUi({ msg: hot ? HOT_MSG : null })
    }
    // demasiado caliente: baja rápido (en un momento vuelve a su punto) y casi no pierde lo avanzado
    if (hot) {
      g.forgeHeat = Math.max(FORGE_GOOD[1] - 0.05, g.forgeHeat - dt * 0.25)
      g.forgeGood = Math.max(0, g.forgeGood - dt * 0.1)
    } else g.forgeGood = good ? Math.min(1, g.forgeGood + dt / FORGE_HOLD) : Math.max(0, g.forgeGood - dt * 0.15)
    // el aviso dice cómo está el fuego, y la barra muestra su calor (sube con cada E)
    // (con puntos que se van llenando: cuánto falta para que esté listo)
    const dots = ' ' + '●'.repeat(Math.floor(g.forgeGood * 4)) + '○'.repeat(4 - Math.floor(g.forgeGood * 4))
    const label = (hot ? PROMPT_TOO_HOT : good ? PROMPT_RIGHT : g.forgeHeat > 0.3 ? PROMPT_WARMER : PROMPT_PUMP) + dots
    setUi({ prompt: atBellows ? label : null, hold: atBellows ? Math.round(g.forgeHeat * 40) / 40 : -1 })
    if (g.forgeGood >= 1) {
      // el herrero saca el hierro del fuego y lo pone en el yunque
      g.story = 'forgeBend'
      g.forgeHits = 0
      g.pulse = 0.6
      hotShown = false
      bell(NOTES[0])
      setUi({ prompt: null, hold: -1, goal: GOAL_BEND, msg: BEND_MSG })
    }
    return
  }
  const nearAnvil = Math.hypot(g.x - ANVIL.x, g.z - ANVIL.z) < ANVIL_R
  if (g.story === 'forgeBend') {
    // el hierro al rojo espera en el yunque: con E, el herrero se pone a trabajar
    setUi({ prompt: nearAnvil ? PROMPT_FORGE : null, hold: -1 })
    if (nearAnvil && input.interact) {
      g.story = 'forging'
      g.forgingAt = g.time
      g.forgeHits = 0
      setUi({ prompt: null, msg: null })
    }
    return
  }
  if (g.story === 'forging') {
    // martilla: un golpe cada FORGE_BEAT, con chispas; la barra se va doblando hasta ser una llave
    const k = g.time - g.forgingAt
    const hit = Math.floor((k - 0.55) / FORGE_BEAT) + 1
    if (hit > g.forgeHits && hit <= FORGE_STRIKES) {
      g.forgeHits = hit
      g.forgeHitAt = g.time
      g.pulse = 0.35
      bell(NOTES[Math.min(4, hit)])
    }
    if (k > 0.55 + FORGE_STRIKES * FORGE_BEAT + 0.5) {
      // forjada… pero al rojo: la deja sobre la piedra y explica que hay que enfriarla
      g.story = 'keyHot'
      g.keyCool = 0
      g.pulse = 0.6
      bell(NOTES[4])
      setUi({ goal: null })
      startTalk('smith', SMITH_HOT)
    }
    return
  }
  if (g.story === 'keyHot') {
    if (g.talk) return
    // su sombra (el fuego del horno está detrás de ella) tiene que caer sobre la llave
    const covered = g.jumpY < 0.3 && shadowCovers(g.x, g.z, COOL_STONE.x, COOL_STONE.z)
    if (covered) {
      g.keyCool = Math.min(1, g.keyCool + dt / COOL_TIME)
      g.keyShadeAt = g.time
      if (g.time >= nextHiss) {
        hiss(1 - 0.6 * g.keyCool)
        nextHiss = g.time + 0.42
      }
    }
    setUi({ prompt: covered ? PROMPT_COOL : null, hold: covered ? Math.round(g.keyCool * 40) / 40 : -1 })
    if (g.keyCool >= 1) {
      // ¡se enfrió! ahora sí es una llave: el herrero la mira… y habla
      g.story = 'forgeDone'
      g.forgeDoneAt = g.awakeAt = g.time
      g.pulse = 1
      chord()
      setUi({ prompt: null, hold: -1, goal: null })
      startTalk('smith', SMITH_THANKS)
    }
    return
  }
  if (g.story === 'keyReady') {
    // la llave queda sobre la piedra: hay que tomarla
    const nearKey = Math.hypot(g.x - COOL_STONE.x, g.z - COOL_STONE.z) < ANVIL_R
    setUi({ prompt: nearKey ? PROMPT_TAKE : null, hold: -1 })
    if (nearKey && input.interact) {
      g.story = 'key'
      g.keyAt = g.time
      g.pulse = 1
      chord()
      setUi({ prompt: null, goal: GOAL_KEY })
    }
  }
}

/** Cuánto se prueba hacia adelante para ver si hay un borde o una pared (m). */
const PROBE = 0.3
const CONSTRAINED = { x: 0, z: 0 }
/**
 * Dónde puede estar de verdad: no sale del bosque, no vuelve más atrás del inicio, la sombra corta el paso,
 * la escalera solo se entra por el hueco, y no atraviesa casas, gente ni faroles. (Devuelve siempre el mismo objeto.)
 */
function constrain(x0: number, z0: number, maxZ: number, dt: number) {
  let x = x0
  let z = THREE.MathUtils.clamp(z0, START_Z - 3, maxZ)
  const cx = pathAt(z, TMP).x
  x = THREE.MathUtils.clamp(x, cx - PATH_HALF_WIDTH, cx + PATH_HALF_WIDTH)
  // ── La escalera: solo se entra por el hueco entre los muros; arriba y al bajar, por el medio ──
  // (en coordenadas de la calle, que está girada: el muro no es una línea recta en el mundo)
  const inStreet = worldToStreet(x, z)
  if (inStreet.lz > WALL_FRONT && inStreet.lz < WALL_BACK) {
    let { lx, lz } = inStreet
    if (Math.abs(lx) > STREET_HALF + 0.4) lz = lz < WALL_BACK / 2 ? WALL_FRONT : WALL_BACK // (choca contra el muro)
    else {
      const inside = THREE.MathUtils.clamp(lx, -STREET_HALF, STREET_HALF)
      lx += THREE.MathUtils.clamp(inside - lx, -2 * dt, 2 * dt) // (se acomoda al entrar, sin saltar)
    }
    const back = streetToWorld(lx, lz)
    x = back.x
    z = back.z
  }
  // no atraviesa a la gente ni los faroles
  for (const c of COLLIDERS) {
    const cdx = x - c.x
    const cdz = z - c.z
    const cd = Math.hypot(cdx, cdz)
    if (cd < c.r && cd > 1e-4) {
      x = c.x + (cdx / cd) * c.r
      z = c.z + (cdz / cd) * c.r
    }
  }
  // las casas: rectángulos girados; si queda dentro, sale por el lado más cercano
  for (const b of BOXES) {
    const dx = x - b.x
    const dz = z - b.z
    const c = Math.cos(b.rot)
    const s = Math.sin(b.rot)
    let lx = dx * c - dz * s
    let lz = dx * s + dz * c
    const px = b.hx - Math.abs(lx)
    const pz = b.hz - Math.abs(lz)
    if (px > 0 && pz > 0) {
      if (px < pz) lx = Math.sign(lx || 1) * b.hx
      else lz = Math.sign(lz || 1) * b.hz
      x = b.x + lx * c + lz * s
      z = b.z - lx * s + lz * c
    }
  }
  CONSTRAINED.x = x
  CONSTRAINED.z = z
  return CONSTRAINED
}

/** Hasta dónde se guía a la elfa hacia el hueco de la escalera: metros antes del muro y a los lados del hueco. */
const STAIR_GUIDE = { ahead: 1.6, reach: 3 }
/** Los muros de la terraza, en metros de la calle (dejando el grosor de su cuerpo para que no los atraviese). */
const WALL_FRONT = -0.35
const WALL_BACK = STAIR_END - STAIR_Z0 + 0.5

function step(rawDt: number) {
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
    // la música se corta: silencio, y aparece el título
    if (prevMusic < MUSIC.CUT && g.musicT >= MUSIC.CUT) setUi({ title: true })
    if (g.musicT >= MUSIC.CUT + 5.5 && g.musicT < MUSIC.CUT + 6) setUi({ title: false })

    input.backPressed = false

    // ── Fases ───────────────────────────────────────────────────
    switch (g.phase) {
      case 'intro':
        // al empezar está en el inicio del sendero, mirando hacia delante
        // (nace cerca de la aldea: a pocos pasos está el anciano)
        g.x = pathAt(START_Z, TMP).x
        g.z = START_Z
        g.p = g.pMax = START_Z
        g.yaw = headingAt(START_Z)
        // Al apretar Begin ya está de pie, mirando hacia el camino, y el jugador la mueve
        // (las fases rise/gather/look de la intro anterior quedaron sin uso)
        if (!g.started) g.phaseT = 0 // espera al clic de inicio
        else {
          setPhase('play')
          setUi({ hint: true }) // se muestran los controles
        }
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
        // La escena de la semilla: quieta, mirando a la niña (la cámara se acerca a las dos)
        if (inGiftScene()) {
          g.speed += (0 - g.speed) * damp(8, dt)
          const want = Math.atan2(GIRL.x - g.x, GIRL.z - g.z)
          g.yaw += Math.atan2(Math.sin(want - g.yaw), Math.cos(want - g.yaw)) * damp(4, dt)
          g.girlNear = 1
          input.jumpPressed = false
          jumpBuf = 0
          break
        }
        // Escuchando a alguien: la elfa se queda quieta mirándole; E / Espacio / clic pasa a la siguiente frase
        if (g.talk) {
          const who = g.talk === 'girl' ? GIRL : g.talk === 'smith' ? SMITH : ELDER
          const lines = linesOf(g.talk)
          g.speed += (0 - g.speed) * damp(8, dt)
          const want = Math.atan2(who.x - g.x, who.z - g.z)
          g.yaw += Math.atan2(Math.sin(want - g.yaw), Math.cos(want - g.yaw)) * damp(5, dt)
          if (g.talk === 'girl') g.girlNear += (1 - g.girlNear) * damp(1.5, dt)
          else if (g.talk === 'smith') g.smithNear += (1 - g.smithNear) * damp(1.5, dt)
          else g.elderNear += (1 - g.elderNear) * damp(1.5, dt)
          g.lineT += dt
          const next = (input.interact || input.jumpPressed) && g.lineT > 0.35
          input.jumpPressed = false // (Espacio no salta mientras escucha)
          jumpBuf = 0
          if (next) {
            g.line++
            g.lineT = 0
            if (g.line < lines.length) {
              setUi({ say: lines[g.line] })
              voice(lines[g.line], g.talk === 'girl' ? 260 : g.talk === 'smith' ? 95 : 120)
            }
            else {
              const was = g.talk
              g.talk = null
              setUi({ say: null })
              if (was === 'girl') {
                // terminó de contar: atrapar una semilla de su árbol y llevársela
                g.story = 'seed'
                g.pulse = 0.5
                setUi({ goal: GOAL_SEED })
              } else if (was === 'smith' && g.story === 'smith') {
                // el encargo: no tiene hierro… el de la estrella solo se ve desde el altar
                g.story = 'altar'
                smithQuiet = true // (no lo repite enseguida si aprieta E de más)
                setUi({ goal: GOAL_ALTAR })
              } else if (was === 'smith' && g.story === 'starIron') {
                // trajo el hierro de estrella: ahora el fuego
                g.story = 'forgeFire'
                g.forgeGood = 0
                setUi({ goal: GOAL_FIRE })
              } else if (was === 'smith' && g.story === 'keyHot') {
                // ahora: su sombra sobre la llave
                setUi({ goal: GOAL_COOL })
              } else if (was === 'smith' && g.story !== 'forgeDone') {
                // (le habló antes de tiempo: no lo repite hasta que ella se vaya y vuelva)
                smithQuiet = true
              } else if (was === 'smith') {
                // la llave queda sobre el yunque: ahora hay que tomarla
                g.story = 'keyReady'
                setUi({ goal: GOAL_TAKE, msg: null })
              } else {
                // el anciano tiene miedo… y la oscuridad se acerca también a ella
                g.story = 'fear'
                g.courage = 0
                nextBeat = g.time + 0.8
                setUi({ msg: FEAR_MSG, cine: true })
              }
            }
          }
          break
        }
        // ── Nace su sombra: de ella sale una figura de luz, de rodillas como ella. La elfa se levanta,
        //    mira hacia la plaza y da unos pasos; la figura (que repite lo que ella hizo) hace lo mismo detrás ──
        if (g.story === 'born') {
          const k = g.time - g.shadowAt
          g.fear += (0 - g.fear) * damp(1.2, dt)
          const r = smoothstep(BORN.RISE, BORN.RISE + BORN.RISE_LEN, k)
          g.sit = 1 - r // se incorpora
          g.kneel = 0
          if (k > BORN.TURN) {
            const want = Math.atan2(POLE.x - g.x, POLE.z - g.z)
            g.yaw += Math.atan2(Math.sin(want - g.yaw), Math.cos(want - g.yaw)) * damp(3, dt)
          }
          const walk = k > BORN.STEP && k < BORN.STEP + BORN.STEP_LEN && Math.hypot(POLE.x - g.x, POLE.z - g.z) > 2.5
          g.speed += ((walk ? 0.75 : 0) - g.speed) * damp(5, dt)
          g.x += Math.sin(g.yaw) * g.speed * dt
          g.z += Math.cos(g.yaw) * g.speed * dt
          g.p = g.z
          g.pMax = Math.max(g.pMax, g.p)
          // una nota cuando se levanta ella… y la misma, más suave, cuando se levanta su sombra
          if (k - dt < BORN.RISE && k >= BORN.RISE) bell(NOTES[2])
          if (k - dt < BORN.RISE + ECHO_DELAY && k >= BORN.RISE + ECHO_DELAY) bell(NOTES[2], true)
          input.jumpPressed = false
          jumpBuf = 0
          if (k >= BORN.FREE) {
            g.story = 'plates'
            setUi({ cine: false, msg: SHADOW_MSG, goal: GOAL_LANTERN })
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
        if (debugStay && g.story === 'fear') input.hold = true
        // (con la palanca, un toque mínimo no la mueve; y mientras dice "Stay" no camina: se queda con el anciano)
        const moving = MOVE.lengthSq() > 0.04 && g.story !== 'fear' && !altarLocks()
        if (moving) MOVE.normalize()
        // ── Al llegar a la escalera, si va hacia adelante y apenas le erra al hueco, camina hacia él (no se queda contra el muro) ──
        const here = worldToStreet(g.x, g.z)
        if (moving && MOVE.z > 0.3 && here.lz > WALL_FRONT - STAIR_GUIDE.ahead && here.lz <= WALL_FRONT) {
          const edge = STREET_HALF - 0.3
          if (Math.abs(here.lx) > edge && Math.abs(here.lx) < STREET_HALF + STAIR_GUIDE.reach) {
            const aim = streetToWorld(Math.sign(here.lx) * edge, WALL_FRONT + 0.6)
            const aimX = aim.x - g.x
            const aimZ = aim.z - g.z
            const len = Math.hypot(aimX, aimZ)
            if (MOVE.x * (aimX / len) >= -0.3) MOVE.set(aimX / len, 0, aimZ / len) // (si se aleja a propósito, no se la fuerza)
          }
        }
        if (moving && g.phaseT > 4) setUi({ hint: false }) // los controles se van tras los primeros pasos
        if (moving) g.c += (cMax - g.c) * dt * 0.6
        else g.c = Math.max(0, g.c - dt * 0.06)

        // caminar (algo más rápido con la confianza) o correr manteniendo Tab
        const target = moving ? (input.run || input.runToggle ? RUN_SPEED + 0.4 * g.c : WALK_SPEED + 0.45 * g.c) : 0
        g.speed += (target - g.speed) * damp(5, dt)

        // gira suavemente hacia donde camina (por el camino más corto)
        if (moving) {
          let want = Math.atan2(MOVE.x, MOVE.z)
          // si en esa dirección hay un borde o una pared, mira hacia donde de verdad puede ir (a lo largo de la pared):
          // si no, camina mirando contra el muro mientras se desliza de costado, y parece que tambalea
          // (se prueba un paso desde donde está ahora: no depende de lo que pasó antes, así no oscila)
          const maxZNow = sombraMode ? SOMBRA_END : g.shadowOpen ? PATH_LEN : SHADOW_S - 1.2
          const probe = constrain(g.x + MOVE.x * PROBE, g.z + MOVE.z * PROBE, maxZNow, 0)
          const pdx = probe.x - g.x
          const pdz = probe.z - g.z
          const free = Math.hypot(pdx, pdz)
          if (free < PROBE * 0.85 && free > PROBE * 0.15) want = Math.atan2(pdx, pdz)
          const diff = Math.atan2(Math.sin(want - g.yaw), Math.cos(want - g.yaw))
          g.yaw += diff * damp(9, dt)
        }
        // avanza hacia donde mira (así gira en curva, no de golpe)
        // y en el aire el salto la impulsa: recorre más que caminando
        const airborne = g.jumpT >= JUMP_CROUCH && g.jumpT < JUMP_CROUCH + JUMP_AIR
        const air = airborne ? Math.sin(((g.jumpT - JUMP_CROUCH) / JUMP_AIR) * Math.PI) : 0
        const step = airborne ? g.speed + JUMP_BOOST * (0.6 + 0.4 * air) : g.speed
        const fromX = g.x
        const fromZ = g.z
        g.x += Math.sin(g.yaw) * step * dt
        g.z += Math.cos(g.yaw) * step * dt

        // ── Límites, muros, casas y gente (ver constrain) ──
        const maxZ = sombraMode ? SOMBRA_END : g.shadowOpen ? PATH_LEN : SHADOW_S - 1.2
        const fixed = constrain(g.x, g.z, maxZ, dt)
        g.x = fixed.x
        g.z = fixed.z
        // si algo la frena (un muro, una casa), los pies van a lo que de verdad avanzó: no camina en el sitio
        if (dt > 0) g.speed = Math.min(g.speed, Math.hypot(g.x - fromX, g.z - fromZ) / dt)
        const gd = Math.hypot(g.x - GIRL.x, g.z - GIRL.z)
        g.p = g.z
        g.pMax = Math.max(g.pMax, g.p)

        // con la llave, al llegar al portal: gira la llave y se abre
        if (g.story === 'key' && !g.shadowOpen && g.z >= maxZ - 0.6) {
          g.story = 'next'
          g.shadowOpen = true
          g.awakeAt = g.time
          g.pulse = 1
          chord()
          setUi({ goal: null, msg: GATE_MSG })
        }
        // empuja contra la sombra: duda, y un texto lo explica
        g.blocked = !sombraMode && !g.shadowOpen && g.z >= maxZ - 0.05
        if (g.blocked && moving && MOVE.z > 0.3) {
          g.speed = Math.min(g.speed, 0.2)
          setUi({ msg: SHADOW_BLOCK })
          blockMsg = true
        } else if (blockMsg && g.z < maxZ - 2) {
          setUi({ msg: null }) // (solo quita su propio mensaje)
          blockMsg = false
        }

        // ── La gente de la aldea ──
        g.girlNear += ((gd < 6 ? 1 : 0) - g.girlNear) * damp(1.5, dt)
        const ed = Math.hypot(g.x - ELDER.x, g.z - ELDER.z)
        g.elderNear += ((ed < 5 ? 1 : 0) - g.elderNear) * damp(1.5, dt)
        const startTalk = (who: 'girl' | 'elder' | 'smith', lines: string[]) => {
          g.talk = who
          g.line = 0
          g.lineT = 0
          setUi({ prompt: null, hint: false, msg: null, say: lines[0] })
          voice(lines[0], who === 'girl' ? 260 : who === 'smith' ? 95 : 120)
        }
        g.smithNear += ((Math.hypot(g.x - SMITH.x, g.z - SMITH.z) < 5 ? 1 : 0) - g.smithNear) * damp(1.5, dt)
        updateForge(dt, startTalk)
        // a quién puede escuchar ahora (la niña; el anciano; y al herrero siempre que no esté en pleno trabajo)
        const sd = Math.hypot(g.x - SMITH.x, g.z - SMITH.z)
        const smithFree = !g.plane && g.prayAt < 0 && (g.story === 'help' || g.story === 'plates' || g.story === 'smith' || g.story === 'altar' || g.story === 'starIron')
        if (sd > 5 || g.story === 'smith') smithQuiet = false
        const nearSmith = smithFree && !smithQuiet && sd < TALK_DIST + 0.4
        const listen =
          g.story === 'seek' && gd < TALK_DIST ? 'girl' : g.story === 'help' && ed < TALK_DIST && !(nearSmith && sd < ed) ? 'elder' : nearSmith ? 'smith' : null
        if (g.story === 'seek' || smithFree) setUi({ prompt: listen ? PROMPT_LISTEN : null, hold: -1 })
        if (listen && input.interact) startTalk(listen, linesOf(listen))
        // el altar: rezar, y su yo oscuro en el plano que la luz esconde
        updateAltar(dt)

        // ── La semilla para la niña: quieta bajo su árbol → una semilla baja a su mano → se la lleva ──
        if (g.story === 'seed') {
          // le lleva una brasa de las hogueras del bosque: al llegar con ella, se la da
          // (ella la sostiene, se pone de pie y enciende el fuego de su hogar)
          g.carrying = fires.ember > 0
          if (g.carrying && gd < 1.9 && g.giftAt < 0) {
            g.giftAt = g.time
            g.carrying = false
            fires.ember = 0
            g.pulse = 1
            g.spark = Math.min(1, g.spark + 1 / 7)
            setUi({ msg: null, goal: null, hint: false })
          }
          if (g.giftAt >= 0 && g.time - g.giftAt > GIFT.END + 0.3) {
            // su alegría viaja como una luz hasta el anciano: ahora se le puede escuchar
            g.story = 'help'
            g.relayAt = g.time
            g.relayFrom = { x: GIRL.x, z: GIRL.z }
            g.relayTo = { x: ELDER.x, z: ELDER.z }
            // …y otra parte de su alegría vuelve a la elfa
            g.returns.push({ x: GIRL.x, y: 0.9, z: GIRL.z, at: g.time + 0.6 })
            setUi({ goal: GOAL_HELP })
          }
        }
        if (g.giftAt >= 0 && g.time - g.giftAt > GIFT.END + 2 && g.time - g.giftAt < GIFT.END + 2.2) setUi({ msg: null })

        // ── El miedo: la oscuridad la rodea. Si se queda (mantener E, quieta), la oscuridad toma su forma ──
        if (g.story === 'fear') {
          g.fear += (1 - g.fear) * damp(0.7, dt)
          const staying = input.hold && g.speed < 0.4
          g.courage = staying ? Math.min(1, g.courage + dt / 2.6) : Math.max(0, g.courage - dt / 1.5)
          // al quedarse se agacha en cuclillas; si suelta, se vuelve a poner de pie
          g.sit = staying ? Math.min(1, g.sit + dt / 1.1) : Math.max(0, g.sit - dt / 0.7)
          setUi({ prompt: PROMPT_STAY, hold: Math.round(g.courage * 40) / 40 })
          // el corazón late rápido con la oscuridad; al quedarse, se va calmando
          if (g.time >= nextBeat) {
            heartbeat(0.4 + 0.6 * g.fear * (1 - 0.6 * g.courage))
            nextBeat = g.time + 0.62 + 0.75 * g.courage
          }
          if (g.courage >= 1) {
            // nace su sombra: desde ahora repite lo que ella hizo unos segundos antes
            // (empieza agachada en su mismo sitio: se ve que es ella)
            g.story = 'born'
            g.shadowOn = true
            g.shadowAt = g.awakeAt = g.time
            g.sit = 1
            trail.length = 0
            g.pulse = 1
            chord()
            setUi({ prompt: null, hold: -1, msg: null })
          }
        } else g.fear += (0 - g.fear) * damp(1.2, dt)

        // ── Las dos piedras de la plaza: el gran farol sube si están pisadas a la vez ──
        if (g.story === 'plates' && g.time - g.shadowAt > BORN.FREE + 5 && g.time - g.shadowAt < BORN.FREE + 5.2) setUi({ msg: null })
        if (g.story !== 'seek' && g.story !== 'help' && g.story !== 'fear' && g.story !== 'born') {
          PLATES.forEach((pl, i) => {
            const me = Math.hypot(g.x - pl.x, g.z - pl.z) < PLATE_R && g.jumpY < 0.15
            const sh = g.shadowOn && Math.hypot(shadow.x - pl.x, shadow.z - pl.z) < PLATE_R && shadow.jumpY < 0.15
            g.plates[i] = me || sh
          })
          if (g.story === 'plates' && g.plates.every(Boolean)) {
            // ¡sube! y los faroles de la aldea se encienden en cadena desde la plaza
            g.story = 'smith' // (el portal viejo sigue cerrado: la llave la tiene el herrero)
            g.liftAt = g.awakeAt = g.time
            g.lightAwake = true
            g.pulse = 1
            g.c = Math.min(1, g.c + 0.2)
            LANTERNS.forEach((l, i) => (g.lit[i] = g.time + 1.2 + Math.hypot(l.x - POLE.x, l.z - POLE.z) * 0.12))
            // el anciano ve la luz y se levanta su ánimo: su luz también vuelve a ella
            g.returns.push({ x: ELDER.x, y: 1.0, z: ELDER.z, at: g.time + 2.2 })
            setUi({ goal: GOAL_SMITH, msg: LIT_MSG })
          }
        }
        // (el portal se abre cuando el herrero le da la llave: ver la herrería)
        // ── La música escondida: tocar su melodía en las campanas; la sombra la repite detrás (canon) ──
        if (g.story === 'music' || g.story === 'next') {
          const since = g.time - g.awakeAt
          if (g.story === 'music' && since > 5 && since < 5.2) setUi({ msg: MUSIC_HINT, goal: GOAL_MUSIC })
          if (g.story === 'music' && since > 10 && since < 10.2) setUi({ msg: null })
          const ring = (i: number, who: 1 | 2) => {
            g.bellAt[i] = g.time
            g.bellBy[i] = who
            bell(NOTES[i], who === 2)
          }
          BELLS.forEach((b, i) => {
            const me = Math.hypot(g.x - b.x, g.z - b.z) < BELL_R && g.jumpY < 0.2
            if (me && !g.bellIn[i]) {
              ring(i, 1)
              g.mySeq.push(i)
              if (g.mySeq.length > 8) g.mySeq.shift()
            }
            g.bellIn[i] = me
            const sh = g.shadowOn && Math.hypot(shadow.x - b.x, shadow.z - b.z) < BELL_R && shadow.jumpY < 0.2
            if (sh && !g.bellInShadow[i]) {
              ring(i, 2)
              g.shadowSeq.push(i)
              if (g.shadowSeq.length > 8) g.shadowSeq.shift()
            }
            g.bellInShadow[i] = sh
          })
          const endsWith = (seq: number[]) => seq.length >= MELODY.length && MELODY.every((n, k) => seq[seq.length - MELODY.length + k] === n)

          if (g.story === 'music') {
            // ella toca su melodía a escondidas cada pocos segundos (si la elfa está cerca),
            // y las campanas brillan suave con cada nota: así se ve qué campana es cada nota
            const near = Math.hypot(g.x - MUSICIAN.x, g.z - MUSICIAN.z) < 16
            if (near && g.time - g.tuneAt > 9 && since > 6) g.tuneAt = g.time
            MELODY.forEach((n, k) => {
              const at = g.tuneAt + 0.5 + k * 0.6
              if (g.time - dt < at && g.time >= at) {
                const dist = Math.hypot(g.x - MUSICIAN.x, g.z - MUSICIAN.z)
                flute(NOTES[n], 0.45, Math.max(0.25, 1 - dist / 16))
                g.bellAt[n] = g.time
                g.bellBy[n] = 3
              }
            })
            // la elfa tocó la melodía… y cuando su sombra la repite detrás (canon), ella se atreve
            if (endsWith(g.shadowSeq)) {
              g.story = 'next'
              g.freedAt = g.awakeAt = g.time
              g.pulse = 1
              g.c = Math.min(1, g.c + 0.15)
              setUi({ msg: MUSIC_DONE, goal: GOAL_HELP })
            }
          }
          // al salir, toca su melodía con la elfa y la sombra: tres voces en canon, dos veces
          if (g.freedAt >= 0) {
            for (let rep = 0; rep < 2; rep++)
              MELODY.forEach((n, k) => {
                const base = g.freedAt + 1.2 + rep * 3.2 + k * 0.6
                for (const [off, voice] of [[0, 0], [1.2, 1], [2.4, 2]] as const) {
                  const at = base + off
                  if (g.time - dt < at && g.time >= at) {
                    if (voice === 0) flute(NOTES[n], 0.5)
                    else bell(NOTES[n], voice === 2)
                    g.bellAt[n] = g.time
                    g.bellBy[n] = voice === 0 ? 3 : voice === 1 ? 1 : 2
                  }
                }
              })
          }
        }
        if ((g.story === 'next' || g.story === 'smith' || g.story === 'key') && g.time - g.awakeAt > 6 && g.time - g.awakeAt < 6.2) setUi({ msg: null })

        // ── Momentos de estar viva (semilla, charcos, luciérnagas, flores…) ──
        updateMoments(dt)
        if (sombraMode) updateSombra()

        // el claro del final: se detiene… y se da vuelta
        if (g.shadowOpen && g.z >= PATH_LEN - 12) {
          setPhase('end')
          g.speed = 0
          g.jumpT = -1
          g.endStart = { x: g.x, z: g.z }
          const back = pathAt(g.z - 2.4, TMP) // (cerca: tiene que llegar hasta ella y abrazarla de verdad)
          g.endShadow = { x: back.x, z: back.z }
          setUi({ msg: null, goal: null, hint: false, prompt: null })
        }
        break
      }

      case 'end': {
        // ── El final ──────────────────────────────────────────────
        //  0.0–1.6  se detiene; detrás, su sombra (su pasado) se arrodilla a rezar
        //  1.6–4.6  se da vuelta y camina despacio hasta ella
        //  4.6–9.0  de pie frente a ella, le hace una reverencia lenta ("Quick Informal Bow"); la frase del final (hasta 12.5)
        //  8.0–10   la sombra entra en ella (la integró: ahora es parte de ella); destello
        //  10.4–    camina hacia la luz, entera, con su luz más fuerte; vuelve la canción
        const T = g.phaseT
        const sh = shadow
        const toShadow = Math.atan2(g.endShadow.x - g.x, g.endShadow.z - g.z)
        const turn = (want: number, rate: number) => {
          g.yaw += Math.atan2(Math.sin(want - g.yaw), Math.cos(want - g.yaw)) * damp(rate, dt)
        }
        // la sombra: quieta en su sitio, mirando hacia la elfa
        if (T < 10) {
          Object.assign(sh, g)
          sh.x = g.endShadow.x
          sh.z = g.endShadow.z
          sh.yaw = Math.atan2(g.x - sh.x, g.z - sh.z)
          sh.speed = 0
          sh.jumpT = -1
          sh.jumpY = 0
          sh.talk = null
          sh.fear = 0
          sh.kneel = Math.min(1, T / 1.2)
          sh.kneelT = 0
          // la sombra reza de rodillas desde el principio, esperándola ("Praying", más lento; sin llegar a levantarse)
          sh.fuse = smoothstep(0, 1.2, T)
          sh.fuseT = Math.min(T * 0.6, 5)
          sh.bow = 0
        }
        if (T < 1.6) {
          g.speed = 0
        } else if (T < 4.6) {
          turn(toShadow, 4)
          const d = Math.hypot(g.endShadow.x - g.x, g.endShadow.z - g.z)
          const want = d > 0.7 && T > 2.2 ? 0.8 : 0
          g.speed += (want - g.speed) * damp(4, dt)
          g.x += Math.sin(g.yaw) * g.speed * dt
          g.z += Math.cos(g.yaw) * g.speed * dt
        } else if (T < 8) {
          g.speed = 0
          turn(toShadow, 6)
          // de pie frente a ella, le hace una reverencia (la sombra sigue rezando de rodillas)
          g.kneel = 0
          g.fuse = 0
          // (lenta: al 62 % de su velocidad, para que se sienta)
          g.bow = smoothstep(4.6, 5.0, T) * (1 - smoothstep(8.7, 9.1, T))
          g.bowT = (T - 4.6) * BOW_SPEED
          g.hug = sh.hug = 0
          if (T > 5.6 && T - dt <= 5.6) g.pulse = 1
          if (T > 5.8) setUi({ msg: ELF_WORDS })
        } else if (T < 10) {
          // la sombra entra en ella: se acerca hasta ocupar su mismo lugar y se apaga (ver Character: se desvanece)
          const m = smoothstep(8, 9.4, T)
          sh.x = g.endShadow.x + (g.x - g.endShadow.x) * m
          sh.z = g.endShadow.z + (g.z - g.endShadow.z) * m
          sh.yaw = g.yaw
          sh.hug = g.hug = 0
          sh.kneel = 1
          // termina de incorporarse de la reverencia mientras la sombra entra en ella
          g.bow = 1 - smoothstep(8.7, 9.1, T)
          g.bowT = (T - 4.6) * BOW_SPEED
          if (T > 9.4 && T - dt <= 9.4) {
            // ahora es parte de ella: su luz estalla
            g.pulse = 1
            g.awakeAt = g.time
            g.c = 1
            chord()
          }
          g.fuse = 0
          g.kneel = 0

        } else {
          // camina hacia adelante, entera: su sombra ya es parte de ella
          if (T - dt <= 10) playThemeAgain()
          g.fuse = 0
          g.bow = 0
          g.kneel = 0
          sh.kneel = 0
          g.hug = sh.hug = 0
          g.c += (1 - g.c) * dt
          g.speed += ((T > 10.4 ? 1.1 : 0) - g.speed) * damp(1.2, dt)
          const t = tangentAt(g.z, TMP)
          turn(Math.atan2(t.x, t.z), 2)
          g.x += Math.sin(g.yaw) * g.speed * dt
          g.z = Math.min(g.z + Math.cos(g.yaw) * g.speed * dt, PATH_END - 4)
          g.x += (pathAt(g.z, TMP2).x - 0.45 - g.x) * damp(1, dt)
          Object.assign(sh, g) // (dentro de ella: ya no se ve)
          sh.talk = null
          sh.fear = 0
          // la frase del final se queda hasta que todo se funde en luz (y vuelve en la pantalla final)
          if (T > 25) setUi({ fade: true, msg: null })
          if (T > 28) setUi({ final: true })
        }
        g.p = g.z
        g.pMax = Math.max(g.pMax, g.p)
        break
      }
    }

    input.interact = false

    // el recuerdo: mientras la niña cuenta cómo era antes, la aldea vuelve a verse como era
    const remembering = g.talk === 'girl' && (g.line === MEMORY_LINES[0] || g.line === MEMORY_LINES[1])
    g.memory += ((remembering ? 1 : 0) - g.memory) * damp(remembering ? 1.2 : 1.6, dt)

    // la luz de alguien a quien ayudó llega a su pecho: destello y unas campanitas
    for (const r of g.returns) {
      const arrive = r.at + RETURN_TIME
      if (g.time - dt < arrive && g.time >= arrive) {
        g.pulse = 1
        g.c = Math.min(1, g.c + 0.1)
        chord()
      }
    }

    // ── Salto (Espacio) ─────────────────────────────────────────
    if (input.jumpPressed) jumpBuf = 0.3
    input.jumpPressed = false
    if (!(g.jumpT >= 0)) g.jumpT = -1 // (nunca queda en un valor raro)
    // (puede volver a saltar apenas toca el piso: no hace falta esperar a que termine de amortiguar)
    const landedFor = g.jumpT - (JUMP_CROUCH + JUMP_AIR)
    if (jumpBuf > 0 && (g.jumpT < 0 || landedFor >= 0) && g.phase === 'play' && !g.talk && g.story !== 'fear' && !inGiftScene() && !altarLocks()) {
      g.jumpT = 0
      jumpBuf = 0
    }
    jumpBuf = Math.max(0, jumpBuf - dt)
    if (g.jumpT >= 0) {
      g.jumpT += dt
      const t = (g.jumpT - JUMP_CROUCH) / JUMP_AIR // 0..1 en el aire
      g.jumpY = t > 0 && t < 1 ? 4 * JUMP_HEIGHT * t * (1 - t) : 0
      if (g.jumpT > JUMP_CROUCH + JUMP_AIR + JUMP_LAND) g.jumpT = -1
    } else g.jumpY = 0

    g.idle = g.speed < 0.15 && g.jumpT < 0 ? g.idle + dt : 0

    // ── La sombra: guarda lo que hace ella y la sombra lo repite ECHO_DELAY segundos después ──
    if (g.plane) {
      // el jugador maneja a su sombra (sin retraso); su cuerpo queda arrodillado en el altar
      Object.assign(shadow, g)
      shadow.sit = 0
      shadow.talk = null
      shadow.jumpY = g.jumpY - fallDrop()
      Object.assign(body, g)
      body.x = g.bodyX
      body.z = g.bodyZ
      body.yaw = g.bodyYaw
      body.speed = 0
      body.jumpT = -1
      body.jumpY = 0
      body.idle = 5
      body.sit = 1
      body.kneel = 0
      body.talk = null
      body.fear = 0
      body.blocked = false
      trail.length = 0 // (al volver, la sombra sale de su mismo sitio)
    } else if (g.phase !== 'end') {
    trail.push({ t: g.time, x: g.x, z: g.z, yaw: g.yaw, speed: g.speed, jumpT: g.jumpT, jumpY: g.jumpY, idle: g.idle, kneel: g.kneel, kneelT: g.kneelT, sit: g.sit })
    const past = g.time - ECHO_DELAY
    while (trail.length > 2 && trail[1].t <= past) trail.shift() // (solo hace falta desde ahí)
    Object.assign(shadow, g)
    const a = trail[0]
    const b = trail[1] ?? a
    const u = b.t > a.t ? Math.min(1, Math.max(0, (past - a.t) / (b.t - a.t))) : 0
    shadow.x = a.x + (b.x - a.x) * u
    shadow.z = a.z + (b.z - a.z) * u
    shadow.yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * u
    shadow.speed = a.speed
    shadow.jumpT = a.jumpT
    shadow.jumpY = a.jumpY + (b.jumpY - a.jumpY) * u
    shadow.idle = a.idle
    shadow.kneel = a.kneel + (b.kneel - a.kneel) * u
    shadow.kneelT = a.kneelT + (b.kneelT - a.kneelT) * u
    shadow.sit = a.sit + (b.sit - a.sit) * u
    shadow.talk = null
    shadow.fear = 0
    shadow.blocked = false
    shadow.phase = 'play'
    }
}
