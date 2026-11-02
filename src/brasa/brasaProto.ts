import type { Pt } from '../simbolos/recognizer'

/*
 * Onward — la luz que se pasa de mano en mano.
 * Parte 1: el Claro de los grillos (ver game-design.md).
 *
 *   inicio (0, 0): nace de noche, sin nada, sobre lava vieja con líquenes
 *     ──► sigue el rastro dorado del jugador anterior y el canto de los grillos
 *     ──► la hoguera casi apagada (4, 12): ahí está LA BRASA que dejó otra elfa
 *     ──► círculos de hongos (refugios): uno ya encendido, los otros hay que encenderlos dando luz
 *     ──► flores dormidas: darles luz cuesta brasa y devuelve un recuerdo (la brasa dura más)
 *     ──► las raíces cerradas (z 62): la parte 2 (el miedo) empieza ahí
 *
 * Todo lo visual es provisional: se reemplaza después por modelos de otros artistas.
 */

// ── La escena del principio: quién es y qué tiene que hacer (sin explicaciones) ──
// Se ve a lo lejos la luz de quien espera (en la copa de un árbol gigante). Una elfa dorada
// (el jugador anterior) camina hasta la hoguera, deja la brasa, mira esa luz y se desvanece.
// Donde ella estuvo, nace la elfa. Dos frases cortas cuentan la misión.
export const INTRO = {
  ghostWalk: [0.6, 7.2], // la elfa dorada camina hasta la hoguera
  leave: 7.6, // deja la brasa
  fade: [9, 11.5], // mira la luz lejana y se desvanece
  birth: 11.5, // nace la elfa (de la luz, de rodillas)
  rise: 15.5, // se levanta
  gather: 17.7, // ya de pie, gira hacia el camino
  play: 19, // se puede jugar
  line1: [8.6, 13.4] as [number, number], // "Someone left a light for you."
  line2: [15.2, 20.5] as [number, number], // "Carry it to the one who waits."
}
/** La Copa del alba: el árbol gigante donde espera alguien. Siempre visible: es la misión. */
export const DAWN_TREE = { x: -22, z: 142, h: 78 }

// ── Lugares (metros) ─────────────────────────────────────────────
export const HEARTH = { x: 4, z: 12 }
export const ROOTS_Z = 62 // las raíces cerradas: se abren cuando el miedo se calma
export const BOUNDS = { x: 16, zMin: -6, zMax: ROOTS_Z - 1.2 }
export const BOUNDS_OPEN = 106 // hasta dónde se puede ir cuando las raíces se abren (incluye la gruta)

/** El camino del jugador anterior (por ahora uno de ejemplo): termina en la hoguera. */
export const PREV_PATH: Pt[] = (() => {
  const pts: Pt[] = []
  for (let i = 0; i <= 60; i++) {
    const t = i / 60
    pts.push({ x: Math.sin(t * 4.2) * 1.8 + t * HEARTH.x, z: 1.2 + t * (HEARTH.z - 2.2) })
  }
  return pts
})()

// ── Círculos de hongos (refugios) ────────────────────────────────
export type Ring = { x: number; z: number; litAt: number }
export const RING_R = 1.7 // radio del círculo de hongos
export const REFUGE_R = 2.6 // dentro de esto la brasa se recarga
export const RINGS: Ring[] = [
  { x: -1, z: 22, litAt: 0 }, // ya encendido (lo encendió el jugador anterior)
  { x: 5, z: 33, litAt: -1 },
  { x: -3, z: 44, litAt: -1 },
  { x: 2, z: 51, litAt: -1 },
  // detrás de las raíces, junto a la grieta: lo enciende el miedo cuando se calma y abre el paso (su regalo)
  { x: 3.2, z: 66.4, litAt: -1 },
  // del otro lado de la grieta: se enciende cuando el puente se vuelve real (la luz que diste vuelve a ti)
  { x: -2.6, z: 76, litAt: -1 },
]
export const BRIDGE_RING = 5
export const FEAR_RING = 4 // (el círculo que enciende el miedo)
export const WAIT_RING = 3 // (el refugio donde esperar a que el miedo salga)

