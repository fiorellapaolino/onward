"""Small glTF (.gltf + .bin) reader with skinning support, for offline previews."""
import json, os, numpy as np
from PIL import Image

CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def quat_to_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


class GLTF:
    def __init__(self, path):
        self.dir = os.path.dirname(path)
        self.g = json.load(open(path))
        self.bufs = [open(os.path.join(self.dir, b['uri']), 'rb').read() for b in self.g['buffers']]
        self.parent = {}
        for i, n in enumerate(self.g['nodes']):
            for c in n.get('children', []):
                self.parent[c] = i
        self._tex = {}

    def acc(self, i):
        a = self.g['accessors'][i]; bv = self.g['bufferViews'][a['bufferView']]
        buf = self.bufs[bv['buffer']]
        n = NC[a['type']]; dt = np.dtype(CT[a['componentType']])
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        st = bv.get('byteStride')
        if st and st != n * dt.itemsize:
            raw = np.frombuffer(buf, np.uint8, a['count'] * st, off).reshape(-1, st)[:, :n * dt.itemsize].copy()
            out = raw.view(dt).reshape(-1, n)
        else:
            out = np.frombuffer(buf, dt, a['count'] * n, off).reshape(-1, n)
        if a.get('normalized'):
            out = out.astype(np.float64) / np.iinfo(dt).max
        return out

    def local(self, i, trs=None):
        n = self.g['nodes'][i]
        if 'matrix' in n:
            return np.array(n['matrix']).reshape(4, 4).T
        t = np.array(n.get('translation', [0, 0, 0]), float)
        r = np.array(n.get('rotation', [0, 0, 0, 1]), float)
        s = np.array(n.get('scale', [1, 1, 1]), float)
        if trs and i in trs:
            t, r, s = trs[i].get('t', t), trs[i].get('r', r), trs[i].get('s', s)
        M = np.eye(4); M[:3, :3] = quat_to_mat(r) * s; M[:3, 3] = t
        return M

    def world(self, i, trs=None, cache=None):
        if cache is not None and i in cache:
            return cache[i]
        M = self.local(i, trs)
        if i in self.parent:
            M = self.world(self.parent[i], trs, cache) @ M
        if cache is not None:
            cache[i] = M
        return M

    def texture(self, mat_index):
        if mat_index in self._tex:
            return self._tex[mat_index]
        m = self.g['materials'][mat_index]
        pbr = m.get('pbrMetallicRoughness', {})
        img = None
        if 'baseColorTexture' in pbr:
            src = self.g['textures'][pbr['baseColorTexture']['index']]['source']
            p = os.path.join(self.dir, self.g['images'][src]['uri'])
            if os.path.exists(p):
                im = Image.open(p).convert('RGB'); im.thumbnail((512, 512))
                img = np.asarray(im) / 255.0
        factor = np.array(pbr.get('baseColorFactor', [1, 1, 1, 1])[:3])
        self._tex[mat_index] = (img, factor)
        return self._tex[mat_index]

    def meshes(self, trs=None, skip=()):
        """Yields (name, V[n,3] posed world, F, colors[n,3], extras) for every mesh node."""
        cache = {}
        for ni, n in enumerate(self.g['nodes']):
            if 'mesh' not in n or n['name'] in skip:
                continue
            mesh = self.g['meshes'][n['mesh']]
            for pr in mesh['primitives']:
                at = pr['attributes']
                V = self.acc(at['POSITION']).astype(float)
                F = self.acc(pr['indices']).reshape(-1, 3).astype(int)
                if 'skin' in n and 'JOINTS_0' in at:
                    skin = self.g['skins'][n['skin']]
                    ibm = self.acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
                    jm = np.stack([self.world(j, trs, cache) @ ibm[k] for k, j in enumerate(skin['joints'])])
                    J = self.acc(at['JOINTS_0']).astype(int); W = self.acc(at['WEIGHTS_0']).astype(float)
                    W = W / np.maximum(W.sum(1, keepdims=True), 1e-9)
                    Vh = np.c_[V, np.ones(len(V))]
                    P = np.zeros((len(V), 3))
                    for k in range(4):
                        P += W[:, k:k + 1] * np.einsum('nij,nj->ni', jm[J[:, k]], Vh)[:, :3]
                    V = P
                    extras = {'joints': J, 'weights': W, 'jointnames': [self.g['nodes'][j]['name'] for j in skin['joints']]}
                else:
                    M = self.world(ni, trs, cache)
                    V = (np.c_[V, np.ones(len(V))] @ M.T)[:, :3]
                    extras = {}
                img, fac = self.texture(pr['material']) if 'material' in pr else (None, np.ones(3))
                if img is not None and 'TEXCOORD_0' in at:
                    uv = self.acc(at['TEXCOORD_0']).astype(float)
                    H, Wd, _ = img.shape
                    col = img[np.clip((uv[:, 1] % 1) * H, 0, H - 1).astype(int), np.clip((uv[:, 0] % 1) * Wd, 0, Wd - 1).astype(int)] * fac
                else:
                    col = np.tile(fac, (len(V), 1))
                yield n['name'], V, F, col, extras
