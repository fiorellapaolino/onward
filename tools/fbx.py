"""Minimal FBX binary (7.x) reader: nodes, properties, arrays."""
import struct, zlib
import numpy as np


class Node:
    __slots__ = ('name', 'props', 'children')

    def __init__(self, name, props, children):
        self.name, self.props, self.children = name, props, children

    def find(self, name):
        for c in self.children:
            if c.name == name:
                return c
        return None

    def findall(self, name):
        return [c for c in self.children if c.name == name]

    def __repr__(self):
        return f'Node({self.name}, {self.props[:3]}, {len(self.children)} children)'


ARR = {'f': ('<f4', 4), 'd': ('<f8', 8), 'l': ('<i8', 8), 'i': ('<i4', 4), 'b': ('<u1', 1)}


def _prop(b, o):
    t = chr(b[o]); o += 1
    if t == 'Y': return struct.unpack_from('<h', b, o)[0], o + 2
    if t == 'C': return bool(b[o]), o + 1
    if t == 'I': return struct.unpack_from('<i', b, o)[0], o + 4
    if t == 'F': return struct.unpack_from('<f', b, o)[0], o + 4
    if t == 'D': return struct.unpack_from('<d', b, o)[0], o + 8
    if t == 'L': return struct.unpack_from('<q', b, o)[0], o + 8
    if t in 'SR':
        n = struct.unpack_from('<I', b, o)[0]; o += 4
        raw = bytes(b[o:o + n])
        return (raw.decode('utf8', 'replace') if t == 'S' else raw), o + n
    if t in ARR:
        n, enc, clen = struct.unpack_from('<III', b, o); o += 12
        raw = bytes(b[o:o + clen]); o += clen
        if enc == 1: raw = zlib.decompress(raw)
        dt, sz = ARR[t]
        return np.frombuffer(raw, dt, n), o
    raise ValueError(f'bad prop type {t!r} at {o}')


def _node(b, o, v64):
    if v64:
        end, nprops, plen = struct.unpack_from('<QQQ', b, o); o += 24
    else:
        end, nprops, plen = struct.unpack_from('<III', b, o); o += 12
    nlen = b[o]; o += 1
    if end == 0:
        return None, o
    name = bytes(b[o:o + nlen]).decode('ascii', 'replace'); o += nlen
    props = []
    for _ in range(nprops):
        p, o = _prop(b, o)
        props.append(p)
    children = []
    sentinel = 25 if v64 else 13
    while o < end:
        if end - o == sentinel and not any(b[o:end]):
            o = end
            break
        c, o = _node(b, o, v64)
        if c is None:
            break
        children.append(c)
    return Node(name, props, children), end


def load(path):
    b = memoryview(open(path, 'rb').read())
    ver = struct.unpack_from('<I', b, 23)[0]
    v64 = ver >= 7500
    o = 27
    top = []
    while o < len(b):
        n, o2 = _node(b, o, v64)
        if n is None:
            break
        top.append(n)
        o = o2
    return Node('root', [], top), ver
