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

### B1 · Score the two dead deterministic metrics

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

### B2 · Fix the scorecard's reading order

§07: *"The scorecard always names one thing that went well before it names
anything that didn't."* Today the composite leads, the metrics follow, and
`wentWell` sits inside the judgement row two thirds of the way down — hidden
entirely from free users.

This is §07, not §02, so it belongs here rather than in M3. The staged reveal
choreography is §02 rule 6 and stays in M3; this is only the order.

### B3 · Collect ten more transcripts

`npm run grade:collect`. With the roster at three (D10a) these concentrate on
Nadia, Maya and Robin — roughly seven each rather than the two or three each
that twenty across eight would have given. That concentration is most of why
cutting the roster made this gate worth passing.

Collect them **after** B1, so every transcript is scored against the rubric
that ships.

### B4 · Hand-score all twenty

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

## Phase C · The MVP scope §17 never scheduled · ~5 days

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
first morning of M3.

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

> **GATE — MoR account approved · metering reconciles to the cent against the
> provider dashboard across fifty test sessions.**

Then M5: twenty users, weekly calls with five, and **week-4 retention above
25%** among users who did three or more reps. Below 10%, stop and reconsider
the shape. It is the only number that decides anything.

---

## The order, in one list

1. **A1** Blind provider A/B — ten people *(unblocks M3's sound work and M4's pricing)*
2. **A2** Re-measure the three-minute rep cost → **M0 closes**
3. **B1** Score `specificPlanOffered` and `cleanExit` *(before any hand-scoring)*
4. **B2** Scorecard reading order
5. **B3** Collect ten more transcripts
6. **B4** Hand-score twenty
7. **B5** `grade:calibrate` green → **M2 closes**
8. **C1–C5** Ranks, library, progress, orphaned overlays, interview decision
9. **Phase D** — M3

Roughly **eight working days of building**, plus ten people for an afternoon
and your own reading time on twenty transcripts. The two that are not
engineering are the two that have been outstanding longest, which is the whole
lesson of this document.

**Highest leverage single item: B1.** Half a day, and everything downstream of
it is either wrong or has to be done twice.
