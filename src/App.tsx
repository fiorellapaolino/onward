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
import { Fires } from './components/Fires'
import { Elder, Girl, Musician } from './components/Villager'
import { TheLight, OtherPaths } from './components/TheLight'
import { Character, ShadowSelf } from './components/Character'
import { CameraRig } from './components/CameraRig'
import { Hud } from './components/Hud'

export default function App() {
  useInput()
  return (
    <>
      <Canvas camera={{ position: [0, 1.5, -3], fov: 55, near: 0.1, far: 1000 }} dpr={[1, 2]}>
        <GameLoop />
        <World />
        <TheLight />
        <OtherPaths />
        <CameraRig />
        <Suspense fallback={null}>
          <Character />
          <ShadowSelf />
          <Girl />
          <Elder />
          <Musician />
        </Suspense>
        <Suspense fallback={null}>
          <PathStones />
          <Flowers />
          <Village />
          <Moments />
          <Guide />
          <Companions />
          <Memory />
          <Fires />
          <Forest />
        </Suspense>
      </Canvas>
      <Hud />
    </>
  )
}
