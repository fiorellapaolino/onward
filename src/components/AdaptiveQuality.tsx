import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { input } from '../game/state'

/*
 * El juego tiene que ir fluido en cualquier ordenador:
 *   - las sombras se recalculan en cada cuadro (si no, la de la elfa tiembla a sus pies);
 *     solo si el ordenador no da abasto, unas 30 veces por segundo
 *   - si los cuadros tardan demasiado, baja la resolución; si sobra margen, la sube de nuevo,
 *     cada vez con más cautela: cambiarla da un tirón, y no puede estar yendo y viniendo
 *   - nunca dibuja más de MAX_PIXELS: con la página alejada (Cmd −) el lienzo se vuelve enorme y todo va a tirones
 *   - si bajar la resolución no mejora los cuadros, no era la compu: es el navegador el que limita (p. ej. Chrome
 *     con "Ahorro de energía" a 30 cuadros). Entonces vuelve a la resolución anterior y deja de bajarla:
 *     si no, todo se ve borroso (y al moverse, una doble imagen) sin ganar nada
 */
const MAX_PIXELS = 1920 * 1080
const MAX_DPR = 1.5
const LEVELS = [1, 0.85, 0.7, 0.55]
const SHADOW_EVERY_SLOW = 1 / 30
const CALM_WINDOWS = 6 // ventanas de 1,5 s estables para volver a subir (se duplica con cada bajada)

export function AdaptiveQuality() {
  const gl = useThree((s) => s.gl)
  const setDpr = useThree((s) => s.setDpr)
  const size = useThree((s) => s.size)
  // en pantallas Retina, algo más de resolución (a 1 los detalles lejanos titilan); pero nunca más de MAX_PIXELS
  const base = Math.min(Math.max(window.devicePixelRatio || 1, 0.5), MAX_DPR)
  const budget = base * Math.min(1, Math.sqrt(MAX_PIXELS / Math.max(1, size.width * size.height * base * base)))
  const budgetRef = useRef(budget)
  budgetRef.current = budget
  const state = useRef({ shadowT: 0, frames: 0, elapsed: 0, level: 0, calm: 0, drops: 0, before: 0, judge: false, capped: false })

  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    setDpr(LEVELS[state.current.level] * budget)
  }, [budget, setDpr])

  useEffect(() => {
    // (para las pruebas: poder medir el costo real de dibujar)
    if (new URLSearchParams(location.search).has('probe')) Object.assign(window, { __three: { gl, scene, camera, input } })
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
    if (s.judge) {
      // ¿sirvió bajarla? si casi no mejoró, el límite no es la compu: vuelve atrás y no la baja más
      s.judge = false
      if (fps < s.before * 1.12) {
        s.level--
        s.capped = true
        setDpr(LEVELS[s.level] * budgetRef.current)
        return
      }
    }
    if (fps < 42 && s.level < LEVELS.length - 1 && !s.capped) {
      s.before = fps
      s.judge = true
      s.level++
      s.calm = 0
      s.drops++
      setDpr(LEVELS[s.level] * budgetRef.current)
    } else if (fps > 57 && s.level > 0) {
      // sube solo después de un buen rato estable, para no ir y venir
      if (++s.calm >= CALM_WINDOWS * 2 ** s.drops) {
        s.level--
        s.calm = 0
        setDpr(LEVELS[s.level] * budgetRef.current)
      }
    } else s.calm = 0
  })
  return null
}
