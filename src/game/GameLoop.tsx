import { useFrame } from '@react-three/fiber'
import {
  RISE_TIME, GATHER_TIME, LOOK_TIME, PATH_HALF_WIDTH, SHADOW_S, TALK_DIST,
  PATH_LEN, JUMP_AIR, JUMP_BOOST, JUMP_CROUCH, JUMP_HEIGHT, JUMP_LAND, RUN_SPEED, WALK_SPEED, PATH_END,
  smoothstep, damp, headingAt, pathAt, sideAt, tangentAt,
} from './config'
import * as THREE from 'three'
import { ECHO_DELAY, RETURN_TIME, game, input, setUi, shadow, trail, type Phase } from './state'
import { MUSIC, musicTime, playThemeAgain } from './music'
import { CLIPS, duration } from './anim'
import { BELLS, BELL_R, BOXES, COLLIDERS, ELDER, GIRL, LANTERNS, MELODY, MUSICIAN, PLATES, PLATE_R, POLE } from './village'
import { NOTES, bell, chord, flute } from './sfx'
import {
  ELDER_LINES, ELF_WORDS, LAST_STEP, FEAR_MSG, GIRL_LINES, GOAL_HELP, GOAL_SEED, GOAL_LANTERN, GOAL_MUSIC, LIT_MSG, MUSIC_DONE, MUSIC_HINT, PROMPT_LISTEN, PROMPT_STAY, SHADOW_BLOCK, SHADOW_MSG,
} from './story'
import { applyDebug, debugMode } from './debug'
import { MEMORY_LINES } from './story'
import { updateMoments } from './moments'
import { fires, updateFires } from './fires'
import { GIFT, inGiftScene } from './gift'

const MOVE = new THREE.Vector3()
const TMP = new THREE.Vector3()
const TMP2 = new THREE.Vector3()

