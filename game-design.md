# Onward — el bosque que se dibuja

Documento de diseño (31 oct 2026). Sigue los pasos de la skill *game-designer*.

## 1. Idea

| | |
|---|---|
| **Género** | Aventura contemplativa en 3D con acertijos de dibujo |
| **Para quién** | Cualquier edad; jugadoras de Sky, Journey o *Everybody's Gone to the Rapture* |
| **Emoción** | Esperanza y calma: siempre se puede avanzar |
| **Referencias** | Sky (la luz y lo social, sin copiar la recolección de velas), Journey (viaje sin palabras), *El laberinto de Jung* (símbolos, introspección) |
| **Lo nuevo** | Los pasos son un pincel: el camino que recorres florece y, si dibujas un símbolo, el mundo responde |

**Historia en una frase:** una elfa recién nacida cruza un bosque dormido hasta donde la espera otra elfa recién nacida; los seres del bosque le enseñan a abrir camino dibujando con sus pasos.

## 2. Mecánica principal

- **Bucle:** caminar → el rastro florece → llegar a un obstáculo → aparece un ser del bosque y dibuja un símbolo de luz → repetirlo caminando dentro del círculo → el elemento abre el camino.
- **Reconocimiento:** el trazo se compara con plantillas (algoritmo *$1 Unistroke*), más un control de "redondez" para no confundir triángulo y círculo. Solo cuenta lo que se camina dentro del círculo marcado en el suelo.
- **Sin derrota:** si el símbolo no sale, el ser lo vuelve a dibujar, con paciencia. Nunca se pierde.
- **Controles:** W A S D o flechas, Tab para correr, arrastrar para girar la cámara. En el móvil, palanca con el pulgar.
- **Respuesta:** el trazo se ve como una cinta de luz; si sale bien, brilla en dorado, suenan campanas y el mundo cambia; si no, se desvanece en azul.

## 3. Progresión

| Zona | Ser | Símbolo | Obstáculo | Qué cambia |
|---|---|---|---|---|
| 1. Barranco | Tierra | Triángulo | No se puede cruzar | Suben piedras y forman un puente |
| 2. Árbol seco | Agua | Espiral | Un árbol muerto tapa el paso | Revive y sus raíces abren el camino |
| 3. Niebla | Aire | Zigzag | No se ve hacia dónde ir | El viento disipa la niebla |
| 4. Cueva oscura | Fuego | Círculo | No hay luz | Se encienden hogueras |

- **Dificultad:** cada símbolo es un poco más largo o difícil de caminar (triángulo → círculo grande); los símbolos no se combinan.
- **Final:** llega donde la espera la elfa recién nacida, le enciende una hoguera, y la cámara sube: se ve el camino entero, florecido, único para cada jugadora.
- **Duración:** 15–30 minutos (unos 5 minutos por zona).
- **Para la jam (8 nov):** zona 1 + zona 4 + el final, si no da tiempo para las cuatro.

## 4. Contenido

No es un juego educativo. Lo que se cuenta va sin texto: los seres, los símbolos y el paisaje que revive.

## 5. Arquitectura

- **3D con React Three Fiber** (lo que ya usa el proyecto): canvas 3D + una capa HTML encima para los textos.
- **Modular:** el prototipo vive en `src/simbolos/` y reutiliza la elfa, la cámara y los controles del juego anterior.
  - `recognizer.ts`: reconoce el símbolo
  - `proto.ts`: lugares, tiempos y estado
  - `Loop.tsx`: la lógica de cada frame (moverse, florecer, dibujar, el puente)
  - `Scene.tsx`: el claro, el barranco, el puente, el ser de la tierra y la cámara del final
  - `blooms.ts`: las plantas que brotan y el "mapa de vida" del suelo
- **Estado:** objetos que cambian en cada frame (sin estado de React), como en el resto del juego.

## Estado del prototipo

Hecho: zona 1 completa (rastro que florece, el ser de la tierra, dibujar el triángulo, el puente, la llegada y la vista desde arriba).
Pendiente: zonas 2–4, la elfa recién nacida (ahora es una luz provisional), sonido propio para cada ser.
