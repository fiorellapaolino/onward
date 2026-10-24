import { useEffect } from 'react'
import { game, input } from './state'

// Avanzar: mantener Espacio, ↑, W o el clic / dedo en pantalla.
// Mirar atrás: ↓ o S (no retrocede: se gira y vuelve a mirar adelante).
const FORWARD = new Set(['Space', 'ArrowUp', 'KeyW'])
const BACK = new Set(['ArrowDown', 'KeyS'])

export function useInput() {
  useEffect(() => {
    const keys = new Set<string>()
    let pointer = false
    const sync = () => {
      input.forward = pointer || [...keys].some((k) => FORWARD.has(k))
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (FORWARD.has(e.code) || BACK.has(e.code)) e.preventDefault()
      if (BACK.has(e.code) && !e.repeat) input.backPressed = true
      // Al terminar, R vuelve a empezar
      if (e.code === 'KeyR' && game.phase === 'end' && game.phaseT > 10) location.reload()
      keys.add(e.code)
      sync()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code)
      sync()
    }
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0) pointer = true
      sync()
    }
    const onPointerUp = () => {
      pointer = false
      sync()
    }
    const onBlur = () => {
      keys.clear()
      pointer = false
      sync()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}
