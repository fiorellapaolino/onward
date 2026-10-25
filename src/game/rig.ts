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

type Region = 'torso' | 'head' | 'arm' | 'leg'
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

export type BoneName =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | `${'upperArm' | 'foreArm' | 'hand' | 'thigh' | 'shin' | 'foot'}${'L' | 'R'}`

export type Rig = { mesh: THREE.SkinnedMesh; bones: Record<BoneName, THREE.Bone> }

const SOFTNESS = 0.035 // cuánto se mezclan los huesos vecinos (más = más suave)

/** Distancia de un punto a un segmento. */
function segDist(px: number, py: number, pz: number, a: V3, b: V3) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]
  const t = Math.min(1, Math.max(0, ((px - a[0]) * abx + (py - a[1]) * aby + (pz - a[2]) * abz) / (abx * abx + aby * aby + abz * abz)))
  const dx = px - (a[0] + abx * t), dy = py - (a[1] + aby * t), dz = pz - (a[2] + abz * t)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
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
      let ok = true
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
