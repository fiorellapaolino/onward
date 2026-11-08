import { headingAt, pathAt } from './config'
import { ELDER_LINES, GIRL_LINES } from './story'
import { ELDER, GIRL } from './village'
import { game, input, setUi } from './state'
import { fires } from './fires'

/*
 * Atajos para probar (y para las capturas automáticas):
 *   ?at=60          empieza ya de pie en el metro 60 del sendero, sin la intro ni la música
 *   ?at=60&yaw=1.2  … con la cámara girada (radianes)
 *   ?at=60&talk=2   … escuchando la frase 2 de la niña
 *   ?at=60&gift     … después de hablar con la niña: atrapar una semilla para ella (&carry: ya la lleva)
 *   ?at=60&give     … la escena de darle la semilla a la niña
 *   ?at=60&help     … después de darle la semilla a la niña
 *   ?at=66&fear     … con la oscuridad rodeándola (después de escuchar al anciano)
 *   ?at=66&fear&stay … y se queda (como si mantuviera E): se ve nacer su sombra
 *   …&ff=5          adelanta el juego 5 segundos al empezar (para capturar un momento concreto)
 *   …&ff=5&pause    … y lo deja quieto ahí
 *   ?at=66&plates   … con su sombra ya nacida, para el reto de las dos piedras
 *   ?at=18&fires&lit=2&now  … el bosque apagado, con 2 hogueras encendidas (la última recién) y la brasa
 *   ?at=105&ending  … con la aldea iluminada y su sombra: caminar hasta el claro del final
 * Sin parámetros, el juego es normal.
 */
const params = new URLSearchParams(location.search)
let done = false

