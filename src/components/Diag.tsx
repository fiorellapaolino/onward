import { useEffect, useState } from 'react'
import { game, input } from '../game/state'

/*
 * Panel de diagnóstico: solo aparece con ?diag en la dirección.
 * Junta datos mientras se juega (no hace falta sacar la captura caminando):
 * cuadros por segundo, teclas, cuánto avanza al caminar y cuántos saltos salen de los que se piden.
 * La tecla C copia todo al portapapeles, para pegarlo como texto.
 */
export const diagMode = new URLSearchParams(location.search).has('diag')

export function Diag() {
  const [text, setText] = useState('')
  useEffect(() => {
    const s = {
      frames: 0,
      seconds: 0,
      worst: 0,
      slowFrames: 0, // cuadros de más de 50 ms
      spaces: 0,
      jumps: 0,
      walkTime: 0, // segundos con W (o flechas) apretado
      walkDist: 0, // metros que avanzó mientras tanto
      speedSum: 0, // suma de la velocidad del juego mientras camina (para el promedio)
      keys: new Set<string>(),
      focusWhenSpace: new Set<string>(),
    }
    let last = performance.now()
    let px = game.x
    let pz = game.z
    let prevJump = -1
    let raf = 0
    const tick = () => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      if (game.started && dt < 1) {
        s.frames++
        s.seconds += dt
        s.worst = Math.max(s.worst, dt * 1000)
        if (dt > 0.05) s.slowFrames++
        const step = Math.hypot(game.x - px, game.z - pz)
        if (input.forward || input.backward || input.left || input.right) {
          s.walkTime += dt
          s.walkDist += step
          s.speedSum += game.speed * dt
        }
        if (game.jumpT >= 0 && (prevJump < 0 || game.jumpT < prevJump - 0.01)) s.jumps++
      }
      prevJump = game.jumpT
      px = game.x
      pz = game.z
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const summary = () =>
      [
        'Onward · diagnóstico',
        `tiempo jugado ${s.seconds.toFixed(0)} s · fps promedio ${(s.frames / Math.max(s.seconds, 0.001)).toFixed(0)}`,
        `peor cuadro ${s.worst.toFixed(0)} ms · cuadros lentos (>50 ms) ${s.slowFrames}`,
        `caminando ${s.walkTime.toFixed(1)} s · avanzó ${s.walkDist.toFixed(1)} m (${(s.walkDist / Math.max(s.walkTime, 0.001)).toFixed(2)} m/s)`,
        `velocidad del juego al caminar ${(s.speedSum / Math.max(s.walkTime, 0.001)).toFixed(2)} m/s`,
        `Espacio apretado ${s.spaces} · saltos que salieron ${s.jumps}`,
        `foco al apretar Espacio [${[...s.focusWhenSpace].join(' ')}]`,
        `teclas vistas [${[...s.keys].join(' ')}]`,
        `fase ${game.phase} · historia ${game.story} · lienzo ${document.querySelector('canvas')?.width ?? '-'}×${document.querySelector('canvas')?.height ?? '-'} · dpr ${devicePixelRatio}`,
        `navegador ${navigator.userAgent.match(/(Chrome|Firefox|Safari)\/[\d.]+/)?.[0] ?? navigator.userAgent.slice(-40)}`,
        '(C copia este texto)',
      ].join('\n')

    const down = (e: KeyboardEvent) => {
      s.keys.add(e.code || e.key)
      if (e.code === 'Space' || e.key === ' ') {
        if (!e.repeat) s.spaces++
        s.focusWhenSpace.add(document.activeElement?.tagName ?? '-')
      }
      if (e.code === 'KeyC' && !e.repeat) void navigator.clipboard?.writeText(summary()).catch(() => {})
    }
    window.addEventListener('keydown', down, true)
    const iv = setInterval(() => setText(summary()), 400)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(iv)
      window.removeEventListener('keydown', down, true)
    }
  }, [])
  return <pre className="diag">{text}</pre>
}