// ── Flores dormidas (regalos de la naturaleza) ───────────────────
export type Flower = { x: number; z: number; giftAt: number; hidden?: boolean } // hidden: solo se ve en el espejo
export const FLOWERS: Flower[] = [
  { x: 6.6, z: 13.6, giftAt: -1 }, // junto a la hoguera: el recuerdo de su nacimiento
  { x: -7, z: 25, giftAt: -1 },
  { x: 10, z: 31, giftAt: -1 }, // fuera del camino
  { x: -9, z: 47, giftAt: -1 }, // fuera del camino
  // detrás de las raíces: solo se ven en el espejo
  { x: -5, z: 66, giftAt: -1, hidden: true },
  { x: 6.5, z: 75, giftAt: -1, hidden: true },
]

// ── Parte 2: Raíces dormidas — el ser del miedo ──────────────────
// Se esconde entre las raíces. Si te acercas, las raíces se cierran más.
// Hay que encender 3 luces de hongos que formen un camino desde su escondite hacia afuera
// (no son refugios: son para él) y alejarse, para que salga solo, asomándose.
export const HIDEOUT = { x: 0, z: ROOTS_Z + 0.4 }
export type PathLight = { x: number; z: number; litAt: number }
export const PATH_LIGHTS: PathLight[] = [
  { x: 0.4, z: 57.6, litAt: -1 },
  { x: -3.2, z: 55.6, litAt: -1 },
  { x: -6.6, z: 52.8, litAt: -1 },
]
export const PATH_COST = 0.25
export const SCARE_DIST = 5.5 // más cerca: se esconde y las raíces se cierran
export const AWAY_DIST = 7 // hay que estar al menos así de lejos de él para que avance
export const FEAR_SPEED = 0.7 // metros por segundo cuando se anima a avanzar
export const COMPANION_DRAIN = 0.65 // con él al lado, la brasa dura más
export const MIRROR_PICK = 1.5
/** El camino que recorre al salir: de su escondite, pasando por las tres luces. */
export const FEAR_PATH: Pt[] = [{ x: HIDEOUT.x, z: HIDEOUT.z - 0.6 }, ...PATH_LIGHTS.map((p) => ({ x: p.x, z: p.z }))]
export const FEAR_LEN = FEAR_PATH.slice(1).reduce((acc, p, i) => acc + Math.hypot(p.x - FEAR_PATH[i].x, p.z - FEAR_PATH[i].z), 0)

// ── Parte 3: el espejo ───────────────────────────────────────────
// Mantener Espacio (o clic derecho): se mira el mundo a través de la obsidiana.
// Muestra lo oculto; si se le da luz mientras se ve en el espejo, se vuelve real.
// Detrás de las raíces hay una grieta de lava vieja que no se puede cruzar:
// en el espejo se ve un puente de piedras de obsidiana. Al darle luz, aparece de verdad.
export const CRACK_Z0 = 68.5
export const CRACK_Z1 = 72
export const BRIDGE = { x: 0, z: CRACK_Z0 - 0.3, litAt: -1 } // (donde se le da luz: la orilla de este lado)
export const BRIDGE_HALF = 1.1
export const BRIDGE_COST = 0.2
export const MIRROR_SLOW = 0.45 // con el espejo se camina más despacio
export const LOOK_NEED = 0.5 // cuánto tiene que estar mirando para poder dar luz a lo oculto
export const GROTTO_Z = 85 // la entrada a la Gruta de obsidiana (parte 4)

// ── Parte 4: la Gruta de obsidiana — la sombra ───────────────────
// Una cueva redonda de vidrio volcánico. Adentro la brasa no se gasta (la obsidiana guarda el calor).
// Su sombra solo aparece en el espejo, y copia sus movimientos al revés.
// Si camina hacia ella mirándola, se aleja. Para alcanzarla hay que darle la espalda,
// mirarla en el espejo (como un retrovisor) y caminar hacia atrás. Al alcanzarla, se le da luz.
export const GROTTO = { x: 0, z: 97, r: 8.4 }
export const CORRIDOR_HALF = 1.8
export const SHADOW_FLEE = 1.25 // se aleja un poco más rápido de lo que ella avanza
export const SHADOW_REACH = 1.5

// ── Parte 5: la Copa del alba — el final ─────────────────────────
// Después de la sombra ya no le teme a la oscuridad: la brasa no se gasta más.
// Sale de la gruta hacia el árbol gigante; la luz de quien espera baja de la copa a medida que se acerca.
// Quien espera es una elfa recién nacida (la próxima persona que jugará). Ella le da su llama: amanece.
export const EXIT_OPEN = 4 // segundos después de que la sombra se vuelve luz, se abre la salida
export const WAIT_SPOT = { x: DAWN_TREE.x + 2, z: DAWN_TREE.z - 10 } // donde baja la recién nacida
export const TRUNK_R = 7.5
export const NEWBORN_REACH = 2.4
export const DAWN_PATH: Pt[] = [
  { x: 0, z: 108 },
  { x: -3, z: 114 },
  { x: -8, z: 119 },
  { x: -13, z: 124 },
  { x: -17, z: 128 },
]

