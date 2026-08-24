/**
 * One WebGL context for every avatar on the page.
 *
 * The roster mounts six to eight avatars at once and the interviewer grid four.
 * A renderer each meant six to eight live contexts against a browser cap of
 * roughly sixteen, with the oldest silently evicted and no way back — an avatar
 * that went blank stayed blank. So there is exactly one `WebGLRenderer` here,
 * module-scoped, and every mounted avatar registers against it.
 *
 * Each instance owns a scene and a small 2D canvas. Per frame the shared
 * renderer draws that instance into a sub-rectangle of one shared half-float
 * accumulation target, runs the composite pass over that rectangle, and blits
 * the result into the instance's own canvas with `drawImage`. The blit costs a
 * texture copy and buys arbitrary layout: avatars can be masked, clipped,
 * stacked and scrolled like any other element, which a single full-viewport
 * scissored canvas could not do.
 *
 * Everything here is imperative and lives outside React. The component in
 * `index.tsx` only feeds it state.
 */

import type {
  BufferGeometry,
  Group,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  TorusGeometry,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { lodFor, type PersonaVisual, type VisualLod } from '@/lib/personas/visual'
import { bodyFragment, bodyVertex, compositeFragment, compositeVertex, moteFragment, moteVertex } from './shaders'

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

export interface StageHandle {
  push(state: StageState): void
  /** From a ResizeObserver. CSS pixels. */
  measure(cssWidth: number, cssHeight: number): void
  setVisible(visible: boolean): void
  setReducedMotion(reduced: boolean): void
  dispose(): void
}

interface Shared {
  THREE: ThreeModule
  renderer: WebGLRenderer
  canvas: HTMLCanvasElement
  target: WebGLRenderTarget
  compositeScene: Scene
  compositeCamera: OrthographicCamera
  compositeMaterial: ShaderMaterial
  compositeGeometry: BufferGeometry
  /** Side of the square shared surface, in device pixels. */
  surface: number
  disposed: boolean
}

type NumericUniforms = Record<string, { value: number }>

interface Instance {
  visual: PersonaVisual
  context: CanvasRenderingContext2D
  canvas: HTMLCanvasElement
  scene: Scene
  camera: PerspectiveCamera
  root: Group
  body: Group
  meshes: Mesh[]
  materials: ShaderMaterial[]
  motes: Points | null
  moteMaterial: ShaderMaterial | null
  moteGeometry: BufferGeometry | null
  geometry: TorusGeometry
  uniforms: NumericUniforms
  lod: VisualLod
  width: number
  height: number
  cssWidth: number
  cssHeight: number
  state: StageState
  smoothWarmth: number
  smoothSelf: number
  smoothUser: number
  smoothThink: number
  smoothReady: number
  previousWarmth: number
  primed: boolean
  pulseAt: number
  pulseSign: number
  visible: boolean
  reduced: boolean
  needsRender: boolean
  lastFrameAt: number
}

/**
 * The largest shared surface we will allocate, in device pixels.
 *
 * It is square and multisampled, so it costs `side² × 8 × (samples + 1)` bytes.
 * 1280 bounds that at roughly 52 MB and still covers the biggest avatar the
 * layout can produce — the today card at ~500 CSS px on a 2× display.
 */
const MAX_SURFACE = 1280
/** Bound on the avatar in local units, used to frame the camera. */
const FIT_RADIUS = 1.58

let threeModule: Promise<ThreeModule> | null = null
let shared: Shared | null = null
let sharedPromise: Promise<Shared | null> | null = null
const instances = new Set<Instance>()
const lostListeners = new Set<() => void>()
let frame = 0
let running = false
let idleTeardown = 0

function loadThree(): Promise<ThreeModule> {
  threeModule ??= import('three')
  return threeModule
}

/**
 * Called when the shared context dies — eviction, a driver reset, a tab
 * restored from the background. Every mounted avatar drops to the CSS
 * fallback rather than sitting blank forever.
 */
export function onContextLost(listener: () => void): () => void {
  lostListeners.add(listener)
  return () => { lostListeners.delete(listener) }
}

function reportLoss(): void {
  const listeners = [...lostListeners]
  cancelIdleTeardown()
  teardownShared()
  for (const listener of listeners) listener()
}

function cancelIdleTeardown(): void {
  if (!idleTeardown) return
  clearTimeout(idleTeardown)
  idleTeardown = 0
}

/**
 * Tearing the context down the instant the last avatar unmounts would rebuild
 * it on every route change — a roster-to-brief hop empties and refills this
 * set within a frame. Wait, and let a returning avatar reclaim it.
 */
function scheduleTeardown(): void {
  cancelIdleTeardown()
  idleTeardown = setTimeout(() => {
    idleTeardown = 0
    if (instances.size > 0) return
    stopLoop()
    teardownShared()
  }, 5000) as unknown as number
}

function teardownShared(): void {
  const current = shared
  if (!current) return
  shared = null
  sharedPromise = null
  current.disposed = true
  current.target.dispose()
  current.compositeGeometry.dispose()
  current.compositeMaterial.dispose()
  current.renderer.dispose()
  current.renderer.forceContextLoss()
}

function ensureShared(): Promise<Shared | null> {
  if (shared) return Promise.resolve(shared)
  sharedPromise ??= createShared()
  return sharedPromise
}

async function createShared(): Promise<Shared | null> {
  const THREE = await loadThree()
  let renderer: WebGLRenderer
  try {
    // Antialiasing on the default framebuffer would do nothing: every edge is
    // drawn into the render target. `samples` on the target is what matters.
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'high-performance', depth: false, stencil: false })
  } catch {
    sharedPromise = null
    return null
  }

  renderer.autoClear = false
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(1)
  // Tone mapping happens once, in the composite pass, over the accumulated
  // linear buffer. Never per layer — summing tone-mapped, sRGB-encoded values
  // is what turned three translucent skins into grey.
  renderer.toneMapping = THREE.NoToneMapping

  const canvas = renderer.domElement
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); reportLoss() })

  const gl = renderer.getContext()
  const floatCapable = Boolean(gl.getExtension('EXT_color_buffer_half_float') ?? gl.getExtension('EXT_color_buffer_float'))
  const surface = 512
  const target = new THREE.WebGLRenderTarget(surface, surface, {
    type: floatCapable ? THREE.HalfFloatType : THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    samples: 4,
  })
  target.texture.colorSpace = THREE.NoColorSpace
  target.texture.generateMipmaps = false
  renderer.setSize(surface, surface, false)

  const compositeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uSource: { value: target.texture },
      uOffset: { value: new THREE.Vector2(0, 0) },
      uScale: { value: new THREE.Vector2(1, 1) },
      uExposure: { value: 0.74 },
    },
    vertexShader: compositeVertex,
    fragmentShader: compositeFragment,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  })
  const compositeGeometry = new THREE.PlaneGeometry(2, 2)
  const compositeScene = new THREE.Scene()
  compositeScene.add(new THREE.Mesh(compositeGeometry, compositeMaterial))
  const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  shared = { THREE, renderer, canvas, target, compositeScene, compositeCamera, compositeMaterial, compositeGeometry, surface, disposed: false }
  return shared
}

