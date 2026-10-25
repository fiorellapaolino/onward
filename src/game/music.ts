import envJson from '../anims/theme_env.json'

/*
 * El tema de la jam (compuesto por Jason Grace), reproducido una sola vez y sin
 * modificar, durante el nacimiento. Es un FLAC: compresión sin pérdida, mismo
 * audio que el .wav original (comprobado muestra a muestra).
 *
 * Su forma (60 s):
 *   0–21 s  respiración: frases cortas que suben y bajan
 *   21 s    entran los graves: se llena
 *   21–53 s se sostiene y se vuelve más brillante
 *   53 s    se corta y se apaga
 */
export const MUSIC = {
  BASS_IN: 21.25, // entran los graves: la niebla se abre y el bosque se revela (ella ya camina)
  RISE_AT: 9, // se levanta (la intro visual es más corta que la canción)
  CUT: 53.25, // la música se corta: silencio y título
  END: 60,
  // picos de las frases del principio: en cada uno aparece un elemento
  ELEMENT_TIMES: [1.5, 3.4, 5.75, 7.6],
}

const ENV = envJson as { rate: number; values: number[] }

/** Intensidad de la música (0..1) en el segundo t. */
export function musicLevel(t: number) {
  const f = t * ENV.rate
  const i = Math.floor(f)
  if (i < 0 || i >= ENV.values.length - 1) return 0
  const u = f - i
  return ENV.values[i] * (1 - u) + ENV.values[i + 1] * u
}

let audio: HTMLAudioElement | null = null
let startedAt = -1 // reloj propio, por si el audio falla
let endedAt = -1

/** Empieza la música (debe llamarse desde un clic: los navegadores lo exigen). */
export function startMusic() {
  startedAt = performance.now()
  try {
    audio = new Audio(`${import.meta.env.BASE_URL}audio/theme.flac`)
    audio.volume = 0.9
    audio.addEventListener('ended', () => (endedAt = performance.now()))
    void audio.play().catch(() => {
      audio = null // sin sonido: el nacimiento sigue con el reloj propio
      startedAt = performance.now()
    })
  } catch {
    audio = null
  }
}

/** Segundos de música transcurridos (-1 si todavía no empezó). */
export function musicTime() {
  if (startedAt < 0) return -1
  if (audio) {
    if (endedAt >= 0) return MUSIC.END + (performance.now() - endedAt) / 1000
    return audio.currentTime // mientras carga se queda en 0: el nacimiento espera a la música
  }
  return (performance.now() - startedAt) / 1000
}
