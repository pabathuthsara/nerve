# Avatar audit — `FluidPersona`

An audit of the WebGL persona avatar, and the record of the rebuild that
answered it. Nineteen numbered defects were found on 24 Aug 2026; **eighteen
are fixed and one was deliberately declined**. The numbering is preserved so
that code comments and future sessions can cite a defect by its id.

Read §1 for how the avatar works now, §5 for the state of every defect, and §6
for the palette decision this forced.

---

## 1. What it is now

Four files, replacing a single 481-line component:

| File | What it holds |
|---|---|
| [`lib/personas/visual.ts`](../lib/personas/visual.ts) | Authored content: twelve characters' form, motion and colour, plus `visualFor` and `lodFor`. Pure, tested |
| [`lib/personas/visual.test.ts`](../lib/personas/visual.test.ts) | 15 assertions — palette bounds, roster coverage, LOD monotonicity |
| [`components/fluid-persona/shaders.ts`](../components/fluid-persona/shaders.ts) | Three GLSL programs: body, motes, composite |
| [`components/fluid-persona/stage.ts`](../components/fluid-persona/stage.ts) | One shared `WebGLRenderer` for the whole page, and the per-instance scene lifecycle |
| [`components/fluid-persona/index.tsx`](../components/fluid-persona/index.tsx) | The React shell. Feeds state in; reads nothing back |

### The render path

Each mounted avatar owns a scene and a **2D canvas**. There is exactly one
WebGL context on the page, module-scoped, and it is never in the DOM. Per
frame, for each visible instance inside its frame budget:

1. Render the instance into a sub-rectangle of one shared **half-float**
   accumulation target. Body layers are additive, linear and premultiplied:
   RGB accumulates the light she emits, alpha accumulates coverage.
2. Run the composite pass over that rectangle — ACES, then the sRGB transfer,
   **once** — writing premultiplied colour with luminance-capped coverage.
3. `drawImage` the rectangle into the instance's own 2D canvas.

The blit costs a texture copy and buys arbitrary layout: avatars can be masked
(`.today-card__persona`), clipped, stacked and scrolled like any other element,
which a single full-viewport scissored canvas could not do.

### The geometry

The ring is rebuilt analytically from the torus `uv` inside the vertex shader
rather than displacing the baked `position`. That is what makes it possible to
**difference the normal from the displaced surface** — the single change that
turned these from flat stickers into volumes.

### Call sites

| Screen | File | Props | Instances |
|---|---|---|---|
| Roster card | `components/screens/core-screens.tsx:55` | `fill`, warmth = `bestWarmth` | 6–8 at once |
| Persona detail | `components/screens/core-screens.tsx:74` | `size={180}`, `interactive` | 1 |
| Today card | `components/screens/train-screen.tsx:59` | `fill` | 1 |
| Rep brief | `components/screens/rep-screens.tsx:65` | `size={132}` | 1 |
| **Live rep** | `components/screens/rep-screens.tsx:141` | `fill`, `speaking`, levels, `status`, `interactive` | 1 |
| Result | `components/screens/session-screens.tsx:67` | `size={148}`, `announceWarmth` | 1 |
| Interviewer grid | `components/screens/interview-screens.tsx:92` | `fill` | 4 |

---

## 2. Why they were discoloured

### D1 — Premultiply mismatch · **fixed**

`WebGLRenderer` defaults its **context** to `premultipliedAlpha: true`
(`three/src/renderers/WebGLRenderer.js:79`). `Material.premultipliedAlpha`
defaults to **false** (`three.core.js:16676`). So `WebGLState.setBlending` took
the non-premultiplied branch and selected `blendFuncSeparate(SRC_ALPHA, ONE,
ONE, ONE)`: RGB added correctly, **alpha accumulated with no attenuation**.
With alpha written up to 0.88 and `DoubleSide` × 3 layers putting ~6 fragments
on every pixel, canvas alpha saturated to 1.0 across the whole footprint. The
compositor then evaluated `final = canvas.rgb + page.rgb × (1 − canvas.a)`, and
with `a = 1` and a dim `rgb` the card background was **knocked out and replaced
by a dark smear** — the brown slab behind Jules, the dark halo behind Sam.

Now: the body writes premultiplied linear colour, the material declares it, and
coverage is capped at `luminance × 1.7 + 0.015` in the body and again at
`luminance × 1.9 + 0.01` in the composite. A dim fragment can no longer hide
the card behind it.

### D2 — Tone mapping applied per layer, then summed · **fixed**

