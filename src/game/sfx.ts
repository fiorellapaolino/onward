/*
 * Sonidos sintetizados con Web Audio (no son archivos: se generan al vuelo).
 *   - campanas de piedra: notas de una escala pentatónica (siempre suenan bien juntas)
 *   - la música escondida: una flauta suave
 * La canción del tema de la jam NO se toca aquí (esa se usa tal cual, sin modificar).
 */
let ctx: AudioContext | null = null
let master: GainNode | null = null

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.6
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

// los navegadores solo dejan sonar audio después de una tecla o un toque
if (typeof window !== 'undefined') {
  const unlock = () => audio()
  window.addEventListener('keydown', unlock, { once: true })
  window.addEventListener('pointerdown', unlock, { once: true })
}

/** Do, Re, Mi, Sol, La (quinta octava): una nota por campana. */
export const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0]

/**
 * Campana: parciales inarmónicos que se apagan despacio.
 * soft = la campana que toca la sombra (más suave y un poco más grave de timbre).
 */
export function bell(freq: number, soft = false) {
  const a = audio()
  if (!a || !master) return
  const t = a.currentTime
  const out = a.createGain()
  out.gain.value = soft ? 0.5 : 0.85
  if (soft) {
    const lp = a.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1800
    out.connect(lp).connect(master)
  } else out.connect(master)
  for (const [mul, amp, dec] of [
    [1, 0.5, 2.2],
    [2.76, 0.18, 1.1],
    [5.4, 0.08, 0.5],
    [0.5, 0.12, 1.6],
  ] as const) {
    const o = a.createOscillator()
    const g = a.createGain()
    o.type = 'sine'
    o.frequency.value = freq * mul
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(amp, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + dec + 0.05)
  }
}

/** Flauta suave (la mujer que toca a escondidas). distance 0..1: cuanto más lejos, más bajito. */
export function flute(freq: number, dur = 0.5, volume = 1) {
  const a = audio()
  if (!a || !master) return
  const t = a.currentTime
  const o = a.createOscillator()
  const vib = a.createOscillator()
  const vibGain = a.createGain()
  const g = a.createGain()
  const lp = a.createBiquadFilter()
  o.type = 'triangle'
  o.frequency.value = freq
  vib.frequency.value = 5
  vibGain.gain.value = freq * 0.006
  vib.connect(vibGain).connect(o.frequency)
  lp.type = 'lowpass'
  lp.frequency.value = 2600
  const v = 0.22 * volume
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(v, t + 0.06)
  g.gain.setValueAtTime(v, t + dur * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35)
  o.connect(lp).connect(g).connect(master)
  o.start(t)
  vib.start(t)
  o.stop(t + dur + 0.4)
  vib.stop(t + dur + 0.4)
}
