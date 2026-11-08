import { useSyncExternalStore } from 'react'

// Fases del juego, en orden:
// intro  → nace en postura del niño; las herramientas flotan a su alrededor (espera al jugador)
// rise   → se incorpora y alza el brazo como el Mago
// gather → agarra las herramientas
// look   → mira a la izquierda y a la derecha
// play   → avanza por el bosque
// end    → llega a la luz y sigue hacia otros caminos
export type Phase = 'intro' | 'rise' | 'gather' | 'look' | 'play' | 'end'


// La historia de la aldea, en orden:
// seek      → todavía no habló con la niña
// seed      → la niña le contó que antes atrapaba las semillas que giran: atrapar una bajo su árbol y llevársela
//             (cuando ayudas a alguien, ayudas a todos: su alegría viaja como una luz hasta el siguiente)
// help      → la niña sonrió: la luz viajó hasta el anciano
// fear      → el anciano le contó su miedo; la oscuridad la rodea y tiene que quedarse (mantener E)
// born      → se quedó: la oscuridad se cierra sobre ella y sale de ella una figura de luz, de rodillas como ella.
//             Se levanta y da unos pasos hacia la plaza; detrás, la figura hace lo mismo (es ella misma, de antes)
// plates    → la oscuridad tomó su forma: nace su sombra, que repite lo que ella hizo segundos antes.
//             Con ella hay que pisar a la vez las dos piedras que suben el gran farol de la plaza
// music     → subió el gran farol; se oye a alguien tocar a escondidas: hay que tocar su melodía en las campanas
//             (y la sombra la repite detrás, como un canon)
// next      → la música volvió a la aldea (lo siguiente: los dos que no se dijeron lo que sentían)
export type Story = 'seek' | 'seed' | 'help' | 'fear' | 'born' | 'plates' | 'music' | 'smith' | 'altar' | 'starIron' | 'forgeFire' | 'forgeBend' | 'forging' | 'keyHot' | 'forgeDone' | 'keyReady' | 'key' | 'next'
// Con quién está hablando (mientras alguien habla, la elfa se queda quieta escuchando)
export type Talker = 'girl' | 'elder' | 'smith' | null

