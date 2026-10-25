# Hornea las casas de la aldea: arma cada tipo de casa con piezas del Medieval Village MegaKit
# (Quaternius, CC0) y lo guarda como UN solo glTF con una malla por tipo de casa
# (todas las piezas fundidas, una primitiva por material). Así se dibujan con muy pocas llamadas.
import sys, json, os, numpy as np
from PIL import Image
sys.path.insert(0, '/home/claude/scripts')
from gltfload import GLTF, quat_to_mat

K = '/home/claude/assets_in/village/Medieval Village MegaKit[Standard]/glTF/'
OUT = '/home/claude/onward/public/models/village/'
os.makedirs(OUT, exist_ok=True)
H = 3.12
pi = np.pi

WINDOW_FOR = {'Window_Wide_Flat': 'Window_Wide_Flat1', 'Window_Wide_Round': 'Window_Wide_Round1', 'Window_Thin_Round': 'Window_Thin_Round1'}

def house(w, d, front, sides, back, roof, gable, extra=()):
    """w, d: módulos de 2 m de ancho (x) y fondo (z). El frente (puerta) mira a +Z."""
    P = []
    hx, hz = w, d
    def wall(name, x, z, r):
        P.append([name, x, 0, z, r])
        c, s = np.cos(r), np.sin(r)
        for key, win in WINDOW_FOR.items():
            if name.endswith(key):
                P.append([win, x, 0, z, r])
        if '_Door_Flat' in name:  # la puerta: bisagra a la izquierda del hueco
            P.append(['Door_1_Flat', x - 0.53 * c, 0, z + 0.53 * s, r])
    for i, n in enumerate(front): wall(n, -hx + 1 + 2 * i, hz, 0)
    for i, n in enumerate(back): wall(n, hx - 1 - 2 * i, -hz, pi)
    for i, n in enumerate(sides): wall(n, hx, hz - 1 - 2 * i, pi / 2)
    for i, n in enumerate(sides[::-1]): wall(n, -hx, -hz + 1 + 2 * i, -pi / 2)
    for sx in (-1, 1):
        for sz in (-1, 1): P.append(['Corner_Exterior_Wood', sx * hx, 0, sz * hz, 0])
    P.append([roof, 0, H, 0, 0])
    P.append([gable, 0, H, hz, 0])
    P.append([gable, 0, H, -hz, pi])
    P.extend([list(e) for e in extra])
    return P

PL, BR = 'Wall_Plaster_', 'Wall_UnevenBrick_'
HOUSES = {
    # casa pequeña encalada
    'A': (2, 2, house(2, 2, [PL + 'Door_Flat', PL + 'Window_Wide_Flat'], [PL + 'Window_Wide_Flat', PL + 'Straight'],
                      [PL + 'Straight', PL + 'Window_Wide_Flat'], 'Roof_RoundTiles_4x4', 'Roof_Front_Brick4',
                      extra=[['Prop_Vine1', -2.0, 2.9, 1.0, -pi / 2]])),
    # casa alargada de piedra, con chimenea
    'B': (2, 3, house(2, 3, [BR + 'Door_Flat', BR + 'Window_Wide_Round'], [BR + 'Window_Wide_Round', BR + 'Straight', BR + 'Window_Wide_Round'],
                      [BR + 'Straight', BR + 'Straight'], 'Roof_RoundTiles_4x6', 'Roof_Front_Brick4',
                      extra=[['Prop_Chimney', 1.3, 1.8, -2.2, 0]])),
    # casa de entramado de madera
    'C': (2, 2, house(2, 2, [PL + 'Door_Flat', PL + 'WoodGrid'], [PL + 'WoodGrid', PL + 'Window_Wide_Flat'],
                      [PL + 'Window_Wide_Flat', PL + 'WoodGrid'], 'Roof_RoundTiles_4x4', 'Roof_Front_Brick4',
                      extra=[['Prop_Crate', 2.9, 0, 1.4, 0.3]])),
    # casa grande
    'D': (3, 3, house(3, 3, [PL + 'Window_Wide_Flat', PL + 'Door_Flat', PL + 'Window_Wide_Flat'],
                      [PL + 'Window_Wide_Flat', PL + 'WoodGrid', PL + 'Window_Wide_Flat'],
                      [PL + 'Straight', PL + 'Window_Wide_Flat', PL + 'Straight'], 'Roof_RoundTiles_6x6', 'Roof_Front_Brick6',
                      extra=[['Prop_Vine2', 3.0, 2.9, -1.0, pi / 2]])),
}

