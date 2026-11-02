import { bell, getAudio, NOTES } from '../game/sfx'

/*
 * El sonido del jardín.
 *
 * La canción de la jam ("You Hear", de Jason Grace), sin modificar sus notas:
 *   0–21 s   la intro, tal cual: la tierra dormida que respira.
 *   21–53 s  la parte de los graves, en bucle. Suena desde el principio, pero apagada y lejana,
 *            como oída a través de la tierra (un filtro que deja pasar solo lo grave).
 *            Cada planta que crece la destapa un poco; con el jardín lleno suena entera.
 */
const LOOP_START = 21.25
const LOOP_END = 53.0
const MUFFLED = 260 // Hz: la canción bajo tierra
const OPEN = 19000 // Hz: la canción entera

let src: AudioBufferSourceNode | null = null
let filter: BiquadFilterNode | null = null
let gain: GainNode | null = null
let t0 = -1 // cuándo empezó (reloj del audio)
let fallbackT0 = -1 // sin audio: reloj propio

/** Empieza la canción (debe llamarse desde un toque: los navegadores lo exigen). */
export async function startSong() {
  fallbackT0 = performance.now()
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = OPEN
  filter.Q.value = 0.7
  gain = ctx.createGain()
  gain.gain.value = 1.3
  filter.connect(gain).connect(master)
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}audio/theme.flac`)
    const buf = await ctx.decodeAudioData(await res.arrayBuffer())
    src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.loopStart = LOOP_START
    src.loopEnd = LOOP_END
    src.connect(filter)
    src.start()
    t0 = ctx.currentTime
    fallbackT0 = -1
    console.log('[jardin] canción en marcha')
  } catch (e) {
    console.log('[jardin] sin canción', String(e))
  }
}

/** Segundos de canción desde que empezó (sin contar los bucles). -1 = todavía no. */
export function songTime() {
  const a = getAudio()
  if (t0 >= 0 && a) return a.ctx.currentTime - t0
  if (fallbackT0 >= 0) return (performance.now() - fallbackT0) / 1000
  return -1
}

/** rich 0..1: cuánto jardín hay. Abre el filtro (y sube un poco el volumen). */
export function setOpenness(rich: number) {
  if (!filter) return
  const a = getAudio()
  if (!a || !filter || !gain) return
  const t = songTime()
  // en la intro la tierra respira entera; al entrar los graves, la canción se hunde bajo tierra
  const under = t < LOOP_START - 1.2 ? 0 : Math.min(1, (t - (LOOP_START - 1.2)) / 2.5)
  const opened = MUFFLED * Math.pow(OPEN / MUFFLED, Math.pow(rich, 0.8))
  const f = OPEN * (1 - under) + opened * under
  filter.frequency.setTargetAtTime(f, a.ctx.currentTime, 0.4)
  gain.gain.setTargetAtTime(1.3 * (1 - under) + (0.95 + 0.35 * rich) * under, a.ctx.currentTime, 0.4)
}

// ── Efectos ─────────────────────────────────────────────────────

function noise(len: number) {
  const a = getAudio()!
  const n = Math.floor(a.ctx.sampleRate * len)
  const buf = a.ctx.createBuffer(1, n, a.ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2)
  const s = a.ctx.createBufferSource()
  s.buffer = buf
  return s
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, pan = 0) {
  const a = getAudio()
  if (!a) return
  const t = a.ctx.currentTime + delay
  const o = a.ctx.createOscillator()
  const g = a.ctx.createGain()
  const p = a.ctx.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(p).connect(a.master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

let lastRustle = 0
export const sfx = {
  /** Un resto cae en la compostera (n = cuántos hay ya). */
  thud(n: number) {
    const a = getAudio()
    if (!a) return
    const s = noise(0.25)
    const lp = a.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 500
    const g = a.ctx.createGain()
    g.gain.value = 0.9
    s.connect(lp).connect(g).connect(a.master)
    s.start()
    tone('sine', 150 + n * 30, 70, 0.22, 0.5)
    bell(NOTES[n - 1] / 2, true)
  },
  /** No va ahí: un "boing" grave y corto. */
  reject() {
    tone('triangle', 220, 110, 0.18, 0.35)
    tone('triangle', 160, 90, 0.2, 0.3, 0.12)
  },
  /** Plástico o lata en el contenedor amarillo: un clinc limpio. */
  sorted() {
    tone('sine', 1760, 1700, 0.35, 0.18)
    tone('sine', 2637, 2600, 0.3, 0.1, 0.06)
  },
  /** El compost está listo (nueva especie: un arpegio entero). */
  ready(voice: number, isNew: boolean) {
    const base = NOTES[voice % NOTES.length] * (voice >= NOTES.length ? 2 : 1)
    const seq = isNew ? [1, 1.25, 1.5, 2] : [1, 1.5]
    seq.forEach((m, k) => setTimeout(() => bell(base * m, k % 2 === 1), k * 150))
  },
  /** Pintando con compost: tierra que se esparce. */
  rustle() {
    const a = getAudio()
    if (!a || a.ctx.currentTime - lastRustle < 0.09) return
    lastRustle = a.ctx.currentTime
    const s = noise(0.12)
    const bp = a.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900 + Math.random() * 600
    bp.Q.value = 0.8
    const g = a.ctx.createGain()
    g.gain.value = 0.18
    s.connect(bp).connect(g).connect(a.master)
    s.start()
  },
  /** Brota una planta: una nota pequeña de su especie. */
  sprout(voice: number, x: number) {
    const f = NOTES[voice % NOTES.length] * (voice >= NOTES.length ? 4 : 2)
    tone('sine', f, f * 1.01, 0.5, 0.06, Math.random() * 0.2, x / 8)
  },
}
