# The road to M3

What is owed between here and the premium layer, in the order it has to happen.

**This doc supersedes `M2-PLAN.md` as "what to do next".** That one is the
record of M2's nine items and stays readable as history; every one of them
shipped. What it does not contain is the thing that turned out to matter — M2
cannot *close* on built features, because §17 gates it on twenty hand-scored
transcripts, and M0 never passed its own gate either.

**Date** 24 August 2026 · **Against** spec v1.0 (21 Aug 2026)

---

## Where the gates actually stand

§17 opens with a rule that has quietly been broken twice:

> "Every milestone has an exit gate. A failed gate stops the build rather than
> deferring the problem — that is the whole point of ordering it this way."

| Gate | §17 requires | State |
|---|---|---|
| **M0** | RTT < 900ms · character breaks < 0.5 per 5 min · **blind A/B, 10 people** | **2 of 3.** Latency and stability measured in `M0.md`. The A/B has never run |
| **M1** | Ten reps on yourself; you want an eleventh | **Passed** |
| **M2** | **Calibration green across all twenty golden transcripts** | **Open.** Ten collected, none scored |
| M3 | Side-by-side vs RizzAgent, three strangers, Nerve reads as more expensive | Not started |

Everything in M1's and M2's *scope* is built. Both open gates are measurement,
not construction — which is exactly why they were easy to walk past.

**Two structural findings this plan exists to fix.**

1. **The M0 A/B was impossible when the spec was written and is possible now.**
   §04 planned it with ElevenLabs as a stub. The stub is a real assembled
   pipeline (`PIPELINE.md`). The blocker was never the ten people.
2. **§17 does not schedule feature groups D and E at all.** Both are `[MVP]` in
   §10 — the technique library, the opener bank, the progress screens, the
   weekly review — and no milestone owns them. Phase C below places them,
   because M3's gate is a stranger comparing this to a competitor and half of
   what they would click is not there.

---

## Phase A · Close M0 · ~2 days, mostly other people's time

### A1 · Run the blind provider A/B

Ten people, §04's exact question: *"which one felt more like a real person who
wasn't interested in you?"* Both adapters are behind one interface and the
per-user override exists in the factory, which is what makes a blind test
possible without a deploy.

**First, and not because it is urgent.** Its result cascades into decisions
made much later:

- §04: *"Budget for ElevenLabs winning and plan the tier caps in §14 around
  $0.095/min rather than $0.065."* That is the number on the `/pricing` page
  built in M4.
- §04 attaches a deadline in the other direction: **run it before M3**, because
  the ambient mix levels and the whole sound kit are tuned against whichever
  voice ships, and re-tuning them afterwards is wasted work.

*Done when:* ten blind comparisons recorded, a winner named, and `VOICE_PROVIDER`
set to it. Record the result in `M0.md` — it is the spike log and the A/B is
the last of its three questions.

### A2 · Re-measure cost per rep at three minutes

`M0.md` still owes this: ten reps, five past three minutes, from the Colombo
home connection. The existing figures were measured against a **two-minute**
format, and §04 is explicit that realtime pricing re-charges prior audio
context, so the rate is not linear in rep length.

§04: a rep above **$0.12/min** forces §14's tier caps to be revisited *before*
launch rather than after. `npm run cost:model` projects it; this replaces the
projection with a measurement. Recorded as D2a in `LAUNCH-GAP.md`.

---

## Phase B · Close M2 · ~1 day of building, then reading

**The order inside this phase is load-bearing.** B1 changes every composite the
grader produces. Hand-score twenty transcripts first and you do the reading
twice.

### B1 · Score the two dead deterministic metrics · **shipped 24 Aug**

§07 lists **eight** deterministic metrics. `METRIC_BANDS` in
`lib/grade/metrics.ts` has **six**. `specificPlanOffered` and `cleanExit` are
computed, stored, and handed to the judgement prompt — and carry no band and no
points, so they contribute nothing to the deterministic 60%.

Those are the two metrics most directly about **the close** and **the exit**,
which is most of what separates a clean rep from a lucky one. §07's whole
argument is that process is scored and outcome is not; proposing something
concrete and leaving warmly are process, and right now neither counts.

Two design notes that are not optional:

