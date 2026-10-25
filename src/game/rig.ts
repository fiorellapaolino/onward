import * as THREE from 'three'

/*
 * Esqueleto automático para la elfa.
 *
 * El modelo no trae huesos (y Mixamo no lo acepta), así que se los ponemos aquí:
 * 1. Definimos las articulaciones (cadera, rodillas, hombros, codos, cabeza…)
 *    en las coordenadas del modelo original (mide 2 unidades, de -1 a 1).
 * 2. Cada vértice se "pega" a los huesos que tiene más cerca (pesos de piel).
 * 3. Creamos un SkinnedMesh: al girar un hueso, se mueve esa parte del cuerpo.
 *
 * Si se cambia de personaje, solo hay que ajustar las posiciones de JOINTS.
 */

type V3 = [number, number, number]

const JOINTS: Record<string, V3> = {
  hips: [0, -0.05, 0],
  spine: [0, 0.12, 0],
  chest: [0, 0.32, 0],
  neck: [0, 0.56, 0],
  head: [0, 0.66, 0.01],
  headTop: [0, 1.0, 0.02],
  // huesos "secundarios": se mueven solos con física (pelo de la espalda y falda)
  hairRoot: [0, 0.6, -0.1],
  hairTip: [0, 0.0, -0.16],
  skirtRoot: [0, 0.12, 0],
  skirtTip: [0, -0.1, 0],
}
for (const [s, sx] of [['L', 1], ['R', -1]] as const) {
  // L = su izquierda (+X), R = su derecha (-X). Ella mira hacia +Z.
  JOINTS['shoulder' + s] = [0.2 * sx, 0.47, -0.02]
  JOINTS['elbow' + s] = [0.36 * sx, 0.27, 0]
  JOINTS['wrist' + s] = [0.47 * sx, 0.12, 0.06]
  JOINTS['handEnd' + s] = [0.5 * sx, -0.03, 0.08]
  JOINTS['hip' + s] = [0.11 * sx, -0.1, 0.02]
  JOINTS['knee' + s] = [0.13 * sx, -0.5, 0]
  JOINTS['ankle' + s] = [0.14 * sx, -0.88, -0.02]
  JOINTS['toe' + s] = [0.14 * sx, -0.99, 0.13]
}

type Region = 'torso' | 'head' | 'arm' | 'leg' | 'secondary'
type BoneDef = { name: string; parent: string | null; from: string; to: string; radius: number; side: 0 | 1 | -1; region: Region }

const BONES: BoneDef[] = [
  { name: 'hips', parent: null, from: 'hips', to: 'spine', radius: 0.17, side: 0, region: 'torso' },
  { name: 'spine', parent: 'hips', from: 'spine', to: 'chest', radius: 0.15, side: 0, region: 'torso' },
  { name: 'chest', parent: 'spine', from: 'chest', to: 'neck', radius: 0.16, side: 0, region: 'torso' },
  { name: 'neck', parent: 'chest', from: 'neck', to: 'head', radius: 0.06, side: 0, region: 'head' },
  { name: 'head', parent: 'neck', from: 'head', to: 'headTop', radius: 0.15, side: 0, region: 'head' },
]
for (const [s, sx] of [['L', 1], ['R', -1]] as const) {
  BONES.push(
    { name: 'upperArm' + s, parent: 'chest', from: 'shoulder' + s, to: 'elbow' + s, radius: 0.055, side: sx, region: 'arm' },
    { name: 'foreArm' + s, parent: 'upperArm' + s, from: 'elbow' + s, to: 'wrist' + s, radius: 0.045, side: sx, region: 'arm' },
    { name: 'hand' + s, parent: 'foreArm' + s, from: 'wrist' + s, to: 'handEnd' + s, radius: 0.04, side: sx, region: 'arm' },
    { name: 'thigh' + s, parent: 'hips', from: 'hip' + s, to: 'knee' + s, radius: 0.09, side: sx, region: 'leg' },
    { name: 'shin' + s, parent: 'thigh' + s, from: 'knee' + s, to: 'ankle' + s, radius: 0.07, side: sx, region: 'leg' },
    { name: 'foot' + s, parent: 'shin' + s, from: 'ankle' + s, to: 'toe' + s, radius: 0.05, side: sx, region: 'leg' },
  )
}

BONES.push(
  { name: 'hairBack', parent: 'chest', from: 'hairRoot', to: 'hairTip', radius: 0, side: 0, region: 'secondary' },
  { name: 'skirtF', parent: 'hips', from: 'skirtRoot', to: 'skirtTip', radius: 0, side: 0, region: 'secondary' },
  { name: 'skirtB', parent: 'hips', from: 'skirtRoot', to: 'skirtTip', radius: 0, side: 0, region: 'secondary' },
  { name: 'skirtL', parent: 'hips', from: 'skirtRoot', to: 'skirtTip', radius: 0, side: 0, region: 'secondary' },
  { name: 'skirtR', parent: 'hips', from: 'skirtRoot', to: 'skirtTip', radius: 0, side: 0, region: 'secondary' },
)
const boneIndex = (name: string) => BONES.findIndex((b) => b.name === name)

export type BoneName =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | `${'upperArm' | 'foreArm' | 'hand' | 'thigh' | 'shin' | 'foot'}${'L' | 'R'}`
  | 'hairBack' | `skirt${'F' | 'B' | 'L' | 'R'}`

export type Rig = { mesh: THREE.SkinnedMesh; bones: Record<BoneName, THREE.Bone> }