export function applyDebug() {
  if (done || !params.has('at') || !game.loaded) return
  done = true
  game.time = Math.max(game.time, 30) // (para poder poner momentos "en el pasado")
  const s = Number(params.get('at')) || 0
  const p = pathAt(s)
  game.started = true
  game.musicT = 999
  game.phase = 'play'
  game.phaseT = 10
  game.x = p.x + Number(params.get('dx') ?? 0)
  game.z = s
  game.p = game.pMax = s
  game.yaw = headingAt(s)
  input.camYaw = game.yaw + Number(params.get('yaw') ?? 0)
  input.camZoom = Number(params.get('zoom') ?? 1)
  setUi({ start: false })
  if (params.has('talk')) {
    game.talk = 'girl'
    game.line = Number(params.get('talk'))
    game.girlNear = 1
    setUi({ say: GIRL_LINES[game.line] })
    game.memory = 1 // (si es una frase del recuerdo, que se vea ya)
  }
  if (params.has('etalk')) {
    // hablando con el anciano, en la frase N (de pie delante de él)
    game.x = ELDER.x + Math.sin(ELDER.rot) * 1.6
    game.z = ELDER.z + Math.cos(ELDER.rot) * 1.6
    game.yaw = ELDER.rot + Math.PI
    game.talk = 'elder'
    game.line = Number(params.get('etalk'))
    game.elderNear = 1
    setUi({ say: ELDER_LINES[game.line] })
  }
  if (params.has('help') || params.has('fear') || params.has('plates') || params.has('music')) {
    game.story = 'help'
    setUi({ goal: 'Help the people of the village.' })
  }
  if (params.has('gift')) {
    game.story = 'seed'
    game.carrying = params.has('carry')
    setUi({ goal: 'Catch a spinning seed for her.' })
  }
  if (params.has('give')) {
    // delante de la niña, y empieza la escena
    game.story = 'seed'
    game.x = GIRL.x + Math.sin(GIRL.rot) * 1.4
    game.z = GIRL.z + Math.cos(GIRL.rot) * 1.4
    game.yaw = GIRL.rot + Math.PI
    game.giftAt = game.time + Number(params.get('give') || 0)
  }
  if (params.has('fear')) {
    // recién terminó de hablar con el anciano (de pie delante de él)
    game.story = 'fear'
    game.x = ELDER.x + Math.sin(ELDER.rot) * 1.6
    game.z = ELDER.z + Math.cos(ELDER.rot) * 1.6
    game.yaw = ELDER.rot + Math.PI
    input.camYaw = game.yaw
    setUi({ cine: true, msg: 'The dark closes in.' })
  }
  if (params.has('forge')) {
    // ya subió el farol y nació su sombra: ir a la herrería (con &bend, directo a la barra al rojo)
    game.story = params.has('bend') ? 'forgeBend' : 'smith'
    game.shadowOn = true
    game.shadowAt = game.time - 20
    game.liftAt = game.time - 10
    game.lightAwake = true
    game.lit = game.lit.map(() => game.time - 10)
    setUi({ goal: params.has('bend') ? 'The iron is on the anvil. Ask the smith to forge the key.' : 'Find the smith at the forge.' })
  }
  if (params.has('altar')) {
    // el herrero ya pidió el hierro de estrella: ir al altar (?at=50&altar)
    game.story = 'altar'
    game.shadowOn = true
    game.shadowAt = game.time - 20
    game.liftAt = game.time - 10
    game.lightAwake = true
    game.lit = game.lit.map(() => game.time - 10)
    setUi({ goal: 'Find the old altar by the trees.' })
  }
  if (params.has('music')) {
    game.story = 'music'
    game.shadowOn = true
    game.shadowAt = game.time - 5
    game.liftAt = game.time - 3
    game.lightAwake = true
    game.awakeAt = game.time - 4.9
    game.lit = game.lit.map(() => game.time)
  }
  if (params.has('ending')) {
    game.story = 'next'
    game.shadowOn = true
    game.shadowAt = game.time - 5
    game.shadowOpen = true
    game.liftAt = game.time - 20
    game.lightAwake = true
    game.lit = game.lit.map(() => game.time - 10)
    game.returns = [GIRL, ELDER].map((p) => ({ x: p.x, y: 1, z: p.z, at: game.time - 20 }))
    if (params.has('endT')) {
      // directamente dentro del final, en el segundo endT (la elfa ya se dio vuelta y fue hasta su sombra)
      const T = Number(params.get('endT'))
      const back = pathAt(s - 2.4)
      game.phase = 'end'
      game.phaseT = T
      game.endStart = { x: game.x, z: game.z }
      game.endShadow = { x: back.x, z: back.z }
      if (T > 4) {
        const a = Math.atan2(back.x - game.x, back.z - game.z)
        game.x = back.x - Math.sin(a) * 0.7
        game.z = back.z - Math.cos(a) * 0.7
        game.yaw = a
      }
    }
  }
  if (params.has('lit')) {
    // las primeras N hogueras ya encendidas (hace un rato, o justo ahora con &now), y la brasa en la mano
    const n = Number(params.get('lit'))
    for (let i = 0; i < n; i++) fires.litAt[i] = params.has('now') && i === n - 1 ? game.time - 2.5 : game.time - 20
    fires.ember = 1
  }
  if (params.has('plates')) {
    game.story = 'plates'
    game.shadowOn = true
    game.shadowAt = game.time
    setUi({ goal: 'Raise the great lantern: both stones at once.' })
  }
}

/** ?ff=T: al empezar, adelanta el juego T segundos de golpe (las capturas van muy lentas). */
export const debugFF = Number(params.get('ff') ?? 0)

/** ?pause: después de adelantar (&ff), el juego se queda quieto en ese momento. */
export const debugPause = params.has('pause')

/** ?stay: con el miedo, hace como si el jugador mantuviera E (para las capturas). */
export const debugStay = params.has('stay')

/** En modo de prueba la música no suena y su reloj no avanza. */
export const debugMode = params.has('at')
// (para las pruebas automáticas: poder leer el estado del juego desde fuera)
if (debugMode || params.has('probe')) (window as unknown as { __game: typeof game }).__game = game
