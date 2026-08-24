/**
 * The GLSL behind `FluidPersona`.
 *
 * Three programs:
 *
 * - `bodyVertex` / `bodyFragment` — the layered translucent ring. The ring is
 *   rebuilt analytically from the torus `uv` rather than displacing the baked
 *   `position`, which means the surface normal can be **recomputed after the
 *   displacement**. Shading the deformed surface instead of the undeformed one
 *   is the difference between a volume and a sticker.
 * - `moteVertex` / `moteFragment` — the sparse motes drifting around her.
 * - `compositeVertex` / `compositeFragment` — one pass over the accumulation
 *   buffer: ACES, then the sRGB transfer, then premultiply. Exactly once.
 *
 * ## Why the body writes linear, premultiplied colour
 *
 * Every body fragment is additive, and additive blending is only meaningful in
 * a linear space. So the body pass runs with `toneMapped: false` and no
 * colour-space conversion, into a half-float target: RGB accumulates the light
 * she emits (colour × coverage), alpha accumulates coverage. The composite
 * pass is the only place a transfer function is applied.
 */

const COMMON = /* glsl */ `
  const float TAU = 6.28318530718;

  float circularDistance(float a, float b) {
    float d = abs(a - b);
    return min(d, 1.0 - d);
  }
`

export const bodyVertex = /* glsl */ `
  uniform float uTime;
  uniform float uWarmth;
  uniform float uOpenness;
  uniform float uCurl;
  uniform float uSelf;
  uniform float uUser;
  uniform float uThink;
  uniform float uReady;
  uniform float uMode;
  uniform float uPetals;
  uniform float uTube;
  uniform float uLayer;
  uniform float uPulse;
  uniform float uPulseSign;
  uniform float uPulsePos;
  uniform float uSeed;

  varying vec3 vNormalView;
  varying vec3 vViewPos;
  varying float vAround;
  varying float vEnergy;
  varying float vPulse;

  ${COMMON}

  /** The fold and lift profile for this character, at ring angle u. */
  void profile(float u, out float fold, out float lift) {
    float phase = u + uLayer * 0.72 + uSeed * 0.013;
    fold = 0.0;
    lift = 0.0;

    if (uMode < 0.5) {
      fold = sin(phase * uPetals + uTime * 0.22) * 0.23 * uCurl;
      lift = cos(phase * 2.0 - uTime * 0.18) * 0.17 * uCurl;
    } else if (uMode < 1.5) {
      float turbulence = mix(1.0, 0.24, uWarmth);
      fold = sin(phase * uPetals + uTime * 0.72) * 0.18 * turbulence;
      fold += sin(phase * 3.0 - uTime * 0.36) * 0.10 * uCurl;
      lift = sin(phase * 2.0 + uTime * 0.42) * 0.19 * turbulence;
    } else if (uMode < 2.5) {
      fold = sin(phase * uPetals + uTime * 0.20) * 0.10;
      lift = sin(phase * 3.0 - uTime * 0.24 + uLayer * 1.4) * mix(0.10, 0.20, uWarmth);
    } else if (uMode < 3.5) {
      fold = sin(phase * 2.0) * 0.16 * uCurl;
      lift = (uLayer - 0.5) * mix(0.30, 0.08, uWarmth) + sin(phase * 3.0) * 0.08;
    } else if (uMode < 4.5) {
      fold = cos(phase * uPetals - uTime * 0.30) * 0.14;
      lift = sin(phase + uTime * 0.23) * 0.19 * uCurl;
    } else if (uMode < 5.5) {
      fold = sin(phase * uPetals + uTime * 0.18) * 0.12;
      lift = cos(phase * 2.0 + uLayer * 2.2) * 0.18 * uCurl;
    } else if (uMode < 6.5) {
      fold = sin(phase * uPetals) * mix(0.08, 0.18, uWarmth);
      lift = sin(phase * 2.0 - uTime * 0.16) * 0.12;
    } else {
      // Alex: a hard, faceted fold that barely softens as she warms.
      fold = (abs(sin(phase * uPetals * 0.5)) - 0.44) * 0.18 * uCurl;
      lift = sin(phase * 4.0) * 0.10 * mix(1.0, 0.35, uWarmth);
    }
  }

  /**
   * The surface, as a function of its two parameters: u around the ring,
   * v around the tube. Called three times per vertex so the normal can be
   * differenced from the displaced surface rather than assumed from the
   * undisplaced one.
   */
  vec3 shape(float u, float v) {
    float fold;
    float lift;
    profile(u, fold, lift);

    float around = fract(u / TAU + 1.0);
    float phase = u + uLayer * 0.72 + uSeed * 0.013;
    float breath = sin(uTime * 1.55 + phase * 2.0) * 0.5 + 0.5;

    float core = mix(0.52, 1.05, uOpenness) + fold;
    float tube = uTube * mix(1.16, 0.84, uWarmth);

    // Her voice blooms the body outward and thickens it.
    core += uSelf * 0.075 * (0.6 + 0.4 * sin(phase * 3.0 + uTime * 5.2));
    tube *= 1.0 + uSelf * 0.24;

    // His voice is a wave that travels round the ring and pulls it inward.
    float userWave = sin(around * TAU * 2.0 - uTime * 5.4) * 0.5 + 0.5;
    core -= uUser * 0.060 * userWave;
    tube *= 1.0 + uUser * 0.07;

    // Thinking is a slow internal churn, not stillness.
    core += uThink * 0.030 * sin(u * 3.0 - uTime * 0.62);
    tube *= 1.0 + uThink * 0.11 * sin(u * 2.0 + uTime * 0.85);

    // A warmth change travels round the ring once: outward when she warms,
    // a pinch inward when she cools. Signed geometry, so a fall is visible.
    float band = exp(-pow(circularDistance(around, uPulsePos) / 0.10, 2.0));
    core += band * uPulse * uPulseSign * 0.09;

    core *= 1.0 + (breath - 0.5) * mix(0.018, 0.045, uWarmth);
    // Connecting: drawn in, quieter, not yet itself.
    core *= mix(0.86, 1.0, uReady);

    vec2 dir = vec2(cos(u), sin(u));
    vec3 p;
    p.xy = dir * (core + tube * cos(v));
    p.z = tube * sin(v) + lift;
    return p;
  }

  void main() {
    float u = uv.x * TAU;
    float v = uv.y * TAU;
    float e = 0.015;

    vec3 p = shape(u, v);
    vec3 du = shape(u + e, v) - p;
    vec3 dv = shape(u, v + e) - p;
    vec3 n = normalize(cross(du, dv));

    // Orient outward: the undisplaced tube normal is a reliable reference.
    vec3 reference = vec3(cos(u) * cos(v), sin(u) * cos(v), sin(v));
    n *= sign(dot(n, reference) + 1e-6);

    vec4 worldPosition = modelMatrix * vec4(p, 1.0);
    vec4 viewPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * viewPosition;

    float around = fract(u / TAU + 1.0);
    vNormalView = normalize(normalMatrix * n);
    vViewPos = viewPosition.xyz;
    vAround = around;
    vEnergy = uSelf * 0.7 + uUser * 0.35 + uWarmth * 0.25;
    vPulse = exp(-pow(circularDistance(around, uPulsePos) / 0.10, 2.0)) * uPulse;
  }
`