# ── lectura de piezas: primitivas con posición, normal, uv y material, ya colocadas ──
def prims_of(name):
    g = GLTF(K + name + '.gltf'); j = g.g
    out = []
    for ni, n in enumerate(j['nodes']):
        if 'mesh' not in n: continue
        M = g.world(ni)
        for p in j['meshes'][n['mesh']]['primitives']:
            a = p['attributes']
            V = g.acc(a['POSITION']).astype(np.float64)
            N = g.acc(a['NORMAL']).astype(np.float64) if 'NORMAL' in a else np.zeros_like(V)
            T = g.acc(a['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in a else np.zeros((len(V), 2))
            I = g.acc(p['indices']).reshape(-1).astype(np.int64)
            V = (np.c_[V, np.ones(len(V))] @ M.T)[:, :3]
            N = N @ M[:3, :3].T
            mat = j['materials'][p['material']]
            out.append((mat, V, N, T, I))
    return out, g

materials = {}  # nombre → (definición, ruta de la imagen de color)
def mat_key(mat, g):
    name = mat.get('name', 'mat')
    if name not in materials:
        pbr = mat.get('pbrMetallicRoughness', {})
        img = None
        if 'baseColorTexture' in pbr:
            src = g.g['textures'][pbr['baseColorTexture']['index']]['source']
            img = os.path.join(g.dir, g.g['images'][src]['uri'])
        materials[name] = (mat, img)
    return name

def bake():
    buf = bytearray(); views = []; accs = []; meshes = []; nodes = []
    def add(arr, comp, typ, target=None, minmax=False):
        nonlocal buf
        while len(buf) % 4: buf.append(0)
        off = len(buf); b = arr.tobytes(); buf += b
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b), **({'target': target} if target else {})})
        acc = {'bufferView': len(views) - 1, 'componentType': comp, 'count': int(arr.shape[0]), 'type': typ}
        if minmax: acc['min'] = arr.min(0).tolist(); acc['max'] = arr.max(0).tolist()
        accs.append(acc); return len(accs) - 1
    cache = {}
    info = {}
    for hname, (w, d, P) in HOUSES.items():
        groups = {}
        for piece, x, y, z, r in P:
            if piece not in cache: cache[piece] = prims_of(piece)
            prims, g = cache[piece]
            c, s = np.cos(r), np.sin(r); R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
            for mat, V, N, T, I in prims:
                k = mat_key(mat, g)
                G = groups.setdefault(k, [[], [], [], [], 0])
                G[0].append(V @ R.T + [x, y, z]); G[1].append(N @ R.T); G[2].append(T); G[3].append(I + G[4]); G[4] += len(V)
        prims_out = []
        mat_names = list(materials.keys())
        for k, (Vs, Ns, Ts, Is, _) in groups.items():
            V = np.vstack(Vs).astype(np.float32); N = np.vstack(Ns); N = (N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-9)).astype(np.float32)
            T = np.vstack(Ts).astype(np.float32); I = np.concatenate(Is).astype(np.uint32)
            prims_out.append({'attributes': {'POSITION': add(V, 5126, 'VEC3', 34962, True), 'NORMAL': add(N, 5126, 'VEC3', 34962),
                                             'TEXCOORD_0': add(T, 5126, 'VEC2', 34962)},
                              'indices': add(I, 5125, 'SCALAR', 34963), 'material': list(materials.keys()).index(k)})
        meshes.append({'name': 'House_' + hname, 'primitives': prims_out})
        nodes.append({'name': 'House_' + hname, 'mesh': len(meshes) - 1})
        allV = np.vstack([np.vstack(g[0]) for g in groups.values()])
        info[hname] = {'hx': w * 2 / 2 * 1.0 * 1, 'hz': d * 2 / 2, 'tris': int(sum(len(np.concatenate(g[3])) for g in groups.values()) // 3),
                       'door': [-w + 1 - 0.0, d], 'min': allV.min(0).round(2).tolist(), 'max': allV.max(0).round(2).tolist()}
    # materiales: solo color base (texturas reducidas a 512), sin mapas normales ni de rugosidad
    images = []; textures = []; mats_out = []
    done = {}
    for name, (mat, img) in materials.items():
        m = {'name': name, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 0.9}}
        pbr = mat.get('pbrMetallicRoughness', {})
        if 'baseColorFactor' in pbr: m['pbrMetallicRoughness']['baseColorFactor'] = pbr['baseColorFactor']
        if mat.get('alphaMode'): m['alphaMode'] = mat['alphaMode']
        if mat.get('doubleSided'): m['doubleSided'] = True
        if img and os.path.exists(img):
            if img not in done:
                I = Image.open(img); alpha = I.mode in ('RGBA', 'LA') and I.getchannel('A').getextrema()[0] < 250
                I = I.convert('RGBA' if alpha else 'RGB'); I.thumbnail((512, 512), Image.LANCZOS)
                fn = os.path.splitext(os.path.basename(img))[0] + ('.png' if alpha else '.jpg')
                I.save(OUT + fn, **({'optimize': True} if alpha else {'quality': 85}))
                images.append({'uri': fn, 'mimeType': 'image/png' if alpha else 'image/jpeg'}); textures.append({'source': len(images) - 1})
                done[img] = len(textures) - 1
                if alpha: m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.5
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': done[img]}
        mats_out.append(m)
    gl = {'asset': {'version': '2.0', 'generator': 'onward bake_houses.py'}, 'scene': 0,
          'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes, 'materials': mats_out,
          'textures': textures, 'images': images, 'samplers': [{}], 'accessors': accs, 'bufferViews': views,
          'buffers': [{'uri': 'houses.bin', 'byteLength': len(buf)}]}
    for t in textures: t['sampler'] = 0
    open(OUT + 'houses.bin', 'wb').write(buf)
    json.dump(gl, open(OUT + 'houses.gltf', 'w'), separators=(',', ':'))
    print('materiales', list(materials.keys()))
    for k, v in info.items(): print(k, v)
    print('bin', len(buf) // 1024, 'KB')
    return info

if __name__ == '__main__':
    info = bake()
    json.dump({k: {'hx': v['hx'], 'hz': v['hz'], 'min': v['min'], 'max': v['max']} for k, v in info.items()},
              open('/home/claude/onward/src/game/houseTypes.json', 'w'), indent=1)
