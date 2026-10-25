import { useSyncExternalStore } from 'react'

// Fases del juego, en orden:
// intro  → nace en postura del niño; las herramientas flotan a su alrededor (espera al jugador)
// rise   → se incorpora y alza el brazo como el Mago
// gather → agarra las herramientas
// look   → mira a la izquierda y a la derecha
// play   → avanza por el bosque
// end    → llega a la luz y sigue hacia otros caminos
export type Phase = 'intro' | 'rise' | 'gather' | 'look' | 'play' | 'end'

// Estado de cada herramienta del Mago
export type ToolState = 'around' | 'flyingIn' | 'carried' | 'toGate' | 'used'

// Estado del juego. Se modifica cada frame (no es estado de React a propósito,
// para que no se re-renderice todo 60 veces por segundo).
export const game = {
  loaded: false, // ya se cargaron los modelos
  phase: 'intro' as Phase,
  phaseT: 0, // segundos dentro de la fase actual
  time: 0,
  p: 0, // progreso: metros recorridos a lo largo del sendero (su posición en z)
  pMax: 0, // lo más lejos que llegó (la luz y los colores no retroceden)
  x: 0, // posición libre en el bosque
  z: 0,
  yaw: 0, // hacia dónde mira (radianes)
  c: 0, // confianza 0..1 → de dudar a correr
  speed: 0, // metros por segundo
  idle: 0, // segundos sin moverse
  blocked: false, // está frente a un obstáculo
  gateHold: 0,
  opened: new Set<number>(),
  openedAt: new Map<number, number>(), // momento (game.time) en que se abrió cada obstáculo
  walkPhase: 0,
  jumpT: -1, // tiempo desde que empezó el salto (-1 = no salta)
  jumpY: 0, // altura del salto en este momento (metros)
  pulse: 0, // destello de luz (al nacer, al agarrar, al usar una herramienta)
  tools: [0, 1, 2, 3].map(() => ({ state: 'around' as ToolState, t: 0, gate: -1 })),
}

// Controles
export const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  backPressed: false,
  run: false, // Tab mantenido
  jumpPressed: false, // Espacio (se consume en el siguiente frame)
  // Cámara libre: arrastrar con el ratón la gira, la rueda acerca/aleja
  camYaw: 0, // hacia dónde mira la cámara en el mundo (0 = hacia delante en el sendero)
  camPitch: 0, // altura extra (-0.6 abajo … 1 arriba)
  camZoom: 1, // 0.6 cerca … 1.8 lejos
  dragging: false,
}

// ── Textos en pantalla (esto sí es estado de React) ──────────────
type Ui = { title: boolean; msg: string | null; fade: boolean; final: boolean }
let ui: Ui = { title: true, msg: null, fade: false, final: false }
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
