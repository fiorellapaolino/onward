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
  // "Antes nos sentábamos todos alrededor del fuego de casa… ahora está frío."
  'We used to sit around our fire at home… now it is cold.',
  // "¿Me traes una llama? Quizás así volvamos a brillar."
  'Will you bring me a flame? Maybe we can shine again.',
]

/** Mientras dice estas dos frases se ve el recuerdo de cómo era la aldea (Memory.tsx). */
export const MEMORY_LINES = [4, 5]

/** Objetivo: "Llévale una llama." */
export const GOAL_SEED = 'Bring her a flame.'

/** Lo que dice el anciano, sentado a oscuras junto a su puerta. */
export const ELDER_LINES = [
  // "…¿Quién está ahí?"
  "…Who's there?",
  // "Perdona. Por un momento te pareciste a alguien."
  'Forgive me. For a moment, you looked like someone.',
  // "Una chica de aquí. Sin familia. Caminaba detrás de quien fuera caminando."
  'A girl from here. No family. She walked behind whoever was walking.',
  // "Cuando los demás se fueron al bosque, ella fue detrás. Nadie se lo pidió. Nadie se lo impidió."
  'When the others went into the forest, she went after them. No one asked her to. No one stopped her.',
  // "Ninguno volvió. Esa noche nadie subió el gran farol… y entró la oscuridad."
  'None of them came back. That night, no one raised the great lantern… and the dark came in.',
  // "Hacen falta dos para subirlo."
  'It takes two to raise it.',
  // "Y aquí cada uno se queda detrás de su puerta."
  'And here, each of us stays behind our own door.',
]

/** La frase del gran farol (la cámara mira a la plaza y el anciano la señala). */
export const ELDER_LANTERN_LINE = 5

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

// ── El herrero ───────────────────────────────────────────────────
// Desconfía de ella; tiene la llave del portal viejo. Primero el fuego, después la barra al rojo.
export const SMITH_LINES = [
  // "Orejas puntiagudas. Hm."
  'Pointed ears. Hm.',
  // "Los tuyos creen que todo se arregla cantándole a los árboles."
  'Your kind thinks everything gets fixed by singing to trees.',
  // "¿El portal viejo? Su llave se perdió la noche en que entró la oscuridad."
  'The old gate? Its key was lost the night the dark came in.',
  // "Podría forjarte una nueva. Pero mi aprendiz salió corriendo apenas te vio, y el fuego se apaga."
  'I could forge you a new one. But my apprentice ran off the moment he saw you, and the fire is dying.',
  // "Y no me queda hierro. Algo cayó del cielo la noche en que entró la oscuridad: hierro de estrella… pero nadie pudo verlo nunca."
  'And I have no iron left. Something fell from the sky the night the dark came in. Star iron… but no one has ever seen it.',
  // "Hay un altar viejo junto a los árboles. Quizá los tuyos sepan qué hacer con él."
  'There is an old altar by the trees. Maybe your kind knows what to do with it.',
]
// si vuelve a hablarle antes de traer el hierro
export const SMITH_ALTAR = [
  // "El altar. Junto a los árboles. Ve."
  'The altar. By the trees. Go.',
]
// cuando le trae el hierro de estrella
export const SMITH_IRON = [
  '…',
  // "Hierro de estrella. De verdad lo encontraste."
  'Star iron. You actually found it.',
  // "Entonces, el fuego. Aviva el fuelle y mantenlo firme, y forjaré tu llave."
  'Then the fire. Work the bellows and keep it steady, and I will forge your key.',
]
// ── El altar: su yo oscuro ve el plano que la luz esconde ──
// "Busca el altar viejo junto a los árboles."
export const GOAL_ALTAR = 'Find the old altar by the trees.'
// "Rezar"
export const PROMPT_PRAY = 'Pray'
// (solo se leen en su estado oscuro)
// "Ves lo que la luz esconde."
export const DARK_MSG = 'You see what the light hides.'
// "Algo se mueve entre los árboles."
export const WISP_MSG = 'Something moves between the trees.'
// "Aquí nada aguanta mucho. No te detengas."
export const NEG_MSG = 'Nothing here holds for long. Do not stop.'
// "El vacío te suelta… de vuelta a ti."
export const FALL_MSG = 'The void lets you go… back to yourself.'
// "Hierro de estrella: frío, y lleno de luz."
export const IRON_MSG = 'Star iron: cold, and full of light.'
// "Lleva el hierro de estrella al herrero."
export const GOAL_IRON = 'Bring the star iron to the smith.'
// cuando termina de martillar: la llave está al rojo
export const SMITH_HOT = [
  // "Listo. Pero quema: nadie puede sostenerla así."
  "Done. But it burns: nobody can hold it like this.",
  // "El hierro necesita oscuridad para tomar su forma. El fuego no te la va a dar."
  "Iron needs the dark to keep its shape. The fire won't give you that.",
  // "Pero el fuego está detrás de ti. Deja caer tu sombra sobre ella."
  'But the fire is behind you. Let your shadow fall on it.',
]
// cuando la llave se enfrió
export const SMITH_THANKS = [
  '…',
  // "Fuego firme, buena sombra. Nada mal, para unas orejas puntiagudas."
  'Steady fire, a good shadow. Not bad, for pointed ears.',
  // "Supongo que en eso también hay un arte… en las manos correctas."
  "I suppose there's an art in that too… in the right hands.",
  // "Ahí está tu llave. Tómala: el portal viejo te espera."
  'There is your key. Take it: the old gate is waiting.',
]
// si se le habla antes de que suba el gran farol
export const SMITH_EARLY = [
  // "Hm."
  'Hm.',
  // "Toda la aldea sentada a oscuras, ¿y vienes a verme a mí?"
  'The whole village sits in the dark, and you come to me?',
  // "Primero sube el gran farol. Después hablamos."
  'Raise the great lantern first. Then we talk.',
]
// "Busca al herrero, en la herrería."
export const GOAL_SMITH = 'Find the smith at the forge.'
// "Mantén el fuego firme: ni muy frío ni muy caliente."
export const GOAL_FIRE = 'Keep the fire steady: not too cold, not too hot.'
// "El hierro está en el yunque. Pídele al herrero que forje la llave."
export const GOAL_BEND = 'The iron is on the anvil. Ask the smith to forge the key.'
// "Toma la llave."
export const GOAL_TAKE = 'Take the key.'
// "Enfría la llave con tu sombra."
export const GOAL_COOL = 'Cool the key with your shadow.'
// "Enfriando…" (mientras su sombra cubre la llave)
export const PROMPT_COOL = 'Cooling…'
// "Buen fuego. Ahora déjame trabajar."
export const BEND_MSG = 'Good fire. Now let me work.'
// "Demasiado caliente."
export const HOT_MSG = 'Too hot.'
// "La llave gira. El portal viejo se abre."
export const GATE_MSG = 'The key turns. The old gate opens.'
// "Abre el portal viejo, arriba de la escalera."
export const GOAL_KEY = 'Open the old gate at the top of the stairs.'
// avisos de acción (con E)
export const PROMPT_PUMP = 'Pump the bellows'
// "Más… está tomando calor"
export const PROMPT_WARMER = 'Pump again… it is warming up'
// "¡Justo así! Mantenlo"
export const PROMPT_RIGHT = 'Just right! Keep it there'
// "Demasiado caliente: espera"
export const PROMPT_TOO_HOT = 'Too hot! Wait a moment'
// "Forjar la llave"
export const PROMPT_FORGE = 'Forge the key'
// "Tomar la llave"
export const PROMPT_TAKE = 'Take the key'
