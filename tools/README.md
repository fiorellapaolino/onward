# Herramientas

Scripts de Python para convertir animaciones de Mixamo (.fbx) al esqueleto de la elfa.

- `fbx.py` — lector de archivos FBX binarios.
- `mixamo.py` — extrae el esqueleto y las curvas de animación.
- `retarget.py` — traspasa las rotaciones al esqueleto definido en `src/game/rig.ts`
  y exporta un `.json` por animación (en `src/anims/`).

Si cambias las articulaciones en `rig.ts`, actualiza también `J` en `retarget.py` y vuelve a exportar.
