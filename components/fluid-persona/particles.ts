/**
 * The persona avatar: a particle swarm driven by warmth.
 *
 * ── WHERE IT CAME FROM ────────────────────────────────────────────────────
 *
 * The simulation is ported from Edan Kwan's "The Spirit" (MIT,
 * github.com/edankwan/The-Spirit): particle positions live in a float texture,
 * one fragment pass per frame advances every particle through curl noise, and
 * a dead particle respawns in a breathing core. The showpiece around it — soft
 * shadows, motion blur, bloom, the mouse follow — is not ported, because this
 * runs beside a live voice rep on a phone. What stands in for the motion blur
 * is a decaying accumulation buffer: each particle leaves a streak, which is
 * most of why the swarm reads as smoke rather than dots. The simplex noise is
 * Ashima Arts / Stefan Gustavson's webgl-noise (MIT). Tuned in a local lab on
 * 30 September 2026, by eye, against the ring-and-motes orb it replaced.
 *
 * ── WHAT WARMTH DOES ──────────────────────────────────────────────────────
 *
 * `dialsFor` is the whole mapping and it is pure, so it is tested rather than
 * described. Cold: a small, pale, composed swarm — neighbours share their
 * paths, the flow is slow, the colour is graphite lifted toward her sheen.
 * Warm: larger, in her full colour, faster, with gusts and a wandering wind
 * that make it restless — but neighbours still move together, because a swarm
 * where every particle does its own thing reads as television static, not
 * fluid. Her colour is mostly there by the low sixties, since most reps never
 * pass 65, and it is SMOOTH through 65, because that is where the rep silently
 * arms (rule 3) and a visible step there would announce it.
 *
 * ── IDENTITY ──────────────────────────────────────────────────────────────
 *
 * `lib/personas/visual.ts` carries a character by form as well as colour. The
 * swarm keeps that: `petals` lobes her silhouette, `tilt` sets the axis she
 * turns on, `seed` gives her her own region of the flow field, and `mode`
 * decides which way she spins. The palette bounds that file's tests enforce
 * are unchanged; the colours pass straight through.
 *
 * ── TWO WAYS TO DRAW ──────────────────────────────────────────────────────
 *
 * `mountLive` gives one avatar its own renderer and a frame loop. At most
 * `LIVE_LIMIT` exist at once — WebGL contexts are a scarce browser resource,
 * and a grid of simulations is a phone on fire. Everything else is a STILL:
 * `renderStill` runs the same simulation for a second or so on one shared
 * hidden renderer, captures a single transparent frame, and caches it. The
 * component turns and breathes that frame with CSS.
 *
 * Imperative and outside React. `index.tsx` only feeds it state.
 */

import { lodFor, type PersonaVisual } from '@/lib/personas/visual'
import { clamp01, dialsFor, smoothstep, type DialInput, type Dials } from '@/lib/personas/swarm'

type ThreeModule = typeof import('three')

export type Speaking = 'none' | 'user' | 'persona' | 'thinking'
export type StageStatus = 'idle' | 'connecting' | 'live'

/** Everything the avatar reacts to. Pushed in; never read back. */
export interface StageState {
  /** 0–100, as the meter reports it. */
  warmth: number
  speaking: Speaking
  /** His microphone, 0–1. Always live, whatever `speaking` says. */
  userLevel: number
  /** Her output, 0–1. */
  personaLevel: number
  status: StageStatus
  pointerX: number
  pointerY: number
  pointerActive: boolean
}

export interface LiveHandle {
  push(state: StageState): void
  /** From a ResizeObserver. CSS pixels. */
  measure(cssWidth: number, cssHeight: number): void
  setVisible(visible: boolean): void
  setReducedMotion(reduced: boolean): void
  dispose(): void
}

/* ------------------------------------------------------------------ *
 * Shaders
 * ------------------------------------------------------------------ */

