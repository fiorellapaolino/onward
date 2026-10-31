import { Suspense, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { useInput } from '../game/useInput'
import { game, isTouch, setUi, useUi } from '../game/state'
import { startMusic } from '../game/music'
import { Character } from '../components/Character'
import { CameraRig } from '../components/CameraRig'
import { TouchControls } from '../components/TouchControls'
import { Loop } from './Loop'
import { AerialCam, Atmosphere, Blooms, Bridge, DeadForest, Drawings, Fires, Ground, ShadowWall, Spirits, Waiting, ZoneRings } from './Scene'
import { proto } from './proto'

/*
 * Prototipo de "El bosque que se dibuja" (zonas 1 y 4).
 * Reutiliza la elfa, la cámara y los controles del juego; el resto está en src/simbolos/.
 */
export default function SymbolsApp() {
  useInput()
  return (
    <>
      <Canvas camera={{ position: [0, 2, -4], fov: 55, near: 0.1, far: 400 }} dpr={[1, 2]}>
        <Loop />
        <Atmosphere />
        <CameraRig />
        <AerialCam />
        <Ground />
        <ZoneRings />
        <Drawings />
        <Waiting />
        <Suspense fallback={null}>
          <Character />
          <Spirits />
        </Suspense>
        <Suspense fallback={null}>
          <DeadForest />
          <Blooms />
          <Bridge />
        </Suspense>
        <Fires />
        <ShadowWall />
        <EndWatcher />
      </Canvas>
      <Overlay />
    </>
  )
}

/** Cuando la cámara ya subió del todo, aparece el texto final. */
function EndWatcher() {
  useFrame(() => {
    if (proto.endAt >= 0 && game.time - proto.endAt > 11) setUi({ final: true })
  })
  return null
}

function Overlay() {
  const ui = useUi()
  const { active, progress } = useProgress()
  const loaded = !active && progress >= 100
  const [hintShown, setHintShown] = useState(false)
  useEffect(() => {
    game.loaded = loaded
  }, [loaded])

  const begin = () => {
    if (!loaded || game.started) return
    startMusic()
    game.started = true
    setUi({ start: false, hint: true })
    setHintShown(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ui.start && (e.code === 'Enter' || e.code === 'Space')) begin()
      if (e.code === 'KeyR' && ui.final) location.reload()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="hud">
      <div className={`start ${ui.start ? 'show' : ''}`}>
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
        {/* "Prototipo: el bosque que se dibuja" */}
        <p className="hint">Prototype · the forest that draws itself</p>
      </div>

      <div className={`controls ${ui.hint && hintShown ? 'show' : ''}`}>
        {isTouch ? (
          // "Pulgar izquierdo para moverte · arrastra a la derecha para mirar"
          <p>Left thumb to move · drag on the right to look around</p>
        ) : (
          <>
            <p>
              {/* "W A S D para moverte · Tab para correr" */}
              <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to move · <kbd>Tab</kbd> to run
            </p>
            {/* "Arrastra para mirar alrededor" */}
            <p className="hint">Drag to look around · scroll to zoom</p>
          </>
        )}
      </div>

      <TouchControls show={!ui.start && !ui.final} />

      <div className={`final ${ui.final ? 'show' : ''}`} style={{ top: '12%', transform: 'none', color: '#4a3a2a' }}>
        {/* "Tu camino" */}
        <p style={{ fontSize: 'clamp(20px, 3vw, 30px)', fontStyle: 'italic', opacity: 1 }}>Your path.</p>
        {/* "Pulsa R para caminar de nuevo" */}
        <small>{isTouch ? '' : 'Press R to walk again'}</small>
      </div>
    </div>
  )
}