// Estado del juego. Se modifica cada frame (no es estado de React a propósito,
// para que no se re-renderice todo 60 veces por segundo).
export const game = {
  loaded: false, // ya se cargaron los modelos
  started: false, // el jugador hizo clic para empezar (y empezó la música)
  musicT: -1, // segundos de música (el nacimiento va sincronizado con ella)
  phase: 'intro' as Phase,
  phaseT: 0, // segundos dentro de la fase actual
  time: 0,
  p: 0, // progreso: metros recorridos a lo largo del sendero (su posición en z)
  pMax: 0, // lo más lejos que llegó (la luz y los colores no retroceden)
  x: 0, // posición libre en el bosque
  z: 0,
  yaw: 0, // hacia dónde mira (radianes)
  c: 0, // confianza 0..1 → de dudar a correr
  spark: 0, // 0..1: su chispa (momentos de estar viva que ha vivido); su luz y el color del mundo crecen con ella
  speed: 0, // metros por segundo
  idle: 0, // segundos sin moverse
  blocked: false, // empuja contra la sombra (no puede pasar)
  walkPhase: 0,
  story: 'help' as Story, // (sin la niña: la aldea empieza por el anciano)
  talk: null as Talker,
  line: 0, // frase que se está leyendo
  lineT: 0, // segundos desde que apareció esa frase
  girlNear: 0, // 0..1: lo cerca que está la elfa de la niña (ella levanta la cabeza)
  elderNear: 0, // 0..1: lo mismo con el anciano
  fear: 0, // 0..1: la oscuridad la rodea (al escuchar al anciano)
  courage: 0, // 0..1: se queda aunque tenga miedo (mantener E); al llegar a 1 despierta su luz
  lightAwake: false, // ya volvió la luz a la aldea (subió el gran farol)
  awakeAt: -99, // momento (game.time) del último gran momento (nace la sombra, sube el farol…), para los mensajes
  shadowOn: false, // ya nació su sombra
  shadowAt: -99, // momento en que nació
  plates: [false, false], // qué piedras de la plaza están pisadas ahora (por ella o por su sombra)
  liftAt: -1, // momento en que subió el gran farol (-1 = todavía no)
  bellAt: [-99, -99, -99, -99, -99], // última vez que sonó cada campana (para que brille)
  bellBy: [0, 0, 0, 0, 0], // quién la tocó: 1 = la elfa, 2 = la sombra, 3 = la mujer (al enseñar su melodía)
  bellIn: [false, false, false, false, false], // la elfa está encima (para sonar solo al pisarla)
  bellInShadow: [false, false, false, false, false],
  mySeq: [] as number[], // las últimas campanas que tocó la elfa
  shadowSeq: [] as number[], // … y su sombra
  tuneAt: -99, // la última vez que la mujer empezó a tocar su melodía a escondidas
  freedAt: -1, // momento en que la mujer se atrevió a salir y tocar (-1 = todavía no)
  giftStill: 0, // segundos quieta bajo el árbol de la niña
  giftSeedT: -1, // la semilla que baja a su mano (segundos; -1 = ninguna)
  carrying: false, // lleva una semilla para la niña
  giftAt: -1, // momento en que se la dio (-1 = todavía no)
  relayAt: -1, // momento en que la luz de una persona ayudada sale hacia la siguiente
  relayFrom: { x: 0, z: 0 },
  relayTo: { x: 0, z: 0 },
  // la luz que vuelve: cuando ayuda a alguien, una parte de su alegría vuelve a ella y se queda a su lado
  memory: 0, // 0..1: el recuerdo de cómo era la aldea antes (mientras la niña lo cuenta)
  returns: [] as { x: number; y: number; z: number; at: number }[],
  lit: [] as number[], // momento (game.time) en que se encendió cada farol (-1 = apagado)
  shadowOpen: false, // la sombra de la salida ya deja pasar
  // ── el altar: su yo oscuro (la sombra) entra al plano que la luz esconde ──
  plane: 0, // 0 = el mundo; 1 = su estado oscuro (ve lo sobrenatural); 2 = el plano negativo (el vacío)
  planeAt: -99, // cuándo entró al plano actual
  prayAt: -1, // empezó a rezar en el altar (-1 = no)
  bodyX: 0, // dónde quedó su cuerpo, arrodillado, mientras anda su sombra
  bodyZ: 0,
  bodyYaw: 0,
  fallAt: -1, // se cayó al vacío (vuelve a su cuerpo)
  ironAt: -1, // tomó el hierro de estrella
  stoneAt: [-1, -1, -1, -1, -1, -1, -1, -1] as number[], // cuándo pisó cada piedra flotante (se cae al rato)
  waveAt: -1, // pisó la primera piedra: el puente se derrumba detrás de ella
  closeAt: -1, // la grieta empieza a cerrarse (se ve desde su yo oscuro, antes de volver a su cuerpo)
  shake: 0, // 0..1: temblor de la cámara (se abre la grieta, se rompe una piedra)
  // ── la herrería ──
  smithNear: 0, // 0..1: lo cerca que está la elfa del herrero
  forgeHeat: 0.3, // 0..1: el fuego del horno (en su punto entre FORGE_GOOD)
  forgeGood: 0, // 0..1: cuánto tiempo seguido estuvo el fuego en su punto
  forgingAt: -1, // el herrero empezó a martillar el hierro (-1 = todavía no)
  forgeHits: 0, // martillazos dados (la barra se va doblando)
  forgeHitAt: -99, // último golpe (para la chispa)
  forgePumpAt: -99, // última vez que avivó el fuego (llamarada)
  keyCool: 0, // 0..1: cuánto se enfrió la llave bajo su sombra
  keyShadeAt: -99, // último momento en que su sombra cubrió la llave (vapor)
  forgeDoneAt: -1, // la llave se enfrió: está lista
  keyAt: -1, // el herrero le dio la llave (la lleva hasta el portal)
  // ── el final: se da vuelta, su sombra (su pasado) está encogida; la abraza y caminan juntas hacia adelante ──
  kneel: 0, // 0..1: cuánto está de rodillas (pose de "Standing Up")
  kneelT: 0, // momento de esa animación (0 = de rodillas … final = de pie)
  sit: 0, // 0..1: en cuclillas (al quedarse con la oscuridad, hasta que nace su sombra)
  hug: 0, // 0..1: abrazo (brazos hacia delante, rodeando)
  fuse: 0, // 0..1: la pose de rezar del final ("Praying"), mientras su sombra entra en ella
  fuseT: 0, // momento de esa animación
  bow: 0, // 0..1: la reverencia del final ("Quick Informal Bow"), frente a su sombra
  bowT: 0, // momento de esa animación
  endStart: { x: 0, z: 0 }, // dónde se detuvo
  endShadow: { x: 0, z: 0 }, // dónde se encoge su sombra
  jumpT: -1, // tiempo desde que empezó el salto (-1 = no salta)
  jumpY: 0, // altura del salto en este momento (metros)
  pulse: 0, // destello de luz (al nacer, al agarrar, al usar una herramienta)
}