const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
vec3 snoiseVec3(vec3 x) {
  return vec3(snoise(x), snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)), snoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4)));
}
vec3 curlNoise(vec3 p) {
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 px0 = snoiseVec3(p - dx); vec3 px1 = snoiseVec3(p + dx);
  vec3 py0 = snoiseVec3(p - dy); vec3 py1 = snoiseVec3(p + dy);
  vec3 pz0 = snoiseVec3(p - dz); vec3 pz1 = snoiseVec3(p + dz);
  float x = py1.z - py0.z - pz1.y + pz0.y;
  float y = pz1.x - pz0.x - px1.z + px0.z;
  float z = px1.y - px0.y - py1.x + py0.x;
  return normalize(vec3(x, y, z) / (2.0 * e));
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
`

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const COPY_FRAGMENT = /* glsl */ `
uniform sampler2D tSource;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tSource, vUv); }
`

/** The Spirit's position.frag, in unit space, with the mouse follow replaced. */
const SIM_FRAGMENT = /* glsl */ `
uniform sampler2D tPosition;
uniform sampler2D tDefault;
uniform float uTime;
uniform float uStep;
uniform float uSpeed;
uniform float uDie;
uniform float uCurlSize;
uniform float uAttraction;
uniform float uEntropy;
uniform float uGust;
uniform vec3 uWind;
uniform vec3 uSeedOffset;
uniform float uPetals;
varying vec2 vUv;
${NOISE}
void main() {
  vec4 info = texture2D(tPosition, vUv);
  vec4 seed = texture2D(tDefault, vUv);
  vec3 position = info.xyz;
  float life = info.w - uDie * uStep;
  if (life < 0.0) {
    // Respawn in a breathing core so each particle is carried OUT along the
    // field as a wisp. A fixed seed point retraces the same path every life,
    // so entropy blends in a fresh direction and a wider core each time.
    vec3 fresh = hash33(vec3(vUv * 517.0, uTime * 13.7)) * 2.0 - 1.0;
    vec3 direction = normalize(mix(seed.xyz, fresh, uEntropy) + vec3(1e-4));
    float spawn = mix(0.42, 0.7, uEntropy * fresh.x * 0.5 + uEntropy * 0.5);
    position = direction * length(seed.xyz) * spawn * (1.0 + 0.14 * sin(uTime * 2.0 + seed.w * 6.2831));
    // A lifetime the vertex shader can recompute, so a particle fades IN as
    // well as out. Particles that pop into existence read as static.
    life = 1.0 + 0.25 * seed.w;
  } else {
    // A gentle pull to the centre, and a soft wall that turns strays back and
    // moves out with entropy. The wall is lobed by her petal count, which is
    // her silhouette: identity by form, as the old orb had it.
    float reach = length(position);
    float lobes = 1.0 + 0.16 * (1.0 - 0.5 * uEntropy) * cos(uPetals * atan(position.y, position.x) + uTime * 0.15);
    float rim = (0.85 + 0.3 * uEntropy) * lobes;
    position -= position * (0.0015 * uAttraction + smoothstep(rim, rim + 0.3, reach) * 0.05) * uStep;
    // FLUID MEANS NEIGHBOURS MOVE TOGETHER. The unpredictability lives in
    // things that keep them together — a field that churns faster as she
    // warms, a gust that surges or stalls the whole swarm, a wind that shoves
    // it one way and then another — plus only a small offset and a smoothly
    // varying pace per particle.
    vec3 own = seed.xyz * 0.25 * uEntropy;
    vec3 drift = vec3(uTime * (0.04 + 0.12 * uEntropy), uTime * (0.07 + 0.35 * uEntropy), uTime * (0.03 + 0.1 * uEntropy));
    float mine = 0.5 + 0.5 * sin(uTime * (0.6 + 1.8 * uEntropy) + seed.w * 40.0);
    float pace = mix(1.0, 0.55 + 0.9 * mine, uEntropy * 0.7) * (1.0 + uGust * 0.9 * uEntropy);
    position += curlNoise(position * uCurlSize + own + drift + uWind + uSeedOffset) * 0.012 * uSpeed * max(0.15, pace) * uStep;
  }
  gl_FragColor = vec4(position, life);
}
`

const POINT_VERTEX = /* glsl */ `
uniform sampler2D tPosition;
uniform sampler2D tDefault;
uniform float uScale;
uniform float uPointSize;
attribute vec2 ref;
varying float vLife;
varying float vDepth;
varying float vFade;
void main() {
  vec4 info = texture2D(tPosition, ref);
  vec3 position = info.xyz * uScale;
  vLife = info.w;
  float born = 1.0 + 0.25 * texture2D(tDefault, ref).w;
  vFade = smoothstep(0.0, 0.1, born - info.w) * smoothstep(0.0, 0.2, info.w);
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  vDepth = clamp(position.z / max(uScale, 0.001) * 0.5 + 0.5, 0.0, 1.0);
  gl_PointSize = uPointSize * (1.0 / -view.z) * (0.4 + 0.6 * vFade);
}
`

const POINT_FRAGMENT = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uCore;
uniform vec3 uSheen;
uniform float uChroma;
uniform float uAlpha;
varying float vLife;
varying float vDepth;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.05, d);
  // A pale graphite at 0, lifted toward the sheen so a cold swarm is quiet but
  // legible; her full hue once the colour has arrived.
  vec3 base = mix(mix(uDeep, uSheen, 0.4), uCore, uChroma);
  vec3 colour = mix(base, uSheen, smoothstep(0.95, 1.2, vLife) * (0.08 + 0.3 * uChroma));
  colour *= 0.55 + 0.45 * vDepth;
  gl_FragColor = vec4(colour, soft * uAlpha * vFade);
}
`

