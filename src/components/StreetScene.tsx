import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Clone, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { hideInVoid } from './instancing'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { COBBLE_FROM, PATH_END, STAIR_END, STAIR_TOP, STAIR_Z0, STREET_YAW, TERRACE_END, TERRACE_H, damp, natureUrl, pathAt, rng, sideAt, streetOrigin, streetToWorld } from '../game/config'
import { litFraction } from '../game/state'
import { clayTiles, cobbles, dressedStone, oldWood, plaster as plasterSurface, stoneWall, type Surface } from '../game/textures'
import { BOXES, CAMERA_BOXES, ELDER, PLATES, PLATE_R, TALL_HOUSES, inBox, type TallHouse } from '../game/village'

/*
 * La calle de la aldea: empedrado, muro de contención, escalera, terraza y casas altas de entramado.
 * Todo se arma con cajas y se junta en una malla por material (así se dibuja de una sola vez).
 * Las coordenadas son locales a la calle: z sube por la escalera (0 = el primer escalón); x hacia la izquierda.
 * Texturas generadas por código (game/textures.ts). Las hojas de hiedra: Medieval Village MegaKit de Quaternius (CC0).
 */
const V = `${import.meta.env.BASE_URL}models/village/`
const TEX = { vine: V + 'T_VineLeaf_png.png' }
const TREE_URL = natureUrl('CommonTree_1')
const TUFT_URL = natureUrl('Grass_Wispy_Short')

const STAIR_LEN = STAIR_TOP - STAIR_Z0
const TERRACE_LEN = TERRACE_END - STAIR_Z0
const DOWN_LEN = STAIR_END - TERRACE_END
const STAIR_W = 3.5

type MatKey = 'plaster' | 'stone' | 'step' | 'tiles' | 'timber' | 'glass' | 'shutter' | 'door' | 'cap' | 'earth' | 'pot' | 'wood' | 'apple' | 'leaf' | 'cobble' | 'flag' | 'hill' | 'lamp'
type Parts = Map<MatKey, THREE.BufferGeometry[]>

const E = new THREE.Euler()
const Q = new THREE.Quaternion()
const P = new THREE.Vector3()
const ONE = new THREE.Vector3(1, 1, 1)
const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), ONE)

/** Una caja cuya textura mantiene su tamaño en metros (no se estira con la caja). */
function boxGeo(w: number, h: number, d: number, tile: number) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.getAttribute('uv')
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  sizes.forEach(([su, sv], f) => {
    for (let v = 0; v < 4; v++) uv.setXY(f * 4 + v, (uv.getX(f * 4 + v) * su) / tile, (uv.getY(f * 4 + v) * sv) / tile)
  })
  return g.toNonIndexed()
}

const wear = rng(2718)

class Builder {
  parts: Parts = new Map()
  /** Lo siguiente que se agregue queda dentro de este marco. */
  frame = new THREE.Matrix4()
  put(mat: MatKey, geo: THREE.BufferGeometry, m: THREE.Matrix4) {
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.frame, m))
    this.weather(mat, geo)
    if (!this.parts.has(mat)) this.parts.set(mat, [])
    this.parts.get(mat)!.push(geo)
  }
  /** Cada pieza con su tono; abajo y bajo los aleros, más oscura: la suciedad y la sombra de siempre. */
  weather(mat: MatKey, geo: THREE.BufferGeometry) {
    const pos = geo.getAttribute('position')
    geo.computeBoundingBox()
    const { min, max } = geo.boundingBox!
    const span = Math.max(0.001, max.y - min.y)
    const tone = 0.9 + wear() * 0.2
    const warm = (wear() - 0.5) * 0.08
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const up = (y - min.y) / span
      const fromGround = y - (y >= TERRACE_H - 0.01 ? TERRACE_H : 0)
      const foot = THREE.MathUtils.smoothstep(fromGround, 0, 1)
      let k = tone * (0.78 + 0.22 * foot)
      if (mat === 'plaster') k *= 1 - 0.3 * THREE.MathUtils.smoothstep(up, 0.5, 1) // bajo el piso de arriba
      if (mat === 'stone' && span > 1) k *= 0.86 + 0.14 * up
      colors[i * 3] = k * (1 + warm)
      colors[i * 3 + 1] = k
      colors[i * 3 + 2] = k * (1 - warm)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  }
  box(mat: MatKey, w: number, h: number, d: number, m: THREE.Matrix4, tile = 2) {
    // la madera nunca es recta del todo
    const crooked = mat === 'timber' || mat === 'shutter' || mat === 'tiles'
    const amount = mat === 'tiles' ? 0.006 : 0.014
    const mx = crooked ? new THREE.Matrix4().multiplyMatrices(m, at((wear() - 0.5) * 0.012, (wear() - 0.5) * 0.012, 0, (wear() - 0.5) * amount, (wear() - 0.5) * amount, (wear() - 0.5) * amount)) : m
    this.put(mat, boxGeo(w, h, d, tile), mx)
  }
}

