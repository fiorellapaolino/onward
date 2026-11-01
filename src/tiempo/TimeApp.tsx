import { Suspense, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { useInput } from '../game/useInput'
import { game, isTouch, setUi, useUi } from '../game/state'
import { startMusic } from '../game/music'
import { Character } from '../components/Character'
import { CameraRig } from '../components/CameraRig'
import { TouchControls } from '../components/TouchControls'
import { Blooms } from '../simbolos/Scene'
import { TimeLoop } from './TimeLoop'
import { Banks, Forests, River, TimeAerial, TimeAtmosphere, TimeDrawings, TimeGoal, TimeGround, TimeRing, TimeSpirit, TimeWave } from './TimeScene'
import { tp } from './timeProto'

/*
 * Zona de prueba del símbolo del tiempo (?tiempo en la dirección).
 * Reutiliza la elfa, la cámara, los controles, las flores y el reconocedor del prototipo.
 */
export default function TimeApp() {
  useInput()
  return (
    <>
      <Canvas camera={{ position: [0, 2, -4], fov: 55, near: 0.1, far: 400 }} dpr={[1, 2]}>
        <TimeLoop />
        <TimeAtmosphere />
        <CameraRig />
        <TimeAerial />
        <TimeGround />
        <TimeRing />
        <TimeDrawings />
        <TimeWave />
        <TimeGoal />
        <TimeSpirit />
        <Suspense fallback={null}>
          <Character />
        </Suspense>
        <Suspense fallback={null}>
          <River />
          <Banks />
          <Forests />
          <Blooms />
        </Suspense>
        <EndWatcher />
      </Canvas>
      <Overlay />
    </>
  )
}

function EndWatcher() {
  useFrame(() => {
    if (tp.endAt >= 0 && game.time - tp.endAt > 10) setUi({ final: true })
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
        {/* "Prueba: el símbolo del tiempo" */}
        <p className="hint">Test · the symbol of time</p>
      </div>

      <div className={`controls ${ui.hint && hintShown ? 'show' : ''}`}>
        {isTouch ? (
          <p>Left thumb to move · drag on the right to look around</p>
        ) : (
          <>
            <p>
              <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to move · <kbd>Tab</kbd> to run
            </p>
            <p className="hint">Drag to look around · scroll to zoom</p>
          </>
        )}
      </div>

      <TouchControls show={!ui.start && !ui.final} />

      <div className={`final ${ui.final ? 'show' : ''}`} style={{ top: '12%', transform: 'none', color: '#4a3a2a' }}>
        {/* "Tu camino" */}
        <p style={{ fontSize: 'clamp(20px, 3vw, 30px)', fontStyle: 'italic', opacity: 1 }}>Your path.</p>
        <small>{isTouch ? '' : 'Press R to walk again'}</small>
      </div>
    </div>
  )
}
