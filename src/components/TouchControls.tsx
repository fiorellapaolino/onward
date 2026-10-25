import { useEffect, useRef, useState } from 'react'
import { consumePointer, input, isTouch } from '../game/state'

/*
 * Controles para pantallas táctiles (móvil / tablet):
 *   - palanca: aparece donde apoyas el pulgar izquierdo (la lógica está en useInput)
 *   - botón "Run": activa / desactiva correr
 *   - botón "Jump": salta (y, mientras habla la niña, pasa a la siguiente frase)
 *   - arrastrar en el resto de la pantalla gira la cámara
 */
type Joy = { on: boolean; x?: number; y?: number; dx?: number; dy?: number }

export function TouchControls({ show }: { show: boolean }) {
  const [run, setRun] = useState(false)
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)

  // la palanca se dibuja donde está el pulgar (sin re-renderizar React en cada movimiento)
  useEffect(() => {
    const onJoy = (e: Event) => {
      const d = (e as CustomEvent<Joy>).detail
      const b = base.current
      const k = knob.current
      if (!b || !k) return
      b.classList.toggle('on', d.on)
      if (!d.on) return
      b.style.left = `${d.x}px`
      b.style.top = `${d.y}px`
      k.style.transform = `translate(${(d.dx ?? 0) * 40}px, ${(d.dy ?? 0) * 40}px)`
    }
    window.addEventListener('joy', onJoy)
    return () => window.removeEventListener('joy', onJoy)
  }, [])

  if (!isTouch) return null

  return (
    <div className={`touch ${show ? 'show' : ''}`}>
      <div ref={base} className="joy">
        <div ref={knob} className="knob" />
      </div>
      <button
        type="button"
        className={`touch-btn run ${run ? 'active' : ''}`}
        onPointerDown={(e) => {
          consumePointer(e)
          input.runToggle = !input.runToggle
          setRun(input.runToggle)
        }}
      >
        {/* "Correr" */}
        Run
      </button>
      <button
        type="button"
        className="touch-btn jump"
        onPointerDown={(e) => {
          consumePointer(e)
          input.jumpPressed = true
        }}
      >
        {/* "Saltar" */}
        Jump
      </button>
    </div>
  )
}
