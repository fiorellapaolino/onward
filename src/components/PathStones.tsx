import { useMemo } from 'react'
import * as THREE from 'three'
import { PATH_END, pathAt, rng, sideAt } from '../game/config'
import type { Placement } from '../game/forestLayout'
import { ChunkedModels } from './Forest'
import { placeMatrix } from './instancing'

/*
 * El sendero: piedras planas fijas en el suelo. Están ahí desde el principio
 * (el piso no aparece ni desaparece mientras la elfa camina).
 */
const MODELS = ['RockPath_Round_Wide', 'RockPath_Round_Thin', 'RockPath_Round_Small_1']
const SPACING = 1.15
const STONES_FADE_FROM = 47
const STONES_FADE_TO = 51 // (termina justo donde el empedrado ya se ve entero: no van las dos capas juntas)

type Stone = { s: number; x: number; z: number; rot: number; scale: number }

function buildStones() {
  const r = rng(3)
  const byModel: Stone[][] = MODELS.map(() => [])
  const p = new THREE.Vector3()
  const sd = new THREE.Vector3()
  for (let s = -2; s < PATH_END; s += SPACING) {
    // antes de la calle empedrada las piedras se espacian y se achican hasta terminar
    const into = (s - STONES_FADE_FROM) / (STONES_FADE_TO - STONES_FADE_FROM)
    if (s < 104 && into >= 1) continue
    const thin = s < 104 && into > 0 ? into : 0
    if (r() < thin * thin * 0.8 + thin * 0.2) continue
    pathAt(s, p)
    sideAt(s, sd)
    const off = (r() - 0.5) * 0.35
    const k = r() < 0.5 ? 0 : r() < 0.6 ? 1 : 2
    byModel[k].push({ s, x: p.x + sd.x * off, z: p.z + sd.z * off, rot: r() * Math.PI * 2, scale: (0.85 + r() * 0.25) * (1 - thin * 0.45) })
  }
  return byModel
}

const RANGE = { behind: 30, ahead: 50, size: 10 }

export function PathStones() {
  const list = useMemo(() => {
    const out: Placement[] = []
    buildStones().forEach((stones, k) => {
      for (const st of stones) out.push({ model: MODELS[k], s: st.s, matrix: placeMatrix(st.x, 0.01, st.z, st.rot, st.scale) })
    })
    return out
  }, [])
  return <ChunkedModels list={list} range={RANGE} />
}
