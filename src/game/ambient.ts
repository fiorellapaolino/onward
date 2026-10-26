import { audio, sfxOut } from './sfx'

/*
 * La música de la aldea (original, generada aquí con Web Audio; no usa la grabación del tema).
 * La canción del tema es alegre: suena al nacer y al final. En la aldea triste se apaga
 * y en su lugar suena esto: acordes lentos y suaves, en menor, con alguna nota suelta de piano.
 *
 *   sad   0..1  cuánto suena (dentro de la aldea apagada)
 *   hope  0..1  cada persona ayudada: los acordes pasan de menor a mayor y el sonido se abre
 *   memory 0..1 mientras la niña recuerda: una cajita de música en mayor, cálida
 */
type Chord = number[] // frecuencias (Hz)
const n = (semi: number) => 220 * Math.pow(2, semi / 12) // semitonos desde La 3

// la menor, fa, re menor, mi menor… (triste) → fa, do, sol, la menor (esperanza)
const SAD: Chord[] = [
  [n(0), n(3), n(7)], // Am
  [n(-4), n(0), n(3)], // F
  [n(-7), n(-4), n(0)], // Dm
  [n(-5), n(-1), n(2)], // Em
]
const HOPE: Chord[] = [
  [n(-4), n(0), n(3)], // F
  [n(3), n(7), n(10)], // C
  [n(-2), n(2), n(5)], // G
  [n(0), n(3), n(7)], // Am
]
const MINOR_PENTA = [0, 3, 5, 7, 10, 12, 15].map((s) => n(s + 12))
const MAJOR_PENTA = [3, 5, 7, 10, 12, 15, 17].map((s) => n(s + 12)) // (do mayor)
const CHORD_TIME = 7 // segundos por acorde

let bus: GainNode | null = null
let filter: BiquadFilterNode | null = null
let nextChord = 0
let chordIdx = 0
let nextNote = 0

function ensure() {
  const a = audio()
  const out = sfxOut()
  if (!a || !out) return null
  if (!bus) {
    bus = a.createGain()
    bus.gain.value = 0
    filter = a.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    bus.connect(filter).connect(out)
    nextChord = a.currentTime + 0.1
    nextNote = a.currentTime + 2
  }
  return a
}

/** Un acorde largo: tres notas suaves con un poco de desafinación (como un coro lejano). */
function pad(a: AudioContext, chord: Chord, t: number) {
  for (const f of chord)
    for (const det of [-4, 4]) {
      const o = a.createOscillator()
      const g = a.createGain()
      o.type = 'triangle'
      o.frequency.value = f
      o.detune.value = det
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.05, t + 2.5)
      g.gain.linearRampToValueAtTime(0.04, t + CHORD_TIME - 1)
      g.gain.linearRampToValueAtTime(0, t + CHORD_TIME + 2)
      o.connect(g).connect(bus!)
      o.start(t)
      o.stop(t + CHORD_TIME + 2.2)
    }
}

/** Una nota de piano (o de cajita de música, más aguda y brillante). */
function note(a: AudioContext, f: number, t: number, box: boolean, vol: number) {
  const o = a.createOscillator()
  const o2 = a.createOscillator()
  const g = a.createGain()
  o.type = 'sine'
  o2.type = 'sine'
  o.frequency.value = box ? f * 2 : f
  o2.frequency.value = (box ? f * 2 : f) * (box ? 3 : 2)
  const g2 = a.createGain()
  g2.gain.value = box ? 0.25 : 0.12
  const dec = box ? 1.6 : 3
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.16 * vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0005, t + dec)
  o.connect(g)
  o2.connect(g2).connect(g)
  g.connect(bus!)
  o.start(t)
  o2.start(t)
  o.stop(t + dec + 0.1)
  o2.stop(t + dec + 0.1)
}

/** Cada frame: cuánto suena y cómo. */
export function updateAmbient(sad: number, hope: number, memory: number) {
  const level = Math.max(sad, memory)
  if (level < 0.01 && !bus) return // (todavía no hace falta crear nada)
  const a = ensure()
  if (!a || !bus || !filter) return
  const now = a.currentTime
  bus.gain.setTargetAtTime(0.9 * level, now, 0.8)
  // con la esperanza (y en el recuerdo) el sonido se abre: más brillo
  filter.frequency.setTargetAtTime(700 + 1800 * Math.max(hope, memory), now, 1)
  if (level < 0.01) {
    nextChord = Math.max(nextChord, now)
    nextNote = Math.max(nextNote, now + 1)
    return
  }
  const bright = Math.max(hope, memory) > 0.5
  if (now >= nextChord - 0.05) {
    pad(a, (bright ? HOPE : SAD)[chordIdx % 4], nextChord)
    chordIdx++
    nextChord += CHORD_TIME
  }
  if (now >= nextNote) {
    // en el recuerdo: cajita de música, más seguida; si no, notas sueltas, lentas
    const scale = bright ? MAJOR_PENTA : MINOR_PENTA
    const f = scale[Math.floor(Math.random() * scale.length)]
    note(a, f, now + 0.02, memory > 0.5, memory > 0.5 ? 0.9 : 0.6)
    nextNote = now + (memory > 0.5 ? 0.45 + Math.random() * 0.35 : 1.8 + Math.random() * 2.4)
  }
}
