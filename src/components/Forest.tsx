import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { natureUrl } from '../game/config'
import { CHUNK, buildTrees, buildUndergrowth, groupByChunk } from '../game/forestLayout'
import { game } from '../game/state'
import { InstancedModel } from './instancing'

// Solo se dibuja el bosque cercano: un poco hacia atrás y bastante hacia adelante.
const BEHIND = 35
const AHEAD = 150

/** Árboles, hierba, helechos, hongos y rocas (todo fijo). */
export function Forest() {
  const chunks = useMemo(() => {
    const all = [...buildTrees(), ...buildUndergrowth()]
    return [...groupByChunk(all).entries()].sort((a, b) => a[0] - b[0])
  }, [])

  const groups = useRef<(THREE.Group | null)[]>([])

  useFrame(() => {
    chunks.forEach(([c], i) => {
      const g = groups.current[i]
      if (!g) return
      const start = c * CHUNK
      g.visible = start + CHUNK > game.p - BEHIND && start < game.p + AHEAD
    })
  })

  return (
    <>
      {chunks.map(([c, byModel], i) => (
        <group
          key={c}
          ref={(el) => {
            groups.current[i] = el
          }}
        >
          {[...byModel.entries()].map(([model, matrices]) => (
            <InstancedModel key={model} url={natureUrl(model)} matrices={matrices} />
          ))}
        </group>
      ))}
    </>
  )
}

// Cargar los modelos antes de que se necesiten
;[
  'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5',
  'Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5',
  'TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3', 'DeadTree_1', 'DeadTree_2', 'DeadTree_3',
  'Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Plant_1_Big', 'Plant_7', 'Clover_1',
  'Flower_3_Group', 'Flower_4_Group', 'Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short',
  'Mushroom_Common', 'Mushroom_Laetiporus', 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
  'RockPath_Round_Wide', 'RockPath_Round_Thin', 'RockPath_Round_Small_1',
].forEach((m) => useGLTF.preload(natureUrl(m)))