- **They are booleans, and `bandScore` is numeric.** `MetricBand` carries
  `min` / `max` / `tolerance`. Either the band type grows a boolean kind or the
  values map to 0/1 — but the audit line has to stay readable, because §07's
  point is that a composite can be taken apart rather than trusted.
- **`cleanExit` is only meaningful after a knock-back**, as its own comment in
  `metrics.ts` says. A rep that ended warmly with her offering a number must
  score `unmeasured` rather than zero. `MetricScore.points: null` and the
  `'unmeasured'` verdict already exist for exactly this, and `compose` filters
  nulls before averaging.

*Done when:* eight metrics carry points, a rep with no knock-back reports
`cleanExit` as unmeasured rather than failed, and `grade.test.ts` covers both.

**Shipped, and one thing was decided differently.** `MetricBand` grew a
`target` override and the two metrics became graded 0-1 values —
`planQuality` and `exitQuality` — beside the booleans the prompt still reads.

The design note above said `cleanExit` should be unmeasured without a
knock-back. **It is not conditioned on the outcome at all**, and the reason is
§07's own cardinal rule: gating it on rejection would score a rejecting rep
across seven metrics and a receptive one across six, which is the outcome
deciding the composite's composition — outcome scoring by the back door. Every
rep has an ending, leaving well is process, so every rep with two user turns in
it is marked on it: warm farewell 1, trailed off 0.5, pushed 0. A test asserts
that the same conversation ending both ways is scored on the same metrics.

`planQuality` **is** conditional, on a different thing: whether he proposed
anything. No proposal is unmeasured rather than zero, because §16 rule 6 bans
pressure closes and reading a closed person correctly is good play — a metric
that docked him for not asking would teach the one behaviour the product
refuses to teach. §07's gloss compares two asks, not asking with not asking.

### B2 · Fix the scorecard's reading order · **shipped 24 Aug**

§07: *"The scorecard always names one thing that went well before it names
anything that didn't."* Today the composite leads, the metrics follow, and
`wentWell` sits inside the judgement row two thirds of the way down — hidden
entirely from free users.

This is §07, not §02, so it belongs here rather than in M3. The staged reveal
choreography is §02 rule 6 and stays in M3; this is only the order.

**Shipped.** `wentWell` is its own card between the composite and the metrics,
and it is **never gated** — it used to sit inside the Pro lock, so the users
most likely to quit after a bad rep were the only ones who never saw the
encouraging half of their own scorecard.

### B3 · Collect ten more transcripts · **owed**

`npm run grade:collect`. With the roster at three (D10a) these concentrate on
Nadia, Maya and Robin — roughly seven each rather than the two or three each
that twenty across eight would have given. That concentration is most of why
cutting the roster made this gate worth passing.

Collect them **after** B1, so every transcript is scored against the rubric
that ships.

### B4 · Hand-score all twenty · **owed, and not a coding task**

Not a coding task, and deliberately not one. `fixtures.ts` says it plainly:
ground truth a model wrote is not ground truth. Six sub-scores and the
composite on each, against the rubric restated at the top of that file.

### B5 · `npm run grade:calibrate` green

Drift beyond five points on any sub-score **or** the composite fails. The
composite is 60/40 and can drift while all six hold, which is why it is checked
separately.

> **M2 CLOSES HERE.** The last test in `calibration.test.ts` is written to be
> *deleted* on the day the twentieth is scored.

---

## Phase C · The MVP scope §17 never scheduled · **shipped 24 Aug**

Groups D and E of §10 are marked `[MVP]` and appear in no milestone. They are
placed here rather than in M3 because **M3's gate is a stranger judging this
against a funded competitor**, and a product where the scorecard promises a
technique link that goes nowhere does not survive that comparison.

| # | Work | Size | Why here |
|---|---|---|---|
| C1 | **Ranks** (§08). `profiles.rank` defaults to `rookie`; nothing moves it and nothing displays it. The rail on the home screen is not built | 0.5d | Needs a decision first: §08 names four ranks across eight levels, and the roster ships three (D10a) |
| C2 | **The technique library** (§10 D). The table is seeded with 14 hand-written cards; there is no `/library` route, no technique-of-the-session tied to the weakest sub-score, and no link from the scorecard | 2d | Group D is **0 of 7**. §07 promises the link explicitly |
| C3 | **The insight surface** (§10 E). `/progress`, six sub-score trend lines, filler and talk-ratio history, the Sunday review screen | 2d | Currently one chart on the profile |
| C4 | **Seven orphaned overlays.** Built and imported by nothing — including the mic primer (B10) and the first-scorecard explainer | 0.5d | §12 calls the explainer "load-bearing for retention": it is where the user learns outcome is not scored |
| C5 | **The interview track** — finish it or hide the door | — | The nav opens onto fixtures. Decide before strangers see it |

