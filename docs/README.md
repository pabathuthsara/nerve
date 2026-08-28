# Docs

Everything written down about Nerve, and the order to read it in.

**If you are picking up work:** read this page, then `M3-PLAN.md` for what is
next and `LAUNCH-GAP.md` for what is blocking launch. Both carry status
markers, and both are meant to be updated by whoever does the work.

---

## Start here

| Doc | What it answers |
|---|---|
| [`NERVE-SPEC.md`](NERVE-SPEC.md) | **The specification.** What the product is, why every major decision was made, and the milestone order. Section numbers (§04, §07, §14…) are referenced from code comments and from every other doc |
| [`PRODUCT.md`](PRODUCT.md) | The shape as built: three tracks, the rep format, the ladder, the four sections, and what a user sees in what order |

## What to do next

| Doc | What it answers |
|---|---|
| [`M3-PLAN.md`](M3-PLAN.md) | **The current plan.** Everything owed between here and the premium layer, in the order it has to happen — the two milestone gates that never passed, the MVP scope §17 forgot, and M3 itself |
| [`M2-PLAN.md`](M2-PLAN.md) | The record of M2's nine items, all shipped. Superseded by `M3-PLAN.md` as "what to do next", kept as history |
| [`LAUNCH-GAP.md`](LAUNCH-GAP.md) | The build measured against the spec: what is done, the ten launch blockers, the product-promise gaps, and nine pieces of spec drift that need a decision |
| [`PAYMENTS-APPROVAL.md`](PAYMENTS-APPROVAL.md) | **Getting approved to take money.** The merchant-of-record application: who we apply to and in what order, what a reviewer opens, and the three things that still block submitting. Not code, and nobody can start it on our behalf |
| [`INTEGRATION-GAPS.md`](INTEGRATION-GAPS.md) | The frontend seam specifically — which screens read real data and which are still fixtures |

## How the parts work

| Doc | What it answers |
|---|---|
| [`DATA.md`](DATA.md) | The twenty-one tables, the rules they enforce, why plan and quota have no user write path, the spend ceiling, and every `db:*` command |
| [`PERSONA.md`](PERSONA.md) | The four-layer persona schema — trajectory, personality, gated, room — and why it replaced §05's flat record |
| [`AUDIO.md`](AUDIO.md) | The room: ambient beds, reverb, the graph. Currently switched off for intelligibility; the note at the top says why and how to bring it back |
| [`PIPELINE.md`](PIPELINE.md) | The ElevenLabs adapter — the assembled STT → LLM → TTS path behind the same `VoiceProvider` interface |
| [`NERVE-FRONTEND-GUIDE.md`](NERVE-FRONTEND-GUIDE.md) | The Arena frontend brief every screen was built from. Long, and the reference for visual detail |
| [`AVATAR-AUDIT.md`](AVATAR-AUDIT.md) | The WebGL persona avatar: how one shared context draws every avatar on the page, the nineteen numbered defects that rebuild answered, the one that was declined and why, and the palette carve-out it forced (D9) |

## History

| Doc | What it answers |
|---|---|
| [`M0.md`](M0.md) | The spike log: latency from Colombo, character stability over five minutes, and every round of tuning that produced the current warmth engine. **A record — do not rewrite it**, the same way applied migrations are not rewritten |

---

## Keeping these true

A change that ships with stale docs is not finished. The rule of thumb for
what to touch when:

| If you changed | Update |
|---|---|
| A plan item | `M2-PLAN.md` — mark it shipped, say what actually landed and what is still owed by hand |
| The grading rubric or the grade route | Re-run `npm run grade:calibrate`. A rubric change is a calibration change, and the golden set has to be re-scored rather than quietly drifting past the threshold |
| Anything on the blocker list | `LAUNCH-GAP.md` — the entry, its size, and the totals at the top |
| A screen from fixture to real data | `INTEGRATION-GAPS.md` |
| The schema, a policy, or a `db:*` script | `DATA.md` |
| A product rule — rep length, thresholds, what a section is for | `PRODUCT.md`, and record the drift in `LAUNCH-GAP.md` §4 if it now disagrees with the spec |
| A persona dial or contract | `PERSONA.md` |
| The audio graph | `AUDIO.md` |
| A price, a plan's rep count, or what a plan includes | `lib/site/plans.ts` — one record feeds `/pricing` and `/profile/subscription`, and §14 has a merchant-of-record reviewer reading the public one. Then `LAUNCH-GAP.md` D2 |
| The hero rep on `/` — its script, its voices, or the audio behind it | `scripts/hero-audio.ts` and `LAUNCH-GAP.md` B1. The two sides are captured differently on purpose: his lines are authored and read aloud verbatim, hers must come from the real persona and never from a keyboard |
| Anything a payment reviewer would read — the public pitch, pricing, the legal pages, the safety position | `PAYMENTS-APPROVAL.md` §4, and re-read its §3. A human opens the site during MoR onboarding, and every provider on the shortlist bans dating products by name |
| Anything on the public site — the landing, the method, pricing, the three legal pages | `LAUNCH-GAP.md` B1 and B4. The site is the second audience §14 names, so a claim added there is a claim somebody will check against the build |
| A safety rule — what moderation acts on, how the escalation runs, what the age gate accepts | `lib/safety/` is the code and the tests are the argument; then `LAUNCH-GAP.md` B3 and `PAYMENTS-APPROVAL.md` §5.1. A change to what the product refuses is a change to what the three legal pages claim, so `components/site/legal-pages.tsx` is part of the same edit |
| A persona's avatar — its form, its motion, or its place on the colour ramp | `AVATAR-AUDIT.md`, and run `npx vitest run lib/personas/visual.test.ts`: the palette bounds are assertions, not a style note |

`NERVE-SPEC.md` is **not** edited as the build moves. It is v1.0 and it is the
thing we are measuring against; where the build has deliberately diverged, that
is recorded in `LAUNCH-GAP.md` §4 rather than by quietly rewriting the target.
