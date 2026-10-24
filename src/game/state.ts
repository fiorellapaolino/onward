import { useSyncExternalStore } from 'react'

// Fases del juego, en orden:
// intro  → nace y las herramientas flotan a su alrededor (espera al jugador)
// gather → agarra las herramientas
// look   → mira a la izquierda y a la derecha
// play   → sube la escalera
// end    → llega arriba y sigue corriendo hacia el horizonte
export type Phase = 'intro' | 'gather' | 'look' | 'play' | 'end'

// Estado de cada herramienta del Mago
export type ToolState = 'around' | 'flyingIn' | 'carried' | 'toGate' | 'used'

// Estado del juego. Se modifica cada frame (no es estado de React a propósito,
// para que no se re-renderice todo 60 veces por segundo).
export const game = {
  phase: 'intro' as Phase,
  phaseT: 0, // segundos dentro de la fase actual
  time: 0,
  p: 0, // progreso: en qué escalón está (con decimales)
  c: 0, // confianza 0..1 → de dudar a correr
  speed: 0, // escalones por segundo
  idle: 0, // segundos sin moverse
  blocked: false, // está frente a un escalón que falta
  gateHold: 0,
  opened: new Set<number>(),
  lookBack: 0,
  walkPhase: 0,
  pulse: 0, // destello de luz (al nacer, al agarrar, al usar una herramienta)
  tools: [0, 1, 2, 3].map(() => ({ state: 'around' as ToolState, t: 0, gate: -1 })),
}

// Controles
export const input = { forward: false, backPressed: false }

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
