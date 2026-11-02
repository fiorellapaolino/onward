import { Villager, type Spec } from './Villager'
import { game } from '../game/state'
import { FIRES, fires } from '../game/fires'

/*
 * La gente del bosque apagado: junto a cada hoguera apagada hay alguien encogido en la oscuridad,
 * temblando de frío (un niño perdido, una mujer sola, un viejo). Cuando la elfa enciende su fuego,
 * se calientan, se ponen de pie despacio, levantan la cabeza y la miran; su luz vuela al pecho de ella
 * (game/fires.ts → game.returns). Ayudándolos, la elfa gana su propia luz.
 */

// encogido en cuclillas, abrazándose las rodillas, la cabeza escondida (tools/girlpose.py)
const HUDDLE: Spec['pose'] = [
  ['thigh_l', 'left', -1.9],
  ['thigh_r', 'left', -1.9],
  ['calf_l', 'left', 2.3],
  ['calf_r', 'left', 2.3],
  ['thigh_l', 'fwd', -0.08],
  ['thigh_r', 'fwd', 0.08],
  ['spine_01', 'left', 0.35],
  ['spine_02', 'left', 0.2],
  ['neck_01', 'left', 0.3],
  ['Head', 'left', 0.35],
  ['upperarm_l', 'left', -1.0],
  ['upperarm_r', 'left', -1.0],
  ['upperarm_l', 'fwd', -0.2],
  ['upperarm_r', 'fwd', 0.2],
  ['lowerarm_l', 'fwd', -1.3],
  ['lowerarm_r', 'fwd', 1.3],
]

/** Al lado de la hoguera i, del lado de afuera del sendero, mirando al fuego. */
function beside(i: number, angle: number, dist = 1.1) {
  const f = FIRES[i]
  const x = f.x + Math.cos(angle) * dist
  const z = f.z + Math.sin(angle) * dist
  return { x, z, rot: Math.atan2(f.x - x, f.z - z) }
}

/** 0 encogido → 1 de pie, calentándose (empieza un momento después de encender su fuego). */
const warmed = (i: number) => () => {
  const at = fires.litAt[i]
  if (at < 0) return 0
  const u = Math.max(0, Math.min(1, (game.time - at - 0.7) / 2.2))
  return u * u * (3 - 2 * u)
}

// tiembla de frío mientras está a oscuras; ya de pie, mira a la elfa y extiende las manos al fuego
const gestures =
  (i: number): Spec['gestures'] =>
  (rot, t, near, yaw) => {
    const w = warmed(i)()
    const cold = 1 - w
    if (cold > 0.01) {
      rot('spine_01', 'fwd', Math.sin(t * 31 + i) * 0.012 * cold)
      rot('Head', 'up', Math.sin(t * 27 + i * 2) * 0.02 * cold)
    }
    if (w > 0.01) {
      rot('neck_01', 'up', yaw * 0.4 * near * w)
      rot('Head', 'up', yaw * 0.5 * near * w)
      rot('upperarm_l', 'left', -0.55 * w)
      rot('upperarm_r', 'left', -0.55 * w)
      rot('lowerarm_l', 'fwd', -0.5 * w)
      rot('lowerarm_r', 'fwd', 0.5 * w)
    }
  }

const person = (i: number, parts: string[], height: number, hair: string, angle: number): Spec => ({
  parts,
  scale: height / 1.777,
  headScale: height < 1 ? 1.18 : 1,
  ground: 0.587,
  hairColor: hair,
  pose: HUDDLE,
  spot: beside(i, angle),
  stand: warmed(i),
  gestures: gestures(i),
})

// (las hogueras del bosque son la 1, la 2 y la 3: la 0 ya arde junto a donde nace)
export const FOREST_PEOPLE: Spec[] = [
  person(1, ['elf/body', 'girl/outfit', 'girl/hair'], 0.82, '#5a3a22', 0.9), // un niño perdido
  person(2, ['elf/body', 'woman/outfit', 'woman/hair'], 1.08, '#2e1c12', 2.6), // una mujer sola
  person(3, ['elder/body', 'elder/outfit', 'elder/hair', 'elder/beard'], 1.15, '#cfcac0', 0.4), // un viejo
]

export function ForestPeople() {
  return (
    <>
      {FOREST_PEOPLE.map((s, i) => (
        <Villager key={i} spec={s} />
      ))}
    </>
  )
}
