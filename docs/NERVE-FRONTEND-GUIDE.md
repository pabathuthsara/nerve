# NERVE — FRONTEND BUILD GUIDE

**For: Codex. Scope: the entire frontend, in one pass.**
Version 1.0 · Dating track (primary) + Interview track (secondary) · Mobile and desktop, equally weighted.

---

## 0. READ THIS FIRST — RULES OF ENGAGEMENT

You are building the frontend **into an existing repository** that already contains a working voice engine. Your job is the UI layer around it. Read this section completely before writing any code.

### 0.1 DO NOT TOUCH

These directories/modules are load-bearing and represent many rounds of empirical tuning. **Do not refactor, "clean up", reformat, rename, or modify them.** Import from them only.

| Path | What it is |
|---|---|
| `lib/voice/**` | The `VoiceProvider` abstraction and its OpenAI/ElevenLabs adapters |
| `lib/warmth/**` | The warmth state machine, trajectory/personality/gated-behaviour config |
| `lib/scoring/**` | Fast + slow scorers, band enforcement, scorecard generation |
| `lib/personas/**` | Persona compilation and character contracts |
| `app/api/**` | Ephemeral token minting, scoring endpoints, session persistence |
| Any file containing `gain`, `decayPerTurn`, `sessionCeiling`, `overreach` | Tuning constants |

If a screen needs something these modules don't currently expose, **do not edit them to add it.** Instead, add the need to `INTEGRATION-GAPS.md` at repo root as a checklist item and mock it. The repo owner will wire it.

### 0.2 THE MOCK SEAM

Every screen renders from a mock data layer. Build it like this:

```
lib/data/
  types.ts          # all TypeScript interfaces (Section 5 of this doc)
  mock/
    personas.ts
    sessions.ts
    field.ts
    user.ts
    interview.ts
  index.ts          # the seam — every hook lives here
```

`lib/data/index.ts` exports **hooks only**, never raw fixtures:

```ts
export function usePersonas(): { data: Persona[]; loading: boolean }
export function usePersona(id: string): { data: Persona | null; loading: boolean }
export function useUserState(): { data: UserState | null; loading: boolean }
export function useSessionHistory(): { data: SessionSummary[]; loading: boolean }
export function useScorecard(sessionId: string): { data: Scorecard | null; loading: boolean }
// ...etc
```

Each hook currently returns mock data after a simulated 200–500ms delay (so loading states are real and testable). Swapping to Supabase later means editing only `lib/data/index.ts`. **No component may import from `lib/data/mock/**` directly.** Enforce this with an ESLint `no-restricted-imports` rule.

### 0.3 THE VOICE SEAM

The live rep screen is the one place that touches real infrastructure. Wrap it:

```
lib/data/rep.ts
  useRepSession(personaId) → {
    status: 'idle'|'connecting'|'live'|'ending'|'ended',
    warmth: number, band: Band, trainingWheels: boolean,
    userLevel: number,        // 0..1 mic amplitude, smoothed
    personaLevel: number,     // 0..1 remote amplitude, smoothed
    speaking: 'none'|'user'|'persona'|'thinking',
    msRemaining: number,
    outcome: null | { won: boolean; phoneNumber?: string; exitLine: string },
    start(), end()
  }
```

Ship this with a **`MOCK_VOICE=true` env flag** that drives the whole thing off a scripted fake timeline (amplitudes from a sine wave, warmth climbing on a curve, a win at ~95s). This lets you build and visually verify the entire rep screen without burning API credits or needing a mic. The real implementation binds the same interface to `lib/voice`. Build the mock one; leave a clearly marked `TODO(integration)` for the real binding.

### 0.4 NON-NEGOTIABLES (inherited from the product spec)

1. **No spinners.** Anywhere. Use skeletons for content loading. The "thinking" gap during a rep is characterization, not a loading state — see §9.5.
2. **Never announce a downward difficulty adjustment.** If the system eases up, the UI says nothing.
3. **No coaching during a live rep.** Zero tips, hints, or nudges on `/rep/[id]/live`. The only live feedback is the ambient warmth ring.
4. **Outcome is never scored.** Getting the number is a *narrative consequence* of warmth crossing threshold, never a scoring input. A won rep can score 62; a lost rep can score 88. Never show "you won, so +points."
5. **No clinical language.** Not "anxiety", "therapy", "treatment", "disorder". This is training, not medicine.
6. **Dark only.** There is no light theme. Do not build one, do not add a toggle.

### 0.5 STACK & CONVENTIONS