/** Mantener el espejo: Espacio o clic derecho (en el móvil, un botón que lo activa y desactiva). */
export const mirrorKey = { held: false }

// ── Ritmo ────────────────────────────────────────────────────────
export const WALK = 1.5
export const RUN = 3.0
export const EMBER_TIME = 18 // segundos que dura la brasa llena lejos del fuego (caminando)
export const RUN_DRAIN = 1 // (correr ya no gasta más: una regla menos)
export const RECHARGE = 0.6 // por segundo, dentro de un refugio
export const RING_COST = 0.3 // encender un círculo de hongos
export const FLOWER_COST = 0.15 // darle luz a una flor
export const GIFT_BONUS = 0.15 // cada recuerdo: la brasa dura un poco más
export const GIVE_DIST = 2.6 // distancia para dar luz
export const PICK_DIST = 1.6 // para tomar la brasa
export const RETURN_TIME = 2.2 // la chispa vuelve al último refugio
export const MEMORY_FLIGHT = 1.6 // el recuerdo vuela hasta ella

// ── Estado (se modifica cada frame, no es estado de React) ───────
export const b = {
  introT: -1, // segundos desde que empezó (la escena del principio); -1 = todavía no empezó
  introDone: false,
  emberLeft: false, // la elfa dorada ya dejó la brasa en la hoguera
  hasEmber: false,
  pickAt: -1, // cuándo tomó la brasa
  ember: 0, // 0..max
  max: 1, // crece con cada recuerdo
  memories: 0, // recuerdos que le devolvió la naturaleza (completarán su reflejo)
  memFlights: [] as { from: Pt; at: number }[], // recuerdos volando hacia ella
  lastRefuge: { x: HEARTH.x, z: HEARTH.z } as Pt,
  inRefuge: false,
  outAt: -1, // se apagó: la chispa vuela al último refugio (-1 = no)
  outFrom: { x: 0, z: 0 } as Pt,
  giveAt: -99, // la última vez que dio luz (destello)
  failAt: -99, // intentó dar luz sin brasa suficiente
  near: null as null | { kind: 'ring' | 'flower' | 'path' | 'bridge' | 'shadow' | 'newborn'; i: number }, // a qué le puede dar luz ahora
  totalWalked: 0,
  // el ser del miedo
  fear: {
    pos: { x: HIDEOUT.x, z: HIDEOUT.z } as Pt,
    progress: 0, // metros recorridos por el camino de luz (0 = escondido)
    tight: 0, // 0..1: cuánto se cerraron las raíces (se acercó demasiado)
    scaredAt: -99,
    calmAt: -1, // llegó al final del camino de luz: ya no tiene miedo
    homeAt: -1, // volvió a su escondite a sacar el espejo
    openAt: -1, // se abrieron las raíces
    mirrorUpAt: -1, // el espejo sale de la tierra
    following: false,
  },
  hasMirror: false,
  mirrorAt: -1,
  looking: false, // mantiene el espejo
  look: 0, // 0..1 (suave): cuánto está mirando a través del espejo
  lookedOnce: false,
  // la sombra de la gruta
  shadow: { appearAt: -1, pos: { x: 0, z: 0 } as Pt, lightAt: -1 },
  // el final
  end: { landAt: -1, giveAt: -1, dawnAt: -1, aerialAt: -1 },
  path: [] as Pt[], // por dónde caminó (se guarda al final: será el rastro dorado de la próxima persona)
  missionAt: -99, // la luz lejana destella para recordar la misión (al tomar la brasa, al tomar el espejo…)
  lowAt: -99, // la última vez que avisó que se queda sin luz
}

export const refuges = () => [{ x: HEARTH.x, z: HEARTH.z, lit: b.hasEmber }, ...RINGS.map((r) => ({ x: r.x, z: r.z, lit: r.litAt >= 0 }))]

/** 0..1: cuánta luz tiene (para la pantalla y el sonido). */
export const emberLevel = () => (b.hasEmber ? b.ember / b.max : 0)
