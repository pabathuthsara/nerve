# Docs

Everything written down about Nerve, and the order to read it in.

**If you are picking up work:** read this page, then `M2-PLAN.md` for what is
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
| [`M2-PLAN.md`](M2-PLAN.md) | **The current plan.** The remaining M2 work, in dependency order, with sizes, acceptance criteria and what has already shipped |
| [`LAUNCH-GAP.md`](LAUNCH-GAP.md) | The build measured against the spec: what is done, the ten launch blockers, the product-promise gaps, and eight pieces of spec drift that need a decision |
| [`INTEGRATION-GAPS.md`](INTEGRATION-GAPS.md) | The frontend seam specifically — which screens read real data and which are still fixtures |

## How the parts work

| Doc | What it answers |
|---|---|
| [`DATA.md`](DATA.md) | The eighteen tables, the rules they enforce, why plan and quota have no user write path, and every `db:*` command |
| [`PERSONA.md`](PERSONA.md) | The four-layer persona schema — trajectory, personality, gated, room — and why it replaced §05's flat record |
| [`AUDIO.md`](AUDIO.md) | The room: ambient beds, reverb, the graph. Currently switched off for intelligibility; the note at the top says why and how to bring it back |
| [`PIPELINE.md`](PIPELINE.md) | The ElevenLabs adapter — the assembled STT → LLM → TTS path behind the same `VoiceProvider` interface |
| [`NERVE-FRONTEND-GUIDE.md`](NERVE-FRONTEND-GUIDE.md) | The Arena frontend brief every screen was built from. Long, and the reference for visual detail |

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
| Anything on the blocker list | `LAUNCH-GAP.md` — the entry, its size, and the totals at the top |
| A screen from fixture to real data | `INTEGRATION-GAPS.md` |
| The schema, a policy, or a `db:*` script | `DATA.md` |
| A product rule — rep length, thresholds, what a section is for | `PRODUCT.md`, and record the drift in `LAUNCH-GAP.md` §4 if it now disagrees with the spec |
| A persona dial or contract | `PERSONA.md` |
| The audio graph | `AUDIO.md` |

`NERVE-SPEC.md` is **not** edited as the build moves. It is v1.0 and it is the
thing we are measuring against; where the build has deliberately diverged, that
is recorded in `LAUNCH-GAP.md` §4 rather than by quietly rewriting the target.
