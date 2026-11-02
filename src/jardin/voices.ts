import { getAudio, NOTES } from '../game/sfx'
import { j } from './garden'
import type { SpeciesId } from './data'

/*
 * Las voces del jardín: cada especie trae su sonido, más fuerte cuantas más plantas hay
 * y del lado (izquierda/derecha) donde crecen.
 *   🌾 hierba   → grillos
 *   🍄 hongos   → un zumbido grave y lento
 *   🌸 flores   → abejas
 *   🌿 helechos → gotas de agua
 *   🌼 arbustos → pájaros pequeños
 *   🌳 árbol    → un pájaro que canta una melodía con las notas de la canción
 */

type Census = { n: number; x: number }
const census: Record<SpeciesId, Census> = {
  grass: { n: 0, x: 0 }, mushroom: { n: 0, x: 0 }, flower: { n: 0, x: 0 }, fern: { n: 0, x: 0 }, bush: { n: 0, x: 0 }, tree: { n: 0, x: 0 },
}

let hum: { g: GainNode; p: StereoPannerNode } | null = null
let buzz: { g: GainNode; p: StereoPannerNode; o: OscillatorNode } | null = null
const next: Record<string, number> = {}

function pan(x: number) {
  return Math.max(-0.85, Math.min(0.85, x / 7))
}

/** Cada frame: cuenta las plantas crecidas y hace sonar sus voces. */
export function updateVoices() {
  const a = getAudio()
  if (!a || !j.started) return
  for (const k in census) {
    census[k as SpeciesId].n = 0
    census[k as SpeciesId].x = 0
  }
  for (const p of j.plants) {
    if (j.t < p.born + 0.8) continue
    const c = census[p.species]
    c.n++
    c.x += p.x
  }
  for (const k in census) {
    const c = census[k as SpeciesId]
    if (c.n) c.x /= c.n
  }
  const now = a.ctx.currentTime

  // 🍄 zumbido continuo
  const hm = census.mushroom
  if (hm.n && !hum) hum = makeHum()
  if (hum) {
    hum.g.gain.setTargetAtTime(Math.min(0.14, hm.n * 0.006), now, 0.8)
    hum.p.pan.setTargetAtTime(pan(hm.x), now, 0.8)
  }
  // 🌸 abejas: un zumbido que va y viene
  const fl = census.flower
  if (fl.n && !buzz) buzz = makeBuzz()
  if (buzz) {
    const swell = 0.5 + 0.5 * Math.sin(now * 0.7) * Math.sin(now * 0.31)
    buzz.g.gain.setTargetAtTime(Math.min(0.05, fl.n * 0.0018) * swell, now, 0.3)
    buzz.p.pan.setTargetAtTime(pan(fl.x) + Math.sin(now * 0.5) * 0.25, now, 0.3)
    buzz.o.frequency.setTargetAtTime(210 + Math.sin(now * 3.1) * 14, now, 0.1)
  }
  // los que suenan a ratos
  every('grass', census.grass.n, 0.7, () => crickets(pan(census.grass.x), census.grass.n))
  every('fern', census.fern.n, 1.4, () => drop(pan(census.fern.x)))
  every('bush', census.bush.n, 1.2, () => chirps(pan(census.bush.x)))
  every('tree', census.tree.n, 3.2, () => song(pan(census.tree.x)))
}

/** Hace sonar `fn` cada cierto tiempo (más a menudo cuantas más plantas). */
function every(key: string, n: number, base: number, fn: () => void) {
  if (!n) return
  if (next[key] === undefined) next[key] = j.t + 0.5
  if (j.t < next[key]) return
  fn()
  next[key] = j.t + (base / Math.min(3, 0.6 + n * 0.04)) * (0.6 + Math.random() * 0.8)
}

function out(p: number, vol: number) {
  const a = getAudio()!
  const g = a.ctx.createGain()
  const pn = a.ctx.createStereoPanner()
  g.gain.value = vol
  pn.pan.value = p
  g.connect(pn).connect(a.master)
  return g
}