export const bodyFragment = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uCore;
  uniform vec3 uSheen;
  uniform float uWarmth;
  uniform float uLayer;
  uniform float uLayers;
  uniform float uReady;
  uniform float uPulseSign;

  varying vec3 vNormalView;
  varying vec3 vViewPos;
  varying float vAround;
  varying float vEnergy;
  varying float vPulse;

  void main() {
    vec3 N = normalize(vNormalView);
    vec3 V = normalize(-vViewPos);
    if (!gl_FrontFacing) N = -N;

    // One key, wrapped hard so the unlit side stays translucent rather than
    // black — she is glass with something behind her, not a painted shell.
    vec3 L = normalize(vec3(-0.34, 0.60, 0.72));
    float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    float key = pow(wrap, 1.55);
    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
    float transmission = pow(clamp(dot(-N, L), 0.0, 1.0), 2.4);
    vec3 H = normalize(L + V);
    float specular = pow(clamp(dot(N, H), 0.0, 1.0), 46.0);

    // Chroma has a floor and a ceiling. The floor keeps a guarded character
    // identifiable — most screens show her at warmth 18 and she still has to
    // be recognisably herself. The ceiling keeps her from ever reaching the
    // saturation of an Arena accent.
    float chroma = 0.34 + smoothstep(0.02, 0.92, uWarmth) * 0.52;
    vec3 body = mix(uDeep, uCore, chroma);

    vec3 color = body * (0.34 + key * 0.86);
    color += body * transmission * (0.16 + chroma * 0.26);
    color += uSheen * fresnel * (0.16 + chroma * 0.20);
    color += uSheen * specular * 0.30;
    color += uSheen * vEnergy * 0.07;

    // A rising pulse adds light; a falling one drains it, which reads as the
    // colour running out of her rather than as a dark band.
    float rising = step(0.0, uPulseSign);
    color += uSheen * vPulse * rising * 0.55;
    color *= 1.0 - vPulse * (1.0 - rising) * 0.55;

    color *= mix(0.42, 1.0, uReady);

    float alpha = 0.09 + fresnel * 0.38 + key * 0.13;
    alpha *= 1.0 - (uLayer / max(1.0, uLayers)) * 0.30;

    // Coverage may never outrun the light. Without this a dim fragment with a
    // high alpha knocks the card background out and leaves a dark slab.
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    alpha = min(alpha, luminance * 1.7 + 0.015);
    alpha = clamp(alpha, 0.0, 0.92);

    // Linear and premultiplied. The transfer function happens once, later.
    gl_FragColor = vec4(color * alpha, alpha);
  }
