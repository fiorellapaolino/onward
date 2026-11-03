import { useEffect, useRef } from 'react'
import { useProgress } from '@react-three/drei'
import { consumePointer, game, input, isTouch, setUi, useUi } from '../game/state'
import { TouchControls } from './TouchControls'
import { startMusic } from '../game/music'

// Textos en pantalla. Están en inglés porque las reglas lo piden;
// la traducción está en el comentario de al lado.
export function Hud() {
  const ui = useUi()
  // Guardamos el último mensaje para que se desvanezca en vez de desaparecer de golpe
  const lastMsg = useRef('')
  if (ui.msg) lastMsg.current = ui.msg
  const lastSay = useRef('')
  if (ui.say) lastSay.current = ui.say

  // Carga de modelos: no se puede empezar hasta que el bosque esté listo
  const { active, progress } = useProgress()
  const loaded = !active && progress >= 100
  useEffect(() => {
    game.loaded = loaded
  }, [loaded])

  const begin = () => {
    if (!loaded || game.started) return
    startMusic() // en el mismo clic: los navegadores solo dejan sonar audio así
    game.started = true
    setUi({ start: false })
  }

  // también se puede empezar con Enter o Espacio
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ui.start && (e.code === 'Enter' || e.code === 'Space')) begin()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="hud">
      {/* Pantalla de inicio */}
      <div className={`start ${ui.start ? 'show' : ''}`}>
        {/* "Hacia adelante" */}
        <h1>Onward</h1>
        {loaded ? (
          <button type="button" className="begin" onPointerDown={(e) => e.stopPropagation()} onClick={begin}>
            {/* "Empezar" */}
            Begin
          </button>
        ) : (
          // "Cargando el bosque…"
          <p>Loading the forest… {Math.round(progress)}%</p>
        )}
        {/* "Mejor con auriculares" */}
        <p className="hint">Best with headphones</p>
      </div>

      {/* Título, en el silencio después de la canción */}
      <div className={`title ${ui.title ? 'show' : ''}`}>
        <h1>Onward</h1>
      </div>

      {/* Controles, cuando el jugador toma el control */}
      <div className={`controls ${ui.hint ? 'show' : ''}`}>
        {isTouch ? (
          <>
            {/* "Pulgar izquierdo para moverte · arrastra a la derecha para mirar alrededor" */}
            <p>Left thumb to move · drag on the right to look around</p>
          </>
        ) : (
          <>
            <p>
              {/* "W A S D para moverte · Shift para correr · Espacio para saltar" */}
              <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to move · <kbd>Shift</kbd> to run · <kbd>Space</kbd> to jump
            </p>
            {/* "Arrastra para mirar alrededor · rueda para acercar" */}
            <p className="hint">Drag to look around · scroll to zoom</p>
          </>
        )}
      </div>

      <FearDark />

      {/* franjas negras de cine mientras alguien habla (o en un momento de cine) */}
      <div className={`cine ${ui.say || ui.cine ? 'show' : ''}`} />

      <div className={`msg ${ui.msg ? 'show' : ''}`}>{lastMsg.current}</div>

      {/* Qué hay que hacer ahora */}
      <div className={`goal ${ui.goal ? 'show' : ''}`}>{ui.goal}</div>

      {/* Aviso de acción: "E  Escuchar", o "Mantén E · Quédate" con una barra que se llena */}
      <div
        className={`prompt ${ui.prompt ? 'show' : ''} ${ui.hold >= 0 ? 'holding' : ''} ${isTouch ? 'touch-ui' : ''}`}
        onPointerDown={(e) => {
          consumePointer(e) // (en pantallas táctiles también se puede tocar / mantener)
          input.interact = true
          input.hold = true
        }}
      >
        {ui.hold >= 0 ? (
          <>
            {/* "Mantén E" / "Mantén el dedo aquí" */}
            {isTouch ? 'Hold' : <><kbd>E</kbd> hold</>} · {ui.prompt}
            <span className="bar">
              <span style={{ transform: `scaleX(${ui.hold})` }} />
            </span>
          </>
        ) : (
          <>
            {!isTouch && <kbd>E</kbd>} {ui.prompt}
          </>
        )}
      </div>

      {/* Lo que dice quien habla. Clic, E o Espacio para seguir. */}
      <div
        className={`say ${ui.say ? 'show' : ''}`}
        onPointerDown={(e) => {
          consumePointer(e) // (no mover la cámara)
          input.interact = true
        }}
      >
        <p>{lastSay.current}</p>
        <small>{isTouch ? '▸' : <kbd>E</kbd>}</small>
      </div>

      <TouchControls show={!ui.start && !ui.final && !ui.say} />

      <div className={`fade ${ui.fade ? 'show' : ''}`} />

      <div className={`final ${ui.final ? 'show' : ''}`}>
        <h1>Onward</h1>
        {/* "Gracias por jugar" */}
        <p>Thank you for playing.</p>
        {/* "Pulsa R para jugar de nuevo" */}
        <small>Press R to play again</small>
      </div>
    </div>
  )
}

/**
 * El miedo en la pantalla: la oscuridad se cierra desde los bordes hacia ella.
 * Al quedarse, se detiene; cuando nace su sombra, un destello de luz la aparta.
 * (Se lee de "game" cada frame, sin re-renderizar React.)
 */
function FearDark() {
  const dark = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const g = game
      // hueco de luz alrededor de ella: se cierra con el miedo y se abre un poco al quedarse
      const hole = 70 - 48 * g.fear + 14 * g.courage
      if (dark.current) {
        dark.current.style.opacity = String(Math.min(1, g.fear * 1.2))
        dark.current.style.background = `radial-gradient(ellipse at 50% 55%, transparent ${hole}%, rgba(4,3,9,0.97) ${hole + 32}%)`
      }
      const k = g.shadowOn ? g.time - g.shadowAt : 99
      if (flash.current) flash.current.style.opacity = String(Math.max(0, Math.min(1, k / 0.15)) * Math.max(0, 1 - k / 1.4) * 0.75)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <>
      <div ref={dark} className="fear-dark" />
      <div ref={flash} className="fear-flash" />
    </>
  )
}