const FADE_FRAGMENT = /* glsl */ `
uniform float uDecay;
void main() { gl_FragColor = vec4(vec3(uDecay), 1.0); }
`

/**
 * The accumulation buffer to the canvas, TRANSPARENT and premultiplied, so she
 * glows over whatever surface she sits on rather than bringing a square of
 * ground with her. Dense cores sum past 1.0: clipping each channel turns her
 * hue white and capping the peak flattens the core into a plateau, so the peak
 * is rolled off smoothly instead — denser stays brighter, the hue is kept.
 */
const BLIT_FRAGMENT = /* glsl */ `
uniform sampler2D tAccumulation;
varying vec2 vUv;
void main() {
  vec3 a = texture2D(tAccumulation, vUv).rgb;
  float peak = max(max(a.r, a.g), a.b);
  a *= (1.0 - exp(-peak * 1.3)) / max(peak, 0.0001);
  gl_FragColor = vec4(a, max(max(a.r, a.g), a.b));
}
`

/* ------------------------------------------------------------------ *
 * One swarm
 * ------------------------------------------------------------------ */

interface Swarm {
  /** Advance the simulation (unless `frozen`) and draw one frame to the current target. */
  frame(dials: Dials, dt: number, frozen: boolean): void
  resize(pixelWidth: number, pixelHeight: number): void
  setVisual(visual: PersonaVisual): void
  /** Base orientation plus a pointer lean, in radians. */
  orient(x: number, y: number): void
  dispose(): void
}

/**
 * Raw shaders write straight to the canvas with no colour-space conversion, so
 * authored sRGB hex values pass through untouched. `new Color(hex)` would
 * linearise them and every character would render darker than authored.
 */
function rawColour(THREE: ThreeModule, hex: string) {
  return new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace)
}

