import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { natureUrl } from '../game/config'
import { buildTrees, buildUndergrowth, groupByChunk, type Placement } from '../game/forestLayout'
import { game } from '../game/state'
import { InstancedModel } from './instancing'

/*
 * Solo se dibuja lo cercano, por bloques a lo largo del sendero.
 * Los árboles se ven de lejos; la hierba y las flores, solo cerca.
 * Y solo los árboles cercanos proyectan sombra: es la parte más cara de todas.
 */
type Range = { behind: number; ahead: number; size: number; shadow?: { behind: number; ahead: number } }

export function ChunkedModels({ list, range }: { list: Placement[]; range: Range }) {
  const chunks = useMemo(() => [...groupByChunk(list, range.size).entries()].sort((a, b) => a[0] - b[0]), [list, range.size])
  const groups = useRef<(THREE.Group | null)[]>([])
  const casting = useRef<boolean[]>([])

  useFrame(() => {
    chunks.forEach(([c], i) => {
      const g = groups.current[i]
      if (!g) return
      const start = c * range.size
      const end = start + range.size
      g.visible = end > game.p - range.behind && start < game.p + range.ahead
      if (!range.shadow) return
      const near = g.visible && end > game.p - range.shadow.behind && start < game.p + range.shadow.ahead
      if (casting.current[i] === near) return
      casting.current[i] = near
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = near
      })
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

const TREES: Range = { behind: 30, ahead: 120, size: 20, shadow: { behind: 12, ahead: 30 } }
const PLANTS: Range = { behind: 22, ahead: 50, size: 10 }

/** Árboles, hierba, helechos, hongos y rocas (todo fijo). */
export function Forest() {
  const trees = useMemo(buildTrees, [])
  const plants = useMemo(buildUndergrowth, [])
  return (
    <>
      <ChunkedModels list={trees} range={TREES} />
      <ChunkedModels list={plants} range={PLANTS} />
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
