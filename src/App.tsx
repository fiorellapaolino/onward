import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { GameLoop } from './game/GameLoop'
import { useInput } from './game/useInput'
import { World } from './components/World'
import { Forest } from './components/Forest'
import { PathStones } from './components/PathStones'
import { Flowers } from './components/Flowers'
import { Village } from './components/Village'
import { Moments } from './components/Moments'
import { Guide } from './components/Guide'
import { Companions } from './components/Companions'
import { Memory } from './components/Memory'
import { Elder, Musician, Smith } from './components/Villager'
import { Forge } from './components/Forge'
import { Altar } from './components/Altar'
import { TheLight, OtherPaths } from './components/TheLight'
import { Character, ShadowSelf } from './components/Character'
import { CameraRig } from './components/CameraRig'
import { Hud } from './components/Hud'
import { AdaptiveQuality } from './components/AdaptiveQuality'
import { StreetScene } from './components/StreetScene'
import { SombraProto } from './components/SombraProto'
import { TitleScene } from './components/TitleScene'
import { Diag, diagMode } from './components/Diag'
import { sombraMode } from './game/sombra'

/** ?noshadows: sin sombras proyectadas (para comparar rendimiento o en ordenadores lentos). */
const NO_SHADOWS = new URLSearchParams(location.search).has('noshadows')

export default function App() {
  useInput()
  return (
    <>
      <Canvas shadows={!NO_SHADOWS} camera={{ position: [0, 1.5, -3], fov: 55, near: 0.1, far: 1400 }} dpr={1} gl={{ powerPreference: 'high-performance', antialias: true }}>
        <AdaptiveQuality />
        <GameLoop />
        <World />
        <TheLight />
        <OtherPaths />
        <CameraRig />
        <TitleScene />
        <Suspense fallback={null}>
          <Character />
          <ShadowSelf />
          <Elder />
          <Smith />
          <Musician />
        </Suspense>
        <Suspense fallback={null}>
          <PathStones />
          <Flowers />
          <Village />
          <Forge />
          <Altar />
          <StreetScene />
          <Moments />
          <Guide />
          <Companions />
          <Memory />
          <Forest />
          {sombraMode && <SombraProto />}
        </Suspense>
      </Canvas>
      <div className="vignette" />
      <Hud />
      {diagMode && <Diag />}
    </>
  )
}