function createSwarm(THREE: ThreeModule, renderer: import('three').WebGLRenderer, visual: PersonaVisual, texture: readonly [number, number], distance: number, gain = 1): Swarm {
  const gl = renderer.getContext()
  const floatOk = renderer.capabilities.isWebGL2 && gl.getExtension('EXT_color_buffer_float') !== null
  const type = floatOk ? THREE.FloatType : THREE.HalfFloatType
  const [width, height] = texture
  const amount = width * height

  const seeds = new Float32Array(amount * 4)
  for (let i = 0; i < amount; i += 1) {
    let x = 0, y = 0, z = 0
    do {
      x = Math.random() * 2 - 1
      y = Math.random() * 2 - 1
      z = Math.random() * 2 - 1
    } while (x * x + y * y + z * z > 1)
    seeds[i * 4] = x
    seeds[i * 4 + 1] = y
    seeds[i * 4 + 2] = z
    seeds[i * 4 + 3] = Math.random()
  }
  const defaultTexture = new THREE.DataTexture(seeds, width, height, THREE.RGBAFormat, THREE.FloatType)
  defaultTexture.minFilter = THREE.NearestFilter
  defaultTexture.magFilter = THREE.NearestFilter
  defaultTexture.needsUpdate = true

  const makeTarget = () => new THREE.WebGLRenderTarget(width, height, {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
  })
  let read = makeTarget()
  let write = makeTarget()

  const quadCamera = new THREE.Camera()
  const quadGeometry = new THREE.PlaneGeometry(2, 2)
  const copyMaterial = new THREE.ShaderMaterial({ uniforms: { tSource: { value: defaultTexture } }, vertexShader: QUAD_VERTEX, fragmentShader: COPY_FRAGMENT })
  const simMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tPosition: { value: null },
      tDefault: { value: defaultTexture },
      uTime: { value: 0 },
      uStep: { value: 1 },
      uSpeed: { value: 1 },
      uDie: { value: 0.0065 },
      uCurlSize: { value: 1.2 },
      uAttraction: { value: 1 },
      uEntropy: { value: 0.1 },
      uGust: { value: 0 },
      uWind: { value: new THREE.Vector3() },
      uSeedOffset: { value: new THREE.Vector3() },
      uPetals: { value: 4 },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: SIM_FRAGMENT,
  })
  const simScene = new THREE.Scene()
  const simQuad = new THREE.Mesh(quadGeometry, copyMaterial)
  simScene.add(simQuad)
  for (const target of [read, write]) {
    renderer.setRenderTarget(target)
    renderer.render(simScene, quadCamera)
  }
  renderer.setRenderTarget(null)
  simQuad.material = simMaterial

  const refs = new Float32Array(amount * 2)
  for (let i = 0; i < amount; i += 1) {
    refs[i * 2] = ((i % width) + 0.5) / width
    refs[i * 2 + 1] = (Math.floor(i / width) + 0.5) / height
  }
  const pointGeometry = new THREE.BufferGeometry()
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(amount * 3), 3))
  pointGeometry.setAttribute('ref', new THREE.BufferAttribute(refs, 2))
  pointGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
  const pointMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tPosition: { value: null },
      tDefault: { value: defaultTexture },
      uScale: { value: 1 },
      uPointSize: { value: 6 },
      uDeep: { value: rawColour(THREE, visual.deep) },
      uCore: { value: rawColour(THREE, visual.core) },
      uSheen: { value: rawColour(THREE, visual.sheen) },
      uChroma: { value: 0 },
      uAlpha: { value: 0.5 },
    },
    vertexShader: POINT_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(pointGeometry, pointMaterial)
  const orientation = new THREE.Group()
  orientation.add(points)
  const scene = new THREE.Scene()
  scene.add(orientation)
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
  camera.position.set(0, 0, distance)

  // TRAILS: an accumulation buffer multiplied down every frame before the new
  // frame is added. Half-float so the fade reaches true black instead of
  // sticking at the 8-bit floor and leaving a grey smear.
  const accumulation = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false })
  const fadeMaterial = new THREE.ShaderMaterial({
    uniforms: { uDecay: { value: 0.8 } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: FADE_FRAGMENT,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.SrcColorFactor,
    depthTest: false,
    depthWrite: false,
  })
  const fadeScene = new THREE.Scene()
  fadeScene.add(new THREE.Mesh(quadGeometry, fadeMaterial))
  const blitMaterial = new THREE.ShaderMaterial({
    uniforms: { tAccumulation: { value: accumulation.texture } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: BLIT_FRAGMENT,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  })
  const blitScene = new THREE.Scene()
  blitScene.add(new THREE.Mesh(quadGeometry, blitMaterial))

  // Additive alpha thins as the count rises, or a dense swarm leaves her
  // palette for white.
  const alphaForCount = 0.85 * Math.pow(16384 / amount, 0.35)
  let pixelHeight = 1
  let time = 0
  let gust = 0
  let gustTarget = 0
  let gustTimer = 0
  let spin = 1
  const wind = new THREE.Vector3()
  const windVelocity = new THREE.Vector3()
  const tilt = new THREE.Vector3()

  const swarm: Swarm = {
    frame(dials, dt, frozen) {
      // Where the finished frame goes — read BEFORE the simulation step
      // switches the render target to its own position texture.
      const destination = renderer.getRenderTarget()
      const step = dt * 60
      if (!frozen) {
        time += dt
        gustTimer -= dt
        if (gustTimer <= 0) {
          gustTarget = Math.random() * 2 - 1
          gustTimer = 0.2 + Math.random() * (1.6 - 1.3 * dials.entropy)
        }
        gust += (gustTarget - gust) * (1 - Math.pow(1 - (0.05 + 0.2 * dials.entropy), step))
        windVelocity.x += (Math.random() - 0.5) * 0.02 * dials.entropy * step
        windVelocity.y += (Math.random() - 0.5) * 0.02 * dials.entropy * step
        windVelocity.z += (Math.random() - 0.5) * 0.02 * dials.entropy * step
        windVelocity.multiplyScalar(Math.pow(0.97, step))
        wind.addScaledVector(windVelocity, dt * 3)

        const u = simMaterial.uniforms
        u.tPosition!.value = read.texture
        u.uTime!.value = time
        u.uStep!.value = step
        u.uSpeed!.value = dials.speed
        u.uCurlSize!.value = dials.curlSize
        u.uAttraction!.value = dials.attraction
        u.uEntropy!.value = dials.entropy
        u.uGust!.value = gust
        ;(u.uWind!.value as import('three').Vector3).copy(wind)
        renderer.setRenderTarget(write)
        renderer.render(simScene, quadCamera)
        const swap = read
        read = write
        write = swap
        points.rotation.y += (0.0012 + dials.chroma * 0.004 + gust * dials.entropy * 0.002) * step * spin
      }

      const p = pointMaterial.uniforms
      p.tPosition!.value = read.texture
      p.uScale!.value = dials.scale
      p.uChroma!.value = dials.chroma
      // A trail's steady-state brightness is 1 / (1 - decay) frames' worth, so
      // alpha is scaled back by the same factor. Frozen (reduced motion) keeps
      // the same blend: stationary particles settle into a still cloud of the
      // same brightness, and warmth still moves its size and colour.
      const decay = dials.decay
      p.uAlpha!.value = alphaForCount * (1 - decay) * 0.8 * dials.brightness * gain
      p.uPointSize!.value = pixelHeight * (0.02 + 0.008 * dials.chroma)
      fadeMaterial.uniforms.uDecay!.value = decay

      renderer.setRenderTarget(accumulation)
      renderer.render(fadeScene, quadCamera)
      renderer.render(scene, camera)
      renderer.setRenderTarget(destination)
      renderer.render(blitScene, quadCamera)
    },
    resize(pixelWidth, pixelHeight_) {
      const w = Math.max(1, pixelWidth)
      const h = Math.max(1, pixelHeight_)
      // Point size follows the SHORTER side, which is what she is fitted to.
      pixelHeight = Math.min(w, h)
      camera.aspect = w / h
      // A perspective camera's field of view is vertical, so in a box taller
      // than it is wide she was fitted to the height and clipped at the sides.
      // Fit the shorter side instead.
      const half = Math.tan((32 / 2) * Math.PI / 180)
      camera.fov = camera.aspect < 1 ? (2 * Math.atan(half / camera.aspect) * 180) / Math.PI : 32
      camera.updateProjectionMatrix()
      accumulation.setSize(Math.round(w), Math.round(h))
      const previous = renderer.getRenderTarget()
      renderer.setRenderTarget(accumulation)
      renderer.setClearColor(0x000000, 0)
      renderer.clear()
      renderer.setRenderTarget(previous)
    },
    setVisual(next) {
      pointMaterial.uniforms.uDeep!.value = rawColour(THREE, next.deep)
      pointMaterial.uniforms.uCore!.value = rawColour(THREE, next.core)
      pointMaterial.uniforms.uSheen!.value = rawColour(THREE, next.sheen)
      simMaterial.uniforms.uPetals!.value = next.petals
      ;(simMaterial.uniforms.uSeedOffset!.value as import('three').Vector3).set(
        ((next.seed % 997) / 997) * 40,
        ((next.seed % 613) / 613) * 40,
        ((next.seed % 331) / 331) * 40,
      )
      tilt.set(next.tilt[0], next.tilt[1], next.tilt[2])
      spin = next.mode % 2 === 0 ? 1 : -1
      orientation.rotation.set(tilt.x, tilt.y, tilt.z)
    },
    orient(x, y) {
      orientation.rotation.x = tilt.x + x
      orientation.rotation.y = tilt.y + y
    },
    dispose() {
      read.dispose()
      write.dispose()
      accumulation.dispose()
      defaultTexture.dispose()
      quadGeometry.dispose()
      copyMaterial.dispose()
      simMaterial.dispose()
      pointGeometry.dispose()
      pointMaterial.dispose()
      fadeMaterial.dispose()
      blitMaterial.dispose()
    },
  }
  swarm.setVisual(visual)
  return swarm
}

function supportsSimulation(renderer: import('three').WebGLRenderer): boolean {
  const gl = renderer.getContext()
  return (renderer.capabilities.isWebGL2 && gl.getExtension('EXT_color_buffer_float') !== null)
    || gl.getExtension('EXT_color_buffer_half_float') !== null
}

/**
 * How far the camera sits. A still is a thumbnail and has to fill its box the
 * way the old orb did; the live stage leaves room for her to grow into.
 */
const LIVE_DISTANCE = 3.5
const STILL_DISTANCE = 3.3
const STILL_GAIN = 2.2

/** Frames of simulation run before anything is shown, so she arrives as smoke, not a seed ball. */
const PREROLL_FRAMES = 90

function preroll(swarm: Swarm, dials: Dials, frames: number): void {
  for (let i = 0; i < frames; i += 1) swarm.frame(dials, 1 / 60, false)
}

const REST: DialInput = { warmth: 0.18, self: 0, user: 0, think: 0, ready: 1, pulse: 0 }

/* ------------------------------------------------------------------ *
 * Live
 * ------------------------------------------------------------------ */

/** WebGL contexts are a scarce browser resource. Past this, avatars are stills. */
export const LIVE_LIMIT = 3
let liveCount = 0

export function tryAcquireLiveSlot(): boolean {
  if (liveCount >= LIVE_LIMIT) return false
  liveCount += 1
  return true
}

export function releaseLiveSlot(): void {
  liveCount = Math.max(0, liveCount - 1)
}

export interface LiveOptions {
  canvas: HTMLCanvasElement
  visual: PersonaVisual
  reducedMotion: boolean
  onFirstFrame?: () => void
  /** The context was lost. The component drops to a still. */
  onLost?: () => void
}

const approach = (current: number, target: number, rate: number) => current + (target - current) * rate

export async function mountLive(options: LiveOptions): Promise<LiveHandle | null> {
  const THREE: ThreeModule = await import('three')
  let renderer: import('three').WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas: options.canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  if (!supportsSimulation(renderer)) {
    renderer.dispose()
    return null
  }
  renderer.autoClear = false

  // Layout size, not the transformed one — see `layoutBox` in index.tsx.
  const bounds = { width: options.canvas.clientWidth, height: options.canvas.clientHeight }
  const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
  let lod = lodFor(Math.min(bounds.width, bounds.height), ratio)
  let swarm = createSwarm(THREE, renderer, options.visual, lod.texture, LIVE_DISTANCE)

  let state: StageState = { warmth: 18, speaking: 'none', userLevel: 0, personaLevel: 0, status: 'idle', pointerX: 0, pointerY: 0, pointerActive: false }
  let hasState = false
  const smooth = { warmth: 0.18, self: 0, user: 0, think: 0, ready: 1, pulse: 0, leanX: 0, leanY: 0 }
  let lastWarmth: number | null = null
  let reduced = options.reducedMotion
  let visible = true
  let disposed = false
  let frame = 0
  let last = performance.now()
  let lastDraw = 0
  let firstFrame = options.onFirstFrame
  let cssWidth = bounds.width
  let cssHeight = bounds.height

  const onLost = (event: Event) => {
    event.preventDefault()
    stop()
    options.onLost?.()
  }
  options.canvas.addEventListener('webglcontextlost', onLost)

  const size = () => {
    renderer.setPixelRatio(ratio)
    renderer.setSize(cssWidth, cssHeight, false)
    swarm.resize(cssWidth * ratio, cssHeight * ratio)
  }

  const tick = (now: number) => {
    if (disposed || !visible) return
    frame = requestAnimationFrame(tick)
    // A roster-sized avatar does not need sixty frames a second.
    if (now - lastDraw < 1000 / lod.fps - 2) return
    lastDraw = now
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const scale = dt * 60
    const ease = (rate: number) => reduced ? 1 : 1 - Math.pow(1 - rate, scale)

    // His microphone is always live; `speaking` chooses the emphasis, it does
    // not gate the signal. An avatar that ignored him until VAD fired is what
    // made "listening" look dead on the old orb, and the rule carries over.
    const live = state.status !== 'connecting'
    const userGoal = live ? clamp01(state.userLevel) * (state.speaking === 'user' ? 1 : 0.55) : 0
    const selfGoal = live ? clamp01(state.personaLevel) * (state.speaking === 'persona' ? 1 : 0.5) : 0
    smooth.warmth = approach(smooth.warmth, clamp01(state.warmth / 100), ease(0.045))
    smooth.user = approach(smooth.user, userGoal, ease(0.192))
    smooth.self = approach(smooth.self, selfGoal, ease(0.192))
    smooth.think = approach(smooth.think, state.speaking === 'thinking' ? 1 : 0, ease(0.05))
    smooth.ready = approach(smooth.ready, live ? 1 : 0, ease(0.03))
    smooth.pulse *= Math.pow(0.94, scale)

    const dials = dialsFor({ warmth: smooth.warmth, self: reduced ? 0 : smooth.self, user: reduced ? 0 : smooth.user, think: smooth.think, ready: smooth.ready, pulse: reduced ? 0 : smooth.pulse })
    const lean = -0.08 + smoothstep(0.3, 0.8, smooth.warmth) * 0.4
    const pointerOn = state.pointerActive && !reduced
    smooth.leanX = approach(smooth.leanX, pointerOn ? state.pointerY * lean : 0, ease(0.05))
    smooth.leanY = approach(smooth.leanY, pointerOn ? state.pointerX * lean : 0, ease(0.05))
    swarm.orient(smooth.leanX, smooth.leanY)

    renderer.setRenderTarget(null)
    swarm.frame(dials, dt, reduced)
    if (firstFrame) {
      firstFrame()
      firstFrame = undefined
    }
  }

  const start = () => {
    if (disposed || frame) return
    last = performance.now()
    lastDraw = 0
    frame = requestAnimationFrame(tick)
  }
  const stop = () => {
    cancelAnimationFrame(frame)
    frame = 0
  }

  size()
  preroll(swarm, dialsFor(REST), PREROLL_FRAMES)
  start()

  return {
    push(next) {
      // Mounting at warmth 18 is not a warmth change. Only movement after the
      // first reading swells or shrinks her.
      if (!hasState) {
        hasState = true
        smooth.warmth = clamp01(next.warmth / 100)
        smooth.ready = next.status === 'connecting' ? 0 : 1
        lastWarmth = next.warmth
      } else if (lastWarmth !== null && Math.abs(next.warmth - lastWarmth) >= 1) {
        smooth.pulse = Math.max(-1, Math.min(1, smooth.pulse + (next.warmth - lastWarmth) / 12))
        lastWarmth = next.warmth
      }
      state = next
    },
    measure(width, height) {
      if (width < 1 || height < 1) return
      cssWidth = width
      cssHeight = height
      const next = lodFor(Math.min(width, height), ratio)
      if (next.texture[0] !== lod.texture[0] || next.texture[1] !== lod.texture[1]) {
        // A different particle count is a different swarm. Rebuild and
        // pre-roll it so the swap is not a seed ball either.
        lod = next
        swarm.dispose()
        swarm = createSwarm(THREE, renderer, options.visual, lod.texture, LIVE_DISTANCE)
        size()
        preroll(swarm, dialsFor({ ...REST, warmth: smooth.warmth }), PREROLL_FRAMES)
      } else {
        lod = next
        size()
      }
    },
    setVisible(next) {
      visible = next
      if (visible) start()
      else stop()
    },
    setReducedMotion(next) {
      reduced = next
    },
    dispose() {
      disposed = true
      stop()
      options.canvas.removeEventListener('webglcontextlost', onLost)
      swarm.dispose()
      renderer.dispose()
    },
  }
}

/* ------------------------------------------------------------------ *
 * Stills
 * ------------------------------------------------------------------ */

interface StillRenderer {
  THREE: ThreeModule
  renderer: import('three').WebGLRenderer
  canvas: HTMLCanvasElement
}

let stillRenderer: Promise<StillRenderer | null> | null = null
let stillQueue: Promise<unknown> = Promise.resolve()
const stillCache = new Map<string, HTMLCanvasElement>()
const STILL_CACHE_LIMIT = 80

/** Warmth is bucketed so a meter ticking by one does not re-render a thumbnail. */
export const STILL_WARMTH_STEP = 5

function stillKey(visual: PersonaVisual, warmth: number, pixels: number): string {
  return `${visual.deep}|${visual.core}|${visual.sheen}|${visual.petals}|${visual.seed}|${warmth}|${pixels}`
}

function getStillRenderer(): Promise<StillRenderer | null> {
  stillRenderer ??= (async () => {
    try {
      const THREE: ThreeModule = await import('three')
      const canvas = document.createElement('canvas')
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true })
      if (!supportsSimulation(renderer)) {
        renderer.dispose()
        return null
      }
      renderer.autoClear = false
      renderer.setPixelRatio(1)
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault()
        // The next request builds a fresh one.
        stillRenderer = null
      })
      return { THREE, renderer, canvas }
    } catch {
      return null
    }
  })()
  return stillRenderer
}

