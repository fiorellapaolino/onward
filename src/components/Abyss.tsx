import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clamp01, heightAt, natureUrl, pathAt } from '../game/config'
import { game } from '../game/state'
import { CLOSE_TIME, MINERAL, STONES, VOID_FAR, VOID_HALF, VOID_NEAR, stoneAppearAt, stoneFallTime } from '../game/altar'
import { crack, rumble } from '../game/sfx'
import { useGlowTexture } from './TheLight'
import { voidUniforms } from './instancing'

/*
 * El vacío del plano negativo, como un lugar de verdad (no un plano pintado):
 *   - un pozo: el suelo se esconde en esa zona (ver hideInVoid) y debajo hay paredes de roca que bajan 12 m
 *     y se pierden en la oscuridad, con niebla y una luz fría en el fondo. Lo que cae, se ve caer.
 *   - se abre como una grieta (desde el medio hacia los costados) con un retumbo, la cámara tiembla
 *     y la tierra del borde cae adentro; al volver a su cuerpo, se cierra.
 *   - las piedras flotantes son rocas (arriba plana, abajo rocosa), suben del fondo, se mecen y sueltan
 *     tierra; al romperse se parten en pedazos que caen girando, con polvo.
 */
const PIT_D = 20
const LEN = VOID_NEAR - VOID_FAR
const CHUNKS = 140
const DUSTS = 16
const RIM = 52
const easeOutBack = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2)
const easeOutCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3
const IRON_NEG = new THREE.MeshBasicMaterial({ color: '#c8f4ff', toneMapped: false, fog: false })
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false })
const M4 = new THREE.Matrix4()
const Q = new THREE.Quaternion()
const E = new THREE.Euler()
const V = new THREE.Vector3()
const S3 = new THREE.Vector3()