function makeHum() {
  const a = getAudio()!
  const g = a.ctx.createGain()
  g.gain.value = 0
  const p = a.ctx.createStereoPanner()
  g.connect(p).connect(a.master)
  for (const [f, v] of [[110, 1], [164.8, 0.5], [220.5, 0.25]] as const) {
    const o = a.ctx.createOscillator()
    const og = a.ctx.createGain()
    const lfo = a.ctx.createOscillator()
    const lg = a.ctx.createGain()
    o.frequency.value = f
    og.gain.value = v * 0.5
    lfo.frequency.value = 0.15 + f * 0.0007
    lg.gain.value = v * 0.35
    lfo.connect(lg).connect(og.gain)
    o.connect(og).connect(g)
    o.start()
    lfo.start()
  }
  return { g, p }
}

function makeBuzz() {
  const a = getAudio()!
  const g = a.ctx.createGain()
  g.gain.value = 0
  const p = a.ctx.createStereoPanner()
  const o = a.ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.value = 210
  const bp = a.ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 900
  bp.Q.value = 1.5
  o.connect(bp).connect(g).connect(p).connect(a.master)
  o.start()
  return { g, p, o }
}

function crickets(p: number, n: number) {
  const a = getAudio()!
  const t0 = a.ctx.currentTime
  const o = a.ctx.createOscillator()
  o.frequency.value = 4400 + Math.random() * 500
  const g = a.ctx.createGain()
  g.gain.value = 0
  o.connect(g).connect(out(p + (Math.random() - 0.5) * 0.6, Math.min(0.06, 0.015 + n * 0.0008)))
  const pulses = 3 + Math.floor(Math.random() * 3)
  for (let i = 0; i < pulses; i++) {
    const t = t0 + i * 0.06
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(1, t + 0.008)
    g.gain.linearRampToValueAtTime(0, t + 0.04)
  }
  o.start(t0)
  o.stop(t0 + pulses * 0.06 + 0.05)
}

function drop(p: number) {
  const a = getAudio()!
  const t = a.ctx.currentTime
  const o = a.ctx.createOscillator()
  const g = a.ctx.createGain()
  const f = 700 + Math.random() * 500
  o.frequency.setValueAtTime(f, t)
  o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.07)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(1, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
  o.connect(g).connect(out(p + (Math.random() - 0.5) * 0.5, 0.12))
  o.start(t)
  o.stop(t + 0.15)
}

function chirps(p: number) {
  const a = getAudio()!
  const t0 = a.ctx.currentTime
  const o = a.ctx.createOscillator()
  const g = a.ctx.createGain()
  g.gain.value = 0
  o.connect(g).connect(out(p + (Math.random() - 0.5) * 0.6, 0.07))
  const n = 2 + Math.floor(Math.random() * 4)
  const base = 2600 + Math.random() * 1200
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 0.11
    o.frequency.setValueAtTime(base, t)
    o.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.06)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(1, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
  }
  o.start(t0)
  o.stop(t0 + n * 0.11 + 0.1)
}

/** El pájaro del árbol: cuatro o cinco notas de la escala, como una frase. */
function song(p: number) {
  const a = getAudio()!
  const t0 = a.ctx.currentTime
  const o = a.ctx.createOscillator()
  const g = a.ctx.createGain()
  const vib = a.ctx.createOscillator()
  const vg = a.ctx.createGain()
  o.type = 'sine'
  vib.frequency.value = 7
  vg.gain.value = 18
  vib.connect(vg).connect(o.frequency)
  g.gain.value = 0
  o.connect(g).connect(out(p, 0.09))
  const n = 4 + Math.floor(Math.random() * 2)
  let k = Math.floor(Math.random() * NOTES.length)
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 0.22
    k = Math.max(0, Math.min(NOTES.length - 1, k + (Math.random() < 0.5 ? -1 : 1)))
    o.frequency.setValueAtTime(NOTES[k] * 2, t)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(1, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.19)
  }
  o.start(t0)
  vib.start(t0)
  o.stop(t0 + n * 0.22 + 0.1)
  vib.stop(t0 + n * 0.22 + 0.1)
}
