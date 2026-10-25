"""Retarget Mixamo clips onto the elf's procedural skeleton (see onward/src/game/rig.ts)."""
import sys, json, numpy as np
sys.path.insert(0, '/home/claude/scripts')
from mixamo import load_clip

# ── Our skeleton (must match rig.ts) ──────────────────────────────
J = {
    'hips': (0, -0.05, 0), 'spine': (0, 0.12, 0), 'chest': (0, 0.32, 0), 'neck': (0, 0.56, 0),
    'head': (0, 0.66, 0.01), 'headTop': (0, 1.0, 0.02),
}
for s, sx in (('L', 1), ('R', -1)):
    J['shoulder' + s] = (0.2 * sx, 0.47, -0.02); J['elbow' + s] = (0.36 * sx, 0.27, 0)
    J['wrist' + s] = (0.47 * sx, 0.12, 0.06); J['handEnd' + s] = (0.5 * sx, -0.03, 0.08)
    J['hip' + s] = (0.11 * sx, -0.1, 0.02); J['knee' + s] = (0.13 * sx, -0.5, 0)
    J['ankle' + s] = (0.14 * sx, -0.88, -0.02); J['toe' + s] = (0.14 * sx, -0.99, 0.13)
J = {k: np.array(v, float) for k, v in J.items()}

# name, parent, from, to, mixamo bone (rotation source), mixamo (from, to) for rest direction
BONES = [
    ('hips', None, 'hips', 'spine', 'Hips', ('Hips', 'Spine')),
    ('spine', 'hips', 'spine', 'chest', 'Spine1', ('Spine', 'Spine2')),
    ('chest', 'spine', 'chest', 'neck', 'Spine2', ('Spine2', 'Neck')),
    ('neck', 'chest', 'neck', 'head', 'Neck', ('Neck', 'Head')),
    ('head', 'neck', 'head', 'headTop', 'Head', ('Head', 'HeadTop_End')),
]
for s, side in (('L', 'Left'), ('R', 'Right')):
    BONES += [
        ('upperArm' + s, 'chest', 'shoulder' + s, 'elbow' + s, side + 'Arm', (side + 'Arm', side + 'ForeArm')),
        ('foreArm' + s, 'upperArm' + s, 'elbow' + s, 'wrist' + s, side + 'ForeArm', (side + 'ForeArm', side + 'Hand')),
        ('hand' + s, 'foreArm' + s, 'wrist' + s, 'handEnd' + s, side + 'Hand', (side + 'Hand', side + 'HandMiddle1')),
        ('thigh' + s, 'hips', 'hip' + s, 'knee' + s, side + 'UpLeg', (side + 'UpLeg', side + 'Leg')),
        ('shin' + s, 'thigh' + s, 'knee' + s, 'ankle' + s, side + 'Leg', (side + 'Leg', side + 'Foot')),
        ('foot' + s, 'shin' + s, 'ankle' + s, 'toe' + s, side + 'Foot', (side + 'Foot', side + 'ToeBase')),
    ]

OUR_HIP_H = J['hips'][1] - (-1.0)  # hips height above the ground (model units)


def rot_of(M):
    R = M[:3, :3].copy()
    for i in range(3):
        R[:, i] /= np.linalg.norm(R[:, i])
    u, _, vt = np.linalg.svd(R)
    return u @ vt


def align(a, b):
    """Minimal rotation that takes direction a to direction b."""
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = a @ b
    if c < -0.9999:
        return -np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K / (1 + c)


def remove_yaw(R):
    """Quita el giro alrededor del eje vertical, dejando la inclinación."""
    f = R @ np.array([0, 0, 1.0])
    yaw = np.arctan2(f[0], f[2])
    c, s_ = np.cos(-yaw), np.sin(-yaw)
    Ry = np.array([[c, 0, s_], [0, 1, 0], [-s_, 0, c]])
    return Ry @ R


def mat_to_quat(R):
    t = np.trace(R)
    if t > 0:
        s = np.sqrt(t + 1) * 2
        w, x, y, z = 0.25 * s, (R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = np.sqrt(1 + R[0, 0] - R[1, 1] - R[2, 2]) * 2
        w, x, y, z = (R[2, 1] - R[1, 2]) / s, 0.25 * s, (R[0, 1] + R[1, 0]) / s, (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = np.sqrt(1 + R[1, 1] - R[0, 0] - R[2, 2]) * 2
        w, x, y, z = (R[0, 2] - R[2, 0]) / s, (R[0, 1] + R[1, 0]) / s, 0.25 * s, (R[1, 2] + R[2, 1]) / s
    else:
        s = np.sqrt(1 + R[2, 2] - R[0, 0] - R[1, 1]) * 2
        w, x, y, z = (R[1, 0] - R[0, 1]) / s, (R[0, 2] + R[2, 0]) / s, (R[1, 2] + R[2, 1]) / s, 0.25 * s
    q = np.array([x, y, z, w])
    return q / np.linalg.norm(q)


def retarget(path, strip_forward=False, loop=True):
    clip = load_clip(path)
    rest = clip['rest']
    mix_hip_h = rest['Hips'][1, 3]
    scale = OUR_HIP_H / mix_hip_h
    Rrest = {b[4]: rot_of(rest[b[4]]) for b in BONES}
    Ralign = {}
    for (name, parent, a, b, src, (ma, mb)) in BONES:
        # Solo los brazos necesitan alinearse (Mixamo está en pose T y la elfa en pose A).
        # El resto se deja tal cual: si no, le copiaríamos la postura del muñeco (cuello hacia delante).
        if name.startswith(('upperArm', 'foreArm', 'hand')):
            Ralign[name] = align(J[b] - J[a], rest[mb][:3, 3] - rest[ma][:3, 3])
        else:
            Ralign[name] = np.eye(3)

    n = clip['n']
    hips_pos = np.array([fr['Hips'][:3, 3] for fr in clip['frames']])
    off = hips_pos - rest['Hips'][:3, 3]
    if strip_forward:
        # quitar el avance (clips que no son "in place"): solo dejamos la oscilación
        tt = np.arange(n)
        for ax in (0, 2):
            k = np.polyfit(tt, hips_pos[:, ax], 1)
            off[:, ax] = hips_pos[:, ax] - np.polyval(k, tt)
            off[:, ax] -= off[:, ax].mean()
    local = {b[0]: [] for b in BONES}
    for f in range(n):
        W = {}
        for (name, parent, a, b, src, _) in BONES:
            delta = rot_of(clip['frames'][f][src]) @ Rrest[src].T
            if name == 'hips':
                delta = remove_yaw(delta)  # el juego decide hacia dónde mira; la animación no la gira
            W[name] = delta @ Ralign[name]
            L = W[parent].T @ W[name] if parent else W[name]
            local[name].append(L)
    return {'n': n, 'fps': clip['fps'], 'local': local, 'offset': off * scale, 'clip': clip, 'scale': scale}


def export(r, loop):
    q = {}
    for name, mats in r['local'].items():
        qs = np.array([mat_to_quat(M) for M in mats])
        # mantener el mismo hemisferio entre frames para interpolar bien
        for i in range(1, len(qs)):
            if qs[i] @ qs[i - 1] < 0:
                qs[i] = -qs[i]
        q[name] = [round(float(v), 4) for v in qs.flatten()]
    return {
        'fps': r['fps'], 'frames': r['n'], 'loop': loop,
        'bones': q,
        'offset': [round(float(v), 4) for v in r['offset'].flatten()],  # unidades del modelo
    }
