/*
 * Lo que dice la niña de la aldea. La elfa no habla (solo dirá una frase, al final del juego).
 * Los textos van en inglés porque lo piden las reglas de la jam; al lado, la traducción.
 */
export const GIRL_LINES = [
  // "…"  (todavía está triste; levanta la cabeza y la mira)
  '…',
  // "¿Quién eres? Brillas… como brillaba antes nuestra aldea."
  'Who are you? You glow… like our village used to.',
  // "Llegaste a nuestra aldea. Hace tanto que esperábamos una luz…"
  'You came to our village. We have waited so long for a light…',
  // "Llegó una sombra y todos nos fuimos apagando."
  'A shadow came, and one by one we all went dim.',
  // "Ahora nadie juega, nadie canta. Solo nos sentamos a recordar cómo era antes."
  'Now nobody plays, nobody sings. We just sit and remember how it used to be.',
  // "Antes atrapaba las semillas que giran de mi árbol… ahora solo caen."
  'I used to catch the spinning seeds from my tree… now they just fall.',
  // "¿Me ayudas a atrapar una? Quizás así volvamos a brillar."
  'Will you catch one with me? Maybe we can shine again.',
]

/** Mientras dice estas dos frases se ve el recuerdo de cómo era la aldea (Memory.tsx). */
export const MEMORY_LINES = [4, 5]

/** Objetivo: "Atrapa una semilla que gira para ella." */
export const GOAL_SEED = 'Catch a spinning seed for her.'

/** Lo que dice el anciano, sentado a oscuras junto a su puerta. */
export const ELDER_LINES = [
  // "…¿Hay alguien ahí?"
  '…Is someone there?',
  // "Mi farol se apagó cuando llegó la sombra."
  'My lantern went out when the shadow came.',
  // "Soy viejo… y tengo miedo de salir ahí fuera."
  "I'm old… and I'm afraid to go out there.",
  // "El gran farol de la plaza se cayó. Hacen falta dos para subirlo…"
  'The great lantern in the square fell. It takes two to raise it…',
  // "…y aquí todos estamos solos."
  '…and everyone here is alone.',
]

/** La oscuridad la rodea. "Mantén E · Quédate" (en el móvil: mantén el dedo) */
export const PROMPT_STAY = 'Stay'
/** Mensaje mientras la rodea la oscuridad. "La oscuridad se acerca." */
export const FEAR_MSG = 'The dark closes in.'
/** Cuando la oscuridad toma su forma… y se vuelve luz. "Una luz despierta detrás de ti. Camina por donde tú caminaste." */
export const SHADOW_MSG = 'A light wakes up behind you. It walks where you walked.'
/** Objetivo con la sombra. "Sube el gran farol (pisa las dos piedras a la vez)" */
export const GOAL_LANTERN = 'Raise the great lantern: both stones at once.'
/** Cuando sube el farol. "La aldea recuerda su luz." */
export const LIT_MSG = 'The village remembers its light.'

/** Después de subir el farol: se oye una melodía escondida. "Alguien toca música a escondidas…" */
export const MUSIC_HINT = 'Someone is playing music in secret…'
/** Objetivo: "Toca su melodía en las campanas de piedra." */
export const GOAL_MUSIC = 'Play her melody on the stone bells.'
/** Cuando la mujer sale a tocar. "Su música vuelve a la aldea." */
export const MUSIC_DONE = 'Her music returns to the village.'

/** Qué hay que hacer después de hablar con la niña. "Ayuda a la gente de la aldea." */
export const GOAL_HELP = 'Help the people of the village.'

/** Al empujar contra la sombra de la salida. "La sombra es demasiado espesa para atravesarla." */
export const SHADOW_BLOCK = 'The shadow is too thick to walk through.'

/** Aviso para escuchar a la niña. "Escuchar" */
export const PROMPT_LISTEN = 'Listen'

/** La única frase de la elfa en todo el juego (al abrazar a su sombra). "No estás sola." */
export const ELF_WORDS = 'You are not alone.'
/** Al final, caminando juntas hacia la luz. "Siempre hay un paso más." */
export const LAST_STEP = 'There is always one more step.'