**Start sourcing recorded room beds during this phase.** §02 rule 2 calls the
ambient bed the highest ratio of perceived production value to engineering cost
in the entire product. It is switched off today for intelligibility
(`AUDIO.md`), and the fix is recorded audio rather than more code — which makes
it a procurement task with lead time, and the wrong thing to discover on the
first morning of M3. **Still owed** — it is the one Phase C item that is not
engineering.

### What shipped, and what was decided along the way

**C1 · Ranks.** `lib/data/rank.ts`, derived from the same qualifying counts as
the unlocks and mirrored onto `profiles.rank` by `syncLevel`. §08's four names
are kept over three tiers by earning the last one *at* the top rather than above
it: Closer is two reps at 70+ against Robin, which nothing else in the product
unlocks. Ranks key off tiers **cleared**, never tiers open — tiers 1 and 2 are
open from the start, so an unlock-keyed rank would hand a new account a rank it
had not done anything for. The rail is on Train; `npm run db:rep` asserts one
qualifying rep leaves you a Rookie and the second promotes you.

**C2 · The technique library.** `/library` and `/library/[slug]`, grouped by the
sub-score a card moves rather than by kind — nobody arrives wanting "an opener",
they arrive having just scored 42 on signal reading. Both links §07 promises now
exist: the scorecard's two weakest sub-scores each point at their technique, and
the brief carries the technique of the session. `npm run db:verify` asserts the
policy lets a user read the library, that every sub-score has a card to point
at, and that a user cannot rewrite one.

**C3 · The insight surface.** `/progress` — composure trend, six sub-score
lines, the two habit metrics, and the stored Sunday letters at
`/progress/week/[id]`. Linked from Profile and deliberately not from Train: §02
says a wall of charts on the home screen is a screen you look at instead of
training. Under three graded reps it says what unlocks it (§15) rather than
drawing a trend through two points.

**C4 · The orphaned overlays.** Six were dead duplicates of inline versions the
screens had grown — the sign-out sheet, the mic test, the delete-account modal,
the persona-detail sheet, the chickened-out sheet and the field-done sheet — and
they are **deleted**, because a component nothing imports is how the next person
wires the wrong one. Two were real gaps and are now built: §12's mic primer,
shown *before* the browser dialog (B10 — "skipping this step is the single
biggest cause of permanent permission denial"), with browser-specific recovery
split out from `MicLostModal` since a refused microphone and one that dropped
mid-rep are different problems; and the first-scorecard explainer, which §12
calls load-bearing for retention because it is where a user learns outcome is
worth nothing.

**C5 · The interview track — the door is shut.** It is screens and fixtures:
mock hooks, no interviewer characters, nothing writing `interview_setups`.
Finishing it is M4-and-after by §17's ordering. The nav already hid it (the
track switcher needs two unlocked tracks and every profile has one); what the
nav could not do was stop somebody typing the URL, so `/interview*` now
redirects unless `unlocked_tracks` contains it. That makes an existing column
into a real gate, and it is what will let the track ship to a subset of
accounts later without any of this changing.

---

## Phase D · M3 itself · §17 Wk 8–9

Everything in §02 that is not built:

- Sound kit — one coherent set, all under 400ms, mutable in one tap
- Haptics via the Vibration API; silent on desktop, degraded without comment on iOS
- Staged score reveal — composite counting up over 900ms, sub-scores at 60ms
- The armed countdown, 3·2·1 with tick and haptic
- The character-left moment as a full-bleed beat rather than an ordinary ending
- Session audio replay — recordings upload and purge correctly; there is no player
- Reconnection behind `ConnectionLostModal`: ICE retry ×3, paused timer, "saved up to 2:14"
- Keyboard paths — `Space` to arm, `Esc` to end
- PWA manifest and offline shell
- Room tone, once the beds from Phase C exist

