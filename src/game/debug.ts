import { headingAt, pathAt } from './config'
import { GIRL_LINES } from './story'
import { game, input, setUi } from './state'

/*
 * Atajos para probar (y para las capturas automáticas):
 *   ?at=60          empieza ya de pie en el metro 60 del sendero, sin la intro ni la música
 *   ?at=60&yaw=1.2  … con la cámara girada (radianes)
 *   ?at=60&talk=2   … escuchando la frase 2 de la niña
 *   ?at=60&gift     … después de hablar con la niña: atrapar una semilla para ella (&carry: ya la lleva)
 *   ?at=60&help     … después de darle la semilla a la niña
 *   ?at=66&fear     … con la oscuridad rodeándola (después de escuchar al anciano)
 *   ?at=66&plates   … con su sombra ya nacida, para el reto de las dos piedras
 *   ?at=80&music    … con el gran farol ya arriba, para el reto de las campanas
 * Sin parámetros, el juego es normal.
 */
const params = new URLSearchParams(location.search)
let done = false

export function applyDebug() {
  if (done || !params.has('at') || !game.loaded) return
  done = true
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
  game.tools.forEach((t) => (t.state = 'inside'))
  setUi({ start: false })
  if (params.has('talk')) {
    game.talk = 'girl'
    game.line = Number(params.get('talk'))
    game.girlNear = 1
    setUi({ say: GIRL_LINES[game.line] })
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
  if (params.has('fear')) game.story = 'fear'
  if (params.has('music')) {
    game.story = 'music'
    game.shadowOn = true
    game.shadowAt = game.time - 5
    game.liftAt = game.time - 3
    game.lightAwake = true
    game.awakeAt = game.time - 4.9
    game.lit = game.lit.map(() => game.time)
  }
  if (params.has('plates')) {
    game.story = 'plates'
    game.shadowOn = true
    game.shadowAt = game.time
    setUi({ goal: 'Raise the great lantern: both stones at once.' })
  }
}

/** En modo de prueba la música no suena y su reloj no avanza. */
export const debugMode = params.has('at')
