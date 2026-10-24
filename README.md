# thatgamejam #02 — proyecto base

React + TypeScript + React Three Fiber (3D) + Electron (versión de escritorio).

## 1. Primera vez

```bash
npm install
npm run dev
```

Abre la dirección que aparece (normalmente http://localhost:5173). Deberías ver una luz flotando en la niebla.

## 2. El juego: *Onward*

**Controles:** mantener `Espacio`, `↑`, `W` o clic para avanzar. `↓` o `S` para mirar atrás (no retrocede).

**Cómo está organizado `src/`:**

| Archivo | Qué hace |
|---|---|
| `game/config.ts` | **Los números para ajustar**: largo de la escalera, dónde están los escalones que faltan, tiempos de cada animación |
| `game/GameLoop.tsx` | La lógica: fases (nacer → agarrar → mirar → subir → final), confianza, bloqueos |
| `game/state.ts` | El estado del juego y los textos en pantalla |
| `components/Character.tsx` | La personita y sus animaciones |
| `components/Tools.tsx` | Copa, espada, vara y oro (el Mago) |
| `components/Stairs.tsx` | Los escalones que aparecen y se deshacen en luz |
| `components/World.tsx` | Colores del cielo, niebla, montaña y luces |
| `components/DistantPaths.tsx` | Las escaleras lejanas del final |
| `components/CameraRig.tsx` | La cámara |
| `components/Hud.tsx` + `styles.css` | Textos (en inglés, con traducción en comentarios) |

## 3. Probar como app de escritorio (Mac)

```bash
npm run app
```

## 4. Generar los archivos para entregar

| Qué | Cómo | Resultado |
|---|---|---|
| Versión web (navegador en itch.io) | `npm run zip:web` | `release/web.zip` |
| Versión Mac | `npm run dist:mac` | `release/*.zip` |
| Versión Windows (obligatoria*) | GitHub → pestaña **Actions** → **Build** → **Run workflow** | se descarga desde esa misma página, en "Artifacts" |

\*Las reglas piden Windows **o** Mac. Se recomienda Windows porque las apps de Mac sin firmar muestran avisos de seguridad.

Prueba el `.zip` de Windows en el ordenador de casa: descomprímelo y abre el `.exe`.

## 5. Subir a itch.io

- `web.zip` → marcar "This file will be played in the browser".
- Zip de Windows → marcar la plataforma **Windows**.
- Zip de Mac (opcional) → marcar **macOS**.

## Recordatorios de las reglas

- Idioma por defecto del juego: **inglés** (mejor: casi sin texto).
- Si usas IA, declararlo en la descripción del juego y explicar qué partes.
- Todos los modelos/sonidos deben ser propios o con licencia libre.
- Fecha límite: **8 de noviembre, 8:59 (hora de España)**. Después no se puede editar.
