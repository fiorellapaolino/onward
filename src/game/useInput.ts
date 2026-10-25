import { useEffect } from 'react'
import { game, input } from './state'

// Caminar: mantener ↑ o W (en móvil/tablet: mantener el dedo en la pantalla).
// Correr: mantener Tab mientras camina. Saltar: Espacio.
// Mirar atrás: ↓ o S (no retrocede: se gira y vuelve a mirar adelante).
// Cámara: arrastrar con el ratón gira alrededor de la elfa; la rueda acerca o aleja.
const FORWARD = new Set(['ArrowUp', 'KeyW'])
const BACK = new Set(['ArrowDown', 'KeyS'])

const DRAG_SPEED = 0.006
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

export function useInput() {
  useEffect(() => {
    const keys = new Set<string>()
    let touch = false
    let lastX = 0
    let lastY = 0
    const sync = () => {
      input.forward = touch || [...keys].some((k) => FORWARD.has(k))
      input.run = keys.has('Tab')
    }

    const onKeyDown = (e: KeyboardEvent) => {
      // (Tab normalmente cambia el foco de la página; aquí lo usamos para correr)
      if (FORWARD.has(e.code) || BACK.has(e.code) || e.code === 'Tab' || e.code === 'Space') e.preventDefault()
      if (e.code === 'Space' && !e.repeat) input.jumpPressed = true
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
      if (e.pointerType === 'touch') {
        touch = true // en pantallas táctiles, mantener el dedo = caminar
      } else if (e.button === 0) {
        input.dragging = true
        lastX = e.clientX
        lastY = e.clientY
        document.body.classList.add('grabbing')
      }
      sync()
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!input.dragging) return
      input.camYaw -= (e.clientX - lastX) * DRAG_SPEED
      input.camPitch = clamp(input.camPitch + (e.clientY - lastY) * DRAG_SPEED, -0.6, 1)
      lastX = e.clientX
      lastY = e.clientY
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') touch = false
      input.dragging = false
      document.body.classList.remove('grabbing')
      sync()
    }
    const onWheel = (e: WheelEvent) => {
      input.camZoom = clamp(input.camZoom * Math.exp(e.deltaY * 0.001), 0.6, 1.8)
    }
    const onBlur = () => {
      keys.clear()
      touch = false
      input.dragging = false
      document.body.classList.remove('grabbing')
      sync()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}