function growSurface(context: Shared, needed: number): void {
  if (needed <= context.surface) return
  const next = Math.min(MAX_SURFACE, Math.ceil(needed / 128) * 128)
  if (next <= context.surface) return
  context.surface = next
  context.renderer.setSize(next, next, false)
  context.target.setSize(next, next)
}

/**
 * The parameter grid only. The shader rebuilds the ring analytically from `uv`,
 * so the radius and tube passed here never reach the screen — they exist
 * because `TorusGeometry` insists on them.
 */
function buildGeometry(THREE: ThreeModule, lod: VisualLod): TorusGeometry {
  return new THREE.TorusGeometry(1, 0.3, lod.radial, lod.tubular)
}

function buildMotes(THREE: ThreeModule, visual: PersonaVisual, count: number) {
  let state = visual.seed || 1
  const random = () => { state = Math.imul(48271, state) % 0x7fffffff; return (state & 0x7fffffff) / 0x7fffffff }

  const positions = new Float32Array(count * 3)
  const phases = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2
    const radius = 1.20 + random() * 0.58
    positions[index * 3] = Math.cos(angle) * radius
    positions[index * 3 + 1] = Math.sin(angle) * radius * (0.74 + random() * 0.26)
    positions[index * 3 + 2] = (random() - 0.5) * 0.9
    phases[index] = random()
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWarmth: { value: 0 },
      uSize: { value: 2 },
      uReady: { value: 1 },
      uTint: { value: new THREE.Color(visual.core) },
    },
    vertexShader: moteVertex,
    fragmentShader: moteFragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
    toneMapped: false,
  })

  return { points: new THREE.Points(geometry, material), geometry, material }
}

