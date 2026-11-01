import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { useInput } from '../game/useInput'
import { game, isTouch, setUi, useUi } from '../game/state'
import { startMusic } from '../game/music'
import { Character } from '../components/Character'
import { CameraRig } from '../components/CameraRig'
import { TouchControls } from '../components/TouchControls'
import { Blooms } from '../simbolos/Scene'
import { BrasaLoop } from './BrasaLoop'
import { BurntForest, DormantFlowers, EmberAndSparks, FearBeing, Fireflies, Hearth, LavaGround, MirrorPickup, MushroomRings, Night, PathLights, PrevTrail, RootWall, Stars, Vignette, Volcano } from './BrasaScene'

/*
 * Onward — la luz que se pasa de mano en mano (ver game-design.md).
 * Parte 1: el Claro de los grillos. Reutiliza la elfa, la cámara, los controles y las flores del prototipo.
 */
export default function BrasaApp() {
  useInput()
  return (
    <>
      <Canvas camera={{ position: [0, 2, -4], fov: 55, near: 0.1, far: 600 }} dpr={[1, 2]}>
        <BrasaLoop />
        <Night />
        <Stars />
        <Volcano />
        <CameraRig />
        <LavaGround />
        <PrevTrail />
        <Fireflies />
        <EmberAndSparks />
        <Vignette />
        <RootWall />
        <FearBeing />
        <MirrorPickup />
        <Suspense fallback={null}>
          <Character />
        </Suspense>
        <Suspense fallback={null}>
          <BurntForest />
          <Hearth />
          <MushroomRings />
          <PathLights />
          <DormantFlowers />
          <Blooms />
        </Suspense>
      </Canvas>
      <div id="vignette" className="vignette" />
      <Overlay />
    </>
  )
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
        {/* "Usa auriculares: los grillos te guían" */}
        <p className="hint">Best with headphones · the crickets will guide you</p>
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

      {/* "E / Espacio: dar luz" (solo aparece cerca de algo a lo que se le puede dar luz) */}
      <div className={`give ${ui.prompt === 'give' ? 'show' : ''}`}>
        {isTouch ? 'Tap Jump to give light' : (
          <>
            <kbd>E</kbd> give light
          </>
        )}
      </div>

      <TouchControls show={!ui.start} />
    </div>
  )
}
