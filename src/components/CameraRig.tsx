import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GIRL_S, clamp01, damp, headingAt, tangentAt } from '../game/config'
import { BORN, ECHO_DELAY, game, input, shadow } from '../game/state'
import { ELDER, GIRL, POLE } from '../game/village'
import { GIFT, elfHand, giftSeedPos, inGiftScene } from '../game/gift'

const pos = new THREE.Vector3()
const fwd = new THREE.Vector3()
const target = new THREE.Vector3()
const look = new THREE.Vector3()
const ahead = new THREE.Vector3()
const mid = new THREE.Vector3()
const perp = new THREE.Vector3()
const tmpV = new THREE.Vector3()
const seedP = new THREE.Vector3()

/**
 * Cámara en tercera persona que gira alrededor de la elfa.
 *   - Arrastrar con el ratón la gira (y arriba/abajo); la rueda acerca o aleja.
 *   - "camYaw" es hacia dónde mira la cámara en el mundo; el movimiento (W/A/S/D)
 *     es relativo a esa dirección.
 *   - Al principio y al final la cámara se coloca sola detrás de ella.
 */
export function CameraRig() {
  const lookSmooth = useRef(new THREE.Vector3(0, 1.3, 4))
  const cineSide = useRef(0)
  const endSide = useRef(0)
  const talkSide = useRef(0)
  const fearSide = useRef(0)

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game

    const intro = g.phase === 'intro' || g.phase === 'rise' || g.phase === 'gather' || g.phase === 'look'
    const e = g.phase === 'end' ? clamp01((g.phaseT - 10) / 9) : 0
    const ee = e * e * (3 - 2 * e)

    // Al principio y al final la cámara se coloca sola detrás de ella
    if (!input.dragging && (intro || g.phase === 'end')) {
      const d = Math.atan2(Math.sin(g.yaw - input.camYaw), Math.cos(g.yaw - input.camYaw))
      input.camYaw += d * damp(intro ? 4 : 1.2, dt)
      input.camPitch += (0 - input.camPitch) * damp(1, dt)
    }

    // ── Hablando con el anciano: plano de los dos, de perfil (como en una película); con la frase
    //    del gran farol, la cámara mira a la plaza ──
    if (g.talk === 'elder') {
      const first = talkSide.current === 0
      mid.set((g.x + ELDER.x) / 2, 0, (g.z + ELDER.z) / 2)
      perp.set(ELDER.z - g.z, 0, -(ELDER.x - g.x)).normalize()
      if (first) talkSide.current = perp.dot(tmpV.copy(camera.position).sub(mid)) >= 0 ? 1 : -1
      const half = Math.hypot(ELDER.x - g.x, ELDER.z - g.z) / 2 + 0.55
      const dist = Math.max(2.4, fitDist(camera as THREE.PerspectiveCamera, half))
      if (g.line === 4) {
        // "el gran farol de la plaza…": desde detrás del anciano, mirando hacia el poste caído
        // (de lado, a medio camino entre él y la plaza: se ve el poste caído y las dos piedras)
        tmpV.set(POLE.z - ELDER.z, 0, -(POLE.x - ELDER.x)).normalize()
        const side = tmpV.dot(perp) * talkSide.current >= 0 ? 1 : -1
        target.set(ELDER.x + (POLE.x - ELDER.x) * 0.5 + tmpV.x * 4.5 * side, 2.2, ELDER.z + (POLE.z - ELDER.z) * 0.5 + tmpV.z * 4.5 * side)
        look.set(POLE.x, 1.0, POLE.z)
      } else {
        target.copy(mid).addScaledVector(perp, dist * talkSide.current)
        target.y = 1.2
        look.set(mid.x, 0.55, mid.z) // (más abajo: así quedan en la parte de arriba, sin taparlos el texto)
      }
      if (first) {
        camera.position.copy(target)
        lookSmooth.current.copy(look)
      }
      camera.position.lerp(target, damp(2.5, dt))
      lookSmooth.current.lerp(look, damp(3, dt))
      camera.lookAt(lookSmooth.current)
      input.camYaw = g.yaw
      return
    }
    talkSide.current = 0

    // ── El miedo: plano cercano, casi de frente y bajo, con la oscuridad alrededor;
    //    mientras se queda, la cámara se acerca despacio ──
    // ── El nacimiento de su sombra: de perfil, las dos (la figura de luz sale de ella y la imita) ──
    if (g.story === 'fear' || g.story === 'born') {
      const k = g.story === 'born' ? g.time - g.shadowAt : -1
      if (fearSide.current === 0) {
        // del lado donde ya estaba la cámara
        perp.set(Math.cos(g.yaw), 0, -Math.sin(g.yaw))
        fearSide.current = perp.dot(tmpV.set(camera.position.x - g.x, 0, camera.position.z - g.z)) >= 0 ? 1 : -1
      }
      const sd = fearSide.current
      const snap = camera.position.distanceTo(tmpV.set(g.x, 1, g.z)) > 9 // (venía de lejos: corte directo)
      if (k < 0) {
        // 3/4 de frente: 55° hacia un lado de hacia donde mira (así no tapa el anciano)
        const a = g.yaw + sd * 0.95
        const d = 2.3 - 0.5 * g.courage
        target.set(g.x + Math.sin(a) * d, 0.8 - 0.2 * g.kneel, g.z + Math.cos(a) * d)
        look.set(g.x, 0.6 - 0.2 * g.kneel, g.z)
      } else {
        // las dos de perfil: la sombra se queda donde nació; la elfa se levanta y se aleja unos pasos
        const sx = k < ECHO_DELAY ? g.x : shadow.x
        const sz = k < ECHO_DELAY ? g.z : shadow.z
        mid.set((g.x + sx) / 2, 0, (g.z + sz) / 2)
        perp.set(Math.cos(g.yaw), 0, -Math.sin(g.yaw)).multiplyScalar(sd)
        const open = clamp01((k - 0.6) / 2.5) // al principio cerca (la figura sale de ella); luego se aleja
        const half = Math.hypot(g.x - sx, g.z - sz) / 2 + 0.6
        const dist = Math.max(2.3 + open * 0.8, fitDist(camera as THREE.PerspectiveCamera, half) + 0.4)
        target.copy(mid).addScaledVector(perp, dist)
        // (un poco hacia atrás de ella, para ver hacia dónde va)
        target.x -= Math.sin(g.yaw) * 1.2 * open
        target.z -= Math.cos(g.yaw) * 1.2 * open
        target.y = 0.85 + open * 0.35
        look.set(mid.x, 0.55 + 0.15 * open, mid.z)
        if (k > BORN.FREE - 1) input.camYaw = g.yaw // (al terminar vuelve detrás de ella)
      }
      camera.position.lerp(target, snap ? 1 : damp(k < 0 ? 1.4 : 1.8, dt))
      lookSmooth.current.lerp(look, snap ? 1 : damp(2, dt))
      camera.lookAt(lookSmooth.current)
      if (k < BORN.FREE - 1) input.camYaw = Math.atan2(g.x - camera.position.x, g.z - camera.position.z)
      return
    }
    fearSide.current = 0

    // ── La escena de la semilla: plano de las dos, de perfil, mirando la semilla subir ──
    if (inGiftScene()) {
      const k = g.time - g.giftAt
      mid.set((g.x + GIRL.x) / 2, 0, (g.z + GIRL.z) / 2)
      perp.set(GIRL.z - g.z, 0, -(GIRL.x - g.x)).normalize()
      // del lado de la aldea (ahí solo hay pasto: nada tapa la vista)
      const first = cineSide.current === 0
      if (first) cineSide.current = perp.dot(tangentAt(GIRL_S, tmpV)) >= 0 ? 1 : -1
      const rise = Math.max(0, Math.min(1, (k - GIFT.RELEASE) / 3))
      // se aleja un poco mientras la semilla sube, para ver sus caras y la semilla a la vez
      // (en el móvil en vertical la pantalla es estrecha: la cámara se aleja hasta que entran las dos)
      const half = Math.hypot(GIRL.x - g.x, GIRL.z - g.z) / 2 + 0.45
      const dist = Math.max(2.3, fitDist(camera as THREE.PerspectiveCamera, half)) + rise * 1.3
      target.copy(mid).addScaledVector(perp, dist * cineSide.current)
      target.y = 0.8 + rise * 0.15
      giftSeedPos(k, elfHand(tmpV), seedP)
      // al final baja a sus caras: la niña celebra y se miran
      const down = Math.max(0, Math.min(1, (k - GIFT.LOOK_EACH) / 1.2))
      look.set(mid.x, 0.8 + rise * 0.7 * (1 - down), mid.z)
      if (first) {
        // corte de cámara: directamente al plano de las dos
        camera.position.copy(target)
        lookSmooth.current.copy(look)
      }
      camera.position.lerp(target, damp(2.2, dt))
      lookSmooth.current.lerp(look, damp(2.5, dt))
      camera.lookAt(lookSmooth.current)
      // al terminar, la cámara vuelve detrás de ella mirando hacia donde mira
      input.camYaw = g.yaw
      return
    }
    // ── El final: plano de la elfa y su sombra, de perfil (hasta que se levantan) ──
    if (g.phase === 'end' && g.phaseT < 10) {
      mid.set((g.x + g.endShadow.x) / 2, 0, (g.z + g.endShadow.z) / 2)
      perp.set(g.endShadow.z - g.z, 0, -(g.endShadow.x - g.x))
      if (perp.lengthSq() < 1e-4) perp.set(1, 0, 0)
      perp.normalize()
      const first = endSide.current === 0
      if (first) endSide.current = perp.dot(tmpV.copy(camera.position).sub(mid)) >= 0 ? 1 : -1
      const T = g.phaseT
      const close = clamp01((T - 4) / 2) // se acerca para el abrazo
      const fit = fitDist(camera as THREE.PerspectiveCamera, Math.hypot(g.endShadow.x - g.x, g.endShadow.z - g.z) / 2 + 0.5)
      target.copy(mid).addScaledVector(perp, Math.max(3.2 - close * 1.1, fit) * endSide.current)
      target.y = 1.1 - close * 0.35
      look.set(mid.x, 0.7 - close * 0.15, mid.z)
      if (first) {
        // corte de cámara al plano de las dos
        camera.position.copy(target)
        lookSmooth.current.copy(look)
      }
      camera.position.lerp(target, damp(1.6, dt))
      lookSmooth.current.lerp(look, damp(2, dt))
      camera.lookAt(lookSmooth.current)
      input.camYaw = headingAt(g.z) // (al levantarse, la cámara vuelve detrás, mirando hacia adelante)
      return
    }
    cineSide.current = 0

    pos.set(g.x, g.jumpY * 0.5, g.z)
    const cy = input.camYaw
    fwd.set(Math.sin(cy), 0, Math.cos(cy))

    const zoom = input.camZoom
    const back = ((intro ? 3.0 : 4.4) + ee * 6) * zoom
    const up = ((intro ? 1.5 : 1.9) + ee * 6) * zoom + input.camPitch * 3 * zoom

    // detrás de ella según hacia dónde mira la cámara
    target.copy(pos).addScaledVector(fwd, -back)
    target.y = Math.max(0.4, pos.y + up)
    camera.position.lerp(target, damp(input.dragging ? 12 : intro ? 2 : 6, dt))

    // mira un poco por delante de ella (en la dirección de la cámara); si la cámara está alta, mira más a ella
    ahead.copy(pos).addScaledVector(fwd, intro ? 3 : 6)
    ahead.y = 1.3 + ee * 2
    look.copy(pos).setY(0.8).lerp(ahead, 1 - clamp01(Math.max(0, input.camPitch) * 0.6))

    lookSmooth.current.lerp(look, damp(input.dragging ? 12 : 5, dt))
    camera.lookAt(lookSmooth.current)
  })

  return null
}

/** A qué distancia tiene que estar la cámara para que entre un ancho (2 × half metros) en la pantalla. */
function fitDist(camera: THREE.PerspectiveCamera, half: number) {
  const vfov = THREE.MathUtils.degToRad(camera.fov)
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect)
  return half / Math.tan(hfov / 2)
}