const wallVertex = /* glsl */ `
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const wallFragment = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uTop;
  uniform float uDepth;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec3 n = abs(normalize(vN));
    vec2 uv = n.x > n.z ? vW.zy : vW.xy;
    if (n.y > 0.5) uv = vW.xz;
    vec3 rock = texture2D(uTex, uv * 0.35).rgb;
    float depth = clamp((uTop - vW.y) / uDepth, 0.0, 1.0);
    // vetas de roca, más oscura cuanto más hondo
    float strata = 0.82 + 0.18 * sin(vW.y * 5.0 + rock.r * 7.0);
    vec3 col = rock * 0.6 * strata * exp(-depth * 7.0);
    // muy abajo, apenas una luz fría entre la niebla; el fondo no se llega a ver (es oscuridad)
    col += vec3(0.008, 0.02, 0.035) * smoothstep(0.25, 0.7, depth) * (1.0 - smoothstep(0.7, 1.0, depth));
    col = mix(col, vec3(0.0, 0.004, 0.01), smoothstep(0.55, 1.0, depth));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

/** La primera malla de un modelo (geometría y material). */
function firstMesh(scene: THREE.Object3D) {
  let found: THREE.Mesh | null = null
  scene.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh
  })
  return found as unknown as THREE.Mesh
}

export function Abyss() {
  const glowTex = useGlowTexture()
  const rockMesh = firstMesh(useGLTF(natureUrl('Rock_Medium_1')).scene)
  const slabMesh = firstMesh(useGLTF(natureUrl('RockPath_Round_Wide')).scene)
  // copias propias de los materiales: los originales los comparte el bosque y se esconden dentro del pozo
  // (ver hideInVoid); estas rocas tienen que verse justamente ahí
  const own = (m: THREE.Material) => {
    const c = m.clone()
    c.onBeforeCompile = () => {}
    c.customProgramCacheKey = THREE.Material.prototype.customProgramCacheKey
    c.userData = {}
    return c
  }
  const rockMat = useMemo(() => own(rockMesh.material as THREE.Material), [rockMesh])
  const slabMat = useMemo(() => own(slabMesh.material as THREE.Material), [slabMesh])

  const at = useMemo(() => {
    const mid = (VOID_NEAR + VOID_FAR) / 2
    return { x: pathAt(mid, new THREE.Vector3()).x, y: Math.max(heightAt(VOID_NEAR), heightAt(VOID_FAR)) - 0.02, z: mid }
  }, [])

  const wallMat = useMemo(() => {
    const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}models/nature/Rocks_Diffuse.jpg`)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    return new THREE.ShaderMaterial({
      vertexShader: wallVertex,
      fragmentShader: wallFragment,
      uniforms: { uTex: { value: tex }, uTop: { value: at.y }, uDepth: { value: PIT_D } },
      side: THREE.BackSide,
    })
  }, [at])
  // una caja abierta arriba: las paredes y el fondo del pozo
  const pitGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.translate(0, -0.5, 0)
    return g
  }, [])
  const pitMats = useMemo(() => [wallMat, wallMat, HIDDEN, wallMat, wallMat, wallMat], [wallMat])

  const root = useRef<THREE.Group>(null!)
  const pit = useRef<THREE.Mesh>(null!)
  const pitLight = useRef<THREE.PointLight>(null!)
  const mists = useRef<THREE.Group>(null!)
  const rim = useRef<THREE.InstancedMesh>(null!)
  const stones = useRef<THREE.Group>(null!)
  const chunks = useRef<THREE.InstancedMesh>(null!)
  const dusts = useRef<THREE.Group>(null!)
  const mineral = useRef<THREE.Group>(null!)

  const mistMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#5d7c95', transparent: true, opacity: 0.2, depthWrite: false, fog: false }), [glowTex])
  const flashMats = useMemo(() => STONES.map(() => new THREE.SpriteMaterial({ map: glowTex, color: '#cfe6ff', transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending })), [glowTex])
  const dustMats = useMemo(() => Array.from({ length: DUSTS }, () => new THREE.SpriteMaterial({ map: glowTex, color: '#8d8a86', transparent: true, opacity: 0, depthWrite: false, fog: false })), [glowTex])
  const ironGlow = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#8fe3ff', transparent: true, opacity: 0.9, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending }), [glowTex])

  // el borde roto del pozo: piedritas a lo largo de los dos bordes
  const rimSpots = useMemo(
    () =>
      Array.from({ length: RIM }, (_, i) => {
        const side = i % 2 ? 1 : -1
        const u = ((i * 0.618) % 1) * 2 - 1
        return { side, u, dz: ((i * 0.37) % 1) * 0.3, s: 0.035 + ((i * 0.53) % 1) * 0.05, rot: i * 2.3 }
      }),
    [],
  )

  // pedazos de roca y tierra que caen, y nubes de polvo
  const sim = useMemo(
    () => ({
      p: new Float32Array(CHUNKS * 3),
      v: new Float32Array(CHUNKS * 3),
      spin: new Float32Array(CHUNKS * 2),
      size: new Float32Array(CHUNKS),
      life: new Float32Array(CHUNKS),
      next: 0,
      dust: Array.from({ length: DUSTS }, () => ({ x: 0, y: 0, z: 0, s: 0, life: 0 })),
      nextDust: 0,
    }),
    [],
  )
  const spawn = (x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life = 2.5) => {
    const i = sim.next
    sim.next = (sim.next + 1) % CHUNKS
    sim.p.set([x, y, z], i * 3)
    sim.v.set([vx, vy, vz], i * 3)
    sim.spin.set([(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8], i * 2)
    sim.size[i] = size
    sim.life[i] = life
  }
  const puff = (x: number, y: number, z: number, s: number) => {
    const d = sim.dust[sim.nextDust]
    sim.nextDust = (sim.nextDust + 1) % DUSTS
    Object.assign(d, { x, y, z, s, life: 1 })
  }

  const fx = useRef({ closing: false, prev: 0, left: 0, at: -99, shown: STONES.map(() => false), broke: STONES.map(() => false), drip: STONES.map(() => 0), arrived: STONES.map(() => false) })

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = game
    const t = g.time
    const f = fx.current
    if (g.plane !== f.prev) {
      f.left = f.prev
      f.prev = g.plane
      f.at = t
      if (g.plane === 2) {
        // se abre la tierra
        rumble(1.8)
        g.shake = 1
        f.broke.fill(false)
        f.arrived.fill(false)
      }
    }
    const since = t - f.at
    const negative = g.plane === 2
    // se cierra mientras todavía está en su yo oscuro (closeAt); si igual sale antes, termina de cerrarse
    const closingNow = negative && g.closeAt >= 0
    if (closingNow && !f.closing) {
      rumble(1.4, 0.7)
      g.shake = Math.max(g.shake, 0.6)
    }
    f.closing = closingNow
    const shut = closingNow ? clamp01((t - g.closeAt) / CLOSE_TIME) : 0
    const close = negative ? 1 - shut : f.left === 2 ? Math.max(0, 1 - since / 0.4) * 0.3 : 0
    const open = negative ? easeOutCubic(since / 1.1) * (1 - shut * shut) : close
    g.shake = Math.max(0, g.shake - dt * 0.9)
    root.current.visible = negative || close > 0 || sim.life.some((l) => l > 0)
    voidUniforms.uVoidOn.value = negative || close > 0 ? 1 : 0
    const hx = VOID_HALF * Math.max(0.001, open)
    const hz = (LEN / 2) * (0.2 + 0.8 * open)
    // (el suelo, el empedrado y la hierba se esconden justo donde ya se abrió: todo lo que está a menos de 60 cm del suelo)
    voidUniforms.uVoid.value.set(at.z + hz, at.z - hz, at.x, hx)
    voidUniforms.uVoidTop.value = at.y + 0.62
    if (!root.current.visible) return

    pit.current.visible = open > 0.001
    pit.current.position.set(at.x, at.y, at.z)
    pit.current.scale.set(hx * 2, PIT_D, hz * 2)
    pitLight.current.intensity = 9 * open
    mists.current.children.forEach((m, i) => {
      const k = (t * 0.05 + i * 0.21) % 1
      m.position.set(at.x + Math.sin(t * 0.1 + i * 2) * hx * 0.6, at.y - 2.5 - i * 0.8, at.z + Math.cos(t * 0.08 + i) * hz * 0.5)
      m.scale.set(6 + k * 3, 2.5, 1)
    })
    mistMat.opacity = 0.2 * open

    // el borde roto
    rimSpots.forEach((r, i) => {
      V.set(at.x + r.u * hx, at.y + 0.01, at.z + r.side * (hz - r.dz))
      E.set(r.rot, r.rot * 0.7, 0)
      Q.setFromEuler(E)
      S3.setScalar(Math.max(0.0001, r.s * open))
      rim.current.setMatrixAt(i, M4.compose(V, Q, S3))
    })
    rim.current.instanceMatrix.needsUpdate = true

    // mientras se abre, la tierra del borde se desmorona hacia adentro
    if (negative && (since < 1.3 || (closingNow && shut < 0.8))) {
      const n = Math.random() < dt * 40 ? 1 : 0
      for (let k = 0; k < n; k++) {
        const side = Math.random() < 0.5 ? 1 : -1
        spawn(at.x + (Math.random() * 2 - 1) * hx, at.y + 0.02, at.z + side * hz, 0, Math.random() * 0.6, -side * (0.3 + Math.random() * 0.5), 0.02 + Math.random() * 0.03)
      }
      if (Math.random() < dt * 6) puff(at.x + (Math.random() * 2 - 1) * hx * 0.7, at.y + 0.1, at.z + (Math.random() < 0.5 ? 1 : -1) * hz, 1.2)
    }

    // ── las piedras flotantes ──
    STONES.forEach((st, i) => {
      const s = stones.current.children[i]
      const base = heightAt(st.z) - 0.05
      if (negative) {
        const k = (t - stoneAppearAt(i)) / 0.55
        const rise = easeOutBack(k)
        const left = stoneFallTime(i) - t // (segundos hasta que cae)
        const broken = left <= 0
        if (broken && !f.broke[i] && k > 0) {
          // se parte: pedazos que caen girando, polvo y un temblor
          f.broke[i] = true
          for (let c = 0; c < 9; c++) {
            const a = Math.random() * Math.PI * 2
            spawn(st.x + Math.cos(a) * 0.25, base, st.z + Math.sin(a) * 0.25, Math.cos(a) * (0.8 + Math.random()), 0.6 + Math.random() * 1.2, Math.sin(a) * (0.8 + Math.random()), 0.03 + Math.random() * 0.045, 3)
          }
          puff(st.x, base + 0.1, st.z, 1.4)
          puff(st.x, base - 0.3, st.z, 1.0)
          g.shake = Math.max(g.shake, 0.3)
          crack(0.6)
        }
        if (k > 0.55 && !f.arrived[i]) {
          // llegó desde el fondo: suelta tierra y un poco de polvo
          f.arrived[i] = true
          puff(st.x, base - 0.25, st.z, 0.9)
          for (let c = 0; c < 4; c++) spawn(st.x + (Math.random() - 0.5) * 0.6, base - 0.2, st.z + (Math.random() - 0.5) * 0.6, 0, -0.2, 0, 0.015 + Math.random() * 0.02)
        }
        const shake = left > 0 && left < 0.6 ? (1 - left / 0.6) * 0.06 * Math.sin(t * 60) : 0
        const gone = broken ? clamp01(-left / 0.35) : 0 // (los pedazos ya cayeron: lo que queda se hunde rápido)
        const bob = k > 1 && !broken ? Math.sin(t * 1.4 + i) * 0.012 : 0
        s.visible = k > 0 && gone < 1
        s.position.set(st.x + shake, base - (1 - rise) * 5 - gone * 1.5 + bob, st.z)
        s.rotation.set(Math.sin(t * 0.9 + i) * 0.02 + gone, i * 1.3 + (1 - clamp01(k)) * 2.5, Math.cos(t * 0.8 + i) * 0.02)
        s.scale.setScalar(Math.max(0.001, 1 - gone))
        flashMats[i].opacity = k > 0.3 && k < 2 ? Math.max(0, 1 - (k - 0.3) / 1.2) * 0.6 : 0
        // gotea tierra de abajo (más cuando está por romperse)
        if (s.visible && !broken && k > 1 && t > f.drip[i]) {
          f.drip[i] = t + (left < 0.6 ? 0.08 : 0.5 + Math.random() * 0.9)
          spawn(st.x + (Math.random() - 0.5) * 0.4, base - 0.35, st.z + (Math.random() - 0.5) * 0.4, 0, -0.1, 0, 0.012 + Math.random() * 0.018)
        }
        f.shown[i] = s.visible && !broken
        if (closingNow && f.shown[i]) {
          // la grieta se cierra: las que quedaban se hunden en la oscuridad, inclinándose
          const k2 = shut * shut
          s.position.y -= k2 * 4.5
          s.rotation.x += k2 * 0.8 * (i % 2 ? 1 : -1)
          if (Math.random() < dt * 8) spawn(st.x + (Math.random() - 0.5) * 0.5, s.position.y - 0.3, st.z + (Math.random() - 0.5) * 0.5, 0, -0.3, 0, 0.015 + Math.random() * 0.02)
        }
      } else {
        // al cerrarse la grieta, las que quedaban se hunden
        s.visible = f.shown[i] && close > 0
        s.position.y = base - (1 - close) * 4
        flashMats[i].opacity = 0
      }
    })

    // ── el hierro de estrella: aparece al final, creciendo con su brillo ──
    const got = g.ironAt >= 0 ? clamp01((t - g.ironAt) / 0.8) : 0
    const show = negative ? easeOutBack((since - 1.6) / 0.7) : g.ironAt < 0 ? close : 0
    mineral.current.visible = got < 1 && show > 0
    mineral.current.position.set(MINERAL.x, heightAt(MINERAL.z) + 0.55 + Math.sin(t * 1.8) * 0.06 + got * 0.6, MINERAL.z)
    mineral.current.rotation.y = t * 0.8 + (1 - clamp01(show)) * 4
    mineral.current.scale.setScalar(Math.max(0.001, (1 - got) * show))

    // ── pedazos que caen (con gravedad) y polvo ──
    for (let i = 0; i < CHUNKS; i++) {
      let life = sim.life[i]
      if (life <= 0) {
        chunks.current.setMatrixAt(i, M4.makeScale(0, 0, 0))
        continue
      }
      life -= dt
      sim.life[i] = life
      sim.v[i * 3 + 1] -= 9.8 * dt
      sim.p[i * 3] += sim.v[i * 3] * dt
      sim.p[i * 3 + 1] += sim.v[i * 3 + 1] * dt
      sim.p[i * 3 + 2] += sim.v[i * 3 + 2] * dt
      V.set(sim.p[i * 3], sim.p[i * 3 + 1], sim.p[i * 3 + 2])
      E.set(t * sim.spin[i * 2], t * sim.spin[i * 2 + 1], 0)
      Q.setFromEuler(E)
      S3.setScalar(sim.size[i] * Math.min(1, life * 2))
      chunks.current.setMatrixAt(i, M4.compose(V, Q, S3))
    }
    chunks.current.instanceMatrix.needsUpdate = true
    dusts.current.children.forEach((d, i) => {
      const p = sim.dust[i]
      if (p.life > 0) p.life -= dt / 1.1
      dustMats[i].opacity = Math.max(0, p.life) * 0.45
      d.visible = p.life > 0
      d.position.set(p.x, p.y + (1 - p.life) * 0.3, p.z)
      d.scale.setScalar(p.s * (0.5 + (1 - p.life) * 1.2))
    })
  })

  return (
    <group ref={root} visible={false}>
      <mesh ref={pit} geometry={pitGeo} material={pitMats} visible={false} />
      <pointLight ref={pitLight} position={[at.x, at.y - 1.4, at.z]} color="#8ec3ff" intensity={0} distance={11} decay={1.2} />
      <group ref={mists}>
        {[0, 1, 2, 3, 4].map((i) => (
          <sprite key={i} material={mistMat} />
        ))}
      </group>
      <instancedMesh ref={rim} args={[rockMesh.geometry, rockMat, RIM]} frustumCulled={false} />
      <group ref={stones}>
        {STONES.map((_, i) => (
          <group key={i}>
            {/* una roca flotante: arriba una laja plana para pararse, abajo la roca, con la punta hacia abajo */}
            <mesh geometry={slabMesh.geometry} material={slabMat} scale={0.55} receiveShadow />
            <mesh geometry={rockMesh.geometry} material={rockMat} scale={[0.17, 0.2, 0.17]} position={[0, 0.0, 0]} rotation-x={Math.PI} />
            <sprite material={flashMats[i]} scale={1.4} position={[0, -0.2, 0]} />
          </group>
        ))}
      </group>
      <instancedMesh ref={chunks} args={[rockMesh.geometry, rockMat, CHUNKS]} frustumCulled={false} />
      <group ref={dusts}>
        {dustMats.map((m, i) => (
          <sprite key={i} material={m} visible={false} />
        ))}
      </group>
      <group ref={mineral} visible={false}>
        <mesh material={IRON_NEG}>
          <octahedronGeometry args={[0.22, 0]} />
        </mesh>
        <sprite material={ironGlow} scale={1.1} />
      </group>
    </group>
  )
}

useGLTF.preload(natureUrl('Rock_Medium_1'))
useGLTF.preload(natureUrl('RockPath_Round_Wide'))