`toneMapped: true` plus `#include <tonemapping_fragment>` meant each of ~6
fragments per pixel got ACES filmic *and* an sRGB encode, and the blender then
added those non-linear encoded values together. Summing sRGB-encoded colour is
not a meaningful operation: highlights clipped to white, saturated reds drifted
toward orange-brown, everything desaturated. That was the direct cause.

Now: `toneMapped: false`, no colour-space include in the body, accumulation in a
half-float target, and one ACES + transfer pass in the composite shader.
`EXT_color_buffer_half_float` is probed; without it the target falls back to
`UnsignedByteType` and the pass still runs once.

### D3 — No overdraw budget · **fixed**

`side: FrontSide` instead of `DoubleSide`, per-layer alpha scaled by
`1 − layer / layers × 0.30`, and `samples: 4` on the target for real MSAA
(antialiasing on the default framebuffer did nothing — every edge is drawn into
the target).

### D4 — The palette was off-spec · **fixed, and recorded as drift**

`erin: #4f77db` was effectively Cool and `nadia: #ff3157` effectively Red, used
as branding. Replaced by one recipe — `hsl(h, 16%, 24%)` / `hsl(h, 50%, 44%)` /
`hsl(h, 22%, 80%)` scaled by a per-character chroma factor — so the roster reads
as one system. See §6.

---

## 3. Why they looked flat

### F1 — The normals were wrong · **fixed**

The vertex shader displaced `p` heavily and then wrote `vNormalView =
normalize(normalMatrix * normal)` — the **undeformed torus normal**. Every
fresnel term was computed against a surface that was not the one being drawn.
The single biggest visual defect in the file.

Now `shape(u, v)` is called three times per vertex and the normal is the cross
product of two finite differences, oriented outward against the undisplaced
tube normal as a reference.

### F2 / F4 — Coplanar layers, near-orthographic camera · **fixed**

Layers sat 0.028 apart on z with a 0.09 rad twist — close enough to coplanar
that the silhouettes beat into a moiré rosette. FOV 36° at z = 5.15 gave almost
no perspective divergence.

Now layers separate in three dimensions around three different axes, but
*mostly in depth and scale* (`z ±0.15`, `scale ±6.5%`, twist only ±0.11 rad).
Both extremes were tried in the browser: coplanar gives moiré, wildly divergent
gives a bird's nest. Nested shells sit between the two. Camera is 45° FOV,
framed **contain** from the measured aspect so an avatar is never cropped by a
wide card or a tall one.

### F3 — No lighting model · **fixed**

Fresnel-only and additive with no depth write meant no depth cue at all. Now:
one key light with a hard wrap (so the unlit side stays translucent rather than
black), a rim, a tight Blinn-Phong specular, and a back-transmission term. She
reads as glass with something behind her.

### F5 — A torus is a ring · **declined, deliberately**

The audit suggested a raymarched SDF metaball. Not taken, and here is why: the
torus is not arbitrary — `uOpenness` opens the core as warmth rises, so the
shape *is* the meter. A guarded character is a tight closed ring and a warm one
is open. An SDF blob would have thrown that away to fix a problem that F1–F4
turned out to fix on their own. Revisit only if the ring metaphor itself is
being retired.

Jules's `discard`, which split the ring in half and read as a rendering
artefact rather than a design choice, was removed; she now carries a tri-lobe
fold and three layers instead.

---

## 4. Why they misbehaved

| # | Defect | Resolution |
|---|---|---|
| B1 | `fill` avatars rendered at the lowest LOD — `size` defaulted to 96 and drove quality, and every `fill` call site omitted it, so the 430px live orb ran at 24 segments and 1.35× DPR | `lodFor(measuredPixels, dpr)` in `visual.ts`, called from the ResizeObserver. Four stepped buckets, so layout drift cannot thrash geometry rebuilds |
| B2 | Six to eight WebGL contexts against a browser cap of ~16, with silent eviction and no recovery | One shared context for the whole page. Verified in Chrome: 6 avatars, 6 DOM canvases, **0 WebGL contexts in the DOM** |
| B3 | "Listening" was dead — `speaking: 'none'` mapped to a constant, and `userLevel` was ignored unless VAD had already fired | `userLevel` and `personaLevel` are read continuously. `speaking` only chooses the emphasis |
| B4 | `thinking` (0.015) was quieter than idle (0.045), so thinking looked deader than doing nothing | `uThink` is a slow internal churn on the tube and core, not stillness |
| B5 | User and persona fed the same uniform, so you could not tell who was speaking | `uUser` is a wave that travels round the ring and pulls it **inward**; `uSelf` blooms it **outward** and thickens it |
| B6 | A warmth drop pushed a negative additive term, which clamped to zero and rendered as nothing | `uPulseSign` drives signed *geometry* — a pinch inward — and drains colour rather than adding negative light |
| B7 | Reduced motion plus resize left a blank canvas: `resize()` never called `render()`, and `matchMedia` was read once | `measure()` sets `needsRender`, and the loop honours it for static instances. A `change` listener is attached. Verified by forcing the branch on |
| B8 | The scene rebuilt on a `size` change | `size` is out of the effect deps; it changes the box, the ResizeObserver sees it, nothing rebuilds |
| B9 | `connecting` had no visual state — the live screen showed "CONNECTING" and "listening" while the orb looked fully live | `status` is a prop; `uReady` holds her drawn-in, dimmer and mute until the session is up |
| B10 | The centre initial capped at 30px, and pointer tilt was on by default inside roster cards that are links | Initial is `clamp(12px, 15%, 46px)`; `interactive` defaults to **false** and is opted into on the persona detail and the live stage |

