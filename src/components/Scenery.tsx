import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { rng } from '../game/config'
import { makeNoise } from '../game/textures'

/*
 * El paisaje lejano: el cielo (un degradado) y montañas nevadas en el horizonte.
 * Están fuera de la niebla, así que siempre se recortan contra el cielo.
 */

/** Hacia dónde está el sol (detrás y a la derecha de quien camina, bajo: entra en la calle y da de frente a las fachadas). */
export const SUN_DIR = new THREE.Vector3(-0.62, 0.46, -0.55).normalize()

/** Lo oscuro que está el mundo ahora (0 de día … 1 de noche): lo pone World cada frame. */
export const skyState = { night: 0, haze: 0, hazeColor: new THREE.Color('#d3d3c8') }

const NIGHT_LAND = new THREE.Color('#0b0e18')
const WHITE = new THREE.Color('#ffffff')

function Sky() {
  const camera = useThree((s) => s.camera)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          horizon: { value: new THREE.Color('#ecd9b8') },
          middle: { value: new THREE.Color('#7ca8df') },
          zenith: { value: new THREE.Color('#2f62ab') },
          nightSky: { value: new THREE.Color('#06080f') },
          sun: { value: SUN_DIR },
          night: { value: 0 },
          haze: { value: 0 },
          hazeColor: { value: skyState.hazeColor },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 horizon, middle, zenith, nightSky, sun;
          uniform float night, haze;
          uniform vec3 hazeColor;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = max(d.y, 0.0);
            vec3 c = mix(horizon, middle, smoothstep(0.0, 0.12, h));
            c = mix(c, zenith, smoothstep(0.1, 0.55, h));
            c += vec3(1.0, 0.72, 0.42) * pow(max(dot(d, sun), 0.0), 24.0) * 0.3;
            c = mix(c, nightSky, night);
            c = mix(c, hazeColor, haze);
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  const geometry = useMemo(() => new THREE.SphereGeometry(600, 32, 16), [])
  const mesh = useMemo(() => {
    const m = new THREE.Mesh(geometry, material)
    m.frustumCulled = false
    m.renderOrder = -10
    return m
  }, [geometry, material])
  useFrame(() => {
    mesh.position.copy(camera.position)
    material.uniforms.night.value = skyState.night
    material.uniforms.haze.value = skyState.haze
  })
  return <primitive object={mesh} />
}

/** Un pico con crestas y valles (ruido, no caras planas); nieve arriba; azulado por la distancia. */
function makePeak(x: number, z: number, height: number, radius: number, seed: number) {
  const noise = makeNoise(seed)
  const geo = new THREE.ConeGeometry(radius, height, 26, 10, true)
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const rock = new THREE.Color('#5a6372')
  const shadow = new THREE.Color('#3f4a5e')
  const snow = new THREE.Color('#f2f3f5')
  const haze = new THREE.Color('#a4b7cf')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i)
    const pz = pos.getZ(i)
    const up = (pos.getY(i) + height / 2) / height
    const angle = (Math.atan2(pz, px) / (Math.PI * 2) + 1) % 1
    const ridge = noise(angle, up * 0.5, 5, 5)
    const fine = noise(angle, up * 0.5 + 0.5, 22, 3)
    const out = 1 + (ridge - 0.5) * 1.5 * (1 - up * 0.55) + (fine - 0.5) * 0.35
    pos.setXYZ(i, px * out, pos.getY(i) + (ridge - 0.5) * height * 0.16 * (1 - up), pz * out)
    const line = 0.56 + (fine - 0.5) * 0.35 + (ridge - 0.5) * 0.25
    c.copy(shadow).lerp(rock, ridge).lerp(snow, THREE.MathUtils.smoothstep(up, line, line + 0.07))
    c.lerp(haze, 0.38 + (1 - up) * 0.25) // el aire entre medio
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  geo.translate(x, height / 2 - 6, z)
  return geo
}

function Mountains() {
  const { geometry, material } = useMemo(() => {
    const r = rng(2026)
    const peaks: THREE.BufferGeometry[] = []
    // delante, al final del camino; a los lados, más bajas; y unas pocas detrás, para cuando mira atrás
    for (let i = 0; i < 17; i++) {
      const x = -620 + (i / 16) * 1240 + (r() - 0.5) * 50
      peaks.push(makePeak(x, 640 + r() * 130, 85 + r() * 80, 62 + r() * 42, 100 + i))
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) peaks.push(makePeak(side * (620 + r() * 90), -120 + i * 100, 70 + r() * 55, 60 + r() * 35, 200 + i + side))
    }
    for (let i = 0; i < 10; i++) peaks.push(makePeak(-500 + i * 110, -520 - r() * 80, 75 + r() * 60, 62 + r() * 32, 300 + i))
    const geometry = mergeGeometries(peaks)
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, transparent: true })
    return { geometry, material }
  }, [])
  useFrame(() => {
    material.color.copy(WHITE).lerp(NIGHT_LAND, skyState.night)
    material.opacity = 1 - skyState.haze
  })
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

export function Scenery() {
  return (
    <>
      <Sky />
      <Mountains />
    </>
  )
}
