import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { game, setUi } from '../game/state'

/*
 * La pantalla de título: la elfa de pie, sola, con un haz de luz en diagonal detrás.
 * La cámara solo ve la capa TITLE_LAYER (la elfa y estas luces): el mundo está cargado, pero no se ve.
 */
export const TITLE_LAYER = 1

const DIST = 0.95 // distancia de la cámara a la elfa
const CAM_Y = 0.9
const LOOK_Y = 0.85

export const titleState = { elfReady: false, compiled: false }
export const titleShowing = () => !game.started && titleState.elfReady

/** Coloca la cámara delante de la elfa, mirándola de frente. */
export function placeTitleCamera(camera: THREE.Camera) {
  const fx = Math.sin(game.yaw)
  const fz = Math.cos(game.yaw)
  camera.position.set(game.x + fx * DIST, CAM_Y, game.z + fz * DIST)
  camera.lookAt(game.x, LOOK_Y, game.z)
}

const beamVertex = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`
const beamFragment = /* glsl */ `
  varying vec2 vP;
  uniform float uTime;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    // el haz baja en diagonal desde arriba a la derecha, abriéndose
    vec2 a = vec2(0.34, 1.25);
    vec2 b = vec2(-0.62, -1.1);
    vec2 dir = normalize(b - a);
    vec2 rel = vP - a;
    float along = clamp(dot(rel, dir) / length(b - a), 0.0, 1.0);
    float across = abs(rel.x * dir.y - rel.y * dir.x);
    float width = 0.13 + along * 0.26;
    float breathe = 1.0 + 0.035 * sin(uTime * 0.7);
    float beam = exp(-pow(across / width, 2.0) * 1.3) * (1.0 - along * 0.72) * breathe;
    float core = exp(-pow(across / (width * 0.45), 2.0)) * (1.0 - along) * breathe;
    // fondo: casi negro, frío a la izquierda y cálido abajo a la derecha
    vec3 base = mix(vec3(0.012, 0.035, 0.04), vec3(0.03, 0.022, 0.012), smoothstep(-0.8, 0.9, vP.x - vP.y * 0.4));
    vec3 color = base + vec3(0.62, 0.47, 0.25) * beam + vec3(0.42, 0.42, 0.36) * core;
    // grano fino: evita las bandas en el degradado
    color += (hash(vP * 913.0 + fract(uTime)) - 0.5) * 0.012;
    gl_FragColor = vec4(color, 1.0);
  }
`

export function TitleScene() {
  const group = useRef<THREE.Group>(null!)
  const uiReady = useRef(false)
  const target = useMemo(() => new THREE.Object3D(), [])
  const beam = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        uniforms: { uTime: { value: 0 } },
        depthTest: false,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    [],
  )

  useLayoutEffect(() => {
    group.current.traverse((o) => o.layers.set(TITLE_LAYER))
  }, [])

  useFrame(({ clock, gl, scene, camera }) => {
    // apenas está la elfa, se la muestra (el resto del mundo sigue cargando por detrás)
    if (titleState.elfReady && !uiReady.current) {
      uiReady.current = true
      setUi({ titleReady: true })
    }
    // con todo cargado, se preparan los materiales del mundo: así Begin no da un tirón
    if (game.loaded && !titleState.compiled && !game.started) {
      titleState.compiled = true
      const mask = camera.layers.mask
      group.current.visible = false
      camera.layers.set(0)
      void gl.compileAsync(scene, camera)
      camera.layers.mask = mask
    }
    group.current.visible = titleShowing()
    group.current.position.set(game.x, 0, game.z)
    group.current.rotation.y = game.yaw
    beam.uniforms.uTime.value = clock.elapsedTime
  })

  return (
    <group ref={group}>
      <mesh material={beam} frustumCulled={false} renderOrder={-10}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <primitive object={target} position={[0, 0.8, 0]} />
      {/* contraluz: el haz le dibuja el borde del pelo y los hombros */}
      <directionalLight position={[-1.6, 2.6, -2.4]} target={target} intensity={7} color="#ffdcaa" />
      {/* luz principal, suave y cálida, desde el lado del haz */}
      <directionalLight position={[-1.8, 1.8, 2.2]} target={target} intensity={2.6} color="#ffe6c6" />
      {/* relleno frío del otro lado, para separarla del fondo */}
      <directionalLight position={[2.4, 0.8, 1.2]} target={target} intensity={0.55} color="#7fa6c4" />
      <ambientLight intensity={0.16} color="#b8c4cc" />
    </group>
  )
}
