import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/*
 * Postprocesado: lo que hace que la imagen parezca "de cine" y no "de prueba".
 *   1. Bloom: las luces fuertes (su luz, las luciérnagas, los faroles) brillan y se derraman.
 *   2. Gradación de color: sombras un poco azuladas, luces cálidas, algo más de saturación.
 *   3. Viñeta: los bordes un poco más oscuros, para llevar la mirada al centro.
 *   4. Grano muy fino: quita el aspecto "plástico" del render.
 *   5. Tone mapping ACES (en OutputPass): el mismo con el que se ajustaron los colores del juego.
 *
 * Para comparar con el antes: añade ?fx=0 a la dirección.
 */
export const fxEnabled = new URLSearchParams(location.search).get('fx') !== '0'

// Limpia píxeles inválidos (NaN / infinito) antes del bloom: si no, uno solo se desenfoca y apaga toda la pantalla
const CleanShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      bvec3 bad = bvec3(c.r != c.r || c.r > 6e4, c.g != c.g || c.g > 6e4, c.b != c.b || c.b > 6e4);
      if (any(bad)) c.rgb = vec3(0.0);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 32.0), c.a);
    }
  `,
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    shadowTint: { value: new THREE.Color('#3c5a66') }, // azul verdoso en las sombras
    lightTint: { value: new THREE.Color('#ffe2b8') }, // dorado en las luces
    tintAmount: { value: 0.08 },
    saturation: { value: 1.18 },
    vignette: { value: 0.3 },
    grain: { value: 0.025 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec3 shadowTint;
    uniform vec3 lightTint;
    uniform float tintAmount;
    uniform float saturation;
    uniform float vignette;
    uniform float grain;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      // (todavía es luz lineal, sin tone mapping: se mide el brillo de forma suave)
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float t = clamp(lum / (lum + 0.6), 0.0, 1.0);
      // sombras frías, luces cálidas (split toning)
      vec3 tint = mix(shadowTint, lightTint, t);
      col = mix(col, col * tint * 1.6, tintAmount);
      // saturación
      float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l2), col, saturation);
      // viñeta suave
      vec2 d = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.25, 0.85, length(d * vec2(1.15, 1.0)));
      // grano
      col += (hash(vUv * 1000.0 + time) - 0.5) * grain * (0.3 + t);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }
  `,
}

export function Effects() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const { composer, grade } = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    const composer = new EffectComposer(gl, target)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new ShaderPass(CleanShader))
    // fuerza, radio, umbral: solo brilla lo que de verdad es luz (umbral alto)
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.85))
    const grade = new ShaderPass(GradeShader)
    composer.addPass(grade)
    composer.addPass(new OutputPass()) // aplica el tone mapping del renderer y pasa a sRGB
    return { composer, grade }
  }, [gl, scene, camera])

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 1
  }, [gl])

  useEffect(() => {
    composer.setPixelRatio(Math.min(dpr, 1.5)) // (los efectos a 1.5x como mucho: casi igual de nítido y mucho más rápido)
    composer.setSize(size.width, size.height)
  }, [composer, size, dpr])

  useEffect(() => () => composer.dispose(), [composer])

  // prioridad 1: a partir de aquí dibuja el composer, no R3F
  useFrame((state) => {
    grade.uniforms.time.value = state.clock.elapsedTime % 100
    composer.render()
  }, 1)

  return null
}
