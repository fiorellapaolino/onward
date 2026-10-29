import { game, input, setUi } from './state'
import { chord, heartbeat } from './sfx'

/*
 * El miedo (un momento en el bosque, entre el inicio y la aldea).
 *
 *   La oscuridad se cierra a su alrededor. Cuanto más camina (cuanto más quiere huir), más rápido se cierra;
 *   quieta, se cierra despacio. Cuando ya casi no puede moverse, aparece un pequeño ser de fuego delante de ella
 *   que respira: crece (inhala) y se achica (exhala).
 *   Mantener E (o el dedo en "Breathe") = inhalar; soltar = exhalar. Si respira con él, quieta,
 *   cada respiración aparta la oscuridad. Tres respiraciones y el miedo se abre: el ser de fuego entra en su pecho
 *   y su luz queda más grande para siempre.
 *
 * Nadie lo explica: el ser muestra el ritmo y el aviso solo dice "Breathe".
 */
export const FEAR_AT = 26 // dónde empieza (metro del sendero)
export const BREATH = 5 // segundos por respiración del ser de fuego (la mitad inhala, la mitad exhala)
const R_START = 9
const R_MIN = 1.1
const NEEDED = 3

export const fearM = {
  on: false,
  done: false,
  doneAt: -1,
  R: R_START, // radio de la oscuridad alrededor de ella (metros)
  spiritAt: -1, // cuándo apareció el ser de fuego (-1 = todavía no)
  breaths: 0, // respiraciones buenas
  lung: 0, // 0..1 cuánto aire tiene (lo que muestra la barra)
  heldIn: 0, // en esta respiración: segundos manteniendo mientras el ser inhala
  heldOut: 0, // … y soltando mientras exhala
  lastCycle: -1,
  startAt: -1, // cuándo empezó
  beatT: 0,
}

/** 0..1: en qué parte de la respiración está el ser (0–0.5 inhala, 0.5–1 exhala). */
export const breathPhase = () => (fearM.spiritAt < 0 ? 0 : (((game.time - fearM.spiritAt) % BREATH) + BREATH) % BREATH / BREATH)
/** 0..1: cuánto aire tiene el ser ahora (para dibujarlo: crece y se achica). */
export const spiritLung = () => {
  const p = breathPhase()
  return p < 0.5 ? Math.sin((p / 0.5) * Math.PI * 0.5) : Math.cos(((p - 0.5) / 0.5) * Math.PI * 0.5)
}
/** 0..1: lo oscuro que está el mundo por el miedo. */
export const fearDark = () => {
  if (fearM.on) return Math.min(1, 1 - (fearM.R - R_MIN) / (R_START - R_MIN)) * 0.85 + 0.15
  if (fearM.done) return Math.max(0, 1 - (game.time - fearM.doneAt) / 2.5) * 0.4
  return 0
}

export function updateFear(dt: number) {
  const g = game
  const f = fearM
  if (!f.on && !f.done && g.phase === 'play' && g.z > FEAR_AT) {
    f.on = true
    f.R = R_START
    f.startAt = g.time
  }
  if (!f.on) return

  const still = g.speed < 0.25 && g.jumpT < 0
  // quiere huir → se cierra más rápido; quieta → despacio; respirando con el ser → se abre
  if (!still) f.R -= dt * 0.8
  else if (!(f.spiritAt >= 0 && input.hold)) f.R -= dt * 0.18
  f.R = Math.max(R_MIN, f.R)
  // casi no puede moverse
  if (f.R < 2.2) g.speed = Math.min(g.speed, 0.35 + (f.R - R_MIN) * 0.3)

  // cuando ya está muy cerca, aparece el ser de fuego
  // (enseguida: a los pocos segundos, o antes si la oscuridad ya está muy cerca)
  if (f.spiritAt < 0 && (f.R < 5.5 || g.time - f.startAt > 3.5)) {
    f.spiritAt = g.time
    f.lastCycle = 0
  }

  if (f.spiritAt >= 0) {
    // su respiración (la barra): mantener = inhalar, soltar = exhalar
    f.lung = Math.max(0, Math.min(1, f.lung + (input.hold ? 1 : -1) * (dt / (BREATH / 2))))
    const p = breathPhase()
    if (still) {
      if (p < 0.5 && input.hold) f.heldIn += dt
      if (p >= 0.5 && !input.hold) f.heldOut += dt
      if (input.hold) f.R = Math.min(R_START, f.R + dt * 0.25) // (respirar quieta ya ayuda un poco)
    }
    // termina una respiración del ser: ¿respiró con él?
    const cycle = Math.floor((g.time - f.spiritAt) / BREATH)
    if (cycle !== f.lastCycle) {
      if (f.heldIn > BREATH * 0.3 && f.heldOut > BREATH * 0.25) {
        f.breaths++
        f.R = Math.min(R_START, f.R + 2.4)
        g.pulse = Math.max(g.pulse, 0.5)
        chord()
      }
      f.heldIn = f.heldOut = 0
      f.lastCycle = cycle
    }
    setUi({ prompt: f.breaths >= NEEDED ? null : 'Breathe', hold: Math.round(f.lung * 40) / 40 })
  }

  // el corazón late más rápido cuanto más cerca está la oscuridad
  const fear = 1 - (f.R - R_MIN) / (R_START - R_MIN)
  f.beatT -= dt
  if (f.beatT <= 0) {
    heartbeat(0.35 + fear * 0.65)
    f.beatT = 60 / (62 + fear * 70)
  }
  g.fear = Math.max(g.fear, fear * 0.9)

  if (f.breaths >= NEEDED) {
    // el miedo se abre: el ser de fuego entra en su pecho
    f.on = false
    f.done = true
    f.doneAt = g.time
    g.pulse = 1
    g.c = Math.min(1, g.c + 0.25)
    g.spark = Math.min(1, g.spark + 0.2)
    setUi({ prompt: null, hold: -1 })
  }
}
