import { besidePath, headingAt } from './config'
import { game, input } from './state'
import { audioOut, chord, heartbeat } from './sfx'

/*
 * Prototipo "¿qué le crea la sombra?" (se activa con ?sombra en la dirección).
 * Se oye algo dormido, se va hacia el sonido y se lo despierta: su sonido se queda en ese lugar,
 * su luz queda a la espalda de la elfa y le proyecta una sombra cada vez más larga hacia delante.
 * Nadie lo explica: al mirar atrás se ve el camino encendido.
 */
export const sombraMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('sombra')

export type SiteKind = 'water' | 'flowers' | 'crickets'
export const SITES: { kind: SiteKind; x: number; z: number; r: number; color: string }[] = [
  { kind: 'water', ...xz(besidePath(43, -1, 3.4)), r: 1.7, color: '#8fd8ff' },
  { kind: 'flowers', ...xz(besidePath(49.5, 1, 4.6)), r: 2.6, color: '#ffc6e0' },
  { kind: 'crickets', ...xz(besidePath(55, -1, 3.2)), r: 1.8, color: '#e9ff9a' },
]
/** Hasta dónde llega el tramo del prototipo (metros del sendero). */
export const SOMBRA_END = 60

function xz(v: { x: number; z: number }) {
  return { x: v.x, z: v.z }
}

export const sombra = {
  awakeAt: SITES.map(() => -1), // momento en que despertó cada lugar (-1 = dormido)
  count: 0,
  revealAt: -1, // momento en que la cámara empieza a mirar atrás (-1 = todavía no)
  revealFrom: 0,
  revealing: false,
}
if (sombraMode) (window as unknown as { __sombra: typeof sombra }).__sombra = sombra

// ── Sonido: cada lugar suena desde su sitio (HRTF: con auriculares se oye si está delante o detrás) ──
const ASLEEP_LEVEL = 0.35
type Voice = { level: GainNode; nextChirp: number }
let voices: Voice[] | null = null

function noiseBuffer(a: AudioContext) {
  const b = a.createBuffer(1, a.sampleRate * 2, a.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}

function buildWater(a: AudioContext, out: AudioNode) {
  const noise = a.createBufferSource()
  noise.buffer = noiseBuffer(a)
  noise.loop = true
  for (const [freq, q, amp, rate] of [
    [900, 0.7, 0.55, 0.23],
    [2400, 1.3, 0.3, 0.61],
  ] as const) {
    const band = a.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = freq
    band.Q.value = q
    const gain = a.createGain()
    gain.gain.value = amp
    const lfo = a.createOscillator()
    const depth = a.createGain()
    lfo.frequency.value = rate
    depth.gain.value = amp * 0.4
    lfo.connect(depth).connect(gain.gain)
    lfo.start()
    noise.connect(band).connect(gain).connect(out)
  }
  noise.start()
}

function buildCrickets(a: AudioContext, out: AudioNode) {
  for (const [freq, trill, chirp] of [
    [4300, 26, 1.7],
    [4750, 31, 2.3],
  ] as const) {
    const osc = a.createOscillator()
    osc.frequency.value = freq
    const fast = a.createGain()
    fast.gain.value = 0.5
    const fastLfo = a.createOscillator()
    fastLfo.type = 'square'
    fastLfo.frequency.value = trill
    const fastDepth = a.createGain()
    fastDepth.gain.value = 0.5
    fastLfo.connect(fastDepth).connect(fast.gain)
    const slow = a.createGain()
    slow.gain.value = 0.09
    const slowLfo = a.createOscillator()
    slowLfo.type = 'square'
    slowLfo.frequency.value = chirp
    const slowDepth = a.createGain()
    slowDepth.gain.value = 0.09
    slowLfo.connect(slowDepth).connect(slow.gain)
    osc.connect(fast).connect(slow).connect(out)
    osc.start()
    fastLfo.start()
    slowLfo.start()
  }
}

/** Un pájaro: tres notas cortas que suben. */
function birdCall(a: AudioContext, out: AudioNode) {
  const base = 2300 + Math.random() * 900
  for (let i = 0; i < 3; i++) {
    const t = a.currentTime + i * 0.17
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.frequency.setValueAtTime(base * (1 + i * 0.08), t)
    osc.frequency.exponentialRampToValueAtTime(base * (1.2 + i * 0.08), t + 0.11)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.32, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13)
    osc.connect(gain).connect(out)
    osc.start(t)
    osc.stop(t + 0.15)
  }
}

function startVoices() {
  const io = audioOut()
  if (!io) return
  voices = SITES.map((site) => {
    const panner = io.ctx.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = 3
    panner.rolloffFactor = 1.2
    panner.setPosition(site.x, 1, site.z)
    panner.connect(io.out)
    const level = io.ctx.createGain()
    level.gain.value = ASLEEP_LEVEL
    level.connect(panner)
    if (site.kind === 'water') buildWater(io.ctx, level)
    if (site.kind === 'crickets') buildCrickets(io.ctx, level)
    return { level, nextChirp: 0 }
  })
}

/** Lo que oye el jugador sale desde la cámara (cada frame, desde el componente). */
export function placeListener(x: number, y: number, z: number, fx: number, fy: number, fz: number) {
  const io = audioOut(false)
  if (io) {
    io.ctx.listener.setPosition(x, y, z)
    io.ctx.listener.setOrientation(fx, fy, fz, 0, 1, 0)
  }
}

/** Cada frame, mientras el jugador tiene el control. */
export function updateSombra() {
  const g = game
  const s = sombra
  if (!voices && g.started) startVoices()
  const io = audioOut(false)

  SITES.forEach((site, i) => {
    if (s.awakeAt[i] < 0 && Math.hypot(g.x - site.x, g.z - site.z) < site.r) {
      s.awakeAt[i] = g.time
      s.count++
      g.spark = Math.min(1, g.spark + 1 / SITES.length)
      g.pulse = 1
      chord() // lo que despertó se alegra…
      heartbeat(0.7) // … y delante de ella algo crece
      if (voices && io) voices[i].level.gain.setTargetAtTime(1, io.ctx.currentTime, 1.2)
    }
    // los pájaros cantan de a ratos (el agua y los grillos suenan solos)
    const v = voices?.[i]
    if (v && io && site.kind === 'flowers' && g.time >= v.nextChirp) {
      birdCall(io.ctx, v.level)
      v.nextChirp = g.time + (s.awakeAt[i] >= 0 ? 1.6 : 3.2) + Math.random() * 1.8
    }
  })

  // ── Cuando ya pasó el último lugar, la cámara mira atrás una vez (arrastrar la interrumpe) ──
  const last = SITES[SITES.length - 1]
  const passed = g.z > last.z + 2.5
  if (s.count === SITES.length && s.revealAt < 0 && (passed || g.time - Math.max(...s.awakeAt) > 12)) {
    s.revealAt = g.time
    s.revealFrom = input.camYaw
    s.revealing = true
  }
  if (s.revealing) {
    const k = Math.min(1, (g.time - s.revealAt) / 3.2)
    const e = k * k * (3 - 2 * k)
    const want = headingAt(g.z) + Math.PI
    const d = Math.atan2(Math.sin(want - s.revealFrom), Math.cos(want - s.revealFrom))
    input.camYaw = s.revealFrom + d * e
    if (k >= 1 || input.dragging) s.revealing = false
  }
}