/** Una cara de un piso, en el plano z = 0 con +z hacia afuera: vigas, montantes, diagonales y ventanas. */
function timberFace(b: Builder, width: number, h: number, seed: number) {
  const r = rng(seed)
  const n = Math.max(2, Math.round(width / 1.25))
  const pw = width / n
  // vigas de arriba y de abajo
  b.box('timber', width + 0.08, 0.15, 0.1, at(0, 0.07, 0.03))
  b.box('timber', width + 0.08, 0.13, 0.1, at(0, h - 0.06, 0.03))
  for (let i = 0; i <= n; i++) b.box('timber', 0.13, h, 0.09, at(-width / 2 + i * pw, h / 2, 0.03))
  for (let i = 0; i < n; i++) {
    const cx = -width / 2 + (i + 0.5) * pw
    if (i % 2 === 1 || n === 2) {
      // ventana con postigos y parteluces
      const cy = h * 0.53
      b.box('timber', 0.74, 0.96, 0.05, at(cx, cy, 0.03))
      b.box('glass', 0.6, 0.82, 0.05, at(cx, cy, 0.05))
      b.box('timber', 0.035, 0.82, 0.03, at(cx, cy, 0.08))
      b.box('timber', 0.6, 0.035, 0.03, at(cx, cy, 0.08))
      if (r() < 0.4) {
        b.box('wood', 0.74, 0.11, 0.2, at(cx, cy - 0.53, 0.12))
        for (const k of [-0.24, 0, 0.24]) {
          b.put('leaf', new THREE.IcosahedronGeometry(0.11, 0), at(cx + k, cy - 0.42, 0.13))
          b.put('apple', new THREE.IcosahedronGeometry(0.035, 0), at(cx + k + 0.04, cy - 0.34, 0.2))
        }
      }
      if (pw > 1) {
        b.box('shutter', 0.17, 0.86, 0.04, at(cx - 0.47, cy, 0.07, 0, -0.25))
        b.box('shutter', 0.17, 0.86, 0.04, at(cx + 0.47, cy, 0.07, 0, 0.25))
      }
    } else {
      // diagonales de entramado, en un sentido o en cruz
      const len = Math.hypot(pw, h - 0.2)
      const a = Math.atan2(h - 0.2, pw)
      b.box('timber', len, 0.1, 0.07, at(cx, h / 2, 0.03, 0, 0, a))
      if (r() < 0.55) b.box('timber', len, 0.1, 0.07, at(cx, h / 2, 0.035, 0, 0, -a))
    }
  }
}

/** El techo a dos aguas: la cumbrera va a lo largo de z y los hastiales miran a ±z. */
function gableRoof(b: Builder, w: number, d: number, y: number, over = 0.45) {
  const rise = w * 0.48
  const half = w / 2 + over
  const a = Math.atan2(rise, w / 2)
  const len = half / Math.cos(a)
  const topY = y + rise
  for (const s of [1, -1]) {
    b.box('tiles', len, 0.13, d + over * 2, at((s * half) / 2, topY - (Math.tan(a) * half) / 2 + 0.07, 0, 0, 0, -s * a), 1.7)
  }
  b.box('timber', 0.18, 0.18, d + over * 2 + 0.05, at(0, topY + 0.1, 0))
  // hastiales: triángulo de revoque y su armazón de madera
  for (const s of [1, -1]) {
    const tri = new THREE.BufferGeometry()
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, rise, 0], 3))
    tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w / 2, 0, w / 4, rise / 2], 2))
    const ry = s > 0 ? 0 : Math.PI
    b.put('plaster', tri, at(0, y, (s * d) / 2, 0, ry))
    const face = at(0, y, (s * d) / 2 + s * 0.04, 0, ry)
    const place = (m: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(face, m)
    b.box('timber', 0.16, rise, 0.08, place(at(0, rise / 2, 0)))
    b.box('timber', w, 0.14, 0.08, place(at(0, 0.07, 0)))
    const rafter = Math.hypot(w / 2, rise) + over
    for (const k of [1, -1]) {
      b.box('timber', rafter, 0.15, 0.1, place(at((k * w) / 4, rise / 2 + 0.05, 0.03, 0, 0, -k * a)))
      b.box('timber', Math.hypot(w / 4, rise / 2), 0.1, 0.07, place(at((k * w) / 8, rise / 4 + 0.08, 0.01, 0, 0, k * a)))
    }
  }
}

