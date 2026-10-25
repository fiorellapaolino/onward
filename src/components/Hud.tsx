import { useEffect, useRef } from 'react'
import { useProgress } from '@react-three/drei'
import { game, setUi, useUi } from '../game/state'
import { startMusic } from '../game/music'
import { Elements } from './Elements'

// Textos en pantalla. Están en inglés porque las reglas lo piden;
// la traducción está en el comentario de al lado.
export function Hud() {
  const ui = useUi()
  // Guardamos el último mensaje para que se desvanezca en vez de desaparecer de golpe
  const lastMsg = useRef('')
  if (ui.msg) lastMsg.current = ui.msg

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
        <p>
          {/* "W A S D para moverte · Tab para correr · Espacio para saltar" */}
          <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to move · <kbd>Tab</kbd> to run · <kbd>Space</kbd> to jump
        </p>
        {/* "Arrastra para mirar alrededor · rueda para acercar" */}
        <p className="hint">Drag to look around · scroll to zoom</p>
      </div>

      <div className={`msg ${ui.msg ? 'show' : ''}`}>{lastMsg.current}</div>

      <Elements />

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