/**
 * Layers separated in three dimensions, around three different axes.
 *
 * They used to sit 0.028 apart on z with a 0.09 rad twist, close enough to
 * coplanar that the silhouettes beat against each other into a flat spirograph
 * rosette. Real separation gives real parallax.
 */
function placeLayer(THREE: ThreeModule, mesh: Mesh, visual: PersonaVisual, layer: number, layers: number): void {
  const t = layers <= 1 ? 0 : layer / (layers - 1) - 0.5
  const seedAngle = (visual.seed % 628) / 100
  const axis = new THREE.Vector3(Math.cos(seedAngle + layer * 2.1), Math.sin(seedAngle + layer * 1.3), 0.55).normalize()
  // Mostly depth and scale, only a little twist. Coplanar layers beat into a
  // moiré; wildly divergent ones read as a bird's nest. Nested shells sit
  // between the two.
  mesh.setRotationFromAxisAngle(axis, t * 0.22)
  mesh.position.z = t * 0.30
  mesh.scale.setScalar(1 + t * 0.13)
}

function frameCamera(instance: Instance): void {
  const aspect = instance.width / Math.max(1, instance.height)
  const camera = instance.camera
  camera.aspect = aspect
  const half = Math.tan((camera.fov * Math.PI) / 360)
  const byHeight = FIT_RADIUS / half
  const byWidth = FIT_RADIUS / (half * aspect)
  // Contain, not cover: the avatar is never cropped by a wide card or a tall one.
  camera.position.z = Math.max(byHeight, byWidth) * 1.04
  camera.updateProjectionMatrix()
}

