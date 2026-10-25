import { useMemo } from 'react'
import * as THREE from 'three'
import { PATH_END, pathAt, rng, sideAt } from '../game/config'

/*
 * El suelo del bosque:
 * 1. Pasto con manchas de distintos verdes, tierra y hojas secas (textura generada).
 * 2. Un sendero de tierra por donde camina la elfa, con bordes irregulares.
 * Las texturas se dibujan con código, así no dependen de ningún archivo externo.
 */

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Pasto: manchas grandes y suaves + motas pequeñas. Se repite en mosaico. */
function makeGrassTexture() {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const r = rng(11)

  ctx.fillStyle = '#6f9444'
  ctx.fillRect(0, 0, S, S)

  // Dibuja una mancha también en los bordes opuestos para que el mosaico no tenga cortes
  const blob = (x: number, y: number, rad: number, color: string, alpha: number) => {
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad)
        g.addColorStop(0, color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.globalAlpha = alpha
        ctx.fillStyle = g
        ctx.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2)
      }
    }
  }

  const greens = ['#5c8238', '#7fa34d', '#8fae55', '#4f7533', '#9bb35c']
  for (let i = 0; i < 60; i++) blob(r() * S, r() * S, 40 + r() * 90, greens[i % greens.length], 0.55)
  // zonas más secas y algo de tierra
  for (let i = 0; i < 14; i++) blob(r() * S, r() * S, 25 + r() * 45, '#a3a25e', 0.45)
  for (let i = 0; i < 10; i++) blob(r() * S, r() * S, 15 + r() * 30, '#7d6a42', 0.35)

  // motas: briznas claras y oscuras
  ctx.globalAlpha = 1
  for (let i = 0; i < 9000; i++) {
    const x = r() * S
    const y = r() * S
    const light = r() < 0.5
    ctx.fillStyle = light ? `rgba(190,215,120,${0.15 + r() * 0.25})` : `rgba(40,70,25,${0.15 + r() * 0.25})`
    ctx.fillRect(x, y, 1 + r() * 1.5, 2 + r() * 3)
  }
  // hojitas caídas
  const leaves = ['#c08a3e', '#a8662f', '#d0b05a']
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = leaves[i % 3]
    ctx.globalAlpha = 0.6
    ctx.beginPath()
    ctx.ellipse(r() * S, r() * S, 2 + r() * 2, 1 + r(), r() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/** Tierra del sendero: marrón con piedritas, bordes que se funden con el pasto. */
function makeDirtTexture() {
  const W = 128
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const r = rng(5)

  // ruido suave repetible a lo largo del sendero (para el borde irregular)
  const edgeL = Array.from({ length: H }, (_, y) => Math.sin((y / H) * Math.PI * 2 * 3) * 0.05 + Math.sin((y / H) * Math.PI * 2 * 7 + 1) * 0.035)
  const edgeR = Array.from({ length: H }, (_, y) => Math.sin((y / H) * Math.PI * 2 * 4 + 2) * 0.05 + Math.sin((y / H) * Math.PI * 2 * 9) * 0.03)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1)
      const n = r()
      const a = smooth(0.08 + edgeL[y], 0.3 + edgeL[y], u) * (1 - smooth(0.7 - edgeR[y], 0.92 - edgeR[y], u))
      // centro un poco más claro (pisado)
      const center = 1 - Math.abs(u - 0.5) * 1.2
      const base = 120 + center * 28 + (n - 0.5) * 30
      const i = (y * W + x) * 4
      img.data[i] = base + 18
      img.data[i + 1] = base * 0.82
      img.data[i + 2] = base * 0.55
      img.data[i + 3] = Math.max(0, Math.min(255, a * 255 * (0.85 + n * 0.15)))
    }
  }
  ctx.putImageData(img, 0, 0)

  // piedritas
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(90,72,52,0.8)' : 'rgba(185,165,130,0.8)'
    ctx.beginPath()
    ctx.ellipse(W * (0.3 + r() * 0.4), r() * H, 0.8 + r() * 1.4, 0.6 + r(), r() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/** Cinta de geometría que sigue la curva del sendero. */
function makePathGeometry(from: number, to: number, width: number) {
  const STEP = 0.5
  const n = Math.ceil((to - from) / STEP) + 1
  const pos = new Float32Array(n * 2 * 3)
  const uv = new Float32Array(n * 2 * 2)
  const idx: number[] = []
  const p = new THREE.Vector3()
  const sd = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    const s = from + i * STEP
    pathAt(s, p)
    sideAt(s, sd)
    const w = width * (1 + Math.sin(s * 0.31) * 0.12) // el ancho varía un poco
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -0.5 : 0.5
      const j = i * 2 + k
      pos[j * 3] = p.x + sd.x * side * w
      pos[j * 3 + 1] = 0
      pos[j * 3 + 2] = p.z + sd.z * side * w
      uv[j * 2] = k
      uv[j * 2 + 1] = s / 9 // la textura se repite cada 9 metros
    }
    if (i < n - 1) {
      const a = i * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

const GROUND_W = 260
const GROUND_L = PATH_END + 220

export function Ground({ tintRef }: { tintRef: React.RefObject<THREE.MeshStandardMaterial | null> }) {
  const grass = useMemo(() => {
    const t = makeGrassTexture()
    t.repeat.set(GROUND_W / 7, GROUND_L / 7) // cada mosaico mide 7 metros
    return t
  }, [])
  const dirt = useMemo(makeDirtTexture, [])
  const pathGeo = useMemo(() => makePathGeometry(-15, PATH_END + 30, 3.2), [])

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, PATH_END / 2]}>
        <planeGeometry args={[GROUND_W, GROUND_L]} />
        <meshStandardMaterial ref={tintRef} map={grass} roughness={1} />
      </mesh>
      <mesh geometry={pathGeo} position-y={0.004} renderOrder={1}>
        <meshStandardMaterial map={dirt} transparent depthWrite={false} roughness={1} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </>
  )
}
