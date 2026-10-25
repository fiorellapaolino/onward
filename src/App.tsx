import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { GameLoop } from './game/GameLoop'
import { useInput } from './game/useInput'
import { World } from './components/World'
import { Forest } from './components/Forest'
import { PathStones } from './components/PathStones'
import { Flowers } from './components/Flowers'
import { Obstacles } from './components/Obstacles'
import { TheLight, OtherPaths } from './components/TheLight'
import { Character } from './components/Character'
import { Tools } from './components/Tools'
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
        <Tools />
        <CameraRig />
        <Suspense fallback={null}>
          <Character />
        </Suspense>
        <Suspense fallback={null}>
          <PathStones />
          <Flowers />
          <Obstacles />
          <Forest />
        </Suspense>
      </Canvas>
      <Hud />
    </>
  )
}