> **GATE — side-by-side against RizzAgent with three strangers; Nerve reads as
> the more expensive product to all three.**

---

## What M4 inherits, so it is not a surprise

M4 is billing **and** safety, and its first day is not code:

**Submit the merchant-of-record application on day one.** §17 and §14 both say
the *start* of the milestone, because approval takes days and can fail — and
§14 says a human reviews the site during onboarding. So B1 (landing,
`/how-it-works`, `/pricing`) and B4 (three legal pages) are built *first* in
M4, not last. There is no landing page today; `/` redirects to `/login`.

Then: checkout, portal, the webhook that writes the subscriptions mirror, the
six money overlays, the age gate, moderation on both streams, the distress
path, delete and export, custom SMTP, PostHog and Sentry, and B9a
(leaked-password protection — five minutes, and it matters as long as password
sign-in exists).

> **Shipped early, 31 Aug — the webhook and checkout (B2).** `lib/billing/` and
> `app/api/webhooks/creem/route.ts`: signature verification, provider-neutral
> event mapping, service-role entitlement writes, and a checkout session
> carrying `metadata.user_id`. Proven by 51 unit assertions and
> `npm run db:billing` (31 checks on the real tables).
> **Still owed by hand:** the MoR account itself, which is the actual blocker
> and is not code; a buy button in front of `startCheckout` and the
> `/profile/subscription` screen; the portal handoff; the six money overlays;
> and one real delivery from Creem against a public URL, which is the only part
> of the loop no harness here can prove. The metering half of the gate below is
> untouched.

> **GATE — MoR account approved · metering reconciles to the cent against the
> provider dashboard across fifty test sessions.**

Then M5: twenty users, weekly calls with five, and **week-4 retention above
25%** among users who did three or more reps. Below 10%, stop and reconsider
the shape. It is the only number that decides anything.

---

## Phase E · The activation path · **shipped 25 Aug**

Not in the original plan, and it should have been. The app was walked cold —
sign up, one rep, every signed-in route — and the eight defects that fell out
all sit between the sign-up form and the first score. They are recorded in full
as **B13** in `LAUNCH-GAP.md`; the short version is that the worst realistic
first session ended with an unheard microphone, a rep spent on it, a result
screen blaming the user for it, no grade, and a locked home screen.

What landed: onboarding resumes at the first unanswered step instead of
restarting; the mic gate has a pending state, a twelve-second timeout, recovery
copy and a real escape; sign-out exists inside onboarding; the duplicated brief
is gone; a rep that recorded no user speech is refunded and says so; the
transcript's zero-turn case no longer contradicts its own header; `Win rate` is
replaced by mean composite (§07); and both dead Upgrade buttons now record
demand instead of doing nothing.

**Owed by hand:** the silent-rep result copy has not been seen against a real
three-minute rep, because that needs a working microphone rather than a stub.

**Found while testing, fixed, and one thing corrected.** Every read in
`lib/data/queries.ts` opened with its own `supabase.auth.getUser()` — six call
sites, and `getUser()` is a network round-trip to `/auth/v1/user` rather than a
local token decode. One screen fired four of them before fetching a row. That is
now a single memoised lookup per browser client (`lib/data/session.ts`), dropped
only when the identity actually changes, with twelve tests in
`lib/data/session.test.ts` — the load-bearing one asserts that six concurrent
readers produce one call. `useUserState` also now sends a genuinely signed-out
client to `/login` rather than leaving it on a page whose every read returns
nothing. Recorded as **B14** in `LAUNCH-GAP.md`.

The correction: the symptom that led there — screens sitting in skeletons that
never resolve — was **not** a product defect. It was the automated browser
window being occluded: the page runs but never paints, and React never begins
hydrating, so nothing is attached, no reads are issued and every control is
inert. Timers and `MessageChannel` resolve normally, which is precisely what
made it read as a data-layer problem, and no exception is raised anywhere —
hydration is not failing, it never starts. It does not reproduce in a visible
tab.

---

## Phase F · Earn the second session · **shipped 25 Aug**

The other half of the cold walk. Phase E fixed the session that could end with
nothing; this is the day that could contain nothing — seven items between "the
first rep is over" and "why would I open this again". Recorded in full as
**B15** in `LAUNCH-GAP.md`.

