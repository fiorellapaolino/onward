"""Retarget Mixamo clips onto the Quaternius (UE-style) skeleton. Output: JSON by bone name."""
import sys, json, numpy as np
sys.path.insert(0, '/home/claude/scripts')
from mixamo import load_clip
from gltfload import GLTF, quat_to_mat
from retarget import rot_of, align, mat_to_quat, remove_yaw

BASE = '/home/claude/assets_in/ubc/Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Female_FullBody.gltf'

MAP = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
CHILD_MIX = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head', 'Head': 'HeadTop_End'}
for s, S in (('l', 'Left'), ('r', 'Right')):
    MAP.update({f'clavicle_{s}': f'{S}Shoulder', f'upperarm_{s}': f'{S}Arm', f'lowerarm_{s}': f'{S}ForeArm', f'hand_{s}': f'{S}Hand',
                f'thigh_{s}': f'{S}UpLeg', f'calf_{s}': f'{S}Leg', f'foot_{s}': f'{S}Foot', f'ball_{s}': f'{S}ToeBase'})
    CHILD_MIX.update({f'{S}Shoulder': f'{S}Arm', f'{S}Arm': f'{S}ForeArm', f'{S}ForeArm': f'{S}Hand', f'{S}Hand': f'{S}HandMiddle1',
                      f'{S}UpLeg': f'{S}Leg', f'{S}Leg': f'{S}Foot', f'{S}Foot': f'{S}ToeBase', f'{S}ToeBase': f'{S}Toe_End'})
    for f_ue, f_mx in (('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky'), ('thumb', 'Thumb')):
        for k in (1, 2, 3):
            MAP[f'{f_ue}_0{k}_{s}'] = f'{S}Hand{f_mx}{k}'
            CHILD_MIX[f'{S}Hand{f_mx}{k}'] = f'{S}Hand{f_mx}{k + 1}'
ALIGN = ('clavicle', 'upperarm', 'lowerarm', 'hand', 'thigh', 'calf', 'foot', 'ball')


class Target:
    def __init__(self):
        g = GLTF(BASE)
        self.g = g
        self.idx = {n['name']: i for i, n in enumerate(g.g['nodes'])}
        cache = {}
        self.W = {name: g.world(i, None, cache) for name, i in self.idx.items()}
        self.parent = {name: g.g['nodes'][g.parent[i]]['name'] for name, i in self.idx.items() if i in g.parent}
        kids = {}
        for c, p in self.parent.items():
            kids.setdefault(p, []).append(c)
        self.child = {}
        for b in MAP:
            ks = [k for k in kids.get(b, []) if k in self.idx]
            # el hijo que sigue la cadena (para la dirección del hueso)
            pref = {'hand_l': 'middle_01_l', 'hand_r': 'middle_01_r', 'pelvis': 'spine_01', 'spine_03': 'neck_01'}
            self.child[b] = pref.get(b) or (ks[0] if ks else None)


def retarget(path, strip_forward=False):
    T = Target()
    clip = load_clip(path)
    rest = clip['rest']
    hip_ratio = T.W['pelvis'][1, 3] / rest['Hips'][1, 3]
    order = [b for b in T.idx if b in MAP]
    # padres primero
    def depth(b):
        d = 0
        while b in T.parent:
            b = T.parent[b]; d += 1
        return d
    order.sort(key=depth)
    Rrest_t = {b: rot_of(T.W[b]) for b in T.idx}
    Ralign = {}
    for b in order:
        mx = MAP[b]
        if b.startswith(ALIGN) and T.child.get(b) and mx in CHILD_MIX and CHILD_MIX[mx] in rest:
            dt_ = T.W[T.child[b]][:3, 3] - T.W[b][:3, 3]
            dm = rest[CHILD_MIX[mx]][:3, 3] - rest[mx][:3, 3]
            Ralign[b] = align(dt_, dm)
        else:
            Ralign[b] = np.eye(3)
    n = clip['n']
    hips = np.array([fr['Hips'][:3, 3] for fr in clip['frames']])
    off = hips - rest['Hips'][:3, 3]
    if strip_forward:
        tt = np.arange(n)
        for ax in (0, 2):
            k = np.polyfit(tt, hips[:, ax], 1)
            off[:, ax] = hips[:, ax] - np.polyval(k, tt)
            off[:, ax] -= off[:, ax].mean()
    local = {b: [] for b in order}
    for f in range(n):
        Wt = {}
        for b in order:
            mx = MAP[b]
            delta = rot_of(clip['frames'][f][mx]) @ rot_of(rest[mx]).T
            if b == 'pelvis':
                delta = remove_yaw(delta)
            Wt[b] = delta @ Ralign[b] @ Rrest_t[b]
            p = T.parent.get(b)
            Rp = Wt[p] if p in Wt else rot_of(T.W[p])
            local[b].append(Rp.T @ Wt[b])
    return {'n': n, 'fps': clip['fps'], 'local': local, 'offset': off * hip_ratio, 'clip': clip, 'ratio': hip_ratio, 'T': T}


def export(r, loop):
    q = {}
    for name, mats in r['local'].items():
        qs = np.array([mat_to_quat(M) for M in mats])
        for i in range(1, len(qs)):
            if qs[i] @ qs[i - 1] < 0:
                qs[i] = -qs[i]
        q[name] = [round(float(v), 4) for v in qs.flatten()]
    return {'fps': r['fps'], 'frames': r['n'], 'loop': loop, 'bones': q,
            'offset': [round(float(v), 4) for v in r['offset'].flatten()]}
