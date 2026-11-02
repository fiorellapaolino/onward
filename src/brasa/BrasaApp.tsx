import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { useInput } from '../game/useInput'
import { game, isTouch, setUi, useUi } from '../game/state'
import { startMusic } from '../game/music'
import { Character, ShadowSelf } from '../components/Character'
import { CameraRig } from '../components/CameraRig'
import { TouchControls } from '../components/TouchControls'
import { Blooms } from '../simbolos/Scene'
import { BrasaLoop } from './BrasaLoop'
import {
  BurntForest, Crack, DawnTree, DormantFlowers, GrottoChamber, IntroCam, RearMirror, EmberAndSparks, FearBeing, Fireflies, GrottoGate, Hearth, LavaGround, MirrorBridge, MirrorPickup, MirrorView, MushroomRings,
  Night, PathLights, PrevTrail, RootWall, Stars, Vignette, Volcano,
} from './BrasaScene'
import { b, mirrorKey } from './brasaProto'
import { Reflection } from './Reflection'
import { ActionIcons, Beacons, Beckons, giveGlyph } from './Guides'

/*
 * Onward — la luz que se pasa de mano en mano (ver game-design.md).
 * Parte 1: el Claro de los grillos. Reutiliza la elfa, la cámara, los controles y las flores del prototipo.
 */
export default function BrasaApp() {
  useInput()
  useMirrorKeys()
  return (
    <>
      <Canvas camera={{ position: [0, 2, -4], fov: 55, near: 0.1, far: 600 }} dpr={[1, 2]}>
        <BrasaLoop />
        <Night />
        <Stars />
        <Volcano />
        <DawnTree />
        <CameraRig />
        <IntroCam />
        <LavaGround />
        <PrevTrail />
        <Fireflies />
        <EmberAndSparks />
        <Vignette />
        <RootWall />
        <FearBeing />
        <MirrorPickup />
        <Crack />
        <MirrorBridge />
        <GrottoGate />
        <GrottoChamber />
        <MirrorView />
        <Beckons />
        <Beacons />
        <ActionIcons />
        <Suspense fallback={null}>
          <Character />
          {/* la elfa dorada del jugador anterior (en la escena del principio) y su sombra (en la gruta) */}
          <ShadowSelf />
          {/* (después de la sombra: decide si se ve solo en el espejo) */}
          <RearMirror />
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
      {/* cuánta luz le queda (sin números) */}
      <div id="ember-hud" className="ember-hud" aria-hidden="true">
        <div className="ember-core" />
      </div>
      <div id="mirror-view" className="mirror-view">
        <Reflection />
      </div>
      <Overlay />
    </>
  )
}

/** Mantener Espacio o el clic derecho: mirar por el espejo. */
function useMirrorKeys() {
  useEffect(() => {
    const isSpace = (e: KeyboardEvent) => e.code === 'Space' || e.key === ' '
    const down = (e: KeyboardEvent) => {
      if (isSpace(e) && game.started) mirrorKey.held = true
    }
    const up = (e: KeyboardEvent) => {
      if (isSpace(e)) mirrorKey.held = false
    }
    const pdown = (e: PointerEvent) => {
      if (e.button === 2 && game.started) mirrorKey.held = true
    }
    const pup = (e: PointerEvent) => {
      if (e.button === 2) mirrorKey.held = false
    }
    const menu = (e: MouseEvent) => e.preventDefault()
    const blur = () => (mirrorKey.held = false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('pointerdown', pdown)
    window.addEventListener('pointerup', pup)
    window.addEventListener('contextmenu', menu)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('pointerdown', pdown)
      window.removeEventListener('pointerup', pup)
      window.removeEventListener('contextmenu', menu)
      window.removeEventListener('blur', blur)
    }
  }, [])
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
    setUi({ start: false }) // (los controles aparecen al terminar la escena del principio)
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

      {/* la escena del principio: el título y las dos frases de la misión */}
      <div className={`story title-card ${ui.title ? 'show' : ''}`}>Onward</div>
      <div className={`story ${ui.msg === 'line1' ? 'show' : ''}`}>
        {/* "Alguien te dejó una luz." */}
        Someone left a light for you.
      </div>
      <div className={`story ${ui.msg === 'line2' ? 'show' : ''}`}>
        {/* "Llévala hasta quien espera." */}
        Carry it to the one who waits.
      </div>

      {/* los controles, solo con teclas (sin palabras): moverse · correr */}
      <div className={`controls ${ui.hint && hintShown ? 'show' : ''}`}>
        {isTouch ? null : (
          <p>
            <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> &nbsp;·&nbsp; <kbd>Tab</kbd> »
          </p>
        )}
      </div>

      {/* la tecla sobre lo que se puede hacer (sin palabras): dar luz / mirar por el espejo */}
      <div id="icon-give" className="world-icon give-icon">
        <kbd>{giveGlyph}</kbd>
      </div>
      <div id="icon-mirror" className="world-icon mirror-icon">
        {isTouch ? null : <kbd className="wide">Space</kbd>}
        <svg viewBox="0 0 20 26" aria-hidden="true">
          <ellipse cx="10" cy="13" rx="8" ry="11" fill="#0b0912" stroke="#c8a8ff" strokeWidth="2" />
        </svg>
      </div>

      <TouchControls show={!ui.start} jumpLabel="Light" />
      {isTouch && b.hasMirror ? <MirrorButton /> : null}
    </div>
  )
}

/** En el móvil: un botón que activa y desactiva el espejo. */
function MirrorButton() {
  const [on, setOn] = useState(false)
  return (
    <button
      type="button"
      className={`touch-btn mirror ${on ? 'active' : ''}`}
      onPointerDown={(e) => {
        ;(e.nativeEvent as Event & { handled?: boolean }).handled = true
        mirrorKey.held = !mirrorKey.held
        setOn(mirrorKey.held)
      }}
    >
      {/* "Espejo" */}
      Mirror
    </button>
  )
}