Also added, none of which the audit asked for but all of which "production
ready" needs: `webglcontextlost` handling with one retry then the CSS fallback,
`renderer.forceContextLoss()` on dispose, a per-instance frame budget (24 fps
for a roster card, 60 for the live stage), an `IntersectionObserver` that stops
off-screen avatars entirely, a `document.visibilityState` check that pauses the
whole loop in a background tab, and a five-second deferred teardown so a
route change does not destroy and rebuild the context.

---

## 5. Verification

```
npm run typecheck    ✓
npm run lint         ✓
npm test             ✓  625 passed, 1 skipped (15 new in visual.test.ts)
npm run build:check  ✓  three stays in its own dynamic chunk; first-load JS unchanged
```

Checked by eye in Chrome against a running dev server: roster (6 avatars),
persona detail at 180px, the today card at ~500px, the interviewer grid, and
the reduced-motion branch with `matches` forced true.

---

## 6. The palette decision

The audit ended by saying this needed a decision rather than a ticket. It was
taken on 24 Aug and recorded as **D9** in `LAUNCH-GAP.md` §4 and in the Arena
section of `CLAUDE.md`.

**Decision: the build wins, but the concession is bounded and enforced in
code.** Eight characters have to be told apart at a glance on the roster, and
form alone was not enough. So colour stays — as a material ramp, never an
accent:

- `deep` — graphite, barely tinted. What warmth 0 looks like: quiet, not invisible.
- `core` — her hue, at moderate chroma. Only fully expressed near warmth 100.
- `sheen` — rim and specular, desaturated, so highlights stay neutral.

Three rules, held by `lib/personas/visual.test.ts` rather than by a style note —
the same principle as rule 7 in `CLAUDE.md`:

1. Every hue avoids the 60–115° band, which is where Volt lives.
2. No avatar colour comes within an RGB distance of 60 of Volt, Volt-dim, Cool,
   Amber or Red.
3. Chroma runs from a **0.34 floor** to a **0.86 ceiling**. The floor keeps a
   guarded character identifiable — most screens show her at warmth 18. The
   ceiling means an avatar can never reach an accent's saturation.

The floor and ceiling matter more than they look. Chroma rises with warmth, so
**the colour is the meter**: she arrives graphite and gains herself as the
conversation goes well. That is what earns the colour its place on the screen,
and it is why the carve-out is defensible rather than merely convenient.

## 7. The particle avatar — 30 September 2026

**The ring-and-motes orb is gone.** `FluidPersona` keeps its name, its props
and every CSS class, and draws a particle swarm instead. §1–§5 above describe
the orb it replaced and are kept as the record; §6's palette rules are
unchanged and still bind.

**Where it came from.** The simulation is ported from Edan Kwan's *The Spirit*
(MIT, github.com/edankwan/The-Spirit): positions in a float texture, one
fragment pass per frame through curl noise, respawn in a breathing core. Its
shadows, motion blur, bloom and mouse follow were left out for phone
performance; a decaying half-float accumulation buffer stands in for the
motion blur and is most of why the swarm reads as smoke. It was tuned by eye
by the product owner in a local lab, at 65k particles on a phone, before it
replaced anything.

**What warmth does** is `lib/personas/swarm.ts`, pure and tested
(`swarm.test.ts`). Cold: small, pale, composed. Warm: larger, in her full
colour, faster and restless — gusts, a wandering wind, a field that churns
faster. Two findings from the lab are now assertions:

- **Fluid means neighbours move together.** Per-particle routes, jitter and
  hard speed re-rolls made the warm swarm read as television static. The
  restlessness now lives in things that move whole regions together.
