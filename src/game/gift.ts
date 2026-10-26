import * as THREE from 'three'
import { GIRL } from './village'
import { game } from './state'

/*
 * La escena de la semilla: la elfa le da la semilla a la niña.
 *   0.0–0.8  la semilla pasa de la mano de la elfa a las manos de la niña (sentada)
 *   0.8–1.4  la mira en sus manos
 *   1.4–2.6  se pone de pie con la semilla en las manos
 *   2.6–7.0  la suelta: sube girando y las dos la siguen con la mirada, "¡wow!"
 *   7.0–9.0  la niña se lleva las dos manos al pecho y celebra (da saltitos); mira a la elfa
 *   9.5      termina; la cámara vuelve y la elfa puede moverse
 */
export const GIFT = { TO_GIRL: 0.8, STAND: 1.4, STOOD: 2.6, RELEASE: 2.6, LOOK_EACH: 7.0, CHEER_END: 9.0, END: 9.5 }

/** Cuánto está de pie la niña (0 sentada en la piedra → 1 de pie). Después de la escena se queda de pie. */
export function girlStand() {
  if (game.giftAt < 0) return 0
  const u = THREE.MathUtils.clamp((game.time - game.giftAt - GIFT.STAND) / (GIFT.STOOD - GIFT.STAND), 0, 1)
  return u * u * (3 - 2 * u)
}

/** Al ponerse de pie da un paso hacia delante, fuera de la piedra (metros). */
export const STAND_STEP = 0.2

/** Las manos de la niña (delante de ella): en el regazo sentada, a la altura del pecho de pie. */
export const GIRL_HANDS = new THREE.Vector3()
function hands(stand: number, out: THREE.Vector3) {
  const fwd = 0.22 + (STAND_STEP + 0.02) * stand
  return out.set(GIRL.x + Math.sin(GIRL.rot) * fwd, 0.5 + 0.12 * stand, GIRL.z + Math.cos(GIRL.rot) * fwd)
}
hands(0, GIRL_HANDS)

/** Dónde está la semilla k segundos después de dársela (la mano de la elfa se pasa en `from`). */
export function giftSeedPos(k: number, from: { x: number; y: number; z: number }, out: THREE.Vector3) {
  if (k < GIFT.TO_GIRL) {
    const u = k / GIFT.TO_GIRL
    const e = u * u * (3 - 2 * u)
    hands(0, TMP)
    return out.set(from.x + (TMP.x - from.x) * e, from.y + (TMP.y - from.y) * e + Math.sin(u * Math.PI) * 0.15, from.z + (TMP.z - from.z) * e)
  }
  const st = girlStandAt(k)
  if (k < GIFT.RELEASE) return hands(st, out)
  // sube girando, despacio, haciendo círculos
  hands(1, TMP)
  const up = k - GIFT.RELEASE
  const r = Math.min(0.35, up * 0.25)
  return out.set(TMP.x + Math.sin(up * 2.2) * r, TMP.y + up * 0.55 + up * up * 0.03, TMP.z + Math.cos(up * 2.2) * r)
}
const TMP = new THREE.Vector3()
function girlStandAt(k: number) {
  const u = THREE.MathUtils.clamp((k - GIFT.STAND) / (GIFT.STOOD - GIFT.STAND), 0, 1)
  return u * u * (3 - 2 * u)
}

/** ¿Se está viendo la escena? (la elfa no se mueve y la cámara se acerca) */
export const inGiftScene = () => game.giftAt >= 0 && game.time - game.giftAt < GIFT.END

/** La mano de la elfa (para el principio de la escena). */
export function elfHand(out: THREE.Vector3) {
  const g = game
  return out.set(g.x + Math.sin(g.yaw) * 0.22, 0.62 + g.jumpY, g.z + Math.cos(g.yaw) * 0.22)
}
