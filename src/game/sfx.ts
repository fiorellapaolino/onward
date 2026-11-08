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

/** Para sonidos que se arman en otro archivo. create = false: no despierta el audio si todavía no existe. */
export function audioOut(create = true) {
  const a = create ? audio() : ctx
  return a && master ? { ctx: a, out: master } : null
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

/** Un momento vivido: un pequeño arpegio de campanas, hacia arriba. */
export function chord() {
  const a = audio()
  if (!a) return
  ;[0, 2, 4, 1].forEach((n, k) => setTimeout(() => bell(NOTES[n] * (k === 3 ? 2 : 1), k % 2 === 1), k * 140))
}

/** Salpicadura: ruido filtrado muy corto, con un "plop" grave. */
export function splash() {
  const a = audio()
  if (!a || !master) return
  const t = a.currentTime
  const len = Math.floor(a.sampleRate * 0.45)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  const src = a.createBufferSource()
  src.buffer = buf
  const bp = a.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1400
  bp.Q.value = 0.7
  const g = a.createGain()
  g.gain.value = 0.7
  src.connect(bp).connect(g).connect(master)
  src.start(t)
  // plop
  const o = a.createOscillator()
  const og = a.createGain()
  o.frequency.setValueAtTime(380, t)
  o.frequency.exponentialRampToValueAtTime(120, t + 0.12)
  og.gain.setValueAtTime(0.35, t)
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
  o.connect(og).connect(master)
  o.start(t)
  o.stop(t + 0.2)
}

/** Siseo del metal caliente que se enfría: ruido agudo, corto. */
export function hiss(volume = 1) {
  const a = audio()
  if (!a || !master) return
  const t = a.currentTime
  const len = Math.floor(a.sampleRate * 0.5)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len)
  const src = a.createBufferSource()
  src.buffer = buf
  const hp = a.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 3200
  const g = a.createGain()
  g.gain.value = 0.22 * volume
  src.connect(hp).connect(g).connect(master)
  src.start(t)
}

/** Crujido de piedra: un golpe seco de ruido grave (más fuerte = a punto de romperse). */
export function crack(strength = 1) {
  const a = audio()
  if (!a || !master) return
  const t = a.currentTime
  const len = Math.floor(a.sampleRate * 0.18)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4)
  const src = a.createBufferSource()
  src.buffer = buf
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900 + 900 * strength
  const g = a.createGain()
  g.gain.value = 0.35 + 0.45 * strength
  src.connect(lp).connect(g).connect(master)
  src.start(t)
}

/** Caída: un soplo que baja (se la traga el vacío). */
export function fallSound() {
  const a = audio()
  if (!a || !master) return
  const t = a.currentTime
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(420, t)
  o.frequency.exponentialRampToValueAtTime(60, t + 1.1)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.08)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + 1.3)
}

/**
 * La "voz" de quien habla: no son palabras, son murmullos suaves (una nota corta por palabra),
 * como si se oyera hablar a lo lejos. pitch = lo grave o agudo de la voz.
 */
export function voice(text: string, pitch = 140) {
  const a = audio()
  if (!a || !master) return
  const words = text.split(/\s+/).filter((w) => /\w/.test(w)).slice(0, 10)
  let t = a.currentTime + 0.05
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900
  lp.connect(master)
  words.forEach((w, i) => {
    const o = a.createOscillator()
    const g = a.createGain()
    o.type = 'triangle'
    const f = pitch * (1 + 0.12 * Math.sin(i * 2.3 + w.length))
    o.frequency.setValueAtTime(f, t)
    o.frequency.linearRampToValueAtTime(f * 0.92, t + 0.1)
    const len = 0.07 + Math.min(0.08, w.length * 0.012)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.16, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0005, t + len)
    o.connect(g).connect(lp)
    o.start(t)
    o.stop(t + len + 0.02)
    t += len + 0.06
  })
}

/** Un latido ("pum-pum"), grave y apagado. Suena mientras la oscuridad la rodea. */
export function heartbeat(volume = 1) {
  const a = audio()
  if (!a || !master) return
  const t = a.currentTime
  ;[0, 0.2].forEach((dt, i) => {
    const o = a.createOscillator()
    const g = a.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(i ? 58 : 66, t + dt)
    o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.14)
    const v = (i ? 0.45 : 0.7) * volume
    g.gain.setValueAtTime(0, t + dt)
    g.gain.linearRampToValueAtTime(v, t + dt + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.22)
    o.connect(g).connect(master!)
    o.start(t + dt)
    o.stop(t + dt + 0.25)
  })
}