function buildHouse(b: Builder, h: TallHouse, base: THREE.Matrix4, seed: number) {
  const FLOOR = 1.55
  const STONE = 1.45
  const JETTY = 0.17 // cada piso sobresale un poco del de abajo
  const { w, d, floors, gableFront } = h
  // ninguna casa vieja está a plomo
  const lean = rng(seed * 991)
  base = new THREE.Matrix4().multiplyMatrices(base, at(0, 0, 0, (lean() - 0.5) * 0.012, 0, (lean() - 0.5) * 0.012))
  b.frame = base
  b.box('stone', w, STONE, d, at(0, STONE / 2, 0), 1.6)
  // esquinas de sillares claros, alternados
  for (const cx of [-1, 1]) {
    for (const cz of [-1, 1]) {
      for (let q = 0; q < 5; q++) {
        const long = q % 2 ? 0.46 : 0.3
        b.box('cap', long, 0.25, q % 2 ? 0.3 : 0.46, at((cx * (w + 0.04 - long)) / 2, 0.15 + q * 0.28, (cz * (d + 0.04 - (q % 2 ? 0.3 : 0.46))) / 2), 1)
      }
    }
  }
  // el zócalo de piedra clara y la puerta
  b.box('cap', w + 0.1, 0.1, d + 0.1, at(0, STONE + 0.03, 0))
  b.box('timber', 1.08, 1.32, 0.08, at(-w * 0.22, 0.66, d / 2 + 0.02))
  b.box('door', 0.86, 1.2, 0.06, at(-w * 0.22, 0.6, d / 2 + 0.06))
  const wx = w * 0.22
  b.box('timber', 0.74, 0.74, 0.05, at(wx, 0.85, d / 2 + 0.02))
  b.box('glass', 0.6, 0.6, 0.05, at(wx, 0.85, d / 2 + 0.04))
  b.box('timber', 0.035, 0.6, 0.03, at(wx, 0.85, d / 2 + 0.07))
  b.box('timber', 0.6, 0.035, 0.03, at(wx, 0.85, d / 2 + 0.07))
  b.box('cap', 0.86, 0.07, 0.16, at(wx, 0.46, d / 2 + 0.06))
  b.box('cap', 1.3, 0.1, 0.45, at(-w * 0.22, 0.05, d / 2 + 0.2))
  // farol de pared junto a la puerta
  b.box('timber', 0.05, 0.05, 0.22, at(-w * 0.22 + 0.72, 1.24, d / 2 + 0.11))
  b.box('timber', 0.17, 0.03, 0.17, at(-w * 0.22 + 0.72, 1.2, d / 2 + 0.2))
  b.box('glass', 0.12, 0.2, 0.12, at(-w * 0.22 + 0.72, 1.08, d / 2 + 0.2))
  b.box('timber', 0.17, 0.03, 0.17, at(-w * 0.22 + 0.72, 0.97, d / 2 + 0.2))

  let W = w
  let D = d
  for (let i = 0; i < floors; i++) {
    W = w + JETTY * 2 * (i + 1)
    D = d + JETTY * 2 * (i + 1)
    const y = STONE + FLOOR * i
    b.frame = base
    b.box('plaster', W, FLOOR, D, at(0, y + FLOOR / 2, 0), 2.6)
    for (let side = 0; side < 4; side++) {
      const width = side % 2 ? D : W
      const dist = side % 2 ? W / 2 : D / 2
      const a = (side * Math.PI) / 2
      b.frame = new THREE.Matrix4().multiplyMatrices(base, at(Math.sin(a) * dist, y, Math.cos(a) * dist, 0, a))
      timberFace(b, width, FLOOR, seed * 13 + i * 7 + side)
    }
  }
  const roofY = STONE + FLOOR * floors
  // cumbrera hacia el frente (hastial visible) o de costado
  b.frame = gableFront ? base : new THREE.Matrix4().multiplyMatrices(base, at(0, 0, 0, 0, Math.PI / 2))
  gableRoof(b, gableFront ? W : D, gableFront ? D : W, roofY)
  if (!gableFront) {
    // buhardillas sobre la caída del techo que mira a la calle
    const rise = D * 0.48
    const dz = D * 0.2
    const dy = roofY + rise * (1 - (2 * dz) / D)
    for (const dx of W > 8 ? [-W * 0.25, W * 0.25] : [0]) {
      const dormer = new THREE.Matrix4().multiplyMatrices(base, at(dx, dy, dz))
      b.frame = dormer
      b.box('plaster', 0.95, 0.85, 1.25, at(0, 0.3, -0.05), 1.4)
      b.box('timber', 0.72, 0.6, 0.05, at(0, 0.32, 0.59))
      b.box('glass', 0.54, 0.44, 0.05, at(0, 0.32, 0.61))
      b.box('timber', 0.03, 0.44, 0.03, at(0, 0.32, 0.64))
      gableRoof(b, 0.95, 1.25, 0.72, 0.13)
    }
    if (floors >= 3) {
      // balcón de madera con flores, en el segundo piso
      b.frame = new THREE.Matrix4().multiplyMatrices(base, at(W * 0.2, STONE + FLOOR + 0.05, D / 2 + 0.36))
      b.box('wood', 2, 0.08, 0.72, at(0, 0, 0), 1)
      b.box('timber', 2.04, 0.06, 0.06, at(0, 0.62, 0.34))
      b.box('timber', 0.06, 0.62, 0.72, at(-1, 0.31, 0))
      b.box('timber', 0.06, 0.62, 0.72, at(1, 0.31, 0))
      for (let k = 0; k < 11; k++) b.box('timber', 0.035, 0.58, 0.035, at(-0.9 + k * 0.18, 0.3, 0.34))
      for (const k of [-0.65, -0.2, 0.25, 0.7]) {
        b.put('leaf', new THREE.IcosahedronGeometry(0.15, 0), at(k, 0.66, 0.36))
        b.put('apple', new THREE.IcosahedronGeometry(0.045, 0), at(k + 0.05, 0.78, 0.42))
      }
    }
  }
  b.frame = base
  b.box('stone', 0.55, 1.5, 0.55, at(W * 0.26, roofY + W * 0.34, D * 0.15), 1.2)
  b.box('cap', 0.66, 0.1, 0.66, at(W * 0.26, roofY + W * 0.34 + 0.78, D * 0.15))
  b.frame = new THREE.Matrix4()
}

