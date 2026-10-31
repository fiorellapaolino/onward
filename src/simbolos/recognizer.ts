/*
 * Reconocedor de símbolos dibujados con los pasos de la elfa.
 * Es el algoritmo "$1 Unistroke Recognizer" (Wobbrock, Wilson y Li, 2007):
 *   1. se reparte el trazo en 64 puntos a la misma distancia
 *   2. se gira para que empiece "mirando" siempre hacia el mismo lado
 *   3. se escala a un cuadrado y se centra
 *   4. se compara con cada plantilla y gana la más parecida
 * Las plantillas se generan con código (triángulo, círculo, espiral, zigzag…),
 * empezando desde distintos puntos y en los dos sentidos, porque la jugadora puede
 * empezar a caminar el símbolo desde cualquier esquina.
 */

export type Pt = { x: number; z: number }
export type SymbolName = 'triangle' | 'circle' | 'spiral' | 'zigzag' | 'square' | 'line'
/** name: el más parecido · score: su nota (0..1) · second: la nota del mejor símbolo distinto */
export type Result = { name: SymbolName | null; score: number; second: number }

const N = 64
const SIZE = 250
const HALF_DIAG = 0.5 * Math.sqrt(2 * SIZE * SIZE)
const ANGLE_RANGE = (45 * Math.PI) / 180
const ANGLE_STEP = (2 * Math.PI) / 180
const PHI = 0.5 * (-1 + Math.sqrt(5))

type P = { x: number; y: number }

function pathLength(pts: P[]) {
  let d = 0
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return d
}

function resample(input: P[], n: number): P[] {
  const pts = input.map((p) => ({ ...p }))
  const I = pathLength(pts) / (n - 1)
  let D = 0
  const out: P[] = [{ ...pts[0] }]
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (D + d >= I && d > 0) {
      const t = (I - D) / d
      const q = { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y) }
      out.push(q)
      pts.splice(i, 0, q)
      D = 0
    } else D += d
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] })
  return out.slice(0, n)
}

function centroid(pts: P[]): P {
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  return { x: x / pts.length, y: y / pts.length }
}

function rotateBy(pts: P[], a: number): P[] {
  const c = centroid(pts)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return pts.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }))
}

function scaleToSquare(pts: P[]): P[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const w = Math.max(maxX - minX, 1e-6)
  const h = Math.max(maxY - minY, 1e-6)
  return pts.map((p) => ({ x: (p.x * SIZE) / w, y: (p.y * SIZE) / h }))
}

function translateToOrigin(pts: P[]): P[] {
  const c = centroid(pts)
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }))
}

function normalize(raw: P[]): P[] {
  let pts = resample(raw, N)
  const c = centroid(pts)
  const angle = Math.atan2(c.y - pts[0].y, c.x - pts[0].x)
  pts = rotateBy(pts, -angle)
  pts = scaleToSquare(pts)
  return translateToOrigin(pts)
}

function pathDistance(a: P[], b: P[]) {
  let d = 0
  for (let i = 0; i < a.length; i++) d += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)
  return d / a.length
}

function distanceAtAngle(pts: P[], t: P[], a: number) {
  return pathDistance(rotateBy(pts, a), t)
}

function distanceAtBestAngle(pts: P[], t: P[]) {
  let a = -ANGLE_RANGE
  let b = ANGLE_RANGE
  let x1 = PHI * a + (1 - PHI) * b
  let f1 = distanceAtAngle(pts, t, x1)
  let x2 = (1 - PHI) * a + PHI * b
  let f2 = distanceAtAngle(pts, t, x2)
  while (Math.abs(b - a) > ANGLE_STEP) {
    if (f1 < f2) {
      b = x2
      x2 = x1
      f2 = f1
      x1 = PHI * a + (1 - PHI) * b
      f1 = distanceAtAngle(pts, t, x1)
    } else {
      a = x1
      x1 = x2
      f1 = f2
      x2 = (1 - PHI) * a + PHI * b
      f2 = distanceAtAngle(pts, t, x2)
    }
  }
  return Math.min(f1, f2)
}

// ── Plantillas ──────────────────────────────────────────────────