function applyLod(instance: Instance, THREE: ThreeModule): void {
  const next = lodFor(Math.max(instance.cssWidth, instance.cssHeight), window.devicePixelRatio || 1)
  const sameGeometry = next.radial === instance.lod.radial && next.tubular === instance.lod.tubular
  const sameMotes = next.motes === instance.lod.motes
  instance.lod = next
  if (sameGeometry && sameMotes) return

  if (!sameGeometry) {
    instance.geometry.dispose()
    instance.geometry = buildGeometry(THREE, next)
    for (const mesh of instance.meshes) mesh.geometry = instance.geometry
  }

  if (!sameMotes) {
    if (instance.motes) {
      instance.root.remove(instance.motes)
      instance.moteGeometry?.dispose()
      instance.moteMaterial?.dispose()
      instance.motes = null
      instance.moteGeometry = null
      instance.moteMaterial = null
    }
    if (next.motes > 0) {
      const built = buildMotes(THREE, instance.visual, next.motes)
      instance.root.add(built.points)
      instance.motes = built.points
      instance.moteGeometry = built.geometry
      instance.moteMaterial = built.material
    }
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function approach(current: number, goal: number, rate: number): number {
  return current + (goal - current) * rate
}

function update(instance: Instance, elapsed: number, now: number): void {
  const state = instance.state
  const reduced = instance.reduced
  const rate = reduced ? 1 : 0.12
  const warmthRate = reduced ? 1 : 0.045

  const targetWarmth = Math.min(1, Math.max(0, state.warmth / 100))
  instance.smoothWarmth = approach(instance.smoothWarmth, targetWarmth, warmthRate)

  // His microphone is always live. `speaking` chooses the emphasis; it does not
  // gate the signal. An avatar that ignores the microphone until VAD fires is
  // what made "listening" look dead.
  const live = state.status !== 'connecting'
  const userGoal = live ? Math.min(1, Math.max(0, state.userLevel)) * (state.speaking === 'user' ? 1 : 0.55) : 0
  const selfGoal = live ? Math.min(1, Math.max(0, state.personaLevel)) * (state.speaking === 'persona' ? 1 : 0.5) : 0
  const thinkGoal = state.speaking === 'thinking' ? 1 : 0
  const readyGoal = state.status === 'connecting' ? 0 : 1

  instance.smoothUser = approach(instance.smoothUser, userGoal, rate * 1.6)
  instance.smoothSelf = approach(instance.smoothSelf, selfGoal, rate * 1.6)
  instance.smoothThink = approach(instance.smoothThink, thinkGoal, reduced ? 1 : 0.05)
  instance.smoothReady = approach(instance.smoothReady, readyGoal, reduced ? 1 : 0.03)

  const pulseAge = (now - instance.pulseAt) / 1000
  const pulseLife = !reduced && pulseAge >= 0 && pulseAge < 1.15 ? 1 - smoothstep(0.12, 1.15, pulseAge) : 0

  const uniforms = instance.uniforms
  const set = (key: string, value: number) => { const uniform = uniforms[key]; if (uniform) uniform.value = value }
  const time = reduced ? instance.visual.seed * 0.001 : elapsed
  const warmth = instance.smoothWarmth

  set('uTime', time)
  set('uWarmth', warmth)
  set('uOpenness', 0.35 + warmth * 0.65)
  set('uCurl', 1 - warmth * 0.75)
  set('uSelf', reduced ? 0 : instance.smoothSelf)
  set('uUser', reduced ? 0 : instance.smoothUser)
  set('uThink', reduced ? 0 : instance.smoothThink)
  set('uReady', instance.smoothReady)
  set('uPulse', pulseLife)
  set('uPulseSign', instance.pulseSign)
  set('uPulsePos', Math.min(1, Math.max(0, pulseAge / 0.88)))

  const mote = instance.moteMaterial?.uniforms
  if (mote) {
    mote.uTime!.value = time
    mote.uWarmth!.value = warmth
    mote.uReady!.value = instance.smoothReady
    mote.uSize!.value = Math.max(1.5, instance.height * 0.016)
  }

  const tilt = instance.visual.tilt
  const lean = -0.08 + smoothstep(0.3, 0.8, warmth) * 0.4
  const pointerX = state.pointerActive ? state.pointerX : 0
  const pointerY = state.pointerActive ? state.pointerY : 0
  instance.root.rotation.x = approach(instance.root.rotation.x, tilt[0] + pointerY * lean, reduced ? 1 : 0.05)
  instance.root.rotation.y = approach(instance.root.rotation.y, tilt[1] + pointerX * lean, reduced ? 1 : 0.05)
  instance.root.rotation.z = tilt[2] + (reduced ? 0 : Math.sin(elapsed * 0.16 + instance.visual.seed) * 0.035)

  if (!reduced) {
    instance.body.rotation.z += 0.0006 + warmth * 0.0012
    if (instance.motes) instance.motes.rotation.z -= 0.0004 + warmth * 0.0006
  }
}

function draw(context: Shared, instance: Instance): void {
  const { renderer, target, surface } = context
  const width = instance.width
  const height = instance.height
  if (width < 1 || height < 1 || width > surface || height > surface) return

  const originY = surface - height

  renderer.setRenderTarget(target)
  renderer.setViewport(0, originY, width, height)
  renderer.setScissor(0, originY, width, height)
  renderer.setScissorTest(true)
  renderer.clear(true, false, false)
  renderer.render(instance.scene, instance.camera)

  const uniforms = context.compositeMaterial.uniforms
  ;(uniforms.uOffset!.value as Vector2).set(0, originY / surface)
  ;(uniforms.uScale!.value as Vector2).set(width / surface, height / surface)

  renderer.setRenderTarget(null)
  renderer.setViewport(0, originY, width, height)
  renderer.setScissor(0, originY, width, height)
  renderer.setScissorTest(true)
  renderer.clear(true, false, false)
  renderer.render(context.compositeScene, context.compositeCamera)
  renderer.setScissorTest(false)

  instance.context.clearRect(0, 0, width, height)
  instance.context.drawImage(context.canvas, 0, 0, width, height, 0, 0, width, height)
}

function tick(): void {
  frame = requestAnimationFrame(tick)
  const context = shared
  if (!context || context.disposed) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

  const now = performance.now()
  const elapsed = now / 1000

  for (const instance of instances) {
    if (!instance.visible) continue
    if (instance.reduced && !instance.needsRender) continue
    if (!instance.reduced && now - instance.lastFrameAt < 1000 / instance.lod.fps - 1) continue
    instance.lastFrameAt = now
    instance.needsRender = false
    update(instance, elapsed, now)
    draw(context, instance)
  }
}

function startLoop(): void {
  if (running) return
  running = true
  frame = requestAnimationFrame(tick)
}

function stopLoop(): void {
  if (!running) return
  running = false
  cancelAnimationFrame(frame)
}

export interface MountOptions {
  visual: PersonaVisual
  canvas: HTMLCanvasElement
  reducedMotion: boolean
}

/**
 * Attach one avatar to the shared renderer.
 *
 * Resolves to `null` when WebGL is unavailable, which the component reads as
 * "draw the CSS fallback". Never throws.
 */
export async function mountAvatar(options: MountOptions): Promise<StageHandle | null> {
  const context = await ensureShared()
  if (!context) return null
  const THREE = context.THREE

  const drawing = options.canvas.getContext('2d', { alpha: true })
  if (!drawing) return null

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 40)
  camera.position.set(0, 0, 5)

  const root = new THREE.Group()
  root.rotation.set(...options.visual.tilt)
  scene.add(root)
  const body = new THREE.Group()
  root.add(body)

  const lod = lodFor(96, window.devicePixelRatio || 1)
  const geometry = buildGeometry(THREE, lod)

  const deep = new THREE.Color(options.visual.deep)
  const core = new THREE.Color(options.visual.core)
  const sheen = new THREE.Color(options.visual.sheen)

  // One object per uniform name, spread into every layer's material, so a
  // single write reaches all of them. Only uLayer and the colours differ.
  const uniforms: NumericUniforms = {
    uTime: { value: 0 },
    uWarmth: { value: 0 },
    uOpenness: { value: 0.35 },
    uCurl: { value: 1 },
    uSelf: { value: 0 },
    uUser: { value: 0 },
    uThink: { value: 0 },
    uReady: { value: 1 },
    uMode: { value: options.visual.mode },
    uPetals: { value: options.visual.petals },
    uTube: { value: options.visual.tube },
    uPulse: { value: 0 },
    uPulseSign: { value: 1 },
    uPulsePos: { value: 0 },
    uSeed: { value: options.visual.seed % 997 },
    uLayers: { value: options.visual.layers },
  }

  const meshes: Mesh[] = []
  const materials: ShaderMaterial[] = []
  for (let layer = 0; layer < options.visual.layers; layer += 1) {
    const material = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uLayer: { value: layer }, uDeep: { value: deep }, uCore: { value: core }, uSheen: { value: sheen } },
      vertexShader: bodyVertex,
      fragmentShader: bodyFragment,
      // One surface per layer instead of two. `DoubleSide` on a closed ring
      // doubled the overdraw for a back face the front face already covers.
      side: THREE.FrontSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    placeLayer(THREE, mesh, options.visual, layer, options.visual.layers)
    body.add(mesh)
    meshes.push(mesh)
    materials.push(material)
  }

  const instance: Instance = {
    visual: options.visual,
    context: drawing,
    canvas: options.canvas,
    scene,
    camera,
    root,
    body,
    meshes,
    materials,
    motes: null,
    moteMaterial: null,
    moteGeometry: null,
    geometry,
    uniforms,
    lod,
    width: 1,
    height: 1,
    cssWidth: 1,
    cssHeight: 1,
    state: { warmth: 0, speaking: 'none', userLevel: 0, personaLevel: 0, status: 'idle', pointerX: 0, pointerY: 0, pointerActive: false },
    smoothWarmth: 0,
    smoothSelf: 0,
    smoothUser: 0,
    smoothThink: 0,
    smoothReady: 1,
    previousWarmth: 0,
    primed: false,
    pulseAt: -10_000,
    pulseSign: 1,
    visible: true,
    reduced: options.reducedMotion,
    needsRender: true,
    // Staggered, so eight roster cards sharing a 24 fps budget do not all fall
    // due on the same frame.
    lastFrameAt: performance.now() - (options.visual.seed % 41),
  }

  instances.add(instance)
  cancelIdleTeardown()
  startLoop()

  return {
    push(next: StageState) {
      const previous = instance.state
      instance.state = next
      if (!instance.primed) {
        // Mounting at warmth 18 is not a warmth change. Only movement after the
        // first push earns a pulse.
        instance.primed = true
        instance.previousWarmth = next.warmth
        instance.smoothWarmth = Math.min(1, Math.max(0, next.warmth / 100))
      } else if (next.warmth !== instance.previousWarmth) {
        instance.pulseAt = performance.now()
        instance.pulseSign = next.warmth > instance.previousWarmth ? 1 : -1
        instance.previousWarmth = next.warmth
      }
      if (
        next.warmth !== previous.warmth ||
        next.speaking !== previous.speaking ||
        next.status !== previous.status ||
        next.pointerActive !== previous.pointerActive
      ) {
        instance.needsRender = true
      }
    },
    measure(cssWidth: number, cssHeight: number) {
      instance.cssWidth = Math.max(1, cssWidth)
      instance.cssHeight = Math.max(1, cssHeight)
      applyLod(instance, THREE)
      const ratio = instance.lod.pixelRatio
      const width = Math.max(1, Math.min(MAX_SURFACE, Math.round(instance.cssWidth * ratio)))
      const height = Math.max(1, Math.min(MAX_SURFACE, Math.round(instance.cssHeight * ratio)))
      // A resized canvas is a blank canvas, and under reduced motion nothing
      // else would ever redraw it.
      instance.needsRender = true
      if (width === instance.width && height === instance.height) return
      instance.width = width
      instance.height = height
      instance.canvas.width = width
      instance.canvas.height = height
      frameCamera(instance)
      if (shared) growSurface(shared, Math.max(width, height))
    },
    setVisible(visible: boolean) {
      if (visible && !instance.visible) instance.needsRender = true
      instance.visible = visible
    },
    setReducedMotion(reduced: boolean) {
      instance.reduced = reduced
      instance.needsRender = true
    },
    dispose() {
      instances.delete(instance)
      instance.geometry.dispose()
      for (const material of instance.materials) material.dispose()
      instance.moteGeometry?.dispose()
      instance.moteMaterial?.dispose()
      if (instances.size === 0) scheduleTeardown()
    },
  }
}