/**
 * One frame of her at a warmth, as a transparent canvas, or null when this
 * device cannot run the simulation (the component then keeps its CSS form).
 *
 * Renders are serialised through one hidden renderer and yield between each,
 * so a roster of eight does not stall a frame.
 */
export function renderStill(visual: PersonaVisual, warmth: number, cssSize: number): Promise<HTMLCanvasElement | null> {
  const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
  const pixels = Math.max(16, Math.min(768, Math.round(cssSize * ratio / 8) * 8))
  const bucket = Math.round(Math.min(100, Math.max(0, warmth)) / STILL_WARMTH_STEP) * STILL_WARMTH_STEP
  const key = stillKey(visual, bucket, pixels)
  const cached = stillCache.get(key)
  if (cached) return Promise.resolve(cached)

  const job = stillQueue.then(async () => {
    const again = stillCache.get(key)
    if (again) return again
    await new Promise((resolve) => setTimeout(resolve, 0))
    const context = await getStillRenderer()
    if (!context) return null
    const { THREE, renderer, canvas } = context
    renderer.setSize(pixels, pixels, false)
    // Always 32k: a still renders once, so density is nearly free, and a
    // thumbnail drawn from 8k read as a faint halo around a dot. It is also
    // brighter than live, because it has no moving trails to fill it in.
    const swarm = createSwarm(THREE, renderer, visual, [256, 128], STILL_DISTANCE, STILL_GAIN)
    swarm.resize(pixels, pixels)
    const dials = dialsFor({ ...REST, warmth: bucket / 100 })
    renderer.setRenderTarget(null)
    preroll(swarm, dials, PREROLL_FRAMES + 20)
    const out = document.createElement('canvas')
    out.width = pixels
    out.height = pixels
    out.getContext('2d')?.drawImage(canvas, 0, 0)
    swarm.dispose()
    stillCache.set(key, out)
    if (stillCache.size > STILL_CACHE_LIMIT) {
      const oldest = stillCache.keys().next().value
      if (oldest !== undefined) stillCache.delete(oldest)
    }
    return out
  })
  stillQueue = job.catch(() => null)
  return job.catch(() => null)
}
