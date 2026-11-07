import { useMemo } from 'react'
import { buildFlowers } from '../game/forestLayout'
import { ChunkedModels } from './Forest'

/*
 * Flores a los lados del camino: fijas y abiertas desde el principio.
 * Hacia el final del bosque hay cada vez más.
 */
const RANGE = { behind: 22, ahead: 50, size: 10 }

export function Flowers() {
  const list = useMemo(buildFlowers, [])
  return <ChunkedModels list={list} range={RANGE} />
}
