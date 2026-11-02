import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF, useProgress } from '@react-three/drei'
import { natureUrl } from '../game/config'
import { PLANT_MODELS, SPECIES } from './data'
import { j } from './garden'
import { startSong } from './audio'
import { GardenInput, GardenLoop } from './Input'
import { CompostBin, DeadTrees, DioramaCam, Ground, Heaps, Hints, Plants, Brush, Scraps, Sky, YellowBin } from './Scene'
import './jardin.css'

/*
 * El jardín que suena (ver jardin-design.md).
 * Restos → compostera → compost → se pinta la tierra seca → crece una especie → el jardín suena.
 */
export default function JardinApp() {
  return (
    <>
      <Canvas camera={{ position: [0, 20, 16], fov: 38, near: 0.1, far: 200 }} dpr={[1, 2]}>
        <GardenLoop />
        <DioramaCam />
        <Sky />
        <GardenInput />
        <Suspense fallback={null}>
          <Ground />
          <Plants />
          <DeadTrees />
        </Suspense>
        <Scraps />
        <CompostBin />
        <YellowBin />
        <Heaps />
        <Brush />
        <Hints />
      </Canvas>
      <Hud />
    </>
  )
}

/** Sin palabras: una semilla para empezar y, arriba, el cuaderno de especies. */
function Hud() {
  const { active, progress } = useProgress()
  const loaded = !active && progress >= 100
  const [started, setStarted] = useState(false)
  const [found, setFound] = useState<string[]>([])
  const [fresh, setFresh] = useState('')

  const begin = () => {
    if (!loaded || j.started) return
    j.started = true
    j.lastAction = j.t
    void startSong()
    setStarted(true)
  }

  // pruebas: ?auto empieza solo
  useEffect(() => {
    if (loaded && new URLSearchParams(location.search).has('auto')) begin()
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => {
      const now = SPECIES.filter((s) => j.found.has(s.id)).map((s) => s.id)
      setFound((prev) => {
        if (prev.length === now.length) return prev
        setFresh(now.find((x) => !prev.includes(x)) ?? '')
        return now
      })
    }, 250)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="jardin-hud">
      <div className={`notebook ${started ? 'show' : ''}`}>
        {SPECIES.map((s) => (
          <div key={s.id} className={`leaf ${found.includes(s.id) ? 'on' : ''} ${fresh === s.id ? 'fresh' : ''}`} style={{ ['--tint' as string]: s.tint }}>
            <span>{s.icon}</span>
          </div>
        ))}
      </div>
      <div className={`seed-start ${started ? '' : 'show'}`}>
        <button type="button" className={`seed ${loaded ? 'ready' : ''}`} onClick={begin} aria-label="Play">
          <span>🌱</span>
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" pathLength={100} strokeDasharray={`${loaded ? 100 : progress} 100`} />
          </svg>
        </button>
      </div>
    </div>
  )
}

;[...PLANT_MODELS, 'DeadTree_1', 'DeadTree_2', 'Rock_Medium_2', 'Pebble_Round_1'].forEach((m) => useGLTF.preload(natureUrl(m)))
