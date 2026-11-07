import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/*
 * El juego tiene que ir fluido en cualquier ordenador:
 *   - las sombras se recalculan en cada cuadro (si no, la de la elfa tiembla a sus pies);
 *     solo si el ordenador no da abasto, unas 30 veces por segundo
 *   - si los cuadros tardan demasiado, baja la resolución; si sobra margen, la sube de nuevo,
 *     cada vez con más cautela: cambiarla da un tirón, y no puede estar yendo y viniendo
 */
const LEVELS = [1, 0.85, 0.7, 0.55]
const SHADOW_EVERY_SLOW = 1 / 30
const CALM_WINDOWS = 6 // ventanas de 1,5 s estables para volver a subir (se duplica con cada bajada)

export function AdaptiveQuality() {
  const gl = useThree((s) => s.gl)
  const setDpr = useThree((s) => s.setDpr)
  const state = useRef({ shadowT: 0, frames: 0, elapsed: 0, level: 0, calm: 0, drops: 0 })

  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    // (para las pruebas: poder medir el costo real de dibujar)
    if (new URLSearchParams(location.search).has('probe')) Object.assign(window, { __three: { gl, scene, camera } })
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl, scene, camera])

  useFrame((_, dt) => {
    const s = state.current
    s.shadowT += dt
    if (s.level === 0 || s.shadowT >= SHADOW_EVERY_SLOW) {
      s.shadowT = 0
      gl.shadowMap.needsUpdate = true
    }
    // (un cuadro larguísimo es la pestaña en segundo plano o la carga: no cuenta)
    if (dt > 0.5) return
    s.frames++
    s.elapsed += dt
    if (s.elapsed < 1.5) return
    const fps = s.frames / s.elapsed
    s.frames = 0
    s.elapsed = 0
    if (fps < 42 && s.level < LEVELS.length - 1) {
      s.level++
      s.calm = 0
      s.drops++
      setDpr(LEVELS[s.level])
    } else if (fps > 57 && s.level > 0) {
      // sube solo después de un buen rato estable, para no ir y venir
      if (++s.calm >= CALM_WINDOWS * 2 ** s.drops) {
        s.level--
        s.calm = 0
        setDpr(LEVELS[s.level])
      }
    } else s.calm = 0
  })
  return null
}
