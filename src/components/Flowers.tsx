import { useMemo } from 'react'
import * as THREE from 'three'
import { natureUrl } from '../game/config'
import { buildFlowers, type Placement } from '../game/forestLayout'
import { game } from '../game/state'
import { DynamicModel, type SetInstance } from './instancing'

/*
 * Flores que brotan a su paso: aparecen cerradas (escala 0) y crecen
 * cuando la elfa se acerca. Hacia el final del bosque hay cada vez más.
 */
const BLOOM_AHEAD = 7 // metros por delante en los que empiezan a brotar

type Flower = Placement & { a: number; base: THREE.Matrix4 }

const pos = new THREE.Vector3()
const quat = new THREE.Quaternion()
const scl = new THREE.Vector3()
const m = new THREE.Matrix4()

export function Flowers() {
  const byModel = useMemo(() => {
    const map = new Map<string, Flower[]>()
    for (const pl of buildFlowers()) {
      if (!map.has(pl.model)) map.set(pl.model, [])
      map.get(pl.model)!.push({ ...pl, a: 0, base: pl.matrix })
    }
    return [...map.entries()]
  }, [])

  const update = (list: Flower[]) => (set: SetInstance) => {
    const g = game
    list.forEach((fl, i) => {
      // una vez que brotan, se quedan
      if (g.p > fl.s - BLOOM_AHEAD) fl.a = Math.min(1, fl.a + 1 / 60 / 0.9)
      const a = fl.a
      const grow = a < 1 ? 1 - Math.pow(1 - a, 3) : 1
      fl.base.decompose(pos, quat, scl)
      m.compose(pos, quat, scl.multiplyScalar(Math.max(0.0001, grow)))
      set(i, m, 1 + (1 - a) * 1.5)
    })
  }

  return (
    <>
      {byModel.map(([model, list]) => (
        <DynamicModel key={model} url={natureUrl(model)} count={list.length} onFrame={update(list)} />
      ))}
    </>
  )
}