/** Cuánto tarda en volar hasta ella la luz de alguien a quien ayudó (segundos). */
export const RETURN_TIME = 2.4
/** Cuántas luces de gente ayudada ya llegaron a ella. */
export function helpedLights() {
  return game.returns.filter((r) => game.time - r.at >= RETURN_TIME).length
}

/** Cuántos faroles de la aldea hay encendidos (0..1). */
export function litFraction() {
  const lit = game.lit
  if (!lit.length) return 0
  return lit.filter((t) => t >= 0 && t <= game.time).length / lit.length
}

/*
 * La sombra: repite lo que hizo la elfa ECHO_DELAY segundos antes.
 * Cada frame se guarda dónde estaba y qué hacía; la sombra lee el pasado.
 * "shadow" tiene la misma forma que "game" para poder dibujarla con el mismo personaje.
 */
export const ECHO_DELAY = 3.5
type Frame = { t: number; x: number; z: number; yaw: number; speed: number; jumpT: number; jumpY: number; idle: number; kneel: number; kneelT: number; sit: number }
export const trail: Frame[] = []
export const shadow = { ...game }
/** Su cuerpo, arrodillado en el altar, mientras el jugador maneja a su sombra (game.plane > 0). */
export const body = { ...game }

/**
 * El nacimiento de la sombra (segundos desde game.shadowAt). La elfa no se mueve sola hasta FREE:
 *   0        la oscuridad se cierra sobre ella; de ella sale una figura de luz, de rodillas como ella
 *   RISE     se levanta (la figura sigue de rodillas)
 *   TURN     mira hacia la plaza  ·  STEP  da unos pasos hacia allí
 *   +ECHO_DELAY  la figura hace lo mismo: se levanta, mira y camina detrás de ella
 */
export const BORN = { RISE: 1.6, RISE_LEN: 2.6, TURN: 4.0, STEP: 4.5, STEP_LEN: 2.3, FREE: 8.6 }

// Controles
export const CAM_ZOOM_MIN = 0.25
export const CAM_ZOOM_MAX = 1.35 // (más lejos, la cámara se mete en la copa de los árboles)
export const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  backPressed: false,
  run: false, // Shift o Tab mantenido (o el botón "Run" activado en el móvil)
  runToggle: false, // botón "Run" del móvil: se activa / desactiva con un toque
  joyX: 0, // palanca táctil del móvil: -1 izquierda … 1 derecha
  joyY: 0, // -1 adelante … 1 atrás (como en la pantalla: hacia arriba = adelante)
  jumpPressed: false, // Espacio (se consume en el siguiente frame)
  interact: false, // E (o clic en el diálogo): escuchar / pasar a la siguiente frase
  hold: false, // E mantenida (o el dedo sobre el aviso): quedarse aunque dé miedo
  // Cámara libre: arrastrar con el ratón la gira, la rueda acerca/aleja
  camYaw: 0, // hacia dónde mira la cámara en el mundo (0 = hacia delante en el sendero)
  camPitch: 0, // altura extra (-0.6 abajo … 1 arriba)
  camZoom: 1, // 0.25 cerca (su cara) … 1.35 lejos
  dragging: false,
}

/** ¿Pantalla táctil? (móvil / tablet): se muestran la palanca y los botones */
export const isTouch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)

/** Marca un toque como "ya usado" por un botón, para que no mueva también la cámara. */
export function consumePointer(e: { nativeEvent: Event }) {
  ;(e.nativeEvent as Event & { handled?: boolean }).handled = true
}

// ── Textos en pantalla (esto sí es estado de React) ──────────────
type Ui = {
  start: boolean // pantalla de inicio (clic para empezar)
  hint: boolean // controles en pantalla
  title: boolean
  msg: string | null
  fade: boolean
  final: boolean
  prompt: string | null // aviso de acción, p. ej. "Listen"
  hold: number // -1 = sin barra; 0..1 = cuánto lleva manteniendo E
  say: string | null // lo que dice la niña
  goal: string | null // qué hay que hacer ahora (arriba a la izquierda)
  titleReady: boolean // la escena del título ya se puede mostrar
  cine: boolean // franjas negras de cine (también sin diálogo: el miedo y el nacimiento de la sombra)
}
let ui: Ui = { start: true, hint: false, title: false, msg: null, fade: false, final: false, prompt: null, hold: -1, say: null, goal: null, cine: false, titleReady: false }
const listeners = new Set<() => void>()

export function setUi(patch: Partial<Ui>) {
  const changed = (Object.keys(patch) as (keyof Ui)[]).some((k) => patch[k] !== ui[k])
  if (!changed) return
  ui = { ...ui, ...patch }
  listeners.forEach((l) => l())
}

export function useUi() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => ui,
  )
}