const SOFTNESS = 0.035 // cuánto se mezclan los huesos vecinos (más = más suave)

/** Distancia de un punto a un segmento. */
function segDist(px: number, py: number, pz: number, a: V3, b: V3) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]
  const t = Math.min(1, Math.max(0, ((px - a[0]) * abx + (py - a[1]) * aby + (pz - a[2]) * abz) / (abx * abx + aby * aby + abz * abz)))
  const dx = px - (a[0] + abx * t), dy = py - (a[1] + aby * t), dz = pz - (a[2] + abz * t)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

const smoothstep = (e0: number, e1: number, t: number) => {
  const u = Math.min(1, Math.max(0, (t - e0) / (e1 - e0)))
  return u * u * (3 - 2 * u)
}
const HAIR = boneIndex('hairBack')
const SKIRT = ['skirtF', 'skirtB', 'skirtL', 'skirtR'].map(boneIndex)

/**
 * Pelo de la espalda y falda: se quedan con los huesos principales que ya tenían
 * (cuanto más arriba, más) y se reparten el resto con su hueso secundario
 * (cuanto más abajo, más se balancean).
 */
function applySecondary(v: number, x: number, y: number, z: number, idx: Uint16Array, w: Float32Array) {
  const o = v * 4
  const r = Math.sqrt(x * x + z * z) + 1e-9
  const keep = (slots: number, scale: number) => {
    let sum = 0
    for (let k = 0; k < slots; k++) sum += w[o + k]
    for (let k = 0; k < 4; k++) w[o + k] = k < slots && sum > 0 ? (w[o + k] / sum) * scale : 0
  }
  if (Math.abs(x) < 0.2 && z < -0.07 && y > 0 && y < 0.62) {
    const ws = 0.9 * smoothstep(0, 0.45, (0.62 - y) / 0.62)
    keep(3, 1 - ws)
    idx[o + 3] = HAIR
    w[o + 3] = ws
  } else if (y > -0.12 && y < 0.12 && r > 0.14 && Math.abs(x) < 0.32) {
    const ws = 0.95 * smoothstep(0, 0.9, (0.12 - y) / 0.24)
    // reparto entre delante/detrás/izquierda/derecha según hacia dónde mira ese trozo de falda
    const c = [Math.max(z / r, 0), Math.max(-z / r, 0), Math.max(x / r, 0), Math.max(-x / r, 0)]
    const order = [0, 1, 2, 3].sort((a, b) => c[b] - c[a])
    const sum = c[order[0]] + c[order[1]] || 1
    keep(2, 1 - ws)
    idx[o + 2] = SKIRT[order[0]]
    w[o + 2] = (ws * c[order[0]]) / sum
    idx[o + 3] = SKIRT[order[1]]
    w[o + 3] = (ws * c[order[1]]) / sum
  }
}

/** Convierte la malla de la elfa en una malla con esqueleto. */
export function rigElf(source: THREE.Mesh): Rig {
  const geo = source.geometry
  const pos = geo.getAttribute('position')
  const n = pos.count

  // ── Pesos de piel: cada vértice a sus 4 huesos más cercanos ──
  const skinIndex = new Uint16Array(n * 4)
  const skinWeight = new Float32Array(n * 4)
  const w = new Float32Array(BONES.length)
  for (let v = 0; v < n; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v)
    for (let b = 0; b < BONES.length; b++) {
      const bd = BONES[b]
      let ok = bd.region !== 'secondary'
      if (bd.side !== 0) ok &&= Math.sign(x) === bd.side || Math.abs(x) < 0.02
      if (bd.region === 'arm') ok &&= Math.abs(x) > 0.17 && y < 0.56
      if (bd.region === 'leg') ok &&= y < 0.02
      if (bd.region === 'head') ok &&= y > 0.5
      w[b] = ok ? Math.exp(-Math.max(0, segDist(x, y, z, JOINTS[bd.from], JOINTS[bd.to]) - bd.radius) / SOFTNESS) : 0
    }
    // los 4 mayores
    let total = 0
    for (let k = 0; k < 4; k++) {
      let best = -1
      for (let b = 0; b < BONES.length; b++) if (w[b] > 0 && (best < 0 || w[b] > w[best])) best = b
      if (best < 0) {
        skinIndex[v * 4 + k] = 0
        skinWeight[v * 4 + k] = 0
        continue
      }
      skinIndex[v * 4 + k] = best
      skinWeight[v * 4 + k] = w[best]
      total += w[best]
      w[best] = 0
    }
    if (total > 0) for (let k = 0; k < 4; k++) skinWeight[v * 4 + k] /= total
    else skinWeight[v * 4] = 1 // por si acaso: a la cadera

    applySecondary(v, x, y, z, skinIndex, skinWeight)
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4))

  // ── Huesos ──
  const bones = {} as Record<BoneName, THREE.Bone>
  const list: THREE.Bone[] = []
  for (const bd of BONES) {
    const bone = new THREE.Bone()
    bone.name = bd.name
    const p = JOINTS[bd.from]
    if (bd.parent) {
      const pp = JOINTS[BONES.find((x) => x.name === bd.parent)!.from]
      bone.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2])
      bones[bd.parent as BoneName].add(bone)
    } else {
      bone.position.set(p[0], p[1], p[2])
    }
    bones[bd.name as BoneName] = bone
    list.push(bone)
  }

  const mesh = new THREE.SkinnedMesh(geo, source.material)
  mesh.add(bones.hips)
  mesh.bind(new THREE.Skeleton(list))
  mesh.frustumCulled = false
  return { mesh, bones }
}
