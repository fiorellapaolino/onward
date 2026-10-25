import * as THREE from 'three'
import { GIRL } from './village'
import { game } from './state'

/*
 * La escena de la semilla: la elfa le da la semilla a la niña.
 *   0.0–0.8  la semilla pasa de la mano de la elfa a las manos de la niña
 *   0.8–2.0  las dos la miran en sus manos
 *   2.0–6.5  la niña la suelta: sube girando y las dos la siguen con la mirada, sorprendidas
 *   6.5–8.0  se miran la una a la otra (conectan)
 *   8.5      termina; la cámara vuelve y la elfa puede moverse
 */
export const GIFT = { TO_GIRL: 0.8, RELEASE: 2.0, LOOK_EACH: 6.5, END: 8.5 }

/** Las manos de la niña (delante de ella, a la altura del regazo). */
export const GIRL_HANDS = new THREE.Vector3(GIRL.x + Math.sin(GIRL.rot) * 0.22, 0.5, GIRL.z + Math.cos(GIRL.rot) * 0.22)

/** Dónde está la semilla k segundos después de dársela (la mano de la elfa se pasa en `from`). */
export function giftSeedPos(k: number, from: { x: number; y: number; z: number }, out: THREE.Vector3) {
  if (k < GIFT.TO_GIRL) {
    const u = k / GIFT.TO_GIRL
    const e = u * u * (3 - 2 * u)
    return out.set(from.x + (GIRL_HANDS.x - from.x) * e, from.y + (GIRL_HANDS.y - from.y) * e + Math.sin(u * Math.PI) * 0.15, from.z + (GIRL_HANDS.z - from.z) * e)
  }
  if (k < GIFT.RELEASE) return out.copy(GIRL_HANDS)
  // sube girando, despacio, haciendo círculos
  const up = k - GIFT.RELEASE
  const r = Math.min(0.35, up * 0.25)
  return out.set(GIRL_HANDS.x + Math.sin(up * 2.2) * r, GIRL_HANDS.y + up * 0.55 + up * up * 0.03, GIRL_HANDS.z + Math.cos(up * 2.2) * r)
}

/** ¿Se está viendo la escena? (la elfa no se mueve y la cámara se acerca) */
export const inGiftScene = () => game.giftAt >= 0 && game.time - game.giftAt < GIFT.END

/** La mano de la elfa (para el principio de la escena). */
export function elfHand(out: THREE.Vector3) {
  const g = game
  return out.set(g.x + Math.sin(g.yaw) * 0.22, 0.62 + g.jumpY, g.z + Math.cos(g.yaw) * 0.22)
}
