"""Exporta todas las animaciones para el esqueleto de la elfa (src/anims/*.json)."""
import sys, json, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retarget_ue import retarget, export
from smoothclip import smooth_clip
SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/assets_in/mixamo'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/onward/src/anims'
HEIGHT = 1.15; MODEL_H = 1.777; WS = HEIGHT / MODEL_H
FING = ('index', 'middle', 'ring', 'pinky', 'thumb')
SIGMA = {'walk': 1.0, 'run': 1.0, 'idle': 1.5, 'look': 1.5, 'standup': 1.5}  # suavizado, en frames
# nombre: (archivo, quitar avance, bucle, sincronía del paso, giro de cadera conservado, fps de salida)
SPECS = {
    'walk': ('Walk', False, True, 0.1667, 1.0, 60),
    'run': ('Running', True, True, 0.2857, 1.0, 60),
    'idle': ('Breathing_Idle', False, True, None, 1.0, 30),
    'look': ('Looking_Around', False, True, None, 0.2, 30),
    'standup': ('Standing_Up', False, False, None, 0.5, 30),
}
for key, (fname, strip, loop, sync, yaw_keep, fps_out) in SPECS.items():
    r = retarget(f'{SRC}/{fname}.fbx', strip_forward=strip, yaw_scale=yaw_keep)
    d = export(r, loop)
    clip = r['clip']; fps = r['fps']; n = d['frames']
    if sync is not None: d['sync'] = sync
    if key == 'walk':
        v = []
        for side in ('Left', 'Right'):
            p = np.array([fr[side + 'Foot'][:3, 3] - fr['Hips'][:3, 3] for fr in clip['frames']])
            y = np.array([fr[side + 'Foot'][1, 3] for fr in clip['frames']])
            vz = np.gradient(p[:, 2]) * fps; st = y < np.percentile(y, 35); v.append(-np.median(vz[st]))
        d['speed'] = round(float(np.mean(v)) * r['ratio'] * WS, 3)
    if key == 'run':
        hp = np.array([fr['Hips'][2, 3] for fr in clip['frames']])
        d['speed'] = round(float(np.polyfit(np.arange(len(hp)), hp, 1)[0] * fps) * r['ratio'] * WS, 3)
    # suavizado (quita el ruido de la captura) y curvas a fps_out, luego compresión
    d = smooth_clip(d, sigma=SIGMA[key], fps_out=fps_out)
    for b, arr in list(d['bones'].items()):
        q = np.array(arr).reshape(-1, 4)
        if b.startswith(FING) and key not in ('walk', 'run') and len(q) > 1:
            q = q.mean(0, keepdims=True); q /= np.linalg.norm(q)
        d['bones'][b] = [round(float(x), 5 if key in ('walk', 'run') else 4) for x in q.flatten()]
    d['offset'] = [round(float(x), 4) for x in d['offset']]
    json.dump(d, open(f'{OUT}/{key}.json', 'w'), separators=(',', ':'))
    print(key, d['frames'], d.get('speed'), os.path.getsize(f'{OUT}/{key}.json') // 1024, 'KB')
