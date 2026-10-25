"""Exporta todas las animaciones para el esqueleto de la elfa (src/anims/*.json)."""
import sys, json, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retarget_ue import retarget, export
SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/assets_in/mixamo'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/onward/src/anims'
HEIGHT = 1.15; MODEL_H = 1.777; WS = HEIGHT / MODEL_H
FING = ('index', 'middle', 'ring', 'pinky', 'thumb')
# nombre: (archivo, quitar avance, bucle, sincronía del paso, giro de cadera conservado, fps de salida)
SPECS = {
    'walk': ('Walk', False, True, 0.1667, 1.0, 30),
    'run': ('Running', True, True, 0.2857, 1.0, 30),
    'idle': ('Breathing_Idle', False, True, None, 1.0, 15),
    'look': ('Looking_Around', False, True, None, 0.2, 15),
    'standup': ('Standing_Up', False, False, None, 0.5, 15),
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
    # re-muestreo y compresión
    t_new = np.arange(0, (n - 1) / fps + 1e-9, 1 / fps_out); fo = t_new * fps
    i = np.floor(fo).astype(int); j = np.minimum(i + 1, n - 1); u = (fo - i)[:, None]
    for b, arr in list(d['bones'].items()):
        q = np.array(arr).reshape(-1, 4)
        q = q[i] * (1 - u) + q[j] * u
        q /= np.linalg.norm(q, axis=1, keepdims=True)
        if b.startswith(FING) and key != 'walk' and key != 'run':
            q = q.mean(0, keepdims=True); q /= np.linalg.norm(q)
        elif np.abs(q - q[0]).max() < 0.004:
            q = q[:1]
        d['bones'][b] = [round(float(x), 3) for x in q.flatten()]
    o = np.array(d['offset']).reshape(-1, 3); o = o[i] * (1 - u) + o[j] * u
    d['offset'] = [round(float(x), 3) for x in o.flatten()]
    d['fps'] = fps_out; d['frames'] = len(t_new)
    json.dump(d, open(f'{OUT}/{key}.json', 'w'), separators=(',', ':'))
    print(key, d['frames'], d.get('speed'), os.path.getsize(f'{OUT}/{key}.json') // 1024, 'KB')