What landed:

- ~~**Day one is three reps on every plan**~~ — **superseded 31 Aug.** It is one
  sign-up rep, once per account, on `entitlements.onboarding_rep_used_at`, and
  free grants no voice reps a day at all. The arc this item was defending —
  fail, adjust, succeed — is what Pro is for rather than something given away in
  front of it. `lib/data/allowance.ts` still holds the rule; drift entry **D11**;
  the reasoning in full is `PAYMENTS-NEW-INTEGRATION.md`.
- **Text mode** — `/text/[personaId]`, the same character and contract with no
  microphone, no clock, no meter, no score and no quota. It is the on-ramp for
  a first session and the thing that is still open when the day's reps are
  gone, which is why `/train`'s primary action stops being a dead OUT OF REPS.
  Unmetered to the user is not unmetered to us: its own `text` spend bucket,
  and a warmth curve capped below `ARM_THRESHOLD` so the number a voice rep
  exists to earn can never be farmed here.
- **Character memory reaches both arms.** The Realtime mint read it; the
  assembled pipeline never did. One module now (`lib/db/persona-context.ts`),
  carrying the memory line and the user's first name, resolved from the
  authenticated user rather than from anything a client sent.
- **The onboarding answers spend.** `focus_area` decides the first character,
  the first field challenge and the brief's technique card before any rep is
  graded (`lib/data/focus.ts`). Last tie-break in the persona choice, so it
  settles the first rep and then leaves the rotation alone.
- **A first name**, asked skippably in onboarding, and a contract that is told
  when she may know it. §08's `usesYourName` dial finally has something to open.
- **The library goes back to the gym.** "Run a rep on this" on every card wired
  to an authored character rule (`lib/techniques/scenario.ts`), next/previous
  inside the section, a read mark, and one card per section
  (`lib/techniques/grouping.ts`) so fourteen stop reading as eighteen.
- **A real input meter and a silence nudge** on the live rep. Gated on never
  having been heard at all, so a deliberate pause is never mistaken for a dead
  microphone.

**Owed by hand:** the input meter and the nudge have not been seen against a
real three-minute rep — same reason as Phase E's silent-rep copy, it needs a
working microphone rather than a stub. The `personaSlugs` preference in
`lib/data/focus.ts` now genuinely chooses between Tess and Nadia on a fresh
account, since both bottom tiers are open from the start; it had nothing to
choose between while the roster was three.

**What is still owed from the same teardown, and is P2 rather than P1:** share
cards for the rejection ledger, the warmth curve and rank promotions; streak
freeze and repair; delivery analytics; surfacing memory in the *voice* brief
beyond the line already there; repricing on capability; filling the roster.

---

## The order, in one list

1. **A1** Blind provider A/B — ten people *(unblocks M3's sound work and M4's pricing)*
2. **A2** Re-measure the three-minute rep cost → **M0 closes**
3. ~~**B1** Score `specificPlanOffered` and `cleanExit`~~ **shipped 24 Aug**
4. ~~**B2** Scorecard reading order~~ **shipped 24 Aug**
5. **B3** Collect ten more transcripts
6. **B4** Hand-score twenty
7. **B5** `grade:calibrate` green → **M2 closes**
8. ~~**C1–C5** Ranks, library, progress, orphaned overlays, interview decision~~
   **shipped 24 Aug** — except sourcing the room beds, which is procurement
9. ~~**Phase E** The activation path~~ **shipped 25 Aug**
10. ~~**Phase F** Earn the second session — day one, text mode, the onboarding
    answers, the name, the library, the input meter~~ **shipped 25 Aug**
11. **Phase D** — M3

### What is left before M3

**None of it is engineering**, which is the shape this document predicted:

| # | Owed | Whose |
|---|---|---|
| A1 | The blind provider A/B — ten people, one question | Ten people, an afternoon |
| A2 | Ten reps measured at three minutes from Colombo | Yours |
| B3 | Ten more transcripts collected | Falls out of running the reps above |
| B4 | Twenty transcripts hand-scored | Yours, and deliberately not a model's |
| C | Recorded room beds sourced | Procurement, with lead time |

B1 was the highest-leverage item and it went first, so the twenty transcripts
can now be scored once against the rubric that ships rather than twice.
