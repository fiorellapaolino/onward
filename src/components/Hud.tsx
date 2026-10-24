import { useRef } from 'react'
import { useUi } from '../game/state'

// Textos en pantalla. Están en inglés porque las reglas lo piden;
// la traducción está en el comentario de al lado.
export function Hud() {
  const ui = useUi()
  // Guardamos el último mensaje para que se desvanezca en vez de desaparecer de golpe
  const lastMsg = useRef('')
  if (ui.msg) lastMsg.current = ui.msg

  return (
    <div className="hud">
      <div className={`title ${ui.title ? 'show' : ''}`}>
        {/* "Hacia adelante" */}
        <h1>Onward</h1>
        {/* "Mantén Espacio, ↑ o clic para caminar" */}
        <p>
          Hold <kbd>Space</kbd>, <kbd>↑</kbd> or click to walk
        </p>
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