function pot(b: Builder, x: number, y: number, z: number) {
  b.put('pot', new THREE.CylinderGeometry(0.2, 0.14, 0.26, 10).toNonIndexed(), at(x, y + 0.13, z))
  b.put('leaf', new THREE.IcosahedronGeometry(0.21, 0), at(x, y + 0.38, z))
}

/** Los elementos de la calle y la terraza. */
function buildStreet() {
  const b = new Builder()
  const rise = TERRACE_H
  const inner = STAIR_W / 2 + 0.05
  const span = 46

  // ── La terraza: dos bloques de piedra con la escalera entre ellos ──
  for (const s of [1, -1]) {
    b.box('stone', span, rise, TERRACE_LEN, at(s * (inner + span / 2), rise / 2, TERRACE_LEN / 2), 1.7)
    b.box('earth', span, 0.08, TERRACE_LEN, at(s * (inner + span / 2), rise + 0.04, TERRACE_LEN / 2), 3)
    b.box('cap', span, 0.2, 0.62, at(s * (inner + span / 2), rise + 0.1, 0.05), 1.5)
  }
  // contrafuertes: rompen la línea larga del muro
  for (const s of [1, -1]) {
    for (let k = 0; k < 6; k++) {
      const x = s * (8.5 + k * 7.2)
      b.box('stone', 0.85, rise - 0.15, 0.55, at(x, (rise - 0.15) / 2, -0.27), 1.5)
      b.box('cap', 1, 0.14, 0.7, at(x, rise - 0.1, -0.27))
      b.box('cap', 1.05, 0.28, 0.72, at(x, 0.14, -0.28), 1)
    }
  }
  // el suelo de arriba, entre las casas
  b.box('stone', STAIR_W + 0.1, rise, TERRACE_LEN - STAIR_LEN, at(0, rise / 2, STAIR_LEN + (TERRACE_LEN - STAIR_LEN) / 2), 1.7)

  // ── Escalera: sube por el hueco; los escalones llegan hasta el suelo ──
  const N = 17
  const stair = (from: number, length: number, up: boolean) => {
    for (let i = 0; i < N; i++) {
      const h = up ? ((i + 1) * rise) / N : ((N - i) * rise) / N
      b.box('step', STAIR_W, h, length / N + 0.01, at(0, h / 2, from + ((i + 0.5) * length) / N), 2.2)
    }
    const a = Math.atan2(rise, length)
    const len = Math.hypot(rise, length)
    for (const s of [1, -1]) {
      b.box('cap', 0.42, 0.62, len, at(s * (STAIR_W / 2 + 0.2), rise / 2 + 0.2, from + length / 2, up ? -a : a), 1.5)
    }
  }
  stair(0, STAIR_LEN, true)
  stair(TERRACE_LEN, DOWN_LEN, false)
  for (const s of [1, -1]) {
    b.box('stone', 0.62, 1.1, 0.62, at(s * (STAIR_W / 2 + 0.2), 0.55, -0.2), 1.2)
    b.box('cap', 0.74, 0.12, 0.74, at(s * (STAIR_W / 2 + 0.2), 1.14, -0.2))
    pot(b, s * (STAIR_W / 2 + 0.2), 1.2, -0.2)
    pot(b, s * (STAIR_W / 2 + 0.2), rise + 0.42, STAIR_LEN - 0.1)
  }

  // ── Casas ──
  TALL_HOUSES.forEach((h, i) => buildHouse(b, h, at(h.lx, h.onTerrace ? rise : 0, h.lz, 0, h.lrot), i + 1))

  // ── Toneles y una caja al pie del muro ──
  for (const [x, z] of [[-6.5, -0.65], [-7.3, -0.5]] as const) {
    b.put('wood', new THREE.CylinderGeometry(0.34, 0.34, 0.75, 12).toNonIndexed(), at(x, 0.38, z))
    b.box('timber', 0.72, 0.05, 0.72, at(x, 0.5, z))
  }
  b.box('wood', 1.3, 1.1, 0.25, at(-9.1, 0.55, -0.2), 1)
  b.box('timber', 1.35, 0.08, 0.28, at(-9.1, 0.72, -0.18))
  b.box('wood', 1.1, 0.55, 0.8, at(-10.6, 0.28, -0.6), 1)

  // ── El árbol frutal: manzanas sobre su copa ──
  const r = rng(77)
  const appleGeo = new THREE.IcosahedronGeometry(0.075, 1)
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2
    const up = r() * 1.2 - 0.25
    const rad = 1.9 * Math.sqrt(Math.max(0.1, 1 - up * up * 0.5))
    b.put('apple', appleGeo.clone(), at(APPLE_TREE.x + Math.cos(a) * rad, 3.1 + up * 1.5, APPLE_TREE.z + Math.sin(a) * rad))
  }

  // ── Un castillo a lo lejos, sobre una colina ──
  const cz = 165
  const hill = 11
  b.put('hill', new THREE.CylinderGeometry(20, 64, hill, 28, 1).toNonIndexed(), at(-3, hill / 2 - 0.5, cz))
  for (const [x, z, rad, h] of [[-3, cz, 5.5, 17], [-14, cz + 4, 3.6, 13], [8, cz + 6, 2.8, 22]] as const) {
    b.put('stone', new THREE.CylinderGeometry(rad, rad * 1.04, h, 18).toNonIndexed(), at(x, hill + h / 2, z))
    b.put('tiles', new THREE.ConeGeometry(rad * 1.28, rad * 1.5, 18).toNonIndexed(), at(x, hill + h + rad * 0.75, z))
  }
  b.box('stone', 32, 9, 3, at(-3, hill + 4.5, cz + 3), 3)
  b.box('timber', 0.18, 6, 0.18, at(8, hill + 22 + 2.8 * 1.5 + 2.6, cz + 6))
  b.box('flag', 3, 1.5, 0.08, at(9.6, hill + 22 + 2.8 * 1.5 + 4.6, cz + 6))

  // ── El portal de piedra, arriba de la escalera ──
  const PZ = TERRACE_LEN
  const pillarH = 2.9
  const arcR = 2.05
  for (const s of [1, -1]) {
    b.box('stone', 0.85, pillarH, 1.1, at(s * (arcR + 0.42), rise + pillarH / 2, PZ), 1.5)
    b.box('cap', 1.02, 0.16, 1.25, at(s * (arcR + 0.42), rise + 0.08, PZ))
    b.box('cap', 1.02, 0.14, 1.25, at(s * (arcR + 0.42), rise + pillarH, PZ))
    // el muro que lo une con las casas
    b.box('stone', 7.5, 2.5, 0.8, at(s * (arcR + 0.85 + 3.75), rise + 1.25, PZ), 1.6)
    b.box('cap', 7.5, 0.14, 0.95, at(s * (arcR + 0.85 + 3.75), rise + 2.55, PZ), 1.5)
  }
  // el arco: dovelas alrededor de un semicírculo
  const VOUSS = 13
  for (let i = 0; i < VOUSS; i++) {
    const a = ((i + 0.5) / VOUSS) * Math.PI
    const big = i === (VOUSS - 1) / 2
    b.box(i % 2 ? 'cap' : 'stone', (Math.PI * (arcR + 0.42)) / VOUSS + 0.03, big ? 1.05 : 0.84, 1.1, at(Math.cos(a) * (arcR + 0.42), rise + pillarH + Math.sin(a) * (arcR + 0.42), PZ, 0, 0, a - Math.PI / 2), 1.3)
  }
  // la piedra clave y una cornisa encima del arco
  b.box('cap', 0.7, 0.2, 1.3, at(0, rise + pillarH + arcR + 1, PZ))

  // ── La terraza: bordes del empedrado, faroles, un banco y macetas ──
  const topLen = TERRACE_LEN - STAIR_LEN
  for (const s of [1, -1]) {
    b.box('cap', 0.2, 0.06, topLen, at(s * (STAIR_W / 2 + 0.02), rise + 0.04, STAIR_LEN + topLen / 2), 1)
    for (const z of [STAIR_LEN + 3.2, STAIR_LEN + 9.5]) {
      const x = s * (STAIR_W / 2 + 0.75)
      b.box('timber', 0.1, 2, 0.1, at(x, rise + 1, z))
      b.box('timber', 0.34, 0.04, 0.34, at(x, rise + 2.02, z))
      b.box('lamp', 0.22, 0.32, 0.22, at(x, rise + 2.2, z))
      b.put('timber', new THREE.ConeGeometry(0.25, 0.2, 4).toNonIndexed(), at(x, rise + 2.46, z, 0, Math.PI / 4))
    }
  }
  b.box('wood', 1.5, 0.08, 0.42, at(STAIR_W / 2 + 0.55, rise + 0.46, STAIR_LEN + 6.1, 0, Math.PI / 2), 1)
  b.box('wood', 1.5, 0.42, 0.07, at(STAIR_W / 2 + 0.76, rise + 0.72, STAIR_LEN + 6.1, 0, Math.PI / 2), 1)
  b.box('timber', 0.08, 0.44, 0.38, at(STAIR_W / 2 + 0.55, rise + 0.22, STAIR_LEN + 5.45))
  b.box('timber', 0.08, 0.44, 0.38, at(STAIR_W / 2 + 0.55, rise + 0.22, STAIR_LEN + 6.75))
  for (const [x, z] of [[-2.55, 4.4], [-2.55, 6.9], [-2.55, 9.4], [2.6, 8.4], [3.3, 11.3]] as const) pot(b, x, rise + 0.05, STAIR_LEN + z - 2)
  return b.parts
}

