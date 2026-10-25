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
              {/* "W A S D para moverte · Tab para correr · Espacio para saltar" */}
              <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to move · <kbd>Tab</kbd> to run · <kbd>Space</kbd> to jump
            </p>
            {/* "Arrastra para mirar alrededor · rueda para acercar" */}
            <p className="hint">Drag to look around · scroll to zoom</p>
          </>
        )}
      </div>

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
