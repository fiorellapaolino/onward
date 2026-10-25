import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { GameLoop } from './game/GameLoop'
import { useInput } from './game/useInput'
import { World } from './components/World'
import { Stairs } from './components/Stairs'
import { Character } from './components/Character'
import { Tools } from './components/Tools'
import { DistantPaths } from './components/DistantPaths'
import { CameraRig } from './components/CameraRig'
import { Hud } from './components/Hud'

export default function App() {
  useInput()
  return (
    <>
      <Canvas camera={{ position: [6.2, 1.5, -3], fov: 55, far: 1000 }} dpr={[1, 2]}>
        <GameLoop />
        <World />
        <Stairs />
        <Suspense fallback={null}>
          <Character />
        </Suspense>
        <Tools />
        <DistantPaths />
        <CameraRig />
      </Canvas>
      <Hud />
    </>
  )
}
