/*
 * Lo que dice la niña de la aldea. La elfa no habla (solo dirá una frase, al final del juego).
 * Los textos van en inglés porque lo piden las reglas de la jam; al lado, la traducción.
 */
export const GIRL_LINES = [
  // "…"  (todavía solloza; levanta la cabeza y la mira)
  '…',
  // "¿Quién eres? Brillas… como brillaban antes los faroles."
  'Who are you? You glow… like the lanterns used to.',
  // "Una sombra llegó a nuestra aldea. Las luces se apagaron, una por una."
  'A shadow came to our village. The lights went out, one by one.',
  // "Todos se esconden en sus casas. Ya no salen."
  "Everyone is hiding in their homes. They won't come out.",
  // "Nadie puede ayudarnos."
  'Nobody can help us.',
  // "…¿Tú puedes?"
  '…Can you?',
]

/** Qué hay que hacer después de hablar con la niña. "Ayuda a la gente de la aldea." */
export const GOAL_HELP = 'Help the people of the village.'

/** Al empujar contra la sombra de la salida. "La sombra es demasiado espesa para atravesarla." */
export const SHADOW_BLOCK = 'The shadow is too thick to walk through.'

/** Aviso para escuchar a la niña. "Escuchar" */
export const PROMPT_LISTEN = 'Listen'
