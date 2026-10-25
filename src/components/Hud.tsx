import { useEffect, useRef } from 'react'
import { useProgress } from '@react-three/drei'
import { game, useUi } from '../game/state'

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

  return (
    <div className="hud">
      <div className={`title ${ui.title ? 'show' : ''}`}>
        {/* "Hacia adelante" */}
        <h1>Onward</h1>
        {/* "Mantén Espacio, ↑ o clic para caminar" */}
        {loaded ? (
          <>
            {/* "Mantén Espacio o ↑ para caminar" */}
            <p>
              {/* "W A S D para moverte · Tab para correr · Espacio para saltar" */}
              <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to move · <kbd>Tab</kbd> to run · <kbd>Space</kbd> to jump
            </p>
            {/* "Arrastra para mirar alrededor · rueda para acercar" */}
            <p className="hint">Drag to look around · scroll to zoom</p>
          </>
        ) : (
          // "Cargando el bosque…"
          <p>Loading the forest… {Math.round(progress)}%</p>
        )}
      </div>

      <div className={`msg ${ui.msg ? 'show' : ''}`}>{lastMsg.current}</div>

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