`

export const moteVertex = /* glsl */ `
  uniform float uTime;
  uniform float uWarmth;
  uniform float uSize;
  uniform float uReady;

  attribute float aPhase;

  varying float vFade;

  void main() {
    vec3 p = position;
    p.xy *= mix(0.86, 1.06, uWarmth);
    p.z += sin(uTime * 0.5 + aPhase * 6.28318) * 0.08;

    vec4 viewPosition = viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = uSize * (1.0 / max(0.35, -viewPosition.z));
    vFade = (0.35 + 0.65 * (sin(uTime * 0.9 + aPhase * 9.4) * 0.5 + 0.5)) * uReady;
  }
`

export const moteFragment = /* glsl */ `
  uniform vec3 uTint;
  uniform float uWarmth;

  varying float vFade;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float falloff = 1.0 - smoothstep(0.10, 0.5, length(d));
    float alpha = falloff * vFade * (0.10 + uWarmth * 0.26);
    if (alpha <= 0.001) discard;
    vec3 color = uTint * (0.6 + uWarmth * 0.8);
    gl_FragColor = vec4(color * alpha, alpha);
  }
`

export const compositeVertex = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/**
 * The only place a transfer function is applied.
 *
 * `uOffset`/`uScale` map this instance's viewport onto its sub-rectangle of the
 * shared accumulation buffer, so every avatar on the page shares one target.
 */
export const compositeFragment = /* glsl */ `
  uniform sampler2D uSource;
  uniform vec2 uOffset;
  uniform vec2 uScale;
  uniform float uExposure;

  varying vec2 vUv;

  // ACES filmic, Narkowicz's fit. Rolls the accumulated highlights off instead
  // of clipping them, which is what stopped the layers turning to grey.
  vec3 aces(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  vec3 encodeSRGB(vec3 value) {
    return mix(pow(value, vec3(0.41666)) * 1.055 - vec3(0.055), value * 12.92, vec3(lessThanEqual(value, vec3(0.0031308))));
  }

  void main() {
    vec4 accumulated = texture2D(uSource, uOffset + vUv * uScale);

    // RGB is already the light she emits — colour times coverage, summed — so
    // it is its own premultiplied value and must not be scaled again. Alpha is
    // only how much of the card behind her she hides.
    vec3 light = encodeSRGB(aces(accumulated.rgb * uExposure));
    float coverage = clamp(accumulated.a, 0.0, 1.0);

    float luminance = dot(light, vec3(0.2126, 0.7152, 0.0722));
    coverage = min(coverage, luminance * 1.9 + 0.01);

    gl_FragColor = vec4(light, coverage);
  }
`
