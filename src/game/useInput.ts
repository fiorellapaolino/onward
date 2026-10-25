import { useEffect } from 'react'
import { game, input } from './state'

// Moverse (relativo a la cámara): W/↑ adelante, S/↓ atrás, A/← izquierda, D/→ derecha
// (en móvil/tablet: palanca con el pulgar izquierdo, arrastrar a la derecha para mirar, botones para correr y saltar).
// Correr: mantener Tab mientras camina. Saltar: Espacio. Escuchar / hablar: E.
// Cámara: arrastrar con el ratón gira alrededor de la elfa; la rueda acerca o aleja.
const FORWARD = new Set(['ArrowUp', 'KeyW'])
const BACK = new Set(['ArrowDown', 'KeyS'])
const LEFT = new Set(['ArrowLeft', 'KeyA'])
const RIGHT = new Set(['ArrowRight', 'KeyD'])

const DRAG_SPEED = 0.006
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

export function useInput() {
  useEffect(() => {
    const keys = new Set<string>()
    let lastX = 0
    let lastY = 0
    const sync = () => {
      const any = (set: Set<string>) => [...keys].some((k) => set.has(k))
      input.forward = any(FORWARD)
      input.backward = any(BACK)
      input.left = any(LEFT)
      input.right = any(RIGHT)
      input.run = keys.has('Tab') || input.runToggle
    }

    const onKeyDown = (e: KeyboardEvent) => {
      // (Tab normalmente cambia el foco de la página; aquí lo usamos para correr)
      if (FORWARD.has(e.code) || BACK.has(e.code) || LEFT.has(e.code) || RIGHT.has(e.code) || e.code === 'Tab' || e.code === 'Space') e.preventDefault()
      if (e.code === 'Space' && !e.repeat) input.jumpPressed = true
      // E (o Enter): escuchar a alguien / pasar a la siguiente frase
      if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat && game.started) input.interact = true
      // Al terminar, R vuelve a empezar
      if (e.code === 'KeyR' && game.phase === 'end' && game.phaseT > 10) location.reload()
      keys.add(e.code)
      sync()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code)
      sync()
    }

    // Ratón: arrastrar gira la cámara.
    // Pantalla táctil: el pulgar en la mitad izquierda es una palanca para moverse (aparece donde tocas);
    // arrastrar en el resto de la pantalla gira la cámara. Correr y saltar son botones (Hud).
    let joyId = -1
    let joyX0 = 0
    let joyY0 = 0
    let camId = -1
    const JOY_RADIUS = 55 // píxeles para llegar al máximo

    const onPointerDown = (e: PointerEvent) => {
      if ((e as PointerEvent & { handled?: boolean }).handled) return // lo usó un botón
      if (e.pointerType === 'touch') {
        if (!game.started) return
        if (joyId < 0 && e.clientX < window.innerWidth * 0.45) {
          joyId = e.pointerId
          joyX0 = e.clientX
          joyY0 = e.clientY
          input.joyX = input.joyY = 0
          window.dispatchEvent(new CustomEvent('joy', { detail: { on: true, x: joyX0, y: joyY0, dx: 0, dy: 0 } }))
        } else if (camId < 0) {
          camId = e.pointerId
          input.dragging = true
          lastX = e.clientX
          lastY = e.clientY
        }
      } else if (e.button === 0) {
        input.dragging = true
        camId = e.pointerId
        lastX = e.clientX
        lastY = e.clientY
        document.body.classList.add('grabbing')
      }
      sync()
    }
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId === joyId) {
        let dx = (e.clientX - joyX0) / JOY_RADIUS
        let dy = (e.clientY - joyY0) / JOY_RADIUS
        const len = Math.hypot(dx, dy)
        if (len > 1) {
          dx /= len
          dy /= len
        }
        input.joyX = dx
        input.joyY = dy
        window.dispatchEvent(new CustomEvent('joy', { detail: { on: true, x: joyX0, y: joyY0, dx, dy } }))
        return
      }
      if (!input.dragging || e.pointerId !== camId) return
      const k = e.pointerType === 'touch' ? DRAG_SPEED * 1.4 : DRAG_SPEED
      input.camYaw -= (e.clientX - lastX) * k
      input.camPitch = clamp(input.camPitch + (e.clientY - lastY) * k, -0.6, 1)
      lastX = e.clientX
      lastY = e.clientY
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId === joyId) {
        joyId = -1
        input.joyX = input.joyY = 0
        window.dispatchEvent(new CustomEvent('joy', { detail: { on: false } }))
      }
      if (e.pointerId === camId) {
        camId = -1
        input.dragging = false
        document.body.classList.remove('grabbing')
      }
      sync()
    }
    const onWheel = (e: WheelEvent) => {
      input.camZoom = clamp(input.camZoom * Math.exp(e.deltaY * 0.001), 0.6, 1.8)
    }
    const onBlur = () => {
      keys.clear()
      joyId = camId = -1
      input.joyX = input.joyY = 0
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