/** Un polígono cerrado, empezando en el vértice `start` y en el sentido `dir` (1 o -1). */
function polygon(sides: number, start: number, dir: number, rot = Math.PI / 2): P[] {
  const v: P[] = []
  for (let i = 0; i <= sides; i++) {
    const k = (start + dir * i + sides * 2) % sides
    const a = rot + (k / sides) * Math.PI * 2
    v.push({ x: Math.cos(a), y: Math.sin(a) })
  }
  // con puntos intermedios en cada lado (para que se parezca a un trazo caminado)
  const out: P[] = []
  for (let i = 0; i < v.length - 1; i++) {
    for (let s = 0; s < 10; s++) {
      const t = s / 10
      out.push({ x: v[i].x + (v[i + 1].x - v[i].x) * t, y: v[i].y + (v[i + 1].y - v[i].y) * t })
    }
  }
  out.push(v[v.length - 1])
  return out
}

function circle(startA: number, dir: number): P[] {
  const out: P[] = []
  for (let i = 0; i <= 48; i++) {
    const a = startA + dir * (i / 48) * Math.PI * 2
    out.push({ x: Math.cos(a), y: Math.sin(a) })
  }
  return out
}

function spiral(dir: number, inward: boolean): P[] {
  const out: P[] = []
  for (let i = 0; i <= 80; i++) {
    const t = i / 80
    const r = inward ? 1 - t * 0.85 : 0.15 + t * 0.85
    const a = dir * t * Math.PI * 4.5
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
  }
  return out
}

function zigzag(): P[] {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 0 },
    { x: 3, y: 1 },
    { x: 4, y: 0 },
  ]
}

type Template = { name: SymbolName; pts: P[] }
const TEMPLATES: Template[] = []
const add = (name: SymbolName, raw: P[]) => TEMPLATES.push({ name, pts: normalize(raw) })
for (const dir of [1, -1]) {
  for (let s = 0; s < 3; s++) add('triangle', polygon(3, s, dir))
  for (let s = 0; s < 4; s++) add('square', polygon(4, s, dir, Math.PI / 4))
  for (let s = 0; s < 4; s++) add('circle', circle((s * Math.PI) / 2, dir))
  add('spiral', spiral(dir, true))
  add('spiral', spiral(dir, false))
}
add('zigzag', zigzag())
add('zigzag', zigzag().reverse())

/**
 * Reconoce un trazo (puntos en el suelo, en metros).
 * Devuelve el símbolo más parecido y una nota de 0 a 1 (1 = idéntico).
 */
export function recognize(stroke: Pt[]): Result {
  if (stroke.length < 8) return { name: null, score: 0, second: 0 }
  const raw: P[] = stroke.map((p) => ({ x: p.x, y: p.z }))
  // una línea casi recta no se puede escalar a un cuadrado: se detecta aparte
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of raw) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const w = maxX - minX
  const h = maxY - minY
  if (Math.min(w, h) / Math.max(w, h, 1e-6) < 0.22) return { name: 'line', score: 1, second: 0 }

  const pts = normalize(raw)
  // la mejor distancia de cada símbolo
  const byName = new Map<SymbolName, number>()
  for (const t of TEMPLATES) {
    const d = distanceAtBestAngle(pts, t.pts)
    if (d < (byName.get(t.name) ?? Infinity)) byName.set(t.name, d)
  }
  const ranked = [...byName.entries()].sort((a, b) => a[1] - b[1])
  const score = (d: number) => 1 - d / HALF_DIAG
  return { name: ranked[0][0], score: score(ranked[0][1]), second: ranked[1] ? score(ranked[1][1]) : 0 }
}

/**
 * Redondez de un lazo cerrado (cociente isoperimétrico 4πA / P²):
 * círculo = 1 · cuadrado ≈ 0,79 · triángulo equilátero ≈ 0,60 · una línea = 0.
 * Sirve para no confundir un triángulo caminado (esquinas redondeadas) con un círculo.
 */
export function roundness(pts: Pt[]) {
  let area = 0
  let per = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    area += a.x * b.z - b.x * a.z
    per += Math.hypot(b.x - a.x, b.z - a.z)
  }
  return per > 0 ? (4 * Math.PI * Math.abs(area / 2)) / (per * per) : 0
}
