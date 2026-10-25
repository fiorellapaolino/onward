"""Extract Mixamo FBX animation and compute world rotations per frame."""
import sys, numpy as np
sys.path.insert(0, '/home/claude/scripts')
import fbx

KTIME = 46186158000


def euler_xyz(deg):
    """FBX eEulerXYZ: rotate about X, then Y, then Z  -> M = Rz @ Ry @ Rx."""
    x, y, z = np.radians(deg)
    cx, sx, cy, sy, cz, sz = np.cos(x), np.sin(x), np.cos(y), np.sin(y), np.cos(z), np.sin(z)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def props70(node):
    out = {}
    p = node.find('Properties70')
    if p is None:
        return out
    for c in p.children:
        out[c.props[0]] = c.props[4:]
    return out


def load_clip(path, fps=30):
    root, _ = fbx.load(path)
    objs = root.find('Objects')
    conns = root.find('Connections').children
    models = {}
    for m in objs.findall('Model'):
        name = m.props[1].split('\x00')[0].replace('mixamorig:', '')
        if m.props[2] in ('LimbNode', 'Null', 'Root'):
            models[m.props[0]] = {'name': name, 'p': props70(m)}
    parent = {}
    curve_nodes = {cn.props[0]: {'p': props70(cn), 'curves': {}} for cn in objs.findall('AnimationCurveNode')}
    curves = {}
    for c in objs.findall('AnimationCurve'):
        t = c.find('KeyTime').props[0].astype(np.float64) / KTIME
        v = c.find('KeyValueFloat').props[0].astype(np.float64)
        curves[c.props[0]] = (t, v)
    cn_target = {}
    for c in conns:
        kind, a, b = c.props[0], c.props[1], c.props[2]
        if kind == 'OO' and a in models and b in models:
            parent[a] = b
        if kind == 'OP' and a in curve_nodes and b in models:
            cn_target[a] = (b, c.props[3])
        if kind == 'OP' and a in curves and b in curve_nodes:
            curve_nodes[b]['curves'][c.props[3]] = curves[a]
    anim = {}  # model id -> {'Lcl Rotation': (fx,fy,fz) ...}
    tmax = 0
    for cid, (mid, prop) in cn_target.items():
        cs = curve_nodes[cid]['curves']
        anim.setdefault(mid, {})[prop] = cs
        for k in cs.values():
            tmax = max(tmax, k[0][-1])
    nframes = int(round(tmax * fps)) + 1
    times = np.arange(nframes) / fps

    def channel(mid, prop, default):
        d = np.array(default, float)
        out = np.tile(d, (nframes, 1))
        cs = anim.get(mid, {}).get(prop)
        if cs:
            for i, ax in enumerate(('d|X', 'd|Y', 'd|Z')):
                if ax in cs:
                    t, v = cs[ax]
                    out[:, i] = np.interp(times, t, v)
        return out

    by_name = {}
    for mid, m in models.items():
        p = m['p']
        T0 = p.get('Lcl Translation', (0, 0, 0))
        R0 = p.get('Lcl Rotation', (0, 0, 0))
        pre = p.get('PreRotation', (0, 0, 0))
        post = p.get('PostRotation', (0, 0, 0))
        S0 = p.get('Lcl Scaling', (1, 1, 1))
        m['T'] = channel(mid, 'Lcl Translation', T0)
        m['R'] = channel(mid, 'Lcl Rotation', R0)
        m['T0'], m['R0'] = np.array(T0, float), np.array(R0, float)
        m['pre'], m['post'] = euler_xyz(pre), euler_xyz(post)
        m['S'] = np.array(S0, float)
        m['parent'] = parent.get(mid)
        by_name[m['name']] = mid

    def local(m, f):
        R = m['pre'] @ euler_xyz(m['R'][f] if f is not None else m['R0']) @ m['post'].T
        T = m['T'][f] if f is not None else m['T0']
        M = np.eye(4); M[:3, :3] = R * m['S']; M[:3, 3] = T
        return M

    def world_all(f):
        out = {}
        def get(mid):
            if mid in out: return out[mid]
            m = models[mid]
            L = local(m, f)
            W = get(m['parent']) @ L if m['parent'] in models else L
            out[mid] = W
            return W
        for mid in models: get(mid)
        return {models[k]['name']: v for k, v in out.items()}

    rest = world_all(None)
    frames = [world_all(f) for f in range(nframes)]
    return {'rest': rest, 'frames': frames, 'fps': fps, 'n': nframes}


if __name__ == '__main__':
    c = load_clip(sys.argv[1])
    r = c['rest']
    print('frames', c['n'])
    for k in ['Hips', 'Spine2', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase']:
        print(k, np.round(r[k][:3, 3], 2))
    print('hips traj y', np.round([fr['Hips'][1, 3] for fr in c['frames'][::5]], 1))
    print('hips traj z', np.round([fr['Hips'][2, 3] for fr in c['frames'][::5]], 1))