- Next.js App Router, TypeScript strict, Tailwind CSS, React Server Components where trivially possible (most screens are client components because they're stateful).
- `framer-motion` for transitions. No other animation library.
- No component library (no shadcn, MUI, Chakra). Build the primitives in §4 by hand — the visual system is too specific and you'll fight the library.
- Icons: `lucide-react`, stroke width 1.5, size 20 default.
- Fonts via `next/font/google`.
- State: React Context for track + user state; local state elsewhere. No Redux/Zustand.

---

## 1. DESIGN SYSTEM — "ARENA"

Athletic performance equipment, not a dating app. Think stopwatch, weight rack, race timer. Precise, dark, unsentimental. Nothing rounded, nothing soft, nothing pink.

### 1.1 Color tokens

```css
--ground:    #0B0C0A;  /* page background */
--surface:   #131511;  /* cards, sheets */
--surface-2: #191C16;  /* raised / hover / input fields */
--line:      #242820;  /* all borders, 1px hairlines */
--text:      #E8EAE4;  /* primary text */
--text-dim:  #8B9184;  /* secondary text, labels */
--text-mute: #5A6055;  /* tertiary, disabled, placeholders */

--volt:      #C4F82A;  /* THE accent. Primary actions, active nav, win states */
--volt-dim:  #7A9B1A;  /* volt at rest / pressed */

--cool:      #5AA9FF;  /* ONLY for a second data series in charts. Never UI. */
--amber:     #FFB020;  /* warning, caution states only */
--red:       #FF4D3D;  /* error, destructive, loss states only */
```

**Volt is the only accent.** If a screen has two volt elements competing for attention, one of them is wrong. Semantic colors (amber/red) never decorate — they only mean something.

### 1.2 Warmth band colors

Used for the rep ring, band chips, and transcript gutters. These are the *only* place a gradient of color is allowed.

```css
--band-closed:   #4A5247;  /* grey-green, nearly dead */
--band-guarded:  #6B7A55;
--band-open:     #94B23C;
--band-engaged:  #B8E22E;
--band-invested: #C4F82A;  /* = volt */
```

### 1.3 Typography

```
Display / headings / numbers-as-headlines:  Barlow Condensed, 600/700, UPPERCASE, letter-spacing 0.02em
Body / UI text:                             IBM Plex Sans, 400/500
Data, labels, timers, metrics:              IBM Plex Mono, 400/500, font-variant-numeric: tabular-nums
```

**Every number in the app uses tabular-nums.** Timers, scores, percentages, counts. No exceptions — digits must not jitter as they change.

Scale (mobile / desktop):
```
display-xl   40/56px   Barlow Condensed 700 upper   (result verdict, big scores)
display-lg   28/36px   Barlow Condensed 700 upper   (screen titles)
display-md   20/24px   Barlow Condensed 600 upper   (section headers, card titles)
body-lg      16/17px   Plex Sans 400
body         14/15px   Plex Sans 400
label        11/12px   Plex Mono 500 upper, ls 0.08em, text-dim
data-xl      32/44px   Plex Mono 500 tabular
data         13/14px   Plex Mono 400 tabular
```

### 1.4 Geometry & depth

- **Border radius: 2px maximum.** Everywhere. The only exceptions are the orb and the warmth ring (circles) and the avatar (circle).
- **No box-shadows.** Depth comes from 1px `--line` hairlines and background steps (ground → surface → surface-2).
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
- Content max-width on desktop: 1120px, centered. Rep screen is full-bleed.
- Touch targets: 44px minimum on mobile.

### 1.5 Motion

- Durations: 120ms (micro/hover), 240ms (standard transitions), 400ms (warmth ring, band changes), 600ms+ (rep screen state beats only).
- Easing: `cubic-bezier(0.2, 0, 0, 1)` for enters, `cubic-bezier(0.4, 0, 1, 1)` for exits.
- Page transitions: 180ms cross-fade + 8px upward slide. Nothing more elaborate.
- **Respect `prefers-reduced-motion`:** disable the orb's continuous animation (hold it at a static mid-state), disable page slides, keep opacity fades. Never disable the warmth ring's value change — it's information, not decoration.

---

## 2. APP SHELL & NAVIGATION

Two layouts, same components, driven by a single `useBreakpoint()` hook. Breakpoint: **`lg` = 1024px**.

### 2.1 Mobile (<1024px)

```
┌─────────────────────────┐
│  Top bar (56px)         │  ← screen title + optional right action. Hidden on rep screen.
├─────────────────────────┤
│                         │
│  Scrollable content     │  ← 16px horizontal padding
│                         │
├─────────────────────────┤
│  Bottom tab bar (64px)  │  ← 4 tabs, safe-area-inset-bottom padding
└─────────────────────────┘
```

Bottom tab bar: 4 equal tabs, icon (20px) above label (10px Plex Mono upper). Active = volt icon + volt label + a 2px volt bar across the top edge of that tab. Inactive = `--text-mute`. Background `--surface`, 1px `--line` top border.

### 2.2 Desktop (≥1024px)

```
┌────────┬────────────────────────────────┐
│        │  Top bar (64px)                │
│ Rail   ├────────────────────────────────┤
│ 240px  │                                │
│        │  Content, max-w 1120px         │
│        │                                │
│        │                                │
└────────┴────────────────────────────────┘
```

Left sidebar rail (240px, fixed, `--surface`, 1px right hairline):
- Wordmark "NERVE" at top (Barlow Condensed 700, 20px, volt), 24px padding
- Track switcher directly beneath it (see §2.3)
- 4 nav items, vertical, 44px tall each, icon + label, 12px gap. Active = volt text + volt 2px left border + `--surface-2` background.
- Pushed to the bottom: reps-remaining pill + avatar/account button

### 2.3 The four tabs

| Tab | Icon (lucide) | Route | Purpose |
|---|---|---|---|
| Train | `zap` | `/train` | What do I do right now |
| Roster | `users` | `/roster` | Who can I face, what's locked |
| Field | `target` | `/field` | Real-world challenges |
| Profile | `user` | `/profile` | History, stats, account |

**Track switching:** when the user has both tracks unlocked, a compact switcher sits above the nav (mobile: in the top bar as a small segmented control; desktop: in the rail under the wordmark). Two segments: `DATING` / `INTERVIEW`. Switching swaps `/train`↔`/interview` and re-scopes Roster. **Field is dating-only** — hide the tab entirely in interview track (3 tabs then, not a disabled 4th).

If the user has only one track, render no switcher at all.

### 2.4 Chrome-free routes

These render with **no nav, no top bar, full-bleed**: all `/auth/*`, all `/onboarding/*`, `/rep/*/live`, `/interview/rep/*/live`, and `/session/*/result`.

---

## 3. COMPLETE ROUTE MAP

```
/                                       → redirect: authed → /train, else → /login

AUTH (chrome-free)
/login
/signup
/verify-email
/forgot-password
/reset-password                         ?token=
/auth/callback                          OAuth landing

ONBOARDING (chrome-free, linear, progress dots)
/onboarding/track                       Q1 — what are you training for
/onboarding/focus                       Q2 — what's hardest
/onboarding/experience                  Q3 — how much have you done this
/onboarding/mic                         Mic check
/onboarding/ready                       First-rep brief → straight into a rep

DATING TRACK (chrome)
/train                                  Home
/roster
/roster/[personaId]                     Persona detail (full page on desktop, sheet on mobile)
/field
/profile
/profile/history
/profile/settings
/profile/subscription

REP FLOW
/rep/[personaId]/brief                  5-second scene setter (chrome-free)
/rep/[personaId]/live                   THE REP (chrome-free)

SESSION RESULTS (shared by both tracks)
/session/[sessionId]/result             Win/loss beat (chrome-free)
/session/[sessionId]/scorecard          Breakdown (chrome)
/session/[sessionId]/transcript         Turn-by-turn review (chrome)

INTERVIEW TRACK (chrome)
/interview                              Home
/interview/setup/role                   Job title, company, JD paste
/interview/setup/cv                     CV upload
/interview/setup/questions              Custom questions
/interview/interviewers                 Pick your interviewer
/interview/rep/[interviewerId]/brief    (chrome-free)
/interview/rep/[interviewerId]/live     (chrome-free)

CATCH-ALL
/not-found
/error
```

**Route guards:**
- Unauthenticated → any `/train|/roster|/field|/profile|/rep|/session|/interview` → redirect `/login`
- Authenticated but `onboardingComplete === false` → redirect `/onboarding/track`
- `repsRemainingToday === 0` → `/rep/*/brief` shows the paywall sheet instead of proceeding
- Locked persona → `/roster/[id]` renders but the START button is replaced by the unlock requirement

---

## 4. COMPONENT INVENTORY

Build these in `components/`. Every one needs a mobile and desktop behavior.

### 4.1 Primitives (`components/ui/`)

| Component | Props / notes |
|---|---|
| `Button` | `variant: 'primary'\|'secondary'\|'ghost'\|'danger'`, `size: 'sm'\|'md'\|'lg'`, `loading`, `fullWidth`. Primary = volt bg, ground text, Barlow Condensed upper. Secondary = transparent bg, 1px line border, text. Ghost = no border. Radius 2px. `loading` shows a 3-dot pulse, **not a spinner**. |
| `IconButton` | 40px square, ghost by default |
| `Card` | `--surface` bg, 1px `--line`, 2px radius, 16px padding |
| `Hairline` | 1px `--line` divider, horizontal or vertical |
| `Stat` | label (Plex Mono upper 11px dim) above value (Plex Mono tabular). `size: 'sm'\|'lg'` |
| `Chip` | `tone: 'neutral'\|'volt'\|'amber'\|'red'\|'band'`. For band tone pass `band` prop. 11px Plex Mono upper, 1px border, 2px radius, 4px/8px padding |
| `ProgressBar` | linear, 4px tall, `--surface-2` track, volt fill, animates 240ms |
| `ProgressRing` | SVG circle, `value 0-100`, `size`, `strokeWidth`, `color`. Used by warmth ring and time arc |
| `Sheet` | **Responsive**: bottom sheet on mobile (slides up, drag-to-dismiss, rounded top 2px, backdrop `rgba(11,12,10,0.7)`), centered dialog on desktop (max-w 480px, fades + scales from 0.98). Same API both. |
| `Modal` | Non-dismissible variant of Sheet (no backdrop click, no drag). For blocking states only. |
| `Toast` | Bottom-center mobile / bottom-right desktop. Auto-dismiss 4s. `tone: 'neutral'\|'volt'\|'red'` |
| `Input` / `Textarea` | `--surface-2` bg, 1px `--line`, 2px radius, 44px tall, volt focus ring (1px, not glow). Label above in Plex Mono 11px upper dim. |
| `FileDrop` | Drag-drop zone + click-to-browse. Shows filename, size, replace/remove. Accepts `.pdf,.docx`. |
| `Tabs` | Underline style, volt 2px active indicator |
| `Skeleton` | Shimmering `--surface-2` blocks. The ONLY loading affordance. |
| `EmptyState` | Icon (32px, `--text-mute`), display-md title, body-sm dim description, optional CTA |
| `LockOverlay` | Semi-opaque `--ground` at 72%, centered lock icon + requirement text. Wraps locked cards. |
| `Avatar` | Account avatar only: circle, sizes 32/48/64/96. Falls back to an initial on `--surface-2`. |
| `FluidPersona` | Persona identity at every scale. Three.js ribbon form with a sharp HTML initial and a CSS fallback when WebGL is unavailable. |

### 4.2 Composites (`components/`)

| Component | Used on |
|---|---|
| `AppShell` | wraps all chrome routes; renders BottomTabBar or SidebarRail |
| `BottomTabBar` / `SidebarRail` | nav |
| `TrackSwitcher` | nav |
| `RepsRemaining` | Train header, sidebar. `3 REPS LEFT` pill. At 0 → amber + "RESETS 04:12" countdown |
| `StreakCounter` | `12 DAY STREAK` — Plex Mono, flame icon. Keep it austere, not celebratory. |
| `TodaysRepCard` | the big single CTA on `/train` |
| `PersonaCard` | Roster grid. Portrait, name, setting, level chip, your record, lock state |
| `LevelSection` | Roster: level header + description + its 2 personas |
| `FieldChallengeCard` | Field: today's challenge + Did it / Couldn't do it |
| `SessionRow` | History list: date, persona, won/lost icon, score, duration |
| `MetricBandRow` | Scorecard: metric name, your value, target range, band bar, points earned |
| `MomentCard` | Scorecard: a quoted turn with its delta and why |
| `TranscriptTurn` | Transcript: speaker, text, delta badge, warmth gutter |
| `WarmthSparkline` | Transcript header: warmth over the whole session, 40px tall |
| `FluidPersona` | **The rep screen centerpiece — see §9** |
| `TimeArc` | Depleting time indicator |
| `MicLevelMeter` | Mic check: 12-segment horizontal level meter |
| `OnboardingProgress` | 5 dots, volt = done, line = pending |
| `PaywallSheet` | Out of reps |

---

## 5. DATA MODELS (`lib/data/types.ts`)

```ts
export type Track = 'dating' | 'interview'
export type Level = 1 | 2 | 3 | 4
export type Band = 'CLOSED' | 'GUARDED' | 'OPEN' | 'ENGAGED' | 'INVESTED'
export type Plan = 'free' | 'pro' | 'elite'

export interface UserState {
  id: string
  email: string
  displayName: string
  activeTrack: Track
  unlockedTracks: Track[]
  currentLevel: Level              // highest level unlocked
  repsRemainingToday: number
  repsPerDay: number
  repsResetAt: string              // ISO
  streakDays: number
  plan: Plan
  trainingWheels: boolean          // show numeric warmth (auto-false at L4)
  onboardingComplete: boolean
  focusArea: 'opening' | 'sustaining' | 'flirting' | 'rejection' | null
}

export interface Persona {
  id: string
  name: string
  level: Level
  setting: string                  // "Quiet bookshop, Sunday afternoon"
  settingShort: string             // "Bookshop"
  hook: string                     // one line shown on the brief: "She's looking for a specific book."
  blurb: string                    // 2 lines on detail: who she is
  respondsTo: string[]             // ["specific questions", "being teased lightly"]
  shutsDownOn: string[]            // ["compliments about looks", "three questions in a row"]
  portraitUrl: string
  locked: boolean
  unlockRequirement: string | null // "Win 2 reps at Level 1"
}

export interface PersonaProgress {
  personaId: string
  attempts: number
  wins: number
  bestTimeMs: number | null        // fastest win
  bestWarmth: number
  lastAttemptAt: string | null
}

export interface SessionSummary {
  id: string
  track: Track
  personaId: string
  personaName: string
  personaSettingShort: string
  startedAt: string
  durationMs: number
  won: boolean
  finalWarmth: number
  finalBand: Band
  compositeScore: number           // 0-100, PROCESS score, independent of `won`
}

export type BandVerdict = 'LOW' | 'GOOD' | 'HIGH'

export interface MetricBand {
  key: 'talk_ratio' | 'question_rate' | 'open_closed' | 'longest_monologue' | 'response_latency' | 'callbacks'
  label: string                    // "Talk ratio"
  displayValue: string             // "58%"
  numericValue: number
  targetLabel: string              // "40–55%"
  targetMin: number
  targetMax: number
  verdict: BandVerdict
  points: number
  maxPoints: number
  note: string                     // "You held the floor too long."
}

export interface Moment {
  turnIndex: number
  quote: string                    // the user's actual line
  delta: number                    // e.g. +4 or -3
  warmthAfter: number
  note: string                     // why it moved
}

export interface Scorecard {
  sessionId: string
  composite: number
  metrics: MetricBand[]            // sum of points must equal composite — show the audit
  bestMoment: Moment | null
  worstMoment: Moment | null
  tryNext: string                  // ONE actionable line
}

export interface TranscriptTurn {
  index: number
  speaker: 'user' | 'persona'
  text: string
  tStart: number                   // ms from session start
  tEnd: number
  warmthAfter: number | null       // null on persona turns
  delta: number | null
  reason: string | null            // shown when a turn is expanded
}

export interface FieldChallenge {
  id: string
  tier: 1 | 2 | 3 | 4
  title: string                    // "Ask a stranger for the time."
  detail: string
  status: 'pending' | 'done' | 'skipped'
  completedAt: string | null
}

export interface Interviewer {
  id: string
  name: string
  style: 'friendly_hr' | 'technical' | 'distracted_exec' | 'panel_lead'
  styleLabel: string               // "Friendly HR"
  gender: 'male' | 'female'
  blurb: string
  portraitUrl: string
  level: Level
  locked: boolean
}

export interface InterviewSetup {
  roleTitle: string
  company: string
  jobDescription: string
  cvFileName: string | null
  cvUploadedAt: string | null
  customQuestions: string[]
  complete: boolean
}
```

### 5.1 Mock roster — build exactly these 8 personas

All female (deliberate MVP decision — men-first audience). Two per level.

| # | Name | Level | Setting | Hook |
|---|---|---|---|---|
| 1 | Nadia | 1 | Quiet bookshop, Sunday afternoon | She's hunting for a specific book and can't find it. |
| 2 | Priya | 1 | Coffee shop, in the queue | She's early for something and killing time. |
| 3 | Mira | 2 | Gym, between sets | She's mid-workout and has headphones half-in. |
| 4 | Chloe | 2 | Bus stop, evening | Her bus is late and she's mildly annoyed. |
| 5 | Jules | 3 | Gallery opening | She's here for the art, not to be talked to. |
| 6 | Samara | 3 | Bar, friends nearby | Her friends are two metres away and watching. |
| 7 | Riley | 4 | Rooftop party | Third guy to approach her tonight. She's over it. |
| 8 | Alex | 4 | Hotel bar, business trip | Sharp, tired, leaves at the first dull sentence. |

Level names for the Roster headers:
- **LEVEL 01 — RECEPTIVE** · "She'll meet you halfway."
- **LEVEL 02 — NEUTRAL** · "She'll give you nothing for free."
- **LEVEL 03 — RESISTANT** · "You are an interruption."
- **LEVEL 04 — HOSTILE** · "She wants you to leave."

### 5.2 Mock interviewers — 4

| Name | Style | Gender | Level |
|---|---|---|---|
| Dan Whitfield | Friendly HR | male | 1 |
| Aisha Rahman | Friendly HR | female | 1 |
| Marcus Vance | Technical | male | 3 |
| Elena Kovač | Distracted exec | female | 4 |

---

## 6. SCREENS — AUTH

All chrome-free. Shared layout: centered column, max-w 380px mobile / 420px desktop, vertically centered. Wordmark "NERVE" at top (Barlow Condensed 700, 24px, volt, ls 0.04em). Nothing else on the page — no marketing copy, no illustrations.

### 6.1 `/signup`
- Title: `START TRAINING` (display-lg)
- Google OAuth button (secondary variant, full width, Google mark left)
- Hairline with centered `OR` label
- Email input, password input (with show/hide toggle, min 8 char, inline strength hint as plain text not a bar)
- Primary button: `CREATE ACCOUNT`
- Below: "Already training? **Log in**" (volt link)
- Fine print: terms + privacy links, 11px `--text-mute`
- **States:** idle, submitting (button loading dots), field errors inline below each field in `--red` 12px, server error as a red-bordered banner above the form.

### 6.2 `/login`
Same layout. Title `LOG IN`. Email + password, "Forgot?" link right-aligned above password field. Primary `LOG IN`. Link to signup.

### 6.3 `/verify-email`
- Icon: `mail-check` 32px volt
- Title `CHECK YOUR EMAIL`
- Body: "We sent a link to **{email}**."
- Secondary button `RESEND` — disabled with a 60s countdown after each send (`RESEND IN 47s`, Plex Mono)
- Ghost link: "Wrong address? Start over"

### 6.4 `/forgot-password`
Email input + `SEND RESET LINK`. On success, swap the whole card to a confirmation state (same as 6.3 pattern). Do not navigate away.

### 6.5 `/reset-password?token=`
New password + confirm. Primary `SET PASSWORD`. Invalid/expired token → full-card error state with a link back to `/forgot-password`.

### 6.6 `/auth/callback`
Blank ground with the wordmark and three pulsing volt dots. No text. Redirects on resolve. If it fails → toast + redirect to `/login`.

---

## 7. SCREENS — ONBOARDING

Chrome-free. Linear. **4 taps and a mic check — target under 40 seconds total.** No typing anywhere except nothing (there is no typing).

Shared layout: `OnboardingProgress` dots pinned top-center (5 steps). Back chevron top-left from step 2 onward. Question as display-lg, left-aligned, generous top space. Options as full-width stacked cards below.

**Option card:** 72px tall, `--surface` bg, 1px `--line`, 2px radius, 16px padding. Label (body-lg) + optional sub-label (13px dim). On select: volt 1px border + volt label + a volt 2px left edge. Selecting **immediately advances** after 180ms — no "Next" button. Desktop: same cards, max-w 480px, centered.

### 7.1 `/onboarding/track` — Q1
**"WHAT ARE YOU TRAINING FOR?"**
- `Talking to people I'm attracted to` — sub: "Approach, conversation, getting the number"
- `Job interviews` — sub: "Behavioural, technical, panel"
- `Speaking English more naturally` — sub: "Coming soon" · **rendered disabled/dimmed with a `SOON` chip**

If Interview selected at MVP: advance to a **waitlist interstitial** — "Interview training opens soon. You're on the list." with `TRY A DATING REP MEANWHILE` (primary) and `I'LL WAIT` (ghost, → a holding screen). Record the selection either way; this is demand data.

### 7.2 `/onboarding/focus` — Q2
**"WHAT'S THE HARD PART?"**
- `Starting the conversation`
- `Keeping it going past two lines`
- `Making it flirty without being weird`
- `Handling it when she's not interested`

Sets `focusArea`. Used to pick which persona is recommended first and to tune copy on `/train`.

### 7.3 `/onboarding/experience` — Q3
**"HOW OFTEN DO YOU DO THIS FOR REAL?"**
- `Basically never` → start L1
- `Once in a while` → start L1
- `Fairly often, want to get sharper` → start L2

Never let anyone start above L2 regardless of answer. Overconfident users who start at L3 lose, feel bad, and churn.

### 7.4 `/onboarding/mic` — Mic check
This screen must prove the whole audio pipeline works end-to-end before the user's first rep. Four sequential states in one screen:

1. **Request** — mic icon 48px, `WE NEED YOUR MICROPHONE`, body: "Reps are spoken out loud. Nothing is recorded to disk." Primary `ALLOW MICROPHONE` → triggers `getUserMedia`.
2. **Denied** (if rejected) — red-toned. Per-browser instructions (detect UA): "Click the 🔒 in your address bar → Site settings → Microphone → Allow." Secondary `TRY AGAIN`.
3. **Level test** — live `MicLevelMeter` (12 segments, filling volt left-to-right off the analyser RMS). Prompt: **"Say: 'testing, one two three'"** in display-md. Below, dim: "Headphones recommended — she'll hear herself otherwise." Auto-advance when sustained level > threshold for 800ms.
4. **Confirmed** — check icon volt, `WE CAN HEAR YOU`, and **echo back the transcribed text** in Plex Mono (this proves STT works, not just the mic). Primary `CONTINUE`.

Include a device picker (`<select>` of `enumerateDevices` audio inputs) at the bottom of states 3–4, styled as a ghost dropdown.

### 7.5 `/onboarding/ready` — First-rep brief
The handoff into their first rep. **Do not route to `/train` yet** — a dashboard full of zeros is the worst possible first impression.

- Persona portrait, 96px, centered
- `NADIA` (display-lg)
- `QUIET BOOKSHOP · SUNDAY AFTERNOON` (label)
- Hook line, body-lg centered, max-w 320px: "She's hunting for a specific book and can't find it."
- A 3-row rule block, Plex Mono 13px, hairline-separated:
  ```
  TIME        3:00
  GOAL        GET HER NUMBER
  SHE LEAVES  WHEN TIME RUNS OUT
  ```
- Primary full-width `START` 
- Ghost below: `How does this work?` → opens `HowItWorksSheet` (§10.3)

This first rep is flagged `isCalibration: true` — it does **not** consume a daily rep, and the engine runs a slightly warmer L1. The UI never says so.

---

## 8. SCREENS — DATING TRACK CORE

### 8.1 `/train` — Home

**This is not a dashboard.** It answers exactly one question: *what do I do right now.* One primary decision, visible without scrolling.

**Mobile layout, top to bottom:**

1. **Header row** — `RepsRemaining` pill left, `StreakCounter` right. 48px tall, no title text.
2. **`TodaysRepCard`** — the hero. Full-width, ~380px tall.
   - Persona portrait as a large dimmed background image (`--ground` 60% overlay, so text stays legible)
   - Bottom-anchored content: level chip (`LEVEL 02 — NEUTRAL`), name in display-xl, setting in label style, hook line in body
   - Full-width primary `START REP` button
   - Below it, ghost text button: `Someone else` → `/roster`
   - If `repsRemainingToday === 0`: START becomes `OUT OF REPS` (amber, disabled-looking but tappable) → opens `PaywallSheet`
3. **Hairline**
4. **`FieldChallengeCard`** — today's real-world challenge. Tier chip, title (display-md), one-line detail. Two buttons side by side: `DID IT` (primary sm) / `COULDN'T` (secondary sm). If already actioned today, collapses to a single completed row with a check and the time.
5. **Last result strip** (only if a session exists within 48h) — a `SessionRow` under a `LAST REP` label, tappable → scorecard.

**Desktop layout:** two columns inside the 1120px container. Left column (~62%): TodaysRepCard, taller and wider with the portrait to the left of the text rather than behind it. Right column (~38%): a stack of RepsRemaining + Streak as `Stat` blocks, then FieldChallengeCard, then last result. Everything above the fold.

**Recommendation logic (mock it, but structure it):** pick the lowest-level persona the user hasn't beaten yet; if all at their level are beaten, pick the first at the next level; if they lost their last rep against persona X, recommend X again ("run it back" is better for learning than moving on).

**Empty state:** never occurs — every user arrives here having already done the calibration rep.

### 8.2 `/roster` — The map

Vertically stacked `LevelSection`s, one per level, in order.

Each section header: level name (display-md, e.g. `LEVEL 02 — NEUTRAL`) + its one-line description (dim body) + a right-aligned progress fraction (`1/2 BEATEN`, Plex Mono). Hairline beneath.

Each section body: its 2 `PersonaCard`s. **Mobile:** stacked full-width cards, 140px tall, portrait left (96px square), text right. **Desktop:** 2-up grid, 240px tall, portrait on top, text below.

`PersonaCard` contents: portrait, name (display-md), setting (label), and a record line in Plex Mono:
- Never attempted: `NOT ATTEMPTED` (dim)
- Attempted, no win: `0/3 — BEST WARMTH 54` (dim)
- Won: `WON — 1:42 BEST` (volt)

**Locked personas:** render the card at 40% opacity under a `LockOverlay` showing the requirement (`WIN 2 REPS AT LEVEL 1`). Still tappable → opens detail in a read-only state so the user can see what they're working toward. This is motivation, not a dead end.

Locked *levels* (all personas locked): collapse the whole section to a single 64px hairline row — level name + lock icon + requirement. Expandable on tap.

### 8.3 `/roster/[personaId]` — Persona detail

**Mobile: a full-height bottom sheet over the roster.** **Desktop: a real page** with a back link, two-column (portrait + meta left 40%, content right 60%).

Contents:
- Portrait (128px), name (display-xl), setting (label), level chip
- Blurb — 2 lines, body-lg
- **`SHE RESPONDS TO`** — list of `respondsTo` chips (volt-toned)
- **`SHE SHUTS DOWN ON`** — list of `shutsDownOn` chips (neutral, not red — these aren't errors)
- **`YOUR RECORD`** — a 4-stat row: `ATTEMPTS` / `WINS` / `BEST TIME` / `BEST WARMTH`
- Recent sessions against her — up to 3 `SessionRow`s
- Sticky bottom: primary `START REP` (or lock requirement, or out-of-reps state)

### 8.4 `/field` — Rejection challenges

Real-world assignments. **Zero API cost — this is the free tier's whole substance.** Do not gate it.

- **Today's challenge** — a large `FieldChallengeCard`, tier chip, title display-lg, detail body. Two actions: `DID IT` / `COULDN'T DO IT`.
  - `DID IT` → volt confirmation micro-animation, streak increments, card locks to completed
  - `COULDN'T DO IT` → opens `ChickenedOutSheet` (§10.7). **This is celebrated, not punished.** Copy: "Logging it honestly is the rep." No streak break, no penalty, no red.
- **Tier progress** — a 4-segment horizontal bar showing which tier the user is on, with tier names: `TIER 1 — LOW STAKES` / `TIER 2 — MILD` / `TIER 3 — REAL` / `TIER 4 — SHARP`
- **History** — reverse-chronological list of past challenges with status icons. Grouped by week with hairline headers.
- Desktop: today's challenge left (60%), tier progress + history right (40%).

**Safety rule (must be in the UI):** a persistent dim footnote on this screen — *"Never do anything illegal, unsafe, or that harasses someone. Walk away means walk away."* Always visible, never dismissible.

### 8.5 `/profile`

- Header: avatar (64px), display name, email (dim), plan chip
- **Lifetime stats** — 6 `Stat` blocks in a grid (2×3 mobile, 3×2 desktop):
  `TOTAL REPS` / `WIN RATE` / `BEST TIME` / `AVG WARMTH GAIN` / `CURRENT STREAK` / `LONGEST STREAK`
- **Warmth-over-time chart** — line chart, last 20 sessions, final warmth per session. Volt line, `--line` grid, no fill gradient. Second series (`--cool`) optional: composite score. This is the one place `--cool` is permitted.
- Navigation rows (hairline-separated, chevron right): `SESSION HISTORY` → `/profile/history`, `SUBSCRIPTION` → `/profile/subscription`, `SETTINGS` → `/profile/settings`
- Ghost `SIGN OUT` at the bottom

### 8.6 `/profile/history`

Reverse-chronological `SessionRow` list, grouped by day with sticky `TODAY` / `YESTERDAY` / `12 AUG` hairline headers.

`SessionRow`: outcome icon (volt check / dim x), persona name + setting, duration (Plex Mono), composite score (Plex Mono, right-aligned, large). Tap → `/session/[id]/scorecard`.

Filters as a `Tabs` row at top: `ALL` / `WINS` / `LOSSES`. Desktop adds a persona filter dropdown.

Empty state: `NO REPS YET` + `START YOUR FIRST` CTA.

### 8.7 `/profile/settings`

Hairline-separated rows, grouped under Plex Mono section labels:

- **ACCOUNT** — display name (inline editable), email (read-only), change password
- **AUDIO** — input device picker, output device picker, `TEST MIC` (opens the §7.4 level-test as a sheet), room ambience volume slider (0–100, default 60)
- **TRAINING** — `Show warmth number during reps` toggle (auto-disabled and locked at L4 with a dim note: "Removed at Level 4"), `Room ambience` toggle
- **DATA** — `Export my data`, `Delete account` (danger, opens `DeleteAccountModal`)
- **ABOUT** — version, terms, privacy, support email

### 8.8 `/profile/subscription`

- Current plan card: plan name (display-lg), reps/day, price, renewal date, `MANAGE` (→ external merchant-of-record portal, opens new tab) or `UPGRADE`
- Plan comparison — 3 columns desktop / stacked cards mobile:
  | | FREE | PRO | ELITE |
  |---|---|---|---|
  | Voice reps | 1 / day | 3 / day | 6 / day |
  | Field challenges | Unlimited | Unlimited | Unlimited |
  | Personas | Level 1 only | All | All |
  | Scorecards | Basic | Full | Full + transcript |
  | Price | — | $24/mo | $39/mo |
- Current plan's column is volt-bordered with a `CURRENT` chip
- Fine print: billing handled by the merchant of record; cancel anytime.

---

## 9. THE REP FLOW — the heart of the app

Three screens: brief → live → result. All chrome-free, all full-bleed, all `--ground`.

### 9.1 `/rep/[personaId]/brief`

Identical structure to `/onboarding/ready` (§7.5) but for any persona. Scene-setter, ~5 seconds of reading.

- Fluid persona 132px, name display-lg, setting label, hook body-lg
- The 3-row rule block (TIME / GOAL / SHE LEAVES)
- If the user has faced her before, a single dim line: `YOUR BEST: WARMTH 54, NO NUMBER`
- Primary `START` (full width mobile, 280px centered desktop)
- Ghost back chevron top-left

On `START`: check reps → if 0, open `PaywallSheet` and do not proceed. Otherwise transition to `/live` with a **600ms fade-through-black**. This beat matters — it's the curtain going up.

### 9.2 `/rep/[personaId]/live` — THE REP

Absolute focus. Nothing on this screen that isn't the conversation.

```
┌───────────────────────────────────┐
│ ‹                          ⌒ 1:47 │  ← top row, both fade to 30% after 4s
│                                   │
│                                   │
│          ╭── unfolding ──╮        │
│          │   fluid form  │        │  ← the persona's 3D identity
│          ╰───────────────╯        │
│                                   │
│              GUARDED              │  ← band label, Plex Mono, only L1–L3
│          WARMTH  41 / 65           │  ← exact progress, only if trainingWheels
│                                   │
│                                   │
│           ● listening             │  ← mic state, 12px dim
└───────────────────────────────────┘
```

**Desktop:** identical, fluid form scaled up (430px vs 330px stage), everything centered in the viewport. Do not add sidebars, transcripts, or panels. Same screen, bigger.

**Top-left:** back chevron → opens `EndRepModal` (§10.1). Never exits directly.
**Top-right:** `TimeArc` — a small ring (28px) that depletes clockwise, with `1:47` in Plex Mono beside it. **Not a digital countdown alone** — the arc does the emotional work. Under 20s remaining: arc and digits shift to `--amber`. **No beeping, ever.**

**Persona name/setting** appear as a caption above the form for the first 3 seconds, then fade out. She's a person, not a UI label.

### 9.3 The Fluid Persona — specification

A layered ribbon form, centered. It is both the character's identity and the visual representation of the conversation. Warmth is a physical progression — **closed → unfolding → responsive → resonant** — rather than a ring being painted progressively greener.

**Construction** (`components/fluid-persona.tsx`):
- Three.js `0.180.0` with `TorusGeometry` as the ribbon surface.
- A custom vertex shader drives openness, curl, breathing, voice amplitude, the persona-specific deformation and the traveling warmth pulse.
- A custom fragment shader layers each character's guarded/warm/light palette with transparency and Fresnel edge lighting.
- Two to four translucent skins use additive blending to create inner depth; three line orbits and deterministic particles sit around them.
- The central initial remains HTML so it stays sharp at profile-card and live-stage sizes.
- Rendering is capped to a modest pixel ratio, pauses off-screen, and uses lower geometry density for card-size instances. WebGL failure falls back to a CSS ribbon mark.

**Amplitude pipeline:**
```
MediaStream → AudioContext → AnalyserNode (fftSize 256, smoothingTimeConstant 0.7)
  → getByteFrequencyData → RMS → normalize 0..1
  → exponential smoothing → shader amplitude uniform
```
Two analysers feed the local and remote speaking levels already exposed by the session. The frame loop smooths them again before deformation. Never let raw values through unsmoothed — it looks like a cheap visualizer.

**The four states:**

| State | Form | Response | Motion |
|---|---|---|---|
| `idle` (nobody speaking) | Current warmth shape | Warm forms track the pointer; guarded forms turn away slightly | 0.4Hz breathe and slow orbit |
| `user` (you're speaking) | Current warmth shape | Pointer response remains warmth-driven | Tight amplitude displacement |
| `persona` (she's speaking) | Current warmth shape with lit inner folds | Pointer response remains warmth-driven | Deeper amplitude displacement |
| `thinking` (gap between) | Slightly contracted and restrained | Holds rather than chasing the pointer | Slow, low-energy drift |

**On `thinking`:** this is the API latency gap (~500–800ms) and it is the single most dangerous moment for immersion. **Do not put a spinner, dots, or "thinking…" text here.** The form quieting reads as *she's considering what you said* — it converts a technical delay into characterization. If the gap exceeds 2.5s, add a very subtle additional dim; if it exceeds 6s, treat as a connection problem (§9.7).

**Warmth drives several properties together.** Openness interpolates from 0.35→1, curl from 1→0.25, orbit coherence and luminance rise, and pointer response crosses from slight avoidance to following between 30–80 warmth. Color supports that change but never carries it alone.

Each persona shares that grammar but has its own authored signature: Nadia unfolds in three petal-like folds; Priya's turbulent vortex coordinates; Maya's offset ripples gain depth; Jules's split ribbons bridge. Erin, Sam, Robin and Alex use orbital, woven, ambiguous and faceted variants respectively. Unknown future identities receive a deterministic fallback, so adding a person never produces a duplicate by accident.

### 9.4 Warmth feedback

There is no outer warmth ring. The form itself is the feedback.

- **On a positive delta:** a bright pulse enters at one point, travels through a fold, expands it briefly, then settles at the new openness.
- **On a negative delta:** the same system contracts inward and loses energy without turning red or shaking.
- **The arm threshold stays silent.** No sweep, marker or special event fires at 65; the outcome rule requires that moment to stay invisible.
- The exact value remains below the form as `WARMTH 41 / 65` while training wheels are active. Shape communicates emotion; the number communicates gameplay progress.

**Training wheels by level:**
- L1–L3: persona form, band name, and exact warmth are shown while `trainingWheels` is active.
- L4: the persona form remains, but the band name and number disappear. The `TrainingWheelsOffModal` (§10.5) fires once, before the user's first L4 rep.

### 9.5 Mic / connection status line

Bottom-center, 12px, `--text-mute`. Exactly one of:
- `● listening` (volt dot) — mic open, waiting for you
- `● you` (cool dot) — you're being heard
- `— nadia` (band-colored dash) — she's speaking
- nothing at all during `thinking` — silence is the point

### 9.6 The exit — two outcomes, one beat

At ~15 seconds remaining, **she begins wrapping naturally** — the engine emits a wrap-up cue and she says something like "anyway, I should find that book." **No UI change accompanies this.** The player should feel time pressure from her behavior, not from a widget.

At 0:00 the rep ends one of two ways:

**WIN** (`warmth >= threshold` at any point where she chooses to offer):
1. She delivers the number line. Her form opens fully and settles into a bright, calm resonance.
2. A `PhoneNumberCard` slides up from the form — a 2px-radius `--surface` card, 1px volt border, containing the number in Plex Mono display-lg with a subtle character-by-character reveal (40ms/char).
3. Hold 2.5s.
4. Auto-navigate → `/session/[id]/result`.

**LOSS:**
1. She delivers her exit line (shown as text under the form, since it's the last thing she says).
2. The form closes, contracts to 0.7, loses light and fades out over 900ms.
3. Hold 800ms on empty ground.
4. Auto-navigate → `/session/[id]/result`.

The loss animation must be *quiet and unhumiliating*. No red, no shake, no buzzer, no "FAILED". She just left. That's the whole point of the product.

### 9.7 Rep screen edge states

| State | Treatment |
|---|---|
| Connecting (first 1–3s) | Fluid persona at guarded idle, dim. Caption: `CONNECTING`. If >5s → connection error. |
| Mic permission lost mid-rep | Pause the clock. `MicLostModal` — "We can't hear you." Resume or end. |
| Connection dropped | Pause clock. `ConnectionLostModal` — auto-retry 3× with the attempt count visible, then offer `END REP`. Session is saved as partial, not lost. |
| User backgrounds the tab | Pause clock and mute mic. Resume on focus with a 3-2-1 countdown over the form. |
| Persona audio fails but data flows | Fall back to showing her text under the form. Toast: `AUDIO ISSUE — SHOWING TEXT`. |
| User says nothing for 25s | She prompts once, in character. At 45s of silence she leaves early. Not an error state — a real consequence. |

### 9.8 `/session/[sessionId]/result`

The emotional payoff. Chrome-free, full-bleed, deliberately sparse. **This is NOT the scorecard** — resist the urge to put metrics here.

**WIN:**
- Fluid persona 148px, dimmed on loss
- `SHE GAVE YOU HER NUMBER` — display-xl, volt, centered
- Time taken, Plex Mono data-xl: `1:42`
- Final band chip
- Primary `SEE BREAKDOWN` → `/scorecard`
- Ghost `RUN IT BACK` → same persona's brief

**LOSS:**
- Fluid persona 148px, heavily dimmed
- `SHE LEFT` — display-xl, `--text` (not red)
- Final warmth reached + the threshold, as a small ring: `54 / 65`
- One dim line of context, chosen by how close they got:
  - Missed by <10: "You were close."
  - Missed by 10–30: "You had her attention and lost it." / or "She never really opened up."
  - Missed by >30: "She wasn't interested from the start. Some aren't."
- Primary `SEE BREAKDOWN`
- Ghost `RUN IT BACK`

**Never show the composite score on this screen.** Outcome and process are separate; mixing them here teaches the wrong lesson. The score lives on the scorecard.

If this was a level-unlocking win, fire `LevelUnlockedSheet` (§10.4) **after** the result screen, on arrival at the scorecard — not layered over this beat.

---

## 10. SCORECARD, TRANSCRIPT & MODALS

### 10.1 `/session/[sessionId]/scorecard`

Chrome present. The coaching surface. Process only.

**Sections, top to bottom:**

1. **Composite** — a large number (display-xl, 72px, Plex Mono tabular) with `/100` in dim. Beside it a one-line verdict in Barlow Condensed upper: `SLOPPY` (<50) / `SOLID` (50–69) / `SHARP` (70–84) / `CLEAN` (85+). Below in dim body: the persona, level, duration, and outcome — outcome stated as fact, never as a scoring input.

2. **`METRICS`** — a `MetricBandRow` per metric. Each row:
   ```
   TALK RATIO                    58%     ●━━━━━━━━━━━━━  12/20
   Target 40–55%                         You held the floor too long.
   ```
   - Metric label (Plex Mono upper), your value (Plex Mono, right of label)
   - A horizontal band bar: the full possible range with the target zone highlighted in volt-dim, and your value marked with a 2px dot. Out-of-band values sit visibly outside the highlighted zone.
   - Points earned / max, right-aligned
   - A one-line note beneath, dim
   - **The points column must sum to the composite.** Show the arithmetic — this is an auditable scorecard, not a vibe. If the sum doesn't match, that's a bug worth surfacing loudly in dev mode.

3. **`THE MOMENT IT WORKED`** — `MomentCard` with the user's actual quoted line, its delta (`+4`, volt), the warmth after, and one line of why. If no positive moment exists, omit the section entirely rather than showing an empty one.

4. **`THE MOMENT IT DIDN'T`** — same, with a negative delta (dim/amber, never red).

5. **`TRY THIS NEXT TIME`** — a single card, one actionable sentence, body-lg. Exactly one. Not a list. Not three tips.

6. **Actions** — `RUN IT BACK` (primary), `READ THE TRANSCRIPT` (secondary), `NEXT PERSONA` (ghost).

**Desktop:** two columns — composite + metrics left (58%), moments + try-next right (42%). Actions span the full width at the bottom.

**Free plan:** metrics section shows only the composite and the first two metrics, with the rest behind a `LockOverlay` → `PaywallSheet`. Moments and transcript are Pro+.

### 10.2 `/session/[sessionId]/transcript`

The highest-value coaching surface and cheap to build — you already log all of it.

- **Header:** `WarmthSparkline` — full session warmth as a line chart, 48px tall, volt line over `--line` grid, band color as a faint background gradient. Tapping a point scrolls to that turn.
- **Turn list:** each `TranscriptTurn` is a row.
  - Left gutter: a 3px vertical bar in the warmth band color at that moment. This makes the whole conversation's temperature scannable at a glance — the single best thing on this screen.
  - Persona turns: left-aligned, `--surface` background, her name in label style above.
  - User turns: right-aligned on desktop / left-aligned with a volt left-edge on mobile, `--surface-2` background.
  - User turns carry a delta badge (`+3` volt / `−2` dim) in the top-right of the bubble.
  - Timestamp in Plex Mono 11px `--text-mute`.
- **Tap a user turn** → expands inline to reveal `reason` — why the scorer moved warmth. 240ms height transition.
- **Filter chip row** at top: `ALL` / `BIG MOVES` (|delta| ≥ 3 only). "Big moves" is how people will actually review.
- Sticky bottom bar: `RUN IT BACK`.

### 10.3–10.16 Modal & Sheet inventory

All use the responsive `Sheet` (bottom sheet mobile / centered dialog desktop) unless marked Modal (non-dismissible).

| # | Name | Trigger | Contents |
|---|---|---|---|
| 10.1 | `EndRepModal` | Back chevron during a live rep | **Modal.** "End this rep? It counts as an attempt." `END REP` (danger) / `KEEP GOING` (primary). Clock keeps running behind it — no free thinking time. |
| 10.2 | `PaywallSheet` | Out of reps, or a locked Pro feature | Reason line, plan comparison (compact 2-col), `UPGRADE` primary → `/profile/subscription`, `MAYBE LATER` ghost. If out of reps, show the reset countdown in Plex Mono. |
| 10.3 | `HowItWorksSheet` | Ghost link on any brief screen | 4 short numbered points: talk out loud · three minutes · her form shows how she feels · she decides at the end whether you get her number. One fluid-form illustration. |
| 10.4 | `LevelUnlockedSheet` | Win that unlocks a level | Level name display-lg, its description, the 2 newly available personas as mini-cards, `SEE THEM` / `NOT NOW`. Restrained — one volt sweep, no confetti. |
| 10.5 | `TrainingWheelsOffModal` | Before first L4 rep | **Modal.** "From here, no numbers. Read her, not the meter." Explains the ring goes neutral. `UNDERSTOOD`. Fires once ever. |
| 10.6 | `FirstWinSheet` | First ever win | "That's the loop. Do it again tomorrow." Streak explanation. Fires once ever. |
| 10.7 | `ChickenedOutSheet` | `COULDN'T DO IT` on a field challenge | **Non-punishing.** "Logging it honestly is the rep. It stays on your list for tomorrow." Optional one-tap reason chips (`Wrong moment` / `Lost my nerve` / `No one around`). `LOG IT` primary. No streak break. |
| 10.8 | `FieldDoneSheet` | `DID IT` | Short volt confirmation, streak increment, next tier preview if applicable. |
| 10.9 | `MicPermissionSheet` | Permission denied anywhere | Browser-specific instructions (detect UA), `TRY AGAIN`, `HOW DO I FIX THIS?` |
| 10.10 | `MicLostModal` | Mic dies mid-rep | **Modal.** Clock paused. `RESUME` / `END REP`. |
| 10.11 | `ConnectionLostModal` | Stream drops mid-rep | **Modal.** Clock paused. Auto-retry with visible attempt count (`RECONNECTING — 2/3`), then `END REP`. |
| 10.12 | `MicTestSheet` | Settings → Test mic | Reuses the §7.4 level-test state. |
| 10.13 | `DeleteAccountModal` | Settings → Delete | **Modal.** Type `DELETE` to confirm. Lists what's lost. Danger button. |
| 10.14 | `SignOutSheet` | Profile → Sign out | Simple confirm. |
| 10.15 | `PersonaDetailSheet` | Roster card tap (mobile only) | The §8.3 content as a sheet. |
| 10.16 | `CVReplaceSheet` | Interview setup, replacing a CV | Current filename, `REPLACE` / `REMOVE`. |

---

## 11. INTERVIEW TRACK

Same engine, different skin. **Build the screens; leave the content thin.** Warmth is relabelled **IMPRESSION** everywhere user-facing; the internal variable name stays `warmth`.

Band labels change: `CLOSED→SKEPTICAL`, `GUARDED→NEUTRAL`, `OPEN→INTERESTED`, `ENGAGED→IMPRESSED`, `INVESTED→CONVINCED`.

### 11.1 `/interview` — Home
Mirrors `/train`. Differences:
- If setup is incomplete, the hero card is a **setup prompt** instead of a rep CTA: `SET UP YOUR INTERVIEW` with a 3-step progress indicator (Role / CV / Questions), → `/interview/setup/role`.
- Once complete, hero becomes the rep CTA showing the role title, company, and chosen interviewer.
- A secondary row of `Stat`s: `ROLE` / `INTERVIEWER` / `QUESTIONS ADDED`, with an `EDIT SETUP` ghost link.
- **No Field card** (dating-only).

### 11.2 `/interview/setup/role`
- Inputs: `Role title` (required), `Company` (optional), `Job description` (Textarea, 8 rows, optional, with a `PASTE` helper button and a character count)
- Dim helper: "The more you paste, the sharper the questions."
- `CONTINUE` primary, saves and advances.

### 11.3 `/interview/setup/cv`
- `FileDrop` accepting `.pdf` / `.docx`, max 5MB
- States: empty (drag prompt + browse button) / uploading (determinate `ProgressBar`, not a spinner) / uploaded (filename, size, upload time, `REPLACE` / `REMOVE`) / error (wrong type, too large — inline red text)
- `SKIP FOR NOW` ghost — CV is optional; do not block on it.

### 11.4 `/interview/setup/questions`
- A list of user-added questions, each an editable row with a drag handle and a delete `IconButton`
- `+ ADD QUESTION` opens an inline input (Enter to commit, Escape to cancel)
- Below a hairline: `SUGGESTED` — 6 tappable common behavioural questions that add themselves on tap ("Tell me about a time you failed", "Why this company", etc.)
- Empty state is fine — the interviewer has its own bank.
- `FINISH SETUP` primary → `/interview/interviewers`

### 11.5 `/interview/interviewers`
Grid of `InterviewerCard`s (2-up mobile, 4-up desktop): portrait, name, style chip, gender, blurb, level chip, lock state. Selecting one sets it and returns to `/interview`.

### 11.6 `/interview/rep/[id]/brief` and `/live`

**Brief:** same structure as §9.1. The rule block changes:
```
TIME         8:00
GOAL         GET A CALLBACK
IT ENDS      WHEN THEY'VE HEARD ENOUGH
```

**Live:** the same orb screen, with these deltas:
- Duration 8:00, not 3:00
- Ring label reads `IMPRESSION`, bands relabelled
- **The question being asked** appears as a small dim caption above the orb, persisting while she asks it, then fading. Interviews are structured; the dating rep is not.
- A question counter bottom-right: `Q3 / 8` in Plex Mono
- No ambient room bed by default (interviews are quiet rooms — a faint HVAC hum only)

**Result:** `THEY WANT YOU BACK` (win) / `NO CALLBACK` (loss). Same two-outcome structure.

**Scorecard metrics differ** — build `MetricBandRow` generic enough to take these without change:
`STAR STRUCTURE` / `SPECIFICITY` / `FILLER WORDS` / `ANSWER LENGTH` / `EVIDENCE GIVEN` / `QUESTIONS ASKED BACK`

---

## 12. GLOBAL STATES

### 12.1 Loading
**Skeletons only. No spinners anywhere in this app.** Every list, card, and stat block needs a skeleton variant matching its final dimensions exactly (so nothing shifts on load). Shimmer: a 1.4s linear sweep of `--surface-2` → `--line` → `--surface-2`.

Exception: the OAuth callback screen (§6.6) uses three pulsing volt dots, because there's no content shape to skeleton.

### 12.2 Empty states
Every list needs one. Pattern: 32px `--text-mute` icon, display-md title, one dim line, optional CTA.
- History: `NO REPS YET`
- Field history: `NOTHING LOGGED YET`
- Roster level locked: handled by `LockOverlay`, not an empty state
- Transcript: never empty (a session always has turns)

### 12.3 Errors
- **Inline field errors:** 12px `--red` beneath the field, plus a 1px red border on the field.
- **Form-level errors:** a banner above the form, `--red` 1px border, `--surface` bg, 13px text.
- **Page-level errors:** centered, `alert-triangle` 32px amber, `SOMETHING BROKE`, the error string in Plex Mono 12px dim, `TRY AGAIN` primary + `GO HOME` ghost.
- **404:** `NOTHING HERE` + `GO HOME`.
- **Toasts** for non-blocking failures only (e.g. "Couldn't save that").

### 12.4 Offline
A persistent 32px amber bar beneath the top bar: `OFFLINE — REPS UNAVAILABLE`. Disable all START buttons while it's up. Field challenges remain usable and queue their writes.

### 12.5 Accessibility
- All interactive elements reachable by keyboard; visible volt 1px focus ring (never remove outlines).
- The orb is decorative → `aria-hidden="true"`. Provide an `aria-live="polite"` region announcing band changes: "She's opening up." Never announce the numeric warmth (too chatty).
- The rep timer: `aria-live="off"` — do not read every second. Announce once at 30s remaining.
- Color is never the only signal: band changes also change the band *label* text; win/loss states carry text, not just color.
- Contrast: all body text ≥ 4.5:1 against its background. `--text-mute` on `--ground` is borderline — use it only for non-essential text.
- Respect `prefers-reduced-motion` per §1.5.

---

## 13. BUILD ORDER

Do it in this sequence. Each phase should be visually reviewable before moving on.

1. **Foundation** — Tailwind config with all tokens, fonts, the `components/ui/` primitives, `useBreakpoint`. Build a `/dev/kitchen-sink` route rendering every primitive in every variant and state. Delete it before shipping, but build it first — it will save you hours.
2. **Data layer** — `types.ts`, all mock fixtures, `lib/data/index.ts` hooks with simulated latency, the ESLint import restriction.
3. **Shell** — `AppShell`, `BottomTabBar`, `SidebarRail`, `TrackSwitcher`, route groups, guards.
4. **Auth screens** — all 6, all states. Stub the actual auth calls.
5. **Onboarding** — all 5, including the real mic check (this one must genuinely work; it's the only non-mocked piece in this phase).
6. **The rep screen** — with `MOCK_VOICE=true`. Fluid persona, time arc, all four states, both exit beats. **Spend the most time here.** This screen is the product.
7. **Result + scorecard + transcript** — the whole post-rep flow.
8. **Train / Roster / Persona detail** — the core loop's navigation.
9. **Field / Profile / History / Settings / Subscription**.
10. **All modals and sheets** from §10.
11. **Interview track** — screens only, thin content.
12. **Polish pass** — every empty state, every skeleton, every error state, reduced-motion, keyboard nav, both breakpoints on every screen.

---

## 14. DEFINITION OF DONE

Do not report this complete until all of the following are true:

- [ ] Every route in §3 renders without error at 390px, 768px, 1024px, and 1440px wide.
- [ ] No component imports from `lib/data/mock/**` directly (ESLint passes).
- [ ] Nothing in `lib/voice/**`, `lib/warmth/**`, `lib/scoring/**`, `lib/personas/**`, or `app/api/**` was modified — verify with `git diff --stat` and include the output.
- [ ] `INTEGRATION-GAPS.md` exists at repo root and lists every place the UI needs data the existing modules don't currently expose.
- [ ] `MOCK_VOICE=true` runs a complete rep end-to-end: connect → conversation with orb reacting → warmth climbing past the threshold marker → win → phone number card → result → scorecard → transcript. And the same for a loss.
- [ ] The word "spinner" appears nowhere; no `animate-spin` class exists in the codebase.
- [ ] `prefers-reduced-motion: reduce` disables the orb loop and page slides without breaking any layout.
- [ ] Every list has a skeleton and an empty state.
- [ ] TypeScript strict passes with zero `any`.
- [ ] Scorecard metric points visibly sum to the composite.

---

## 15. THINGS THAT WILL BE TEMPTING AND ARE WRONG

- **Making `/train` a dashboard.** It is a single decision, not a stats page. Stats live in Profile.
- **Adding a live transcript to the rep screen.** It destroys the illusion instantly — people read instead of listening. The transcript exists afterward.
- **Putting the composite score on the result screen.** Outcome and process must stay separate.
- **Making the loss state red, shaky, or loud.** She left. That's all. The whole product is about making that survivable.
- **A spinner during the thinking gap.** See §9.3.
- **Rounding the corners.** 2px maximum, everywhere.
- **A second accent color in the UI.** Volt only. `--cool` is for chart series two and the user-speaking orb rim; nothing else.
- **Confetti on a win.** One volt ring sweep. That's the celebration.
- **Building a light theme.** There isn't one.