/** El árbol frutal, al frente a la derecha (coordenadas de la calle). */
const APPLE_TREE = { x: -11.5, z: -3.4 }

/**
 * Una tira como la de abajo, pero que aparece de a poco: al principio es transparente
 * y el borde de la aparición es irregular (no una línea recta).
 */
function fadingRibbon(from: number, to: number, offset: number, width: number, y: number, tile: number, fade: number, across: number) {
  const STEP = 0.25
  const n = Math.ceil((to - from) / STEP) + 1
  const pos: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const p = new THREE.Vector3()
  const sd = new THREE.Vector3()
  const r = rng(58)
  const rough = Array.from({ length: across + 1 }, () => r())
  for (let i = 0; i < n; i++) {
    const s = Math.min(to, from + i * STEP)
    pathAt(s, p)
    sideAt(s, sd)
    for (let k = 0; k <= across; k++) {
      const u = k / across
      const o = offset + (u - 0.5) * width
      pos.push(p.x + sd.x * o, y, p.z + sd.z * o)
      uv.push((u * width) / tile, s / tile)
      // el centro llega antes que los costados, y cada columna con su propio retraso
      const late = Math.abs(u - 0.5) * 0.7 + rough[k] * 0.45
      const t = THREE.MathUtils.clamp((s - from) / fade - late * 0.55, 0, 1) / 0.45
      const a = THREE.MathUtils.smoothstep(Math.min(1, t), 0, 1)
      col.push(1, 1, 1, a)
    }
    if (i < n - 1) {
      for (let k = 0; k < across; k++) {
        const a = i * (across + 1) + k
        const b = a + across + 1
        idx.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Una tira que sigue la curva del sendero. */
function ribbon(from: number, to: number, offset: number, width: number, y: number, tile: number) {
  const STEP = 0.5
  const n = Math.ceil((to - from) / STEP) + 1
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const p = new THREE.Vector3()
  const sd = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    const s = Math.min(to, from + i * STEP)
    pathAt(s, p)
    sideAt(s, sd)
    for (const k of [0, 1]) {
      const o = offset + (k - 0.5) * width
      pos.push(p.x + sd.x * o, y, p.z + sd.z * o)
      uv.push((k * width) / tile, s / tile)
    }
    if (i < n - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Tierra con musgo alrededor de la calle: opaca en el centro, se funde con el pasto en los bordes. */
function makeEarthTexture() {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#7d6a48'
  ctx.fillRect(0, 0, S, S)
  const r = rng(31)
  const blot = (color: string, n: number, min: number, max: number) => {
    ctx.fillStyle = color
    for (let i = 0; i < n; i++) {
      ctx.beginPath()
      ctx.ellipse(r() * S, r() * S, min + r() * (max - min), min + r() * (max - min), r() * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  blot('rgba(96,104,52,0.35)', 150, 8, 38) // musgo
  blot('rgba(150,124,84,0.3)', 150, 5, 26) // tierra clara
  blot('rgba(58,46,30,0.22)', 800, 0.6, 2.2) // terrones
  blot('rgba(170,150,110,0.45)', 500, 0.6, 2) // piedritas
  // los bordes se funden con el pasto (irregulares, no en línea recta)
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 26; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    const a = (i / 26) * Math.PI * 2
    const big = 130 + r() * 70
    const k = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)))
    ctx.save()
    ctx.translate(S / 2 + (Math.cos(a) / k) * (S / 2 + 25), S / 2 + (Math.sin(a) / k) * (S / 2 + 25))
    ctx.scale(big, big)
    ctx.beginPath()
    ctx.arc(0, 0, 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** Matas secas salpicadas por la tierra, a los dos lados de la calle. */
function DryTufts() {
  const { scene } = useGLTF(TUFT_URL)
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true)
    const r = rng(404)
    const places: THREE.Matrix4[] = []
    const p = new THREE.Vector3()
    const sd = new THREE.Vector3()
    const mx = new THREE.Matrix4()
    while (places.length < 55) {
      const s = 53 + r() * 25.5
      const off = (r() < 0.5 ? -1 : 1) * (2.1 + r() * r() * 10)
      pathAt(s, p)
      sideAt(s, sd)
      const x = p.x + sd.x * off
      const z = p.z + sd.z * off
      if (Math.hypot(x - ELDER.x, z - ELDER.z) < 6.5) continue // (no tapan la escena con el anciano)
      if (BOXES.some((b) => inBox(b, x, z, 0.1)) || PLATES.some((q) => Math.hypot(q.x - x, q.z - z) < PLATE_R + 0.25)) continue
      places.push(new THREE.Matrix4().compose(P.set(x, 0, z), Q.setFromEuler(E.set(0, r() * 6.28, 0)), new THREE.Vector3().setScalar(0.3 + r() * 0.4)))
    }
    for (let i = 0, tries = 0; i < 18 && tries < 400; tries++) {
      const lx = (r() < 0.5 ? -1 : 1) * (STAIR_W / 2 + 0.5 + r() * 16)
      const lz = 0.6 + r() * (TERRACE_LEN - 1.5)
      if (Math.abs(lx) < 10 && lz < 1.2) continue
      const w = streetToWorld(lx, lz)
      if (CAMERA_BOXES.some((b) => inBox(b, w.x, w.z, 0.1))) continue
      places.push(new THREE.Matrix4().compose(P.set(w.x, TERRACE_H + 0.06, w.z), Q.setFromEuler(E.set(0, r() * 6.28, 0)), new THREE.Vector3().setScalar(0.28 + r() * 0.35)))
      i++
    }
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }[] = []
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const material = (m.material as THREE.MeshStandardMaterial).clone()
      material.color.set('#e8c56a')
      material.emissive.set('#6a5222')
      material.emissiveIntensity = 0.55
      out.push({ geometry: m.geometry, material, matrices: places.map((pl) => mx.multiplyMatrices(pl, m.matrixWorld).clone()) })
    })
    return out
  }, [scene])
  return (
    <>
      {parts.map((part, i) => (
        <instancedMesh
          key={i}
          args={[part.geometry, part.material, part.matrices.length]}
          ref={(el) => {
            if (!el) return
            part.matrices.forEach((m, k) => el.setMatrixAt(k, m))
            el.instanceMatrix.needsUpdate = true
            el.computeBoundingSphere()
          }}
        />
      ))}
    </>
  )
}

/** Dónde cuelga la hiedra del muro: x en la calle, ancho y cuánto baja desde arriba. */
const IVY = [
  [2.7, 1.2, 2.5], [3.8, 1.3, 3.1], [5.4, 1.4, 1.6], [7.2, 1.1, 2.3], [10.5, 2, 3.1], [12.2, 1.4, 2], [14.6, 1.5, 1.7], [18, 1.8, 2.8],
  [-2.9, 1.3, 2.9], [-4.2, 1.3, 2.1], [-5.9, 1.6, 2.6], [-8.3, 1.2, 1.5], [-12.5, 2.1, 3.1], [-14.4, 1.3, 2.2], [-16.6, 1.6, 1.8], [-20, 2, 2.9],
] as const

/** Unos pájaros que dan vueltas a lo lejos, sobre la terraza. */
function Birds() {
  const refs = useRef<(THREE.Group | null)[]>([])
  const wings = useRef<(THREE.Mesh | null)[]>([])
  const birds = useMemo(() => {
    const r = rng(12)
    return Array.from({ length: 6 }, () => ({ rad: 9 + r() * 8, h: 18 + r() * 7, speed: 0.13 + r() * 0.06, a: r() * 6.28, flap: 5 + r() * 2 }))
  }, [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#2a2c33', side: THREE.DoubleSide }), [])
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.42, 0.13)
    g.translate(0.21, 0, 0)
    return g
  }, [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    birds.forEach((bd, i) => {
      const a = bd.a + t * bd.speed
      const o = refs.current[i]
      if (o) {
        o.position.set(Math.cos(a) * bd.rad, bd.h + Math.sin(t * 0.4 + i) * 0.6, 34 + Math.sin(a) * bd.rad)
        o.rotation.y = -a
      }
      const k = Math.sin(t * bd.flap + i) * 0.7
      const l = wings.current[i * 2]
      const w = wings.current[i * 2 + 1]
      if (l) l.rotation.x = k
      if (w) w.rotation.x = -k
    })
  })
  return (
    <>
      {birds.map((_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el }}>
          <mesh ref={(el) => { wings.current[i * 2] = el }} geometry={geo} material={mat} rotation-order="YXZ" rotation-y={Math.PI / 2} />
          <mesh ref={(el) => { wings.current[i * 2 + 1] = el }} geometry={geo} material={mat} rotation-order="YXZ" rotation-y={-Math.PI / 2} />
        </group>
      ))}
    </>
  )
}

