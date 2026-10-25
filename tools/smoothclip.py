"""Suaviza y re-muestrea un clip: quita el ruido de la captura y lo pasa a 60 fps con curvas suaves."""
import json, sys, numpy as np
from scipy.interpolate import CubicSpline
from scipy.ndimage import gaussian_filter1d

def smooth_clip(d, sigma=1.0, fps_out=60):
    n = d['frames']; fps = d['fps']; loop = d['loop']
    T = (n - 1) / fps
    t_in = np.arange(n) / fps
    t_out = np.arange(0, T + 1e-9, 1 / fps_out)
    mode = 'wrap' if loop else 'nearest'
    def proc(a, k, quat):
        a = np.array(a, float).reshape(-1, k)
        if len(a) == 1:
            return a
        if quat:
            for i in range(1, len(a)):
                if a[i] @ a[i - 1] < 0: a[i] = -a[i]
        body = a[:-1] if loop else a  # en bucle el último frame repite el primero
        if sigma > 0:
            body = gaussian_filter1d(body, sigma, axis=0, mode=mode)
        if loop:
            ext = np.vstack([body[-3:], body, body[:4]])
            te = (np.arange(len(ext)) - 3) / fps
            cs = CubicSpline(te, ext, axis=0)
        else:
            cs = CubicSpline(t_in, body, axis=0)
        out = cs(t_out)
        if quat:
            out /= np.linalg.norm(out, axis=1, keepdims=True)
        return out
    bones = {}
    for b, arr in d['bones'].items():
        q = proc(arr, 4, True)
        if len(q) > 1 and np.abs(q - q[0]).max() < 0.002:
            q = q[:1]
        bones[b] = [round(float(x), 5) for x in q.flatten()]
    off = proc(d['offset'], 3, False)
    out = dict(d)
    out.update({'bones': bones, 'offset': [round(float(x), 5) for x in off.flatten()], 'fps': fps_out, 'frames': len(t_out)})
    return out

if __name__ == '__main__':
    d = json.load(open(sys.argv[1]))
    json.dump(smooth_clip(d, float(sys.argv[3]), int(sys.argv[4])), open(sys.argv[2], 'w'), separators=(',', ':'))