- **Her colour is mostly there by the low sixties, and smooth through 65.**
  Most reps never pass 65, so colour that only arrived near 100 was colour
  most people never saw. 65 is also where the rep silently arms (rule 3); a
  step there would announce it, so the test walks the curve one point at a
  time across it. This amends §6's "only fully expressed near warmth 100": the
  colour is still the meter, it just reads earlier on it.

**Identity is still form as well as colour.** `petals` lobes her silhouette,
`tilt` sets the axis she turns on, `seed` gives her her own region of the flow
field, and `mode` picks her spin direction. The colours pass through raw — a
shader that let three.js linearise the hex values rendered every character
darker than §6 authored her, and the ground behind the swarm darker than the
frame around it.

**Live and still.** A WebGL context each is not affordable for a grid:
`mountLive` gives one avatar its own renderer and frame loop, and at most
`LIVE_LIMIT` (3) run at once. `motion="auto"` is live for a single avatar of
120px or more and a still otherwise; the roster cards, the locked teasers and
the interviewer grid pass `motion="still"` explicitly, because a
first-come-first-served budget makes half a grid animate. A still is one frame
of the real simulation — 32k particles, 110 frames on one shared hidden
renderer, serialised and cached by character, size and warmth in steps of
five — turned over 140 seconds and breathed over nine with CSS
(`persona-turn`, `persona-breathe`, removed under reduced motion). Particle
count scales with measured pixels (`lodFor`): 8k on a thumbnail, 65k on a
phone's live stage.

**Behaviour carried over from the orb:** his microphone always read, weighted
by who is speaking; drawn in and quiet while connecting; stilled on the loss
beat; a signed swell on a warmth change but not on mount; pointer lean that
grows with warmth; paused when scrolled out of view; reduced motion freezes
the flow but still shows warmth in size and colour. A lost context drops that
avatar to a still, and a device that cannot render to float textures gets the
CSS form — a soft cloud in her colours, which is also what shows while she
loads (§02: no spinners).

**Portraits are drawn warm; the rep earns it.** Outside a rep the avatar is
who she is, not how a conversation is going, so every portrait — roster cards
and detail, the Train card, the brief, `/start`, onboarding, interview strips,
lists and the landing page — passes `SHOWCASE_WARMTH` (72, in
`lib/personas/visual.ts`). Before, most screens passed 10–18, and with the
particle avatar that is a pale grey wisp on every screen but the one where she
is earned. Three places still pass a real warmth because there it is the
meter: the live rep stage, the result screen (her last frame of the rep,
announced to a screen reader) and the texting thread header. This amends §6's
floor rationale ("most screens show her at warmth 18"): the floor still
matters on the rep stage, where she starts cold.

**Two defects the first desktop look found.** A still was stretched to fill its
box, and a desktop roster portrait is a strip about four times wider than tall,
so the square frame was smeared sideways and the slow turn spun the smear into
a diagonal streak — "galaxies". A still is now a square on the box's shorter
side, centred. And the Train card is a large live avatar: 65k particles over a
box that size resolved into single strands and read as fur, so a box over
1100 device pixels on its shorter side gets 131k (`lodFor`), and the camera
fits the shorter side, since a vertical field of view clipped her sides in a
tall box.

**Verified:** in the browser on the live stage and at stills of 132, 72 and
44px, cold and warm, and on the landing page's house voice. **Owed by hand:**
a look at the signed-in screens (roster grid, Train card, profile list, result
screen), which the preview browser could not sign into, and a phone check of
the live rep stage with a real conversation running beside it.

**The pre-release screen pass (30 September 2026)**, every avatar and brief
screen at desktop and phone width, signed in:

- **Measure the layout box, never the drawn one.** The component decided
  live-versus-still with `getBoundingClientRect`, which includes transforms,
  and the reveal's arrival animation starts the avatar at 70% — so a 168px
  brief avatar measured ~85px, mounted as a still, and wore a thumbnail's
  initial. `layoutBox` reads `offsetWidth`/`offsetHeight`; only the pointer
  lean still uses the drawn rect, because that one is about where it is.
- **The initial is a thumbnail's.** It sat in the densest part of the smoke on
  every large avatar, each of which already has her name beside it in display
  type. It now shows only under 120px.
- **The "how it works" figure is the swarm.** It was three hard-coded crimson
  rings — a drawing of the orb this replaced, in a red Arena keeps for
  semantics. It is a still of the house visual now (`HowItWorksFigure`), not a
  character, because the sheet explains every character.
- **The Train card keeps her clear of its text.** The card layers the avatar
  behind the name and level chip, which the faint orb could afford and a bright
  swarm cannot; she sits in the upper right now and fades downward.
- **Framing**: `LIVE_DISTANCE` 3.9 → 3.5 so a live avatar fills its slot, and
  the character detail avatar 180 → 208px.
