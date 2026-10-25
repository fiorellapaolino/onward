import { useMemo } from 'react'
import * as THREE from 'three'
import { GATES, GATE_KINDS, GATE_STOP, PATH_END, damp, natureUrl, pathAt, rng, sideAt } from '../game/config'
import { game } from '../game/state'
import { DynamicModel, placeMatrix } from './instancing'

/*
 * El sendero: piedras planas que aparecen delante de la elfa a medida que avanza
 * (más lejos cuanto más confianza tiene) y se deshacen en luz detrás de ella.
 */
const MODELS = ['RockPath_Round_Wide', 'RockPath_Round_Thin', 'RockPath_Round_Small_1']
const SPACING = 1.15
const BEHIND = 30

type Stone = { s: number; x: number; z: number; rot: number; scale: number; a: number }

function buildStones() {
  const r = rng(3)
  const byModel: Stone[][] = MODELS.map(() => [])
  const p = new THREE.Vector3()
  const sd = new THREE.Vector3()
  for (let s = -2; s < PATH_END; s += SPACING) {
    // en el barranco no hay piedras (lo cruza el puente)
    if (GATES.some((G, i) => GATE_KINDS[i] === 'chasm' && Math.abs(s - G) < 1.8)) continue
    pathAt(s, p)
    sideAt(s, sd)
    const off = (r() - 0.5) * 0.35
    const k = r() < 0.5 ? 0 : r() < 0.6 ? 1 : 2
    byModel[k].push({ s, x: p.x + sd.x * off, z: p.z + sd.z * off, rot: r() * Math.PI * 2, scale: 0.85 + r() * 0.25, a: 0 })
  }
  return byModel
}

const m = new THREE.Matrix4()

export function PathStones() {
  const stones = useMemo(buildStones, [])

  const update = (list: Stone[]) => (set: (i: number, mx: THREE.Matrix4, b?: number) => void) => {
    const g = game
    const dt = 1 / 60
    const closed = GATES.find((G) => !g.opened.has(G))
    const ahead = g.phase === 'end' ? 25 : 2 + g.c * 14
    const visibleMax = Math.min(g.p + ahead, closed !== undefined ? closed - GATE_STOP + 0.8 : Infinity)
    const k = damp(5, dt)
    list.forEach((st, i) => {
      const target = st.s <= visibleMax && st.s >= g.p - BEHIND ? 1 : 0
      st.a += (target - st.a) * k
      const a = st.a < 0.002 ? 0 : st.a
      placeMatrix(st.x, -(1 - a) * 0.35 + 0.01, st.z, st.rot, st.scale * a, m)
      set(i, m, 1 + (1 - a) * 2.5) // brillan al aparecer y al deshacerse
    })
  }

  return (
    <>
      {MODELS.map((name, k) => (
        <DynamicModel key={name} url={natureUrl(name)} count={stones[k].length} onFrame={update(stones[k])} />
      ))}
    </>
  )
}