export function StreetScene() {
  const maps = useTexture(TEX)
  const tree = useGLTF(TREE_URL)

  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a4a5c', roughness: 0.3, metalness: 0.15, emissive: '#ffb45e', emissiveIntensity: 0 }), [])
  // las ventanas: oscuras mientras la sombra cubre la aldea; se encienden con los faroles
  useFrame((_, rawDt) => {
    const on = litFraction()
    glass.emissiveIntensity += (on * 1.8 - glass.emissiveIntensity) * damp(1.5, Math.min(rawDt, 0.05))
    lamp.emissiveIntensity = glass.emissiveIntensity * 2
  })

  const lamp = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9c493', roughness: 0.4, emissive: '#ffb45e', emissiveIntensity: 0 }), [])
  const meshes = useMemo(() => {
    const surf = (sf: Surface, color: string, bumpScale: number, roughness = 0.95, rotate = false) => {
      const place = (t: THREE.Texture) => {
        const c = t.clone()
        c.needsUpdate = true
        if (rotate) {
          c.center.set(0.5, 0.5)
          c.rotation = Math.PI / 2
        }
        return c
      }
      // (el relieve se calcula en cada píxel: solo donde más se nota)
      return new THREE.MeshStandardMaterial({ map: place(sf.map), bumpMap: bumpScale > 0 ? place(sf.bump) : null, bumpScale, color, roughness })
    }
    const flat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
    const stoneS = stoneWall()
    const dressedS = dressedStone()
    const woodS = oldWood()
    const mats: Record<MatKey, THREE.MeshStandardMaterial> = {
      plaster: surf(plasterSurface(), '#fff8ea', 0),
      stone: surf(stoneS, '#ffffff', 4),
      step: surf(dressedS, '#ddd2bd', 0),
      tiles: Object.assign(surf(clayTiles(), '#ffffff', 0, 0.85, true), { side: THREE.DoubleSide }),
      timber: surf(woodS, '#ffffff', 0, 0.9),
      glass,
      lamp,
      shutter: surf(woodS, '#a9c0cf', 0),
      door: surf(woodS, '#d0605a', 0),
      cap: surf(dressedS, '#efe5d2', 0),
      earth: flat('#62573a'),
      pot: flat('#a85d3a'),
      wood: surf(woodS, '#d8c4a8', 0),
      apple: new THREE.MeshStandardMaterial({ color: '#a82020', roughness: 0.5 }),
      leaf: flat('#3a5f2c'),
      cobble: flat('#b8a584'),
      flag: flat('#2d4770'),
      hill: new THREE.MeshStandardMaterial({ color: '#566f35', roughness: 1, flatShading: true }),
    }
    for (const m of Object.values(mats)) m.vertexColors = true
    const parts = buildStreet()
    return [...parts.entries()].map(([key, geos]) => {
      const m = new THREE.Mesh(mergeGeometries(geos), mats[key])
      m.castShadow = key !== 'glass'
      m.receiveShadow = true
      return m
    })
  }, [maps, glass, lamp])

  const cobble = useMemo(() => {
    const sf = cobbles()
    const hide = (m: THREE.Material) => (hideInVoid(m), m)
    const t = sf.map
    const bump = sf.bump
    return {
      // el empedrado: desde el bosque (donde terminan las piedras sueltas) hasta la escalera,
      // y otra vez pasando la puerta grande, hasta el final (un solo tipo de piedra en todo el camino)
      road: fadingRibbon(COBBLE_FROM, STAIR_Z0 + 0.1, 0, 3.3, 0.03, 1.7, 6, 12),
      roadAfter: fadingRibbon(STAIR_END - 0.2, PATH_END, 0, 3.3, 0.03, 1.7, 1.5, 12),
      left: fadingRibbon(COBBLE_FROM + 4, STAIR_Z0 + 0.1, 1.76, 0.24, 0.05, 1, 4, 1),
      right: fadingRibbon(COBBLE_FROM + 5, STAIR_Z0 + 0.1, -1.76, 0.24, 0.05, 1, 4, 1),
      roadMat: hide(new THREE.MeshStandardMaterial({ map: t, bumpMap: bump, bumpScale: 4, roughness: 0.9, vertexColors: true, transparent: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })),
      curbMat: hide(new THREE.MeshStandardMaterial({ color: '#a39678', roughness: 1, vertexColors: true, transparent: true, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 })),
      topMat: (() => {
        const scale = (src: THREE.Texture) => {
          const c = src.clone()
          c.repeat.set(STAIR_W / 1.7, (TERRACE_LEN - STAIR_LEN) / 1.7)
          c.needsUpdate = true
          return c
        }
        return new THREE.MeshStandardMaterial({ map: scale(t), bumpMap: scale(bump), bumpScale: 4, roughness: 0.9 })
      })(),
    }
  }, [])

  const earth = useMemo(() => {
    const from = STAIR_Z0 - 25
    const geo = ribbon(from, STAIR_Z0, 0, 26, 0.014, 26)
    // (la textura ocupa toda la tira una sola vez)
    const uv = geo.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setY(i, Math.floor(i / 2) / (uv.count / 2 - 1))
    const mat = new THREE.MeshStandardMaterial({ map: makeEarthTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })
    return { geo, mat }
  }, [])

  const ivy = useMemo(() => {
    const t = maps.vine.clone()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    t.repeat.set(1.5, 2.2)
    t.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, color: '#a8c878' })
  }, [maps])

  const origin = streetOrigin()
  return (
    <>
      <mesh geometry={earth.geo} material={earth.mat} renderOrder={1} receiveShadow />
      <DryTufts />
      <mesh geometry={cobble.road} material={cobble.roadMat} renderOrder={2} receiveShadow />
      <mesh geometry={cobble.roadAfter} material={cobble.roadMat} renderOrder={2} receiveShadow />
      <mesh geometry={cobble.left} material={cobble.curbMat} renderOrder={2} receiveShadow />
      <mesh geometry={cobble.right} material={cobble.curbMat} renderOrder={2} receiveShadow />
      <group position={[origin.x, 0, origin.z]} rotation-y={STREET_YAW}>
        {meshes.map((m, i) => (
          <primitive key={i} object={m} />
        ))}
        <mesh material={cobble.topMat} rotation-x={-Math.PI / 2} position={[0, TERRACE_H + 0.015, STAIR_LEN + (TERRACE_LEN - STAIR_LEN) / 2]} receiveShadow>
          <planeGeometry args={[STAIR_W, TERRACE_LEN - STAIR_LEN]} />
        </mesh>
        {IVY.map(([x, w, h], i) => (
          <mesh key={i} material={ivy} position={[x, TERRACE_H - h / 2 + 0.05, -0.04]} rotation-y={Math.PI} receiveShadow>
            <planeGeometry args={[w, h]} />
          </mesh>
        ))}
        <Birds />
        <Clone object={tree.scene} position={[APPLE_TREE.x, 0, APPLE_TREE.z]} scale={0.62} rotation-y={1.1} castShadow />
      </group>
    </>
  )
}
useTexture.preload(Object.values(TEX))
useGLTF.preload(TREE_URL)