let jumpBuf = 0 // Espacio pulsado hace poco: salta en cuanto pueda (no se pierde la pulsación)
let blockMsg = false // se está mostrando "la sombra es demasiado espesa"

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
    // la música se corta: silencio, y aparece el título
    if (prevMusic < MUSIC.CUT && g.musicT >= MUSIC.CUT) setUi({ title: true })
    if (g.musicT >= MUSIC.CUT + 5.5 && g.musicT < MUSIC.CUT + 6) setUi({ title: false })

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
          jumpBuf = 0
          if (next) {
            g.line++
            g.lineT = 0
            if (g.line < lines.length) setUi({ say: lines[g.line] })
            else {
              const was = g.talk
              g.talk = null
              setUi({ say: null })
              if (was === 'girl') {
                // terminó de contar: atrapar una semilla de su árbol y llevársela
                g.story = 'seed'
                g.pulse = 0.5
                setUi({ goal: GOAL_SEED })
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
        // las casas: rectángulos girados; si queda dentro, sale por el lado más cercano
        for (const b of BOXES) {
          const dx = g.x - b.x
          const dz = g.z - b.z
          const c = Math.cos(b.rot)
          const s = Math.sin(b.rot)
          let lx = dx * c - dz * s
          let lz = dx * s + dz * c
          const px = b.hx - Math.abs(lx)
          const pz = b.hz - Math.abs(lz)
          if (px > 0 && pz > 0) {
            if (px < pz) lx = Math.sign(lx || 1) * b.hx
            else lz = Math.sign(lz || 1) * b.hz
            g.x = b.x + lx * c + lz * s
            g.z = b.z - lx * s + lz * c
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
          blockMsg = true
        } else if (blockMsg && g.z < maxZ - 2) {
          setUi({ msg: null }) // (solo quita su propio mensaje)
          blockMsg = false
        }

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
          setUi({ prompt: PROMPT_STAY, hold: Math.round(g.courage * 40) / 40 })
          if (g.courage >= 1) {
            // nace su sombra: desde ahora repite lo que ella hizo unos segundos antes
            g.story = 'plates'
            g.shadowOn = true
            g.shadowAt = g.awakeAt = g.time
            trail.length = 0
            g.pulse = 1
            setUi({ prompt: null, hold: -1, msg: SHADOW_MSG, goal: GOAL_LANTERN })
          }
        } else g.fear += (0 - g.fear) * damp(1.2, dt)

        // ── Las dos piedras de la plaza: el gran farol sube si están pisadas a la vez ──
        if (g.story === 'plates' && g.time - g.awakeAt > 5) setUi({ msg: null })
        if (g.story !== 'seek' && g.story !== 'help' && g.story !== 'fear') {
          PLATES.forEach((pl, i) => {
            const me = Math.hypot(g.x - pl.x, g.z - pl.z) < PLATE_R && g.jumpY < 0.15
            const sh = g.shadowOn && Math.hypot(shadow.x - pl.x, shadow.z - pl.z) < PLATE_R && shadow.jumpY < 0.15
            g.plates[i] = me || sh
          })
          if (g.story === 'plates' && g.plates.every(Boolean)) {
            // ¡sube! y los faroles de la aldea se encienden en cadena desde la plaza
            g.story = 'next'
            g.liftAt = g.awakeAt = g.time
            g.lightAwake = true
            g.pulse = 1
            g.c = Math.min(1, g.c + 0.2)
            LANTERNS.forEach((l, i) => (g.lit[i] = g.time + 1.2 + Math.hypot(l.x - POLE.x, l.z - POLE.z) * 0.12))
            // el anciano ve la luz y se levanta su ánimo: su luz también vuelve a ella
            g.returns.push({ x: ELDER.x, y: 1.0, z: ELDER.z, at: g.time + 2.2 })
            setUi({ goal: null, msg: LIT_MSG })
          }
        }
        // con la aldea iluminada, la sombra de la salida se deshace: el camino sigue hacia adelante
        if (g.liftAt >= 0 && !g.shadowOpen && g.time - g.liftAt > 6) {
          g.shadowOpen = true
          g.pulse = 0.6
        }
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
        if (g.story === 'next' && g.time - g.awakeAt > 6) setUi({ msg: null })

        // ── Momentos de estar viva (semilla, charcos, luciérnagas, flores…) ──
        updateMoments(dt)
        // ── Las hogueras: llevar la brasa de fuego en fuego ──
        updateFires(dt)

        // el claro del final: se detiene… y se da vuelta
        if (g.shadowOpen && g.z >= PATH_LEN - 12) {
          setPhase('end')
          g.speed = 0
          g.jumpT = -1
          g.endStart = { x: g.x, z: g.z }
          const back = pathAt(g.z - 3.4, TMP)
          g.endShadow = { x: back.x, z: back.z }
          setUi({ msg: null, goal: null, hint: false, prompt: null })
        }
        break
      }

      case 'end': {
        // ── El final ──────────────────────────────────────────────
        //  0.0–1.6  se detiene; detrás, su sombra (su pasado) se encoge de rodillas
        //  1.6–4.6  se da vuelta y camina despacio hasta ella
        //  4.6–5.6  se arrodilla frente a ella
        //  5.6–8.0  la abraza: "You are not alone."
        //  8.0–10   se levantan las dos (la sombra se vuelve luz)
        //  10–      caminan juntas, una al lado de la otra, hacia la luz; vuelve la canción
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
        }
        if (T < 1.6) {
          g.speed = 0
        } else if (T < 4.6) {
          turn(toShadow, 4)
          const d = Math.hypot(g.endShadow.x - g.x, g.endShadow.z - g.z)
          const want = d > 0.85 && T > 2.2 ? 0.6 : 0
          g.speed += (want - g.speed) * damp(4, dt)
          g.x += Math.sin(g.yaw) * g.speed * dt
          g.z += Math.cos(g.yaw) * g.speed * dt
        } else if (T < 8) {
          g.speed = 0
          turn(toShadow, 6)
          g.kneel = Math.min(1, (T - 4.6) / 0.9)
          g.kneelT = 0
          g.hug = Math.max(0, Math.min(1, (T - 5.4) / 0.8))
          sh.hug = g.hug
          if (T > 5.6 && T - dt <= 5.6) g.pulse = 1
          if (T > 5.8) setUi({ msg: ELF_WORDS })
        } else if (T < 10) {
          // se levantan juntas (el resto de "Standing Up")
          const u = (T - 8) / 2
          g.hug = sh.hug = Math.max(0, 1 - u * 2)
          g.kneelT = sh.kneelT = u * duration(CLIPS.standup)
          g.kneel = sh.kneel = 1 - Math.max(0, (u - 0.85) / 0.15)
          if (T > 9.2) setUi({ msg: null })
        } else {
          // caminan juntas hacia adelante, la sombra a su lado (ya no detrás)
          if (T - dt <= 10) playThemeAgain()
          g.kneel = sh.kneel = 0
          g.hug = sh.hug = 0
          g.c += (1 - g.c) * dt
          g.speed += (1.1 - g.speed) * damp(1.2, dt)
          const t = tangentAt(g.z, TMP)
          turn(Math.atan2(t.x, t.z), 2)
          g.x += Math.sin(g.yaw) * g.speed * dt
          g.z = Math.min(g.z + Math.cos(g.yaw) * g.speed * dt, PATH_END - 4)
          g.x += (pathAt(g.z, TMP2).x - 0.45 - g.x) * damp(1, dt)
          Object.assign(sh, g)
          const side = sideAt(g.z, TMP2)
          sh.x = g.x + side.x * 0.9
          sh.z = g.z + side.z * 0.9
          sh.talk = null
          sh.fear = 0
          // "Siempre hay un paso más."
          if (T > 17 && T <= 25) setUi({ msg: LAST_STEP })
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
    if (jumpBuf > 0 && g.jumpT < 0 && g.phase === 'play' && !g.talk && !inGiftScene()) {
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
    if (g.phase !== 'end') {
    trail.push({ t: g.time, x: g.x, z: g.z, yaw: g.yaw, speed: g.speed, jumpT: g.jumpT, jumpY: g.jumpY, idle: g.idle })
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
    shadow.talk = null
    shadow.fear = 0
    shadow.blocked = false
    shadow.phase = 'play'
    }
  }, -1)

  return null
}
