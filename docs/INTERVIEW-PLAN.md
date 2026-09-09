# The interview track

What it would take to make the second track a product, how it is sold, and the
one rule that shapes every line of it: **the dating track is finished and
nothing here may touch it.**

**Date** 6 September 2026 · **Against** spec v1.0 (21 Aug 2026)

The interview track has routes, screens, a table, a storage bucket, a duration
constant, a threshold constant, a band relabel, a track switcher and a guard
that shuts the door on all of it. What it has never had is a character, a
session, a written CV, a price, or a single rep. This is the plan that closes
that.

**Read `PAYMENTS-NEW-INTEGRATION.md` before §5.** The pricing here does not
replace it; it adds a balance alongside the daily rate, and the reason it has to
be a balance rather than another number in `reps_per_day` is arithmetic rather
than preference.

> ## ⚠ PHASE C½ CAME FIRST, AND IT SHIPPED — `INTERVIEW-TECHNICAL-PLAN.md`
>
> **EVERY PHASE HAS NOW SHIPPED.** A, B and C on 7 September (§14), C½ the same
> day (its own §13), and **D and E the same day again (§15) — the track is sold,
> and the door is open.** The one gate that could not be met from a laptop is
> D2's: no pack has been bought with a real card. §15 says what stands in for it
> and what to run the day one is. The paragraph below is the finding it was written to answer, kept
> because it is the argument for the ordering:** Four reps against a real microphone found that the track, as built,
> **never asks a candidate whether they know anything** — every question asks
> what they *did*, because all six authored stems per field are experiential and
> `deep_technical` is authored as *"one problem, taken all the way down"*, which
> pushes an interviewer further into a single project rather than out of it.
>
> `docs/INTERVIEW-TECHNICAL-PLAN.md` is the plan that fixes it: probe domains
> authored per field, a hardness slider independent of the interviewer, a
> re-authored round table where `technical` moves between topics and
> `deep_technical` poses a system design brief instead of reading a CV, and —
> the product decision that changes what Nerve is — **technical accuracy scored
> as a seventh dimension.**
>
> It happens before D because D sells interviews for money and what is being
> sold has to be worth it first. Software is authored properly and proved on a
> microphone before the other eleven fields get a line.

---

## 0. The constraint

> The dating side is behaving exactly as intended. The latency work is done, the
> characters read the way they were authored to read, and the pipeline is tuned.
> **Nothing in this plan may change how a dating rep behaves, sounds, or scores
> — no matter what it costs the interview track.**

This is stated first because it is not a preference to be traded off later. It
is the acceptance criterion every item below is written against, and it changed
the engineering of most of them: the judgement layer is **new files beside the
old ones** rather than the shared-table refactor that would otherwise be correct,
and Phase A opens with a day of tests whose only job is to prove the dating path
did not move.

The build has already learned this lesson in the opposite direction.
`PERSONA-AUDIT.md` records an audit that correctly measured a problem with the
shared band table, gave Tess her own wider bands, her own posture reading and her
own punctuation — and made her worse, because the table was most of what made
Nadia good. **An edit to a shared judgement file is an edit to every character
that reads it, including the ones nobody was looking at.** That is the whole
argument for the tiers below.

### What "do not touch" means in code

Three tiers of contact, and every item in §10 declares which one it is in.

**Tier 0 — never opened.** The interview equivalent is a new file beside it, and
the existing file is not edited at all, not even to add a parameter:

`lib/personas/*.ts` (all nine characters) · `lib/warmth/bands.ts` ·
`lib/warmth/reciprocity.ts` · `lib/warmth/prompt.ts` · `lib/warmth/fast.ts` ·
`lib/warmth/steering.ts` · `lib/warmth/levels.ts` · `lib/grade/prompt.ts` ·
`lib/grade/memory.ts` · `lib/data/guided.ts` · `lib/data/mission.ts` ·
`lib/audio/*` · `lib/voice/elevenlabs/config.ts` and every `PIPELINE_*` default.

The pipeline arm itself is **used as it is**. No model change, no config change,
no latency work, no touching `capToBudget`, `wordCapFor`, the delivery tags or
the steering cadence. The interview track's position is that the transport is
finished and it is inheriting it, not improving it.

**Tier 1 — additive and gated.** Shared plumbing that has to learn a second
shape. The rule is that the dating path reaches the *identical* branch it
reaches today, every new option defaults to off, and the new behaviour is
reachable only through `track === 'interview'`:

`lib/hooks/use-rep-session.ts` (via `lib/data/rep.ts`) · `app/rep/actions.ts` ·
`lib/db/spend.ts` · `components/screens/rep-screens.tsx` ·
`lib/data/rep-rules.ts` (new constants only; `DATING_DURATION_MS`,
`ARM_THRESHOLD`, `KEEP_THRESHOLD`, `WRAP_UP_MS` and `resultReading`'s dating arm
are Tier 0 in practice).

**Tier 2 — provable no-ops.** Exactly one thing is in this tier, and it is the
track filter in §8. It is provable rather than argued: **every session row in
the database today is a dating session**, so a filter that selects dating
sessions selects the same rows and computes the same numbers. That proof holds
only while it is true, which is why the filter lands *before* the first
interviewer is seeded and not after.

### How it is enforced

Not by discipline. **A0 is characterization tests captured before anything
moves**, and it is the first item in the plan for that reason. Compiled prompts,
band output, reciprocity decisions, the fast scorer's applied deltas, rep timing
and the reservation shape, snapshotted from the dating roster as it stands today
and asserted byte-identical afterwards. If an interview change moves a dating
number, the suite says so on the commit that did it rather than on the evening
somebody notices a character reading differently.

### What the constraint costs

About two days, and some duplication that a greenfield build would not have. A
shared `TrackRules` record selected at one seam is the better long-term design
and it is explicitly **not** what this plan does, because arriving at it means
opening four files that currently produce output somebody is happy with. If the
interview track proves out and both arms are stable, unifying them later is a
refactor with two working references and a test suite pinning both. That is a
much safer day than today would be.

---

## 1. The one-paragraph version

The transport carries over for free and the judgement does not. Barge-in,
audibility, moderation, cost accounting and the whole ElevenLabs pipeline are
track-blind and will run an interview the day a character exists — unchanged and
untouched, which is also the instruction. Everything that decides *what she says
and what it was worth* — the band table, the reciprocity model, the intimacy
scale, the six-dimension rubric, the wind-down — is authored about a stranger in
a shop, and gets a parallel set of files rather than a parameter. Interview
demand is episodic, so it is sold as **credits**, which the current entitlement
shape cannot express. A twenty-minute interview costs **$0.45–0.60** against a $6
price, so unit cost is not the risk; an **11% provider-error rate measured over
the last 28 reps** is, because at three minutes that is an annoyance and at
twenty minutes on a paid item it is a refund. Interview keeps **its own
progress**, scoped to the job you are preparing for rather than to a rank. And
there is a live landmine: progression reads every session regardless of track, so
the first interview rep scoring 70+ would open a dating tier — the one thing this
plan is most forbidden to do.

---

## 2. What is actually there

| Piece | State |
|---|---|
| `/interview`, `/interview/setup/{role,cv,questions}`, `/interview/interviewers` | Built, served through `app/[...slug]/page.tsx` |
| `app/interview/rep/[interviewerId]/{brief,live}/page.tsx` | Built. The live page passes `live={null}`, hard-coded |
| `components/screens/interview-screens.tsx` | 93 lines — home, the three-step setup, the interviewer picker |
| `supabase/migrations/20260823040505_m3_interview.sql` | **Applied.** `interview_setups` (one row per user) and a private `cv` bucket, 5 MB, PDF + DOCX MIME allowlist, RLS including delete, proven from a second account by `npm run db:verify` |
| `sessions.track`, `profiles.active_track`, `profiles.unlocked_tracks` | All three exist and accept `interview`; `personas.track` does too |
| `INTERVIEW_DURATION_MS = 480_000`, `INTERVIEW_THRESHOLD = 70` | `lib/data/rep-rules.ts:25,47`, with `repDurationMs` and `repThreshold` reading them |
| The rep screens, reskinned | `rep-screens.tsx` — band relabel (`CLOSED→SKEPTICAL … INVESTED→CONVINCED`), a question rail, no memory line, no mission, no text-mode escape, no guided script |
| `TrackSwitcher` | `components/app-shell.tsx:100`, rendered only when `unlockedTracks.length > 1` |
| The guard | `lib/data/guards.ts` — `/interview*` redirects to `/train` unless `unlocked_tracks` contains `interview`. It never does: the column defaults to `'{dating}'` |

That is a real half, built to the same standard as the rest of the app. Nothing
below is a rewrite of it.

---

## 3. What is missing, honestly

1. **There are no interviewer characters.** All nine files in `lib/personas/`
   are `track: 'dating'`. `useInterviewers()` is `useMock(interviewers, 310)`
   (`lib/data/index.ts:380`) over four fixtures in `lib/data/mock/interview.ts`,
   every one with `portraitUrl: ''`.
2. **No interview has ever run.** `live={null}` is hard-coded in the live page,
   so the screen always renders *"Interview reps are not open yet."*
3. **Nothing reads or writes `interview_setups`.** `useInterviewSetup()` is a
   mock. No server action, no query, no `lib/db` module. The table and the bucket
   are RLS-correct and entirely unused.
4. **The CV upload is theatre.** `CvSetup` validates the extension and the size,
   then runs a `setInterval` that ticks a progress bar to 100% and puts a
   filename in React state. There is no `storage.from('cv').upload` call anywhere
   in the repo. Nothing survives a refresh.
5. **No CV parsing exists.** No PDF library, no DOCX library, nothing that
   extracts text, and nothing that puts a CV into a prompt.
6. **The question rail is three constants.** `lib/data/rep.ts:1015` returns
   `questionIndex: 0, questionTotal: 0, question: null` with the comment
   *"Interview reps are M4."* The screen that renders them is finished.
7. **No interview-specific judgement of any kind.** `INTERVIEW_THRESHOLD = 70` is
   read by `repThreshold` and nothing ever computes against it.

---

## 4. What carries over, and what gets a parallel file

**The transport: everything, unchanged.** An interviewer is a `Persona` row.
`personas.track` "decides the display label only" (`lib/voice/types.ts:267`), and
`mintSession → resolvePipelineConfig → STT/LLM/TTS` never asks which track it is
in. Same voice path, same barge-in (`displaceCurrentReply`), same audibility
accounting, same reservation and settlement, same moderation on both streams,
same rate card, same tuned latency. `PRODUCT.md:17`'s claim — "adding the
interview track is characters and a setup flow, not a second engine" — is true of
the transport, and it is the reason this plan is affordable.

**The judgement layer: none of it, and it is copied rather than parameterised.**
Four files are authored in the first person about a woman in a shop:

| Dating file (Tier 0 — not opened) | Interview equivalent (new) | Why it cannot be shared |
|---|---|---|
| `lib/warmth/prompt.ts` — `INTIMACY_ANCHORS` | `lib/warmth/interview/anchors.ts` | The dating scale runs from *"the shop, the books, the weather"* at 0–10 to *"comments on her body"* at 80–90, with *"work, where she lives"* pinned at 40–50. In an interview, work **is** the topic — a candidate describing their last job would be scored mid-way up a scale whose top is sexual, and the overreach rule would fire on the correct answer |
| `lib/warmth/reciprocity.ts` | `lib/warmth/interview/reciprocity.ts` | The premise inverts. The mirror cap `min(bandCap, ceil(hisWords × 1.3))` means a long, good answer buys a long interviewer reply, which is backwards: the interviewer is supposed to ask and then be quiet |
| `lib/warmth/bands.ts` | `lib/warmth/interview/bands.ts` | 3–15 words is a stranger who owes you nothing. An interviewer asks a two-sentence question and then shuts up — different in both directions, and rule 4 says a cap is a runtime ceiling, not prose |
| `lib/grade/prompt.ts` — `RUBRIC` | `lib/grade/interview/rubric.ts` | *"Did he ask about her, and go past the first answer?"*, *"Leaving warmly without pushing"*. Three of the six dimensions transfer as skills; none transfer as written |

The fork is **one selector at each call site**, reading `persona.track`, with
dating as the default branch that reaches exactly the code it reaches today.

---

## 5. The decisions

Every question this document opened with has now been answered. They are
recorded here as decisions with their reasoning, because a decision without its
argument gets re-litigated by whoever reads this next.

### 5.1 One product, two tracks — not a second product

The pricing shape differs; the product does not. Same account, same `sessions`
table with `track` already on it, same Arena shell, same history. Three of the
six graded dimensions — listening, composure, signal reading — are the same skill
under a different name, which is the ladder §01 of the spec describes: *"the same
engine trains interviews, negotiations, networking and hard conversations at
work."*

### 5.2 Pro and Elite subscribers get interviews, with an allotment

Yes — never unlimited, never metered by day. Forced by arithmetic:
`entitlements.reps_per_day` is a **daily rate**, and Pro is 3/day. If an
interview counted as a rep, a Pro subscriber running three 20-minute interviews a
day would spend about **$45/month of voice against a $19 price**, before the
merchant of record takes its cut. The daily-rate meter cannot hold a
twenty-minute item, and lowering `reps_per_day` to compensate would break the
dating plan it was sized for — which the constraint forbids anyway.

### 5.3 Credits, not a daily rate

One balance, two ways to fill it: a monthly grant on a subscription, and a
one-time purchase. That is also the link between the tracks — buying a pack adds
`interview` to `unlocked_tracks`, the `TrackSwitcher` appears in the chrome for
the first time, and one account carries both.

Rule 11 binds it: the balance has **no user write path**. Append-only ledger,
service-role write, owner read, exactly like `usage_ledger` and the field log.

### 5.4 The prices

| | Price | Contents | COGS at $0.55/interview |
|---|---|---|---|
| Free screener | **$0** | 1 × 5 min, once per account | ~14¢ |
| Two credits | **$6** | 2 credits — one full round of any kind, graded | ~7% |
| Eight credits | **$20** | 8 credits | ~8% |
| Twenty credits | **$45** | 20 credits | ~9% |
| Pro $19/mo | — | **1 credit / month**, on top of 3 dating reps a day | — |
| Elite $49/mo | — | **4 credits / month**, on top of 6 dating reps a day | — |

`lib/site/plans.ts` stays the single record both pricing surfaces read, so packs
are authored there beside `OFFERS`. **A pack is not a `Plan`** — the same
reasoning that let a billing period cost no migration: `Plan` stays
`free | pro | elite` and decides `reps_per_day` and the daily spend cap; a pack
decides a balance. No new plan value, no CHECK constraint, no mark glyph.

### 5.5 Expiry — purchased credits never expire, granted credits do

**Decided by looking at what the category actually does**, and the category is
unusually consistent about it:

| Model | Behaviour | Who does it |
|---|---|---|
| One-time credit pack | **Never expires**, and survives cancellation | Parakeet AI, LockedIn AI, getmockinterview, Mock Call, ReplacedByAI, Hirevire |
| Subscription-granted credits | **Expire at the end of the billing period**, no rollover | Final Round AI, InterviewFocus, Interviews Chat |

We do the same, and the split is coherent rather than merely conventional: a
**grant is part of the month you paid for**, and a **pack is a thing you bought
outright**. It also answers the third question by construction — **unspent
granted credits are voided when a subscription lapses, and purchased credits are
untouched by cancellation and stay in the account.** A user who cancels keeps
every credit they paid for and loses only the ones this month's subscription was
handing them.

Two consequences that are not optional. The ledger has to record **which kind**
each credit is, because they behave differently at a period boundary — so a
`source` on every row (`purchase` / `grant` / `screener`), and spend takes the
**expiring ones first**, which is the only ordering that is not quietly hostile.
And **the terms have to say all of this before the card is entered**:
`components/site/legal-pages.tsx` and `RefundDocument` are part of the same
commit as D1, for the reason §14 gives — a disputing customer quotes the legal
page and a merchant of record reads the PDF.

### 5.6 The free five-minute screener

**One five-minute interview, once per account, free at sign-up** — the interview
equivalent of the sign-up rep, and built the same way: its own stamp on
`entitlements`, additive, no user write path, spent last. At ~14¢ it costs a
quarter of what a full interview costs and a fifth of what the dating sign-up rep
cost the business before it was made one-off.

Five minutes is a recruiter screen, which is a real format rather than a truncated
one — it is what a first-round phone call actually is, so nobody is being shown a
demo. It ends where a screen ends: two or three questions and *"any questions for
me?"*.

It does **not** get a guided rail. Tess's script is a one-character exception
recorded as `LAUNCH-GAP.md` D13 and it stays one character wide (§11).

### 5.7 Length is a property of the round

`INTERVIEW_DURATION_MS` is already 8 minutes, and `rep-screens.tsx:133`
hardcodes `480_000` rather than importing it — live drift, and the two can
already disagree.

| Round | Length | Wind-down |
|---|---|---|
| Free screener | 5 min | "Any questions for me?" |
| Recruiter screen | 10 min | Same |
| Technical | 20 min | Same, plus a next-steps line |
| Deep technical | 25 min | Same |
| Final / behavioural | 20 min | Same |

`WRAP_UP_MS = 30_000` is a **dating** constant and stays exactly where it is. The
interview's wind-down is *"do you have any questions for me?"* — a beat
candidates lose offers on — and it needs its own constant and more than thirty
seconds.

### 5.8 The interview type IS the interviewer, plus a round type

No separate style toggle. `Interviewer.style` already anticipates this —
`'friendly_hr' | 'technical' | 'distracted_exec' | 'panel_lead'` — and rule 10
says content is authored in the repo and seeded, never generated at runtime. The
style is the character, and `InterviewerPicker` is already the toggle. The round
type (§5.7) rides on top and sets duration, question mix and wind-down. Four
characters × four rounds is sixteen configurations from eight authored things.

### 5.9 The field is a dropdown, and it is authored

`lib/data/interview-fields.ts` — an enum with per-field vocabulary and question
stems (software, data, design, product, sales, finance, ops, healthcare,
teaching, …), reviewed in a PR, seeded like the field challenges and the library
cards. It feeds the compiled prompt as context, it must not generate a character
at runtime, and it is what makes a *missing* CV survivable rather than a
substitute for one.

### 5.10 Difficulty is chosen, not earned

**Do not copy the dating ladder.** The dating ladder is a progression — you earn
Robin — and that is the shape of the dating product. Somebody who paid $20
because they interview on Thursday needs the hard one tonight, and a pack of five
mostly spent on tutorial is a refund request. So: **three difficulty levels,
chosen on the brief.** The curves come from `levelTrajectory` (read, never
edited — Tier 0) and `difficulty_offsets` still adapts silently underneath
(rule 7 — never announce a downward adjustment). What is dropped is the gate.

### 5.11 Captions are a setting, and the setup recommends them off

The question on screen stays, and it becomes a **toggle**, defaulting to off,
with the setup saying plainly that a real interview has no captions and that
practising without them is the point.

That is the honest resolution of the §05 tension. `rep-screens.tsx` already
renders `session.question` and a `Q{n} / {n}` counter, and the argument that it
is a caption rather than coaching is a good one — but it is still text on the
live screen, and §05 allows three things. Making it a setting the user chooses
means the product's recommendation and the user's accommodation are both
expressed, and neither is imposed. It is also a genuine accessibility control,
which is the strongest reason of the three.

**It is a caption and never a prompt.** It shows what the interviewer *asked*. It
must never gain a suggested answer, a hint, a structure reminder or an example
line — `assertNoScript`'s doctrine applies to it even though it is not a mission,
and the item in §10 says so with a test.

Recorded as drift in `LAUNCH-GAP.md` §4 when it ships, the way D13 was: §05 says
three things on screen and this is a fourth, deliberately, on one track, behind a
setting that is off by default.

### 5.12 Interview keeps its own progress

**Yes, and this is also the safest answer**, which is a pleasant coincidence
rather than the reason. Interview progress must not touch `profiles.current_level`,
`profiles.rank`, `unlockedLevels`, `earnedLevels`, the field tier, or the
personal-best composite that fires `BestBeat` — every one of those is a dating
number the constraint protects, and §8 is what happens if they are shared.

What interview progress *is*, since a rank would be wrong (§5.10): **readiness
across a preparation run.** The unit is the role you are preparing for — you have
a `interview_setups` row, you do four interviews against it, and what you want to
see is whether you are getting better at *this* interview. Per-round-type best
composite, the six dimensions over the run, and a plain reading of which one
moved. Not a ladder, not a rank, not a tier — a trend with an end date, because a
job hunt has one.

**The one deliberate crossover is the streak.** An interview counts as a training
day. A streak is the account's habit counter, §14 is explicit that running out of
one thing must never break it, and refusing to count a twenty-minute interview
while counting a three-minute rep would be indefensible. Everything else is
separate.

---

## 6. What twenty minutes actually costs

**Measured**, from `voice_operations` and `sessions` on 6 September: 19 completed
reps between 120 and 260 seconds since the ElevenLabs arm started shipping on
5 September, averaging 172 s and 14.0 turns.

| Component | $/rep | Share | Scales with |
|---|---|---|---|
| TTS | 0.0465 | 58% | **her** airtime — 930 characters per rep |
| STT | 0.0142 | 18% | **his** airtime, via the session envelope |
| LLM | 0.0118 | 15% | turns × context; 72.5% cache hit already |
| Warmth (fast scorer) | 0.0031 | 4% | one call per user turn |
| Grade | 0.0041 | 5% | one pass over the transcript |
| **Total** | **$0.0797** | | **2.78¢/min** |

Against the $0.033/min ceiling stamped in `lib/voice/rates.ts:44` — the ceiling
is holding, and **TTS dominates, not the model**.

Projected to twenty minutes component by component, because it does not scale
uniformly. An interviewer talks *less* of the time than a dating persona, so
per-minute TTS falls while STT rises:

| Component | 20-min projection | Reasoning |
|---|---|---|
| TTS | 15–22¢ | ~22 exchanges × ~170 characters. Longer questions, far fewer of them |
| STT | 6–10¢ | 20 minutes of envelope at the transcription rate |
| LLM | 4–7¢ | ~22 turns over a transcript growing ~7×, plus the CV and JD in the system prompt — which rides the existing 72.5% cache |
| Warmth | ~0.5¢ | one call per user turn, and there are fewer of them |
| Grade | 2–3¢ | one pass over a transcript ~7× longer, on `gpt-4.1` |
| **Total** | **28–43¢** | |

Naive linear at 2.78¢/min gives 55.6¢, the upper bound; the two methods bracket
the same number. **Budget $0.45–0.60** — the high end, at p90 rather than mean,
with a reconnect. At $9 that is ~6% COGS. The five-minute screener lands near
**14¢**. Unit cost is not the risk here, which was worth measuring precisely
because the instinct said otherwise.

### 6.1 · Re-costed on 9 September, and it moved the credit ladder

§6 above is the 6 September measurement and its projection. Both survive; what
follows is the same exercise repeated once there were interview reps to measure
rather than only dating ones, and it is the costing `LAUNCH-GAP.md` D18 is
decided on.

**Method.** Per-component sums from `voice_operations`, joined to `sessions`, on
the ElevenLabs arm. Rows before 7 September are excluded: the STT envelope was
still settling `unknown` and charging its whole reservation on 17 of 23 reps,
which inflates every total through it. Rows with `estimated = true` are excluded
from the component figures and counted separately, because an unpriced operation
is charged its whole reservation (rule 18) and one aborted turn is $0.0374 of
phantom against a real cost near zero.

**A full-length dating rep** — 15 reps at or past 165 s, mean 176 s, 14.6 turns:

| Component | avg | worst seen |
|---|---|---|
| TTS · `eleven_v3_conversational`, 984 chars (max 1,435) | $0.0492 | $0.0718 |
| LLM · `gpt-4.1-mini` | $0.0071 | $0.0090 |
| STT · `gpt-4o-mini-transcribe`, prorated envelope | $0.0090 | $0.0240 |
| Warmth · one call per user turn | $0.0034 | $0.0055 |
| Grade · `gpt-4.1`, one pass | $0.0042 | $0.0049 |
| Moderation · `omni-moderation-latest` | free | free |
| **Total** | **$0.073** | **$0.115** |

Against a hard ceiling of **$0.20** — `voiceBudgetPolicy().budgetUsd`, enforced
by `voice_sessions.budget_usd` and not by care.

**Interviews**, projected off the two real 8–9 minute rounds (213 and 227
chars/min, 2.15–2.79 turns/min). Nothing longer than 537 s has ever run, so
every row below the screener is arithmetic:

| Round | TTS | LLM | STT | warmth | grade | accuracy | **total** | ceiling |
|---|---|---|---|---|---|---|---|---|
| screener 5 min | .058 | .015 | .009 | .007 | .007 | — | **$0.10** | $0.34 |
| recruiter 10 min | .110 | .026 | .018 | .011 | .010 | — | **$0.18** | $0.62 |
| technical 20 min | .200 | .051 | .036 | .020 | .016 | .020 | **$0.34** | $0.90 |
| deep technical 25 min | .244 | .060 | .045 | .023 | .019 | .020 | **$0.41** | $0.90 |
| final 20 min | .205 | .053 | .036 | .021 | .016 | — | **$0.33** | $0.90 |

That brackets §6's 28–43¢ projection, which is the useful part: two methods, one
answer. **The maximum cost of any interview is $0.90** — `interviewBudgetPolicy`
clamps at it, and the resource limits (12,000 characters, 900k tokens) sit above
it, so the dollar figure is what binds on every round of fifteen minutes or more.

**What this settled.** A deep technical costs **1.2x a technical** and was priced
at **1.5x**. TTS is 60–67% of every rep and nothing else is close, so what scales
is HER airtime — and an interviewer talks less of a long round, not more. The
ladder is 1 / 2 / 2 / 2 now; the argument and the buyer-facing half of it are
`LAUNCH-GAP.md` D18.

**Four things worth knowing that fell out of this measurement:**

- **The accuracy pass has never fired.** All six real interview reps were
  behavioural rounds with no probe pairs, so `scoreAccuracy` returned null every
  time. The 2¢ in the table is the least-tested line in it.
- **The STT envelope caps at four minutes whatever the round.**
  `pipelineTranscriptionAllowance()` is `0.003 × 4`, and
  `settleTranscriptionEnvelope` takes `min(prorated, maxCostUsd)`. A
  twenty-five-minute deep technical books at most $0.012 against a real ~$0.045.
  It is ~3¢ per long interview and it is the one bound in the system that fails
  in the **wrong** direction — everything else over-charges on purpose.
- **Our ElevenLabs character rate wants one invoice against it.** `config.ts`
  prices `eleven_v3_conversational` at $0.05/1k characters, which is ElevenLabs'
  published API list price for that exact model. The account is on **Creator —
  $22/month, 121,009 credits** — and across 5–8 September we submitted **27,411
  characters** while the vendor billed **12,321 credits** for that model. Both a
  ~0.45 credits-per-character multiplier and a higher effective dollar rate are
  consistent with that; which one is real decides whether a rep is $0.073 or
  $0.10, and therefore whether the $0.20 budget is really $0.20 or really $0.33.
  `rates.ts` already says vendor reconciliation is owed. This is the number that
  makes it worth doing.
- **`DEFAULT_CREDIT_BUDGET = 10_000` is the free plan's allowance** and we are on
  121,009. With `ELEVENLABS_CREDIT_BUDGET` unset, the console warns from 8,000
  upward on every rep and the audition CLI refuses runs it can afford twelve
  times over.

Three findings that fell out of the measurement, all of them **observations about
the current build rather than licence to change it**:

- **`DAILY_CAP_CENTS.free = 100`** (`lib/db/spend.ts:112`) halts an account after
  roughly **1.7** twenty-minute interviews. Sized as five times a plan's honest
  day of three-minute reps, and it knows nothing about a twenty-minute item.
  A5 raises the ceiling **only for accounts holding interview credits**; the
  free, pro and elite numbers a dating account meets are untouched.
- **The ledger cannot see TTS.** Every combined turn is stamped with the *text*
  model — 447 rows carrying $1.76 since 5 September filed under `gpt-4.1-mini` —
  because `turnReservation` returns `model: compiled.llm.model`
  (`lib/voice/elevenlabs/combined.ts:126`) for an operation that also synthesises
  speech. The split above had to be reconstructed from `voice_operations.usage`.
  **Not fixed by this plan** — it is a write to a shared accounting path and the
  constraint says leave it alone. Recorded in `LAUNCH-GAP.md` so it is not lost.
- **`usage_ledger.seconds` is 0 on every row** the pipeline arm has written.
  Same disposition: recorded, not fixed here.

---

## 7. What would send $9 down the drain

Measured over the **28 completed reps since 5 September**: **3 recorded provider
errors** (12 in total) and one recorded **7 unheard replies** — the B11 defect
fixed in the last commit. An **11% rate of reps hitting a provider error**.

At three minutes on a free rep that is survivable. At twenty minutes on a $9 item
it is a refund, and a twenty-minute rep carries **6.8× the exposure per attempt**.

The hard part is that four of the five fixes live in shared plumbing, so every one
of them is Tier 1: additive, gated, off by default for dating, and pinned by A0.
That is why Phase A is three and a half days rather than two.

1. **The refund test is binary and it is the wrong test for a long rep.**
   `app/rep/actions.ts` credits back only when `heardUser` is false — when the rep
   produced *literally nothing*. A rep that dies at minute 14 of 20 has heard the
   user, keeps the money and returns nothing. **Dating keeps `heardUser` exactly
   as it is**; interview gets a completion test beside it.
2. **There is no reconnection.** ICE retry ×3 behind `ConnectionLostModal`, open
   in `M3-PLAN.md` Phase D. Optional at three minutes, not at twenty — and it
   arrives as an opt-in flag that a dating rep never sets.
3. **The credit is spent at connect, not at grade.** `consumeRep` fires when the
   transport connects. A $9 item should be reserved at connect and settled at
   grade — the shape `reserveVoiceOperation`/`settleVoiceOperation` already use
   for money, and rule 18's doctrine applied to a credit. Dating's `consumeRep`
   is not touched.
4. **No resume.** Twenty minutes crosses a closed lid, a phone call and a
   backgrounded tab, and none of them may cost a credit.
5. **The spend cap is interview-blind** (§6).

---

## 8. The landmine, and why it is safe to fix today

`refreshProgression` (`lib/db/progress.ts:435`) selects
`sessions.select('id, persona_slug').eq('user_id', userId)` with **no track
filter**, joins `personas.slug → level`, and feeds `qualifyingByLevel` →
`unlockedLevels` → `earnedLevels` → `rankFor`.

Interviewers will be rows in `personas` — that is how they get a slug, a level
and a compiled prompt. So on the day the first one is seeded at level 2 and
somebody scores 70+ against them:

- a **dating** tier unlocks, and `recordUnlocks` fires its once-ever celebration;
- `rankFor` reads the same counts, so **the rank rail moves**;
- `profiles.current_level` advances, dragging `unlockedTier` and the **field
  tier** with it (`progress.ts:478`).

That is the precise failure the constraint exists to prevent, and nobody would
have chosen it — it is simply what happens by default. `sessions.track` is
written and nothing reads it.

**The fix is a Tier 2 provable no-op, and only while it stays one.** Every
session row in the database today is a dating session, so adding
`.eq('track', 'dating')` selects the same rows, computes the same counts, and
produces the same tier, rank and level for every existing account. That can be
asserted rather than argued: run `refreshProgression` for every user before and
after and diff the three columns. The proof evaporates the moment an interview
session exists, which is why this lands in B1 — **before** B8 seeds a character,
not after.

---

## 9. The compliance dividend

Rule 12 records that the Whop account is
`software / personal_development / public_speaking_coaching`, that it reverts to
`mental_health_app` on almost any account write, and that
`PAYMENTS-APPROVAL.md` §3 exists because **every merchant of record on the
shortlist bans dating products by name** while a human reviewer opens `/` during
onboarding.

Interview practice sits inside `public_speaking_coaching` without any strain. A
product whose public surface leads with interview rehearsal and carries
conversation practice alongside it is describing itself accurately *and* in the
category it is already registered under. This is the best thing that could happen
to the payment position, and it changes the order of the work: the landing page
and `/pricing` gaining an interview surface is not a Phase E afterthought.

It does not license overstating it. The dating track remains the majority of the
product, the legal pages describe both, and `PAYMENTS-APPROVAL.md` §4 is part of
the same edit as any change to the public pitch.

---

## 10. The plan

Five phases. **The order between them is load-bearing**: nothing may take money
until a twenty-minute rep survives a bad network, nothing may be graded until
there is a rubric that is not about a woman in a bookshop, and nothing may be
seeded until §8's filter is in.

Every item declares its **tier** (§0). Sizes are days of work, in this codebase,
by somebody who has read the files named.

### Phase A · Make a long rep survivable · **SHIPPED 7 September**

Four of these six touch shared plumbing, and the constraint is what makes them
cost a phase rather than an afternoon. **None of them changes a dating rep.**

#### A0 · Pin the dating path before anything moves · Tier 0 · **SHIPPED**

The first commit, before any interview code exists. Characterization tests that
snapshot the dating arm as it stands today:

- `compileInstructions` output for all nine personas, at a fixed seed, across
  every warmth band;
- `bands.ts` directives and word caps; `wordCapFor` and `capToBudget` for a
  spread of inputs;
- `reciprocity.ts` decisions (question / volunteer / silence / mirror cap) over a
  table of turn shapes;
- `fast.ts` applied deltas for a fixed transcript;
- `rep-rules.ts` timing — arm, keep, wrap, closing grace — across a rep;
- `turnReservation`'s shape and the reservation/settlement arithmetic;
- the `RUBRIC` string and the grade payload shape.

*Done when:* the suite passes on the current tree, is wired into `npm test`, and
its header says in one sentence that its only job is to fail when an interview
change reaches the dating arm. **This file is the enforcement of §0 and the
reason every later item can be reviewed quickly.**

#### A1 · Reserve the credit at connect, settle it at grade · Tier 1 · **SHIPPED**

A hold at connect, settled when the scorecard is written, released when the rep
never produced one. **`consumeRep` and `mayOpenSession` are untouched** — the
credit path is a separate function that the interview branch calls and the dating
branch never reaches.

*Done when:* a rep killed at minute 3 of 20 leaves the balance unchanged; a rep
reaching the scorecard has spent exactly one credit; two connects for the same
`session_id` cannot spend two; `npm run db:rep` still passes unchanged and a new
`db:credits` covers the new path.

#### A2 · Refund on an incomplete rep, not only an empty one · Tier 1 · **SHIPPED**

`ended_by` already records how a rep ended. An interview that ended for a reason
other than the clock or the user is creditable. **The `heardUser` rule stays
exactly as it is for dating**, and stays as a second creditable case for
interview — it catches the muted-headset failure, which is different and still
deserves the credit back.

*Done when:* an interview terminated by a provider error at any point returns the
credit; one the user ended at 18:00 of 20:00 does not; a dating rep takes the
identical branch it takes today, asserted by A0.

#### A3 · Reconnection · Tier 1 · **SHIPPED**

ICE retry ×3 behind `ConnectionLostModal`, from `M3-PLAN.md` Phase D. The modal
and `session.retry` already exist; the retry policy and the state that survives
it do not. **Arrives as a `RepSessionOptions` flag defaulting to off**, so a
dating rep runs the same code path it runs today and the tuned latency behaviour
is not in the change's blast radius.

*Done when:* a drop under 15 seconds resumes the same interview with warmth,
transcript and clock intact; three failures end it and credit it; the flag is off
everywhere except the interview live screen; A0 is green.

#### A4 · Resume across a backgrounded tab · Tier 1 · **SHIPPED**

Same gating as A3, same flag.

*Done when:* backgrounding for 30 seconds and returning resumes an interview; a
genuinely lost microphone routes to `MicLostModal`, which already exists; a
dating rep's behaviour on the same events is unchanged.

#### A5 · A ceiling that knows about credits · Tier 1 · **SHIPPED**

`DAILY_CAP_CENTS` is sized against three-minute reps (§6). The extra headroom is
keyed to the account's **credit balance**, which is a ceiling the server owns —
rule 18's "bound it from something the server owns, never from a figure the
browser reports."

*Done when:* an account holding 5 credits can spend all five in a day;
**`DAILY_CAP_CENTS.free`, `.pro` and `.elite` are numerically unchanged** for an
account with no credits; `npm run db:spend` covers both.

#### A6 · Stop hardcoding the duration · Tier 1 · **SHIPPED**

`rep-screens.tsx:133` → `repDurationMs(interview)`. The dating branch already
reads `DATING_DURATION_MS`, so this moves only the interview number.

*Done when:* `grep -rn "480_000" components/` is empty.

### Phase B · The judgement arm · **SHIPPED 7 September**

The expensive half, and the half that decides whether the product is any good.
**Nothing here opens a Tier 0 file.**

#### B1 · The track filter, and interview's own progress · Tier 2 + new · **SHIPPED**

Two things, one commit, and it lands **before B8 seeds anything** (§8).

The filter: `.eq('track', 'dating')` wherever `sessions` feeds
`qualifyingByLevel`, `rankFor`, `unlockedTier` or `profiles.current_level`.
Provable no-op today; a migration and an apology tomorrow.

Interview's own progress (§5.12): scoped to the `interview_setups` run rather
than to the account. Per-round-type best composite, the six dimensions across the
run, and a plain reading of which one moved. No ladder, no rank, no tier.

*Done when:* the before/after diff of `current_level`, `rank` and `fieldTier`
across every existing account is empty — run it and record the result here; a
seeded interviewer scoring 90 opens no dating tier and moves no rank; the
personal-best that fires `BestBeat` is per-track; `recordTrainingDay` still fires
for an interview (§5.12's one crossover); a mixed-track history is walked in
`lib/data/progression.test.ts`.

#### B2 · The seam · new files · **SHIPPED**

One selector at each call site reading `persona.track`, with dating as a default
branch that reaches today's code unchanged. `lib/warmth/interview/` and
`lib/grade/interview/` are created empty and wired; the tables arrive in B3–B6.

*Done when:* no Tier 0 file has been edited; the dating branch is byte-identical
under A0; a third track would be a third directory rather than a third `if`.

#### B3 · The interview band table · new file · **SHIPPED**

A two-sentence question then silence is a different curve in both directions from
`bands.ts`'s 3–15 words. Read `PERSONA-AUDIT.md` §12 first: **state the typical,
then the ceiling**, because a text model writes to whichever number it is given,
and `maxWords` is a runtime ceiling handed to `capToBudget`, not prose.

*Done when:* five bands with typical and max; the interview arm has **its own**
verbosity median constant (`lib/metrics/stability.ts`'s
`DEFAULT_VERBOSITY_MEDIAN` is not touched); `npm run rep:audition` run against an
interviewer with its `capped by the band` line inspected.

#### B4 · Reciprocity, inverted · new file · **SHIPPED**

The dating model mirrors his length and floors her at the band's typical. In an
interview the mirror becomes a **floor on his** share rather than a cap on hers,
and "she may say nothing" becomes the far more valuable interview behaviour of
letting a pause sit.

*Done when:* pure functions with tests, the `rep-rules.ts` pattern; the file
carries **no warmth opinion of its own** — the failure `HUMANNESS.md` §7.1
records, where every gate sat twenty points above the band table it was gating
and won silently; a candidate answering in one word gets a follow-up, not a
matching one-word question.

#### B5 · Relevance replaces intimacy · new file · **SHIPPED**

The interview's axis is **specificity**: did the answer name a decision, a
number, a consequence — or was it a description of a job title. That is what an
interviewer actually reads, and what the fast scorer should score.

*Done when:* an anchors table and few-shots for the interview arm; the overreach
rule re-derived (a candidate volunteering salary expectations unasked is the
interview's overreach); `lib/warmth/prompt.ts` unopened.

#### B6 · The interview rubric · new file · **SHIPPED**, calibration owed

Six dimensions re-authored. Three carry over as skills, three do not. Suggested:
**structure** (did the answer have a shape), **specificity** (evidence, not
adjectives), **listening**, **composure**, **signal reading** (did they notice
the interviewer had stopped caring), **close** (the questions they asked back).

*Done when:* §07's "score the process, never the outcome" survives verbatim — a
candidate turned down can score 92; the memory line stays off the interview arm
(`rep-screens.tsx:51` already suppresses it, and an interviewer who remembers
your last attempt is the companion-app framing rule 9 refuses); **`npm run
grade:calibrate` re-run and its result recorded** — a rubric change is a
calibration change, and the dating golden set must come back unmoved.

#### B7 · The wind-down · Tier 1 (new constants only) · **SHIPPED**

`WRAP_UP_MS`, `ARM_THRESHOLD`, `KEEP_THRESHOLD` and `resultReading`'s dating arm
are not touched. The interview's beat is *"any questions for me?"*, with its own
constant and its own reading. `INTERVIEW_THRESHOLD = 70` finally gets something
computing against it.

*Done when:* the beat fires with enough time to answer it; an interview arm of
`resultReading` derives `close`, `lateSurge` and `nearMiss`; the result screen
never uses the word "number"; A0's timing snapshots are green.

#### B8 · Four interviewers, authored properly · new files · **SHIPPED**

One per `Interviewer['style']`, `track: 'interview'`, in `lib/personas/`,
reviewed in a pull request, reaching the database through `npm run db:seed`
(rule 10). Full four-layer contracts — trajectory, personality, gated, room —
authored to the standard `PERSONA.md` sets, not sketches. Difficulty is chosen
rather than earned (§5.10), so each character is authored at one difficulty and
the three levels ride `levelTrajectory` on top, **read and never edited**.

*Done when:* an interview equivalent of `roster.test.ts` asserts the ordering;
each has an avatar hue inside the bounds `visual.test.ts` enforces; each has a
**room scene of its own** (`AUDIO.md` — a character without one is a character
whose absolute rules name the wrong room); `db:seed` seeds them without touching
a dating row; `lib/data/mock/interview.ts` is deleted rather than left beside the
real thing; **no file in `lib/personas/` belonging to a dating character is
opened**.

#### B9 · Safety, checked rather than assumed · Tier 1 · **SHIPPED**

Moderation runs on both streams already and is track-blind, which is right and
stays. What is not track-blind is the **escalation copy**: the first breach is an
"in-frame decline", and what an interviewer says when a candidate crosses a line
is not what a stranger in a shop says. The verdict mapping, the age arithmetic
and the distress path (§16.8) are unchanged.

*Done when:* the escalation sequence has an interview voice behind the same
selector; `lib/safety/`'s pure functions are untouched apart from the copy table;
`components/site/legal-pages.tsx` is reviewed in the same commit — a change to
what the product refuses is a change to what the legal pages claim.

#### B10 · Interview archetypes for the audition harness · new file · **SHIPPED**

`npm run rep:audition` drives a whole rep through the real prompt against a
scripted player archetype. Its archetypes are dating archetypes. Interview needs
its own — the over-preparer, the rambler, the one-word answerer, the
under-confident specialist — added beside them.

*Done when:* an interviewer can be auditioned without a microphone; the dating
archetypes are unchanged; the harness reports the interview band's `capped by the
band` line.

### Phase C · Setup, the CV and the round · **SHIPPED 7 September**

#### C1 · `interview_setups` for real · new · **SHIPPED**

A `lib/db/interview.ts` module and Server Actions returning `{ ok, message }`,
replacing `useInterviewSetup`'s mock. Optimistic UI on every write (§02).

*Done when:* the three setup steps persist across a refresh and a device; RLS
re-proven by `npm run db:verify`, which already covers the table; no screen
imports `lib/data/mock/interview.ts`.

#### C2 · The CV actually uploads · new · **SHIPPED**

`storage.from('cv').upload` to `<user_id>/<filename>`, the RLS key the migration
already enforces. Delete the `setInterval` that fakes progress — a progress bar
that is a timer is worse than no progress bar.

*Done when:* a real PDF and a real DOCX round-trip; a 6 MB file is refused by the
bucket and the message says so; **Replace and Remove both delete the old object**
— a CV is the most personal thing this product holds, and the migration gave the
user delete rights on purpose; account deletion takes the bucket contents with it
(`LAUNCH-GAP.md` B6).

#### C3 · CV text extraction · new · **SHIPPED**

Server-side, on upload, once — never per turn. PDF and DOCX. Store the extracted
text on `interview_setups` beside `cv_path` so the prompt never touches storage.

*Done when:* extraction runs in a Server Action or route, not in the browser; a
scanned image-only PDF fails with a message that says what to do rather than
silently producing an empty CV; the text is capped and the cap is stated on
screen; failure leaves the file uploaded and the interview runnable without it.

#### C4 · The field, and the round type · new · **SHIPPED**

`lib/data/interview-fields.ts` (§5.9) and the round type (§5.7), both authored,
both on the brief.

*Done when:* the field's stems reach the compiled prompt; the round sets duration
and the wind-down; a missing CV degrades to field + role + JD rather than to a
generic interview.

#### C5 · The CV in the prompt, cached · new · **SHIPPED**, share measured 81.9%

The CV, the job description and the custom questions belong in the **system
prompt**, which the pipeline already caches at a measured 72.5% — close to free
in the right place and expensive appended per turn.

*Done when:* the cached-input share on a 20-minute interview is measured from
`voice_operations.usage` and is at least as good as the dating arm's; compiled
snapshots cover a persona with and without a CV; **no change to
`resolvePipelineConfig` or any `PIPELINE_*` default**.

**Measured, 7 September**, off the first real browser rep — Aisha, recruiter
round, 502 seconds, eighteen turns: **71,936 of 87,877 input tokens served from
cache, 81.9%**, against the dating arm's 72.5%. It is better than the dating arm
rather than worse, which is the answer to the obvious worry: a CV makes the
system prompt *longer*, and a longer stable prefix caches harder. The measurement
is an eight-minute recruiter round rather than a twenty-minute deep technical, so
the number is a floor — the longer round has the same prefix and more turns to
amortise it over.

#### C6 · The question rail, and the captions toggle · Tier 1 · **SHIPPED**

`lib/data/rep.ts:1015` returns three constants and the screen is finished. Wire
them to the real agenda, and add the setting (§5.11): a toggle, **off by
default**, with the setup screen recommending it stay off and saying why.

*Done when:* the counter advances on **completed exchanges** rather than on his
turns alone — the D13 lesson, which applies to any rail that counts — and holds
still when the pipeline is failing; the setting persists per account; **a test
asserts the caption can only ever contain the interviewer's own words**, never a
hint, a structure reminder or an example answer; the drift is written into
`LAUNCH-GAP.md` §4.

### Phase D · Money · **SHIPPED 7 September**

> **Next, now.** `INTERVIEW-TECHNICAL-PLAN.md` (Phase C½) came first and
> shipped on 7 September — see its §13. Selling a round for $9 before it asked a
> candidate anything they could get wrong would have been selling the wrong
> product; the probe ladder, the difficulty slider and the accuracy dimension
> are in, so what a pack buys is now the thing the pricing page will describe.
> **One caveat carried forward from C½ §13.3: none of it has been heard out
> loud yet.** A round that is green in the suite and unaudited on a microphone
> is not a round to put a price on.

#### D1 · The credit ledger · new · **SHIPPED**

A migration: append-only `interview_credits` (grant, purchase, screener, spend,
refund, expiry), service-role write only, owner read only, **with a `source` on
every row** so §5.5's two expiry rules can be applied separately. Balance is a
sum, never a column anybody edits (rule 11). Spend takes expiring credits first.

*Done when:* RLS proven from a second account by `npm run db:verify`; no user
write path exists; `npm run db:credits` drives grant → purchase → spend →
refund → period boundary, and asserts that a lapse voids granted credits and
leaves purchased ones alone; `DATA.md` gains the table; **`legal-pages.tsx` and
`RefundDocument` state both expiry rules in the same commit**, then
`npm run legal:pdf`.

#### D2 · Capture one real one-time payload first · **PARTLY — see §15**

**Rule 14 is the law here and `lib/billing/events.ts` is the scar.** Whop's
one-time payments are a different event shape from `membership.*`, and building
from the specification alone put a paying customer on Pro with no charge date.
Buy one pack with a real card, capture the delivery verbatim, make it the fixture
*before* writing the handler.

*Done when:* a real captured payload is pinned in `lib/billing/events.test.ts`
beside the membership ones, and the handler is written against it.

**Partly met, 7 September, and §15 is honest about which part.** No card has been
charged. What was done instead: six real deliveries were read out of Whop's own
delivery log, the two that matter are pinned verbatim, and reading them found the
defect this item exists to catch — a card-backed trial emits a **real
`payment.succeeded` at $0**, so the obvious design would have double-granted every
trial. `npm run whop:probe -- --capture <event>` now prints any real delivery
ready to pin, which is what to run on the first real pack purchase.

#### D3 · Packs at the merchant of record · **SHIPPED**

Authored in `lib/site/plans.ts` beside `OFFERS`, created by
`npm run whop:setup -- --apply`, asserted by `npm run whop:verify`. **Every
account write carries the industry classification** (rule 12) — a `PATCH` setting
nothing but an image has already silently reset it twice.

*Done when:* `whop:verify` asserts the three pack prices and the classification;
the webhook grants credits on the service role; `npm run db:billing` covers
purchase, refund and dispute of a pack.

#### D4 · Grants, expiry and the unlock · **SHIPPED**

Pro grants 1 and Elite 4 per billing period into the same balance; granted
credits expire at the period boundary and purchased ones do not (§5.5). A pack
purchase or a grant adds `interview` to `unlocked_tracks`.

*Done when:* a grant is idempotent under webhook replay (`db:billing` already
replays); the switcher appears the moment the first credit lands; a lapsed
subscription stops granting, voids unspent grants and leaves purchased credits
untouched — asserted, because this is the sentence the terms will be quoted on.

#### D5 · The free five-minute screener · **SHIPPED**

One 5-minute interview, once per account (§5.6), on its own stamp — the same
shape as `entitlements.onboarding_rep_used_at`, additive, spent last, no user
write path. **`lib/data/allowance.ts` is not touched**: the dating sign-up rep's
arithmetic stays exactly as it is, and the screener gets its own function beside
it.

*Done when:* abandoning and resuming onboarding cannot mint a second screener;
`npm run db:rep` still passes unchanged; the screener runs the real interview
arm, not a demo; it ends on the wind-down rather than being cut off; **it carries
no guided rail** (§11).

### Phase E · The shell and the public surface · **SHIPPED 7 September**

#### E1 · Open the door · Tier 1 · **SHIPPED**

The guard in `lib/data/guards.ts` stays exactly as it is — it is the right gate
and it was built for this. What changes is that `unlocked_tracks` gains a second
entry.

*Done when:* the switcher renders, both tracks navigate, history and progress
filter by track, and an account with no credits sees a surface that explains what
it costs rather than a dead end.

#### E2 · `/pricing` and the landing page · **SHIPPED**

Packs on `/pricing` beside the subscriptions, from the one record. The landing
page gains an interview surface — §9 is the argument for doing it properly.

*Done when:* `lib/site/plans.test.ts` covers the packs' ordering and copy; the
legal pages, `PAYMENTS-APPROVAL.md` §4 and `MARKETING-PLAN.md` move in the same
commit; `npm run legal:pdf` re-run and re-uploaded if a policy moved; **the
dating half of the landing page is not re-written** — including D13's "your first
character walks you through it" sentence, which is load-bearing and was argued
for once already.

---

## 11. What stays refused

- **Any change to how a dating rep behaves, sounds or scores.** §0. This is first
  because it outranks everything else on this list.
- **No coaching during an interview rep.** §05, and the Tess carve-out (D13) is
  one character wide and stays that way. `guidedScriptFor` already returns null
  on the interview arm and `assertNoScript` is untouched. The caption shows what
  the interviewer *asked* and may never gain a suggested answer, a hint or a
  structure reminder — enforced by the test in C6, not by this note.
- **No guided rail on the free screener**, tempting as it is. The reason Tess has
  one is that she is rung 1 of a ladder somebody is about to climb; a screener is
  a sample of the real thing, and a scripted sample is a lie about the product.
- **No interviewer memory.** `rep-screens.tsx:51` already suppresses it. An
  interviewer who remembers your last attempt is a companion-app framing, which
  rule 9 refuses and §14 says is a payment account waiting to be closed.
- **No outcome scoring.** A candidate who does not get the callback can score 92.
  §07 applies unchanged, and it matters *more* here, because "did you get the
  job" is the thing every competitor scores.
- **No clinical or outcome claims.** "Interview practice", never "get hired".
  Rule 12, and the Whop classification depends on it.
- **No generated interviewers and no runtime-generated questions.** Characters
  and field stems are authored and seeded (rule 10).
- **No unlimited interviews on any subscription.** §5.2 is arithmetic.
- **No rank, no tier, no ladder on the interview track.** §5.10 and §5.12.
- **Nothing from `RETENTION-AUDIT.md` §4** — no confetti, no leaderboards, no
  guilt copy, no fourth haptic. A new track is not a licence to reopen those.

---

## 12. Order and size

| Phase | What it buys | Size |
|---|---|---|
| **A** · Survive a long rep | Nothing sellable — and A0 makes every later phase reviewable | ~3.5 days |
| **B** · The judgement arm | A rep worth grading, and the landmine defused | ~6 days |
| **C** · Setup, CV, round | A rep that is about *your* job | ~4 days |
| **D** · Money | The thing that pays for it, and the free screener | ~2.5 days |
| **E** · The shell and the pitch | Two tracks in one account, and §9's compliance dividend | ~1.5 days |
| | | **~17.5 days** |

That is about two days more than the same plan without §0's constraint — A0 is
new, four Phase A items became gated rather than direct, and the judgement layer
is copied rather than parameterised. **It is the right trade.** The dating arm is
the working product and the thing customers are paying for today; a week saved on
the interview track is not worth a regression in it, and `PERSONA-AUDIT.md`
already records what a well-argued edit to a shared judgement file did to a
character nobody was auditing.

**Three orderings are not negotiable:**

- **A0 first**, before any interview code exists. Snapshots taken after a change
  prove nothing.
- **B1 before B8** — the track filter before the first interviewer is seeded. It
  is a provable no-op today and a migration plus an apology tomorrow.
- **A before D.** Charging $9 for a rep with an 11% chance of a provider error is
  how a merchant-of-record account accumulates the disputes
  `PAYMENTS-APPROVAL.md` §3 exists to prevent, and this account has been declined
  once already.

**The cheapest useful slice**, if it has to ship in pieces: **A0 + A1 + A2 + B1 +
B2 + B8 + C1 + C2 + D5** — one interviewer, real persistence, a real CV upload,
the free screener, and no money taken. Enough to find out whether the premise
holds, with the dating arm pinned throughout.

---

## 13. Docs owed when this ships

Per the table at the bottom of `docs/README.md`:

| If you build | Update |
|---|---|
| A0 | Nothing — but say in the commit that it is the enforcement of §0, so nobody deletes it as redundant |
| Any of Phase B | `HUMANNESS.md` (the map of every judgement in the build), `PERSONA.md`, and re-run `npm run rep:audition`. **`PERSONA-AUDIT.md` only if a dating number moved**, which it must not |
| B6 | `npm run grade:calibrate`, and record that the dating golden set came back unmoved |
| B1, D1 | `DATA.md`, and `npm run db:verify` |
| C1–C6 | `INTEGRATION-GAPS.md` — screens moving from fixture to real data |
| C6 | `LAUNCH-GAP.md` §4 — the captions setting is drift against §05 and gets an entry, the way D13 did |
| D1, D4, D5 | `PAYMENTS-NEW-INTEGRATION.md`, `PAYMENTS-WHOP.md`, `lib/site/plans.ts`, `LAUNCH-GAP.md` D2, and `components/site/legal-pages.tsx` + `npm run legal:pdf` for the two expiry rules |
| E2 | `PAYMENTS-APPROVAL.md` §4, `MARKETING-PLAN.md`, the legal pages |
| Any of it | `PRODUCT.md`'s track table (line 11 currently reads "characters unwritten (M4)"), `LAUNCH-GAP.md` §3's interview entry, and **this file** — mark the item shipped with what actually landed and what is still owed by hand |

---

## 14. What shipped — Phases A, B and C, 7 September 2026

Phases A, B and C landed in one sitting. Phase D (money) and Phase E (the door
and the public surface) are untouched, which is the plan's own ordering: **A
before D**, because charging $9 for a rep with an 11% chance of a provider error
is how a merchant-of-record account accumulates disputes.

> **Phase C½ shipped later the same day**, on top of everything below, and it is
> recorded in `INTERVIEW-TECHNICAL-PLAN.md` §13 rather than here. What it
> changed about *this* document's contents: `RoundType` now carries `shape`,
> `probeShare` and `opener` as well as a length; `compileInterviewBrief` gains
> probe domains and, on a `system_design` round, suppresses the CV, the job
> description and the field stems outright; the tick fires a third kind of beat;
> and the grade has a nullable seventh dimension. Two of C½'s findings are
> corrections to things recorded below as working: the transport bound on a
> graded transcript was 600 seconds against a 1,500-second round, so **the
> longest round this plan sells was silently ungradeable**; and a bound grade
> reserved under the literal `'grade'`, which a second scoring call on the same
> session would have settled on top of.

**`unlocked_tracks` still does not contain `interview` for anybody**, so the
guard in `lib/data/guards.ts` still redirects every `/interview*` route to
`/train`. That is E1 and it is deliberately last. Everything below is built,
tested and seeded behind it.

### The gates the plan set, answered

| Gate | Answer |
|---|---|
| **A0 first, before any interview code exists** | Held. `lib/characterization/dating-arm.test.ts` was the first thing written and has been green on every commit since. 52 assertions: nine compiled contracts by SHA-256 and length, nine ElevenLabs pipeline configs under both the default and the shipped env, the band table, `capToBudget`, every reciprocity decision, the fast scorer with and without temperament, the steering line, every timing constant, `resultReading`, the rubric, the live scorer's anchors and the turn reservation's arithmetic |
| **B1 before B8 — the filter before the first interviewer is seeded** | Held, and the no-op was *measured* rather than argued: at the moment the filter landed the database held **89 sessions across 17 users, every one of them `track = 'dating'`**, so `.eq('track', 'dating')` selected the identical set. Recorded here because the proof expires — it is no longer true |
| **A before D** | Held. Nothing takes money |

### What the plan got wrong, and what it cost

**`sessions.track` never existed.** §2 lists it as built and §8 describes the
landmine as "`sessions.track` is written and nothing reads it". Checked against
the database: the column has never been there. Nothing writes it because there
was nothing to write. The landmine was real and the fix was one migration wider
than described — `20260907013000_sessions_track.sql` adds the column, defaults
it to `dating`, and sets it from `personas.track` on insert with a trigger
rather than from the three separate paths that create a session.

**`refreshProgression` is called `syncLevel`.** `lib/db/progress.ts:428`.

**The 40% question quota gags an interviewer**, and nothing in the plan
anticipated it. §4e's "questions in at most 40% of turns" is a dating rule and a
correct one; applied to an interviewer it made `suppressQuestion` true on almost
every turn, so *"Do not follow up this turn. Move to the next question."* was
composed into the directive and ignored every single time. A directive that is
disobeyed every turn is worse than no directive — it teaches the model that the
bracketed line is optional, and the bracketed line is the only thing that owns
reply length. Found by the first audition, fixed by giving the track its own
`maxQuestionShare` (1 = no quota). The dating 0.4 is where it was.

**`question-every-turn` reports an interviewer doing her job as a frame break.**
Same shape, same audition: 1.34 breaks per five minutes against a gate of 0.5,
every one of them this rule, on a rep where nothing was wrong. And what the
meter fires *does* something — it injects an identity reminder that measurably
makes her longer. Fixed with `questionsAreTheJob`, the same per-character escape
hatch `verbosityMedian` already had.

**`isOpenQuestion` reads a candidate's paragraph as a question.** It fires on
any text containing "which", "how", "when" or "what", which a long answer
contains essentially always — so `askedQuestion` was true on every turn and
silently disabled the pause gate. The rambler audition came back with **zero**
pauses in twenty-two turns. `fast.ts` is Tier 0 and was not opened; the session
carries a stricter signal (`text.includes('?')`) beside the shape instead, and
only the interview arm reads it.

**`postureClause` is written about a date.** *"You like him more than the
conversation. Let it show in how you say it."* appeared in the first audition of
Elena Kovač, from an interviewer, about a candidate she was not impressed by.
§16 refuses anything that reads as attraction here. `lib/warmth/affect.ts` was
not opened; the interview arm has its own four-line table.

**Letting a pause sit was a reflex rather than a technique.** "Never twice
running" permits every other turn, and against a candidate who over-answers that
is what it did — seven silent turns out of twenty-two in the first Marcus
audition. It now needs an *over*-answer (twice the complete-answer bar) and four
turns since the last one, which puts it at two or three in a twenty-minute
round.

Every one of those five was found by running `npm run rep:audition` against a
real interviewer, and none of them was visible at a desk. That is the argument
for B10 having been in the plan at all.

**And a sixth, which the harnesses found rather than the audition: the credit
ledger made accounts undeletable.** `interview_credit_entries` was given a
`before update or delete` trigger to make it append-only. `user_id` cascades
from `auth.users`, so deleting an account tried to DELETE those rows, the
trigger raised, and the account deletion failed — §16.7 requires the opposite,
and `LAUNCH-GAP.md` B6 is the entry that says account deletion takes everything
with it. `usage_ledger` already had the right answer and it was not copied:
`forbid_update` is UPDATE-only, and the append-only property for the person the
rows are about comes from RLS rather than from a trigger.

**And three more from the first real browser session, all of them things no
fixture could have caught:**

**A null setup is not a loading state.** `InterviewHome` gated its skeleton on
`loading || !setup || !interviewer`, and `useInterviewSetup` returns null when
there is no `interview_setups` row — which is every account that has never been
through the flow, i.e. exactly the person the screen exists for. The old mock
always returned an object, so `!setup` was unreachable and it shipped looking
fine. A permanent spinner, on the first screen of the track.

**`reactStrictMode` breaks a cleanup-only mount guard.** `CvSetup` had
`useRef(true)` plus `useEffect(() => () => { mounted.current = false }, [])`.
Strict mode double-invokes effects in development — mount, cleanup, mount — and
the body did nothing on mount, so the first cleanup set the ref false and
nothing ever set it back. Every later `if (!mounted.current) return` bailed, and
a CV upload that had *already succeeded* sat on "Reading it now" with both
buttons disabled. The guard is worth keeping; it has to be armed as well as
disarmed.

**The PDF reader was reading fonts as prose, and skipping the actual text.**
Two defects in one function, and the second hid the first. `stream` is the tail
of `endstream`, so the scanner matched inside the closer and advanced only as
far as it — skipping **16 of 17 streams** in a real CV and leaving nothing but
the cross-reference table. What it did find was the other half: a stream that
would not decompress was yielded as latin1 anyway, so an embedded font's bytes
were scanned for `(...)` literals and produced **11,946 characters of mojibake
that passed every length check** and was written to `interview_setups.cv_text`.
Fixed both, and added the guard that should have existed from the start:
`readsAsProse` refuses a result that is not letters and words, whatever went
wrong upstream. The same CV now reads 6,039 characters at 85% letters. Existing
rows were re-extracted rather than left.

**And five from the first real interview — ten minutes against Aisha Rahman,
which is the only one of these sessions that produced a graded rep (composite
66).** Every one of them was a design decision behaving exactly as written.

**She asked one question for the entire interview.** She opened with *"tell me
about a software project you've worked on end to end"* and spent **fifteen of
her seventeen turns** following up on that one answer; a single question reached
the CV, at 429 seconds of a 502-second rep. Nothing was broken.
`interviewMayFollowUp` is true whenever there is something to follow up on, OPEN
says *"you may follow up once"*, ENGAGED says *"you may follow the thread rather
than your list"* — and **nothing anywhere told her to come back to the list.**
The round's plan reached her once, in the brief, with "it is a guide" attached.
A model with permission to follow a thread and no pressure to leave it follows
one thread forever. `dueAgendaBeat` now fires on the rep clock, the same channel
and cadence as a scene beat, and says the thread is finished without saying what
to ask next. Re-auditioned: six topics instead of one.

**The pause read as a dropped call, and it is now off.** Three silences in the
rep, and all three were read as the product breaking: *"Hello"*, *"Did you hear
what I said?"*, *"There"*. Answering the second cost her the only frame break in
the rep — *"I did hear you."* The dating arm's silence works because the user can
see a waveform, a timer and an avatar, and because noticing a stranger going
quiet IS the skill; here she is the only feedback in the room, and a candidate
spending the pause debugging the app has learned nothing about interviews.
`interviewMayLetPauseSit` and its tests stay: this is a claim about the medium,
not the rule, and a visible "she is listening" state on the live screen would
make it shippable.

**She quoted the candidate back at himself on ten of seventeen turns.** *"You
said the website Nerve"*, *"You mentioned switching the voice provider"*. Aisha's
own contract modelled it with an example in exactly that construction, which
outweighed the craft rule telling her not to summarise — two systems, one
behaviour, contradicting each other, which is the round-6 failure on a new
track. The example is gone, the craft rule names the construction rather than
two strings, and the per-turn reciprocity clause names the opener directly,
because a rule read once loses to a habit and a clause at maximum recency does
not. Measured after: **18%**, which is roughly what a real interviewer does.
Referring back occasionally is good; doing it every turn is a transcript.

**She sounded robotic, and both of her expressive dials were dead.** Reported by
ear rather than found in a log, and neither half was in the interview code at
all.

The first half is the shape rule 19 exists to catch, arriving from a direction
the rule does not name. `ELEVENLABS_STABILITY=0.85` is set in production; it is
the dating arm's listening-pass override, and it is *correct* there — a cold
stranger who warms up on her own is a broken exposure exercise, and
`stabilityFor`'s own doc comment says forcing the voice flat is how she is
stopped. `voiceSettings()` applied it to every persona compiled by that arm, so
Aisha — authored `earnest`, which maps to 0.55 — rendered at 0.85, which the
config file's own comment describes as "forces it flat". **A global environment
variable is a shared judgement file with worse ergonomics**: it retunes a second
track silently, from outside the repo, with no test able to see it, which is the
shared-band-table failure in `PERSONA-AUDIT.md` wearing different clothes. The
override is now scoped to the dating arm and an interviewer takes
`INTERVIEW_STABILITY`, which the environment may not touch.

The second half is worse, because nothing was wrong with the code at all.
**`speed` is inert on `eleven_v3_conversational`, the model that ships.**
Measured on Aisha's voice across the full range: 0.7 gave 3.84 s and 1.2 gave
3.76 s, a 2% spread that sits inside the model's own run-to-run variance. The
same test on `eleven_flash_v2_5` gave 5.25 s against 2.97 s. So `deliveryFor`'s
three pace bands — the mechanism that makes her quicken when interested and slow
when she is not — have been computed, sent and discarded by the vendor on every
turn of every rep. Between the two, *both* variables the system believes it is
driving were doing nothing: one pinned near-flat from outside the repo, one
dropped by the vendor. It is left in the request because it is correct for
Flash, with the measurement recorded beside it so nobody runs a listening pass
on a dead parameter.

The general lesson is the one rule 19 already teaches and this extends: **a
shared dial is not only a shared FILE.** The tier list names files in `lib/`,
and the thing that actually retuned a second track was a line in `.env.local`
and a vendor's undocumented parameter support. Neither is in any tier.

Still open and not fixed here: nothing carries prosody across turns.
`handleTtsRequest` sends `text`, `model_id`, `voice_settings` and
`apply_text_normalization` — no `previous_text`, no request stitching — so every
reply starts intonation from cold. That is HUMANNESS-PLAN item 5, and it bites
harder here than on dating because interview turns run 8–34 words against 3–12,
so more of each cold start is audible.

**And the audition harness was not firing agenda beats**, so the first run after
the fix showed nothing — it was auditioning a character the product does not
ship. That is the same class of defect as the ledger stamping the wrong model:
a harness that drives a different pipeline from the one customers are on goes
green while the real thing drifts. It fires them now.

One transport incident, recorded rather than fixed: a single `agent.unheard` at
480 s with `audioMs: 0` — a reply that reached nobody (rule 17). One in
seventeen turns.

**It cost 20% of the rep**, which is the part worth carrying forward. That turn
settled `aborted` with `characters: 0` and was charged its entire reservation,
$0.0374, against seventeen completed turns costing $0.1090 between them. Rule 18
names this exact failure — "a turn that synthesised zero characters was billed
$0.0357 against a real $0.0009" — so the ceiling-on-null rule is still pricing an
abort as a worst case rather than as the near-nothing it actually consumed. It
is a shared accounting path and stays unfixed here for the same reason the
model-stamping defect does, but the arithmetic is now on the record: **one lost
reply in eighteen turns moved the rep's cost by a fifth.** At twenty minutes and
two aborts it is most of the gap between §6's projection and its budget.

The lesson those three share is the one worth carrying into D: **every fixture
in this repo returned data.** The mock setup was never null, the test PDFs had
one stream, and nothing ran under strict mode. All three bugs live in the gap
between "the fixture shape" and "the shape a real account has on day one".

It surfaced sideways, which is the part worth remembering. `db:verify` and
`db:credits` both print "test user removed" and both were lying; six harness
accounts accumulated in a day, one of them held `db:verify`'s **fixed**
share-card token, and the next run failed a completely unrelated RLS assertion.
Three things changed: the trigger is UPDATE-only
(`20260907020000_interview_credits_deletable.sql`), `db:credits` now **asserts**
that its teardown deleted the account and took the ledger with it, and
`verify-rls.ts` uses a per-run token so one crashed run can no longer poison
every future one.

### The shape of the judgement fork

Rule 19 held: **no Tier 0 file was opened.** `lib/warmth/{bands,reciprocity,
prompt,fast,steering,levels}.ts`, `lib/grade/{prompt,memory}.ts`,
`lib/data/{guided,mission}.ts` and the nine dating personas are byte-identical,
and A0 says so on every run.

| Dating (untouched) | Interview (new) |
|---|---|
| `lib/warmth/bands.ts` | `lib/warmth/interview/bands.ts` — five bands, longer at *both* ends, typical first |
| `lib/warmth/reciprocity.ts` | `lib/warmth/interview/reciprocity.ts` — the mirror inverted, the pause as a technique |
| `lib/warmth/steering.ts` | `lib/warmth/interview/steering.ts` — plus its own posture table |
| `lib/warmth/prompt.ts` | `lib/warmth/interview/anchors.ts` — specificity replaces intimacy |
| `lib/grade/prompt.ts` | `lib/grade/interview/rubric.ts` — structure and specificity replace opening and curiosity |
| `lib/safety/escalation.ts` | `lib/safety/interview-escalation.ts` — the copy only; the state machine is shared and unchanged |
| `lib/personas/shared.ts` | `lib/personas/interview/shared.ts` |
| `lib/data/rep-rules.ts` | `lib/data/interview-rules.ts` |

The selectors are `lib/warmth/track.ts` (one `TrackJudgement` record per track),
`lib/warmth/track-prompt.ts` (the live scorer) and `lib/grade/track.ts` (the
rubric). Dating is the default branch in all three and reaches the identical
functions. A third track is a third directory and one more case, not a third
`if`.

### Four interviewers, seeded

`dan-whitfield` (friendly HR, rung 1), `aisha-rahman` (panel lead, 2),
`marcus-vance` (technical, 3), `elena-kovac` (distracted exec, 4). Full
four-layer contracts, a room scene each (four new rows in `lib/audio/scenes.ts`,
added — nothing above them moved), an avatar row each (they were already
authored in `visual.ts` under these slugs), their own `verbosityMedian`, moods,
wants and scene beats. `lib/data/mock/interview.ts` is deleted rather than left
beside the real thing, and `lib/data/mock/` is gone with it.

**Difficulty is chosen, not earned.** All four are open from the first credit;
the rung number is a curve and never a gate, and `fetchInterviewers` returns
`locked: false` for every one of them. `levelTrajectory` already filtered on
`track === 'dating'` before this existed, which is the only reason a second rung
1 through 4 is safe.

`interviewTrajectory` scales `maxGainPerTurn` by the round, because it is the
one trajectory dial that is a function of rep length and a five-minute screener
and a twenty-five minute deep technical share a fixed threshold of 70.

### The money shape, without taking any

Two migrations and a module, all of them dormant until D grants a credit:

- `interview_credit_entries` — append-only, service-role write, owner read, a
  `source` on every row, and **the expiry of the lot on every row including the
  spends**. That last one is what makes the balance a single filtered sum: a
  grant and everything charged to it fall out together, so an unspent grant
  evaporates on its own and the arithmetic does not depend on D4's job having
  run. Get it wrong the other way and a spent-then-expired grant leaves its
  negative behind and the balance goes below zero.
- `interview_credit_holds` — keyed on the session id, which is what makes "two
  connects for the same `session_id` cannot spend two" true by construction.
- `voice_session_open_interview` — a separate function beside
  `voice_session_open`, so the one every dating rep in production goes through
  was not opened. It spends no `reps_used_today` and accepts a 300–1800s window.

`voice_session_open`, `voice_operation_reserve`, `voice_session_close` and
`voice_session_refund_empty` were each edited by one line, and both edits are
provable no-ops for dating: the cap now comes from
`public.voice_daily_cap_cents`, which returns the identical 100/300/600 for an
account with no credits, and the two refund paths are guarded on
`quota_kind = 'interview'`, which no dating session has ever carried.

`npm run db:credits` drives the whole thing against the real database: the
balance, the hold, the double-connect, the release, the spend, the double-spend,
the refund rule, both expiry rules, the spend order, the screener, and the daily
ceiling in both directions — including the half that matters most, that an
account with no credits meets free's 100c unchanged.

### Verified

`npm test` 1744 · `typecheck` · `lint` · `build:check` · `db:verify` ·
`db:rep` · `db:spend` · `db:field` · `db:billing` · `db:credits` · `db:seed`.
Three auditions against three interviewers and three candidate archetypes.

### How to actually run one

> **Superseded by §15.** The door is open for everybody now: every account is
> granted the free five-minute screener at sign-up and any credit landing adds
> `interview` to `unlocked_tracks`. Sign up and go to `/interview` — the
> commands below are the developer override, not the way in.

```bash
npm run db:interview -- you@example.com            # top the balance up, 3 credits
npm run db:interview -- you@example.com --screener # re-grant the free round
npm run db:interview -- you@example.com --close    # shut the track on one account
```

`db:interview` is what `db:plan` is, and stays for the same reason `db:plan`
stayed after the webhook shipped: an account that has to be fixed by hand at 2am
should not need a merchant of record to be reachable. `--close` is the one thing
here with no product equivalent, and it is why `lib/data/guards.ts` is still a
guard.

Then `/interview` → role, field and round → CV (optional) → questions →
interviewer → **Start interview**.

Without a browser at all: `npm run rep:audition -- <slug> <archetype> 1` drives a
whole rep through the real prompt, the real engine and the real steering.
Interviewers are `dan-whitfield`, `aisha-rahman`, `marcus-vance`, `elena-kovac`;
archetypes are `over_preparer`, `rambler`, `one_word`, `under_confident`. It
spends money, so it is run by hand.

### Still owed by hand

1. **`npm run grade:calibrate` has not been run, and cannot be.** Every
   expectation in `lib/grade/calibration/fixtures.ts` is `null` — the golden set
   has never been hand-scored, which is `M3-PLAN.md`'s own §17 gate and predates
   this work. What can be said without it: **the dating golden set cannot have
   moved.** `RUBRIC` and `buildGradeSystemPrompt()` are byte-identical (A0 pins
   both digests), `rubricForPersonaName('Nadia').systemPrompt()` is asserted
   equal to `buildGradeSystemPrompt()`, and `renderTranscript` is unchanged — so
   the request the route builds for a dating fixture is the same request. The
   calibration is owed on the interview arm's own numbers once somebody scores
   the ten transcripts.
2. ~~**C5's cached-input share is unmeasured.**~~ **Measured on 7 September:
   81.9%**, off the first real browser rep (Aisha, recruiter, 502s, 18 turns) —
   better than the dating arm's 72.5%, and a floor rather than a ceiling because
   a longer round amortises the same prefix over more turns. Recorded in §C5.
   What is still unmeasured is a *twenty-minute* round specifically.
3. **`npm run legal:pdf` has not been re-run**, and does not need to be until
   D1 — nothing user-facing about refunds or expiry has changed yet.
4. ~~**No interview has been run end to end through the browser.**~~ **One has,
   on 7 September**, against a hand-granted account: setup, CV upload and
   extraction, credit hold, eighteen turns of real voice, grade, settle. It is
   what found the four defects under *What the plan got wrong* above, and what
   produced the C5 measurement in §C5.
   The door itself (E1, `unlocked_tracks`) is still shut for everybody else.


---

## 15. What shipped — Phases D and E, 7 September 2026

The track is sold and the door is open. **Nothing on the dating arm moved** —
`lib/characterization/dating-arm.test.ts` is green, no Tier 0 file was opened,
and the one number that did try to move on that side was caught by a harness and
put back (see *The consequence nobody planned for*, below).

### The gates the plan set, answered

| Gate | Answer |
|---|---|
| **A before D** — nothing takes money until a long rep survives a bad network | Held. A shipped in the morning and D in the evening of the same day |
| **D2: capture a real one-time payload before writing the handler** | **Partly.** No card has been charged; §D2 and *Still owed* say exactly what stands in for it |
| **D1: RLS proven from a second account; no user write path** | Held. `npm run db:verify` proves both, and `db:credits` proves the ledger cannot be edited by anybody including the service role |
| **D4: a grant is idempotent under webhook replay** | Held, and asserted twice — in `lib/billing/credit-rules.test.ts` on the reference, and in `npm run db:billing` against the real tables |
| **D4: a lapse voids unspent grants and leaves purchased ones alone** | Held, and this is the assertion the terms are quoted on. `db:billing` prints it under that name |
| **D5: abandoning and resuming onboarding cannot mint a second screener** | Held by the unique index on `screener:<user id>`, not by a code path |
| **E1: an account with no credits sees a surface that explains what it costs** | Held. `OutOfCredits` stands where **Start interview** would, and the brief's refusal stays behind it |
| **E2: the dating half of the landing page is not re-written** | Held. One section added, one FAQ answer corrected because it had become false. D13's "your first character walks you through it" sentence is untouched |

### What a real payload taught, for the second time

Rule 14 says the specification is not the payload. It earned its place again,
from a direction the rule does not name — not a field spelled differently, but
**an event nobody knew fired**.

The captured `payment.succeeded` from the first live purchase carries
**`total: "0.0"`, `status: "paid"`, `billing_reason: "subscription_create"`**,
ninety milliseconds after `membership.activated`. Whop emits a real payment event
for the $0 authorisation that starts a card-backed trial. The obvious design for
credits — grant on the membership, top up on the payment — therefore hands **two
credits to every trial on day zero**, and nothing in the OpenAPI specification
says so.

So the whole credit layer keys on the payment and only on the payment: one
payment is one period is one grant, `membership.activated` grants nothing at all,
and the `pay_…` is the idempotency key, so eleven of Whop's twelve retries
collide on the ledger's unique index. It is pinned in `events.test.ts` against
the real body, with three assertions whose only job is to fail if that stops
being true.

`npm run whop:probe -- --capture payment.succeeded` reads any real delivery out
of Whop's log and prints it ready to pin. Whop keeps request bodies for a
fortnight — so the thing that made this defect findable is now one command
instead of an afternoon.

### The consequence nobody planned for, and it was on the dating side

D5 grants every account the free screener. `voice_daily_cap_cents` adds **90c of
headroom per credit**, sized for a twenty-five-minute round. So the moment the
sign-up trigger landed, **every free account's daily spend ceiling went from 100c
to 190c** — a change to what a *dating* account may spend, arriving sideways from
a feature on the other track.

That is precisely the shape rule 19 exists to catch, and precisely the shape that
would not have been noticed: it broke nothing that was about it. It surfaced as
one line in `npm run db:credits` whose entire job was A5's promise that free's
number never moves — *"an account with no credits gets free's cap unchanged
(190c)"*. Screener credits now earn no headroom
(`20260907043000_screener_no_extra_cap.sql`), which is also simply correct: five
minutes costs about 14c and fits inside free's existing 100c beside the sign-up
rep.

**The general lesson extends the one C½ recorded.** That one said a shared dial
is not only a shared file — an environment variable and a vendor's undocumented
parameter both retuned a second track from outside the tier list. This one says a
shared dial can be reached through **data**: nothing in `lib/` changed, no
constant moved, and the number a dating account meets moved anyway, because a row
was inserted into a table something else multiplies by ninety.

### Two defects the harnesses found that reading did not

**`whop:probe` caught a lost purchase reported as a success.** The probe's pack
delivery came back `handled: true` for a purchase that had credited nobody,
because `issueInterviewCredits` returns `{ ok, changed }` and the caller was
reading only `changed` — so a ledger write that **failed** was logged with the
same words as a replay that was correctly ignored: *"the pack was already
credited"*. The two are now distinguished, and the failure is the one case in the
whole webhook that asks to be **redelivered**: `ApplyResult.retryable` makes the
route answer 500, because somebody has paid and the interviews are not in the
account, and `applyBillingEvent` is idempotent so the retry re-does nothing that
worked.

**`db:billing` caught the ordering that would have cancelled a subscription.**
`refund.created` maps to `revoke`, which lands an account on free — so a Pro
subscriber refunding a $9 pack would have had their subscription cancelled by a
refund of something else entirely. The pack branch runs before the mirror, the
entitlement and `shouldApply`, and returns; the harness asserts the plan is still
`pro` after the refund.

### A third defect, found by asking what happens on a date boundary

Not by a harness and not by reading — by asking the ledger's own invariant a
question it had not been asked. **Every row carries the expiry of the LOT it
belongs to**, which is what makes the balance a single filtered sum. A void of
granted credits was writing **one** row for the whole source, carrying one lot's
expiry, and that breaks the invariant the moment two lots are live at once — an
upgrade mid-period is enough.

A Pro grant expiring 1 October, an Elite grant expiring 1 November, then a
lapse. One void row of -2 carrying the October expiry balances to zero today,
and on 2 October the October grant and the void fall out together, leaving the
November grant alone: **the voided credits come back to life.** Carrying the
November expiry instead is worse — the balance goes to -1 on 2 October and eats
the first credit of the next thing they buy.

`voidInterviewCredits` now reads the live lots by expiry and writes one negative
row against each, so every pair falls out together. `db:billing` drives it with
two real lots two days and forty days out, and asserts one void row per lot
carrying its own expiry — a check that could not be a unit test, because the
thing that goes wrong is a date boundary the table would have to be lied to
about.

### And a fourth, in the two lines that were meant to make a purchase feel finished

The buyer returns from Whop to `/interview?bought=1` while the webhook is still
in flight, so the balance on screen is the one they had before paying. A banner
and a **Check again** button were the obvious answer, and the button was wired to
`router.refresh()`.

That would have done nothing. The balance comes from `useUserState`, which is
`useAsync(fetchUserState, null, [])` — a browser fetch on an empty dependency
array. Refreshing the server tree re-renders around it and leaves the number
exactly where it was. A button that appears to do nothing, on the one screen
where doing nothing reads as a lost payment, is worse than no button. It is a
full navigation now, which also drops the query so a balance that has arrived
stops being announced.

### What is where

| Piece | File |
|---|---|
| The packs, the plan allotments and both expiry notes | `lib/site/plans.ts` — `INTERVIEW_PACKS`, `PLAN_INTERVIEW_CREDITS`, `CREDIT_EXPIRY_NOTE`, `SCREENER_NOTE` |
| Which vendor plan is which pack | `lib/billing/plans.ts` — `packMap`, `packsConfigured`, `whopPlanIdForPack` |
| What an event does to the balance, as pure functions | `lib/billing/credit-rules.ts` + its test |
| Executing it, and the pack branch | `lib/billing/apply.ts` |
| Taking credits back without going negative, one row per lot | `lib/db/credits.ts` — `voidInterviewCredits`, `liveLots` |
| Opening a pack checkout | `lib/billing/checkout.ts` — `createPackCheckout`; `app/interview/actions.ts` — `startPackCheckout` |
| The balance, the packs and the empty state on screen | `components/screens/interview-screens.tsx` — `CreditsPanel`, `PackButtons`, `OutOfCredits` |
| The public surfaces | `components/site/pricing-page.tsx`, `components/site/landing.tsx` — `InterviewTrack` |
| Both expiry rules, in the words a dispute quotes | `components/site/legal-pages.tsx` — terms clause 07, refunds clause 04 |
| The screener at sign-up, and the door | `20260907042000_interview_screener_at_signup.sql`, `20260907041000_interview_track_on_credit.sql` |

Four migrations: `interview_credit_revoke` (a chargeback is not an expiry),
`interview_track_on_credit` (a credit landing opens the track, as a trigger
rather than a line in the webhook — four paths issue credits and a rule at the
table is true of all four), `interview_screener_at_signup` (with a backfill: 17
accounts, 17 screeners, 17 doors), and `screener_no_extra_cap`.

### Verified

`npm test` 1942 · `typecheck` · `lint` · `build:check` · `db:verify` · `db:rep` ·
`db:field` · `db:spend` · `db:credits` · `db:billing` · `whop:setup --apply` ·
`whop:verify` (0 failed) · `whop:probe` · `legal:pdf`.

The three pack plans exist at Whop and are read back correct:
`plan_QrLflgYyHkFnq` ($9), `plan_b8D7UKsSAnkTS` ($29), `plan_v4te5KT1tHvF9`
($59) — all `one_time`, hidden, no trial, price on `initial_price`. The account
classification survived the `--apply` and `whop:verify` says so.

### Still owed by hand

1. **Buy one pack with a real card.** D2's gate, and the only part of Phase D a
   laptop cannot do. Then `npm run whop:probe -- --capture payment.succeeded`
   and pin the body in `events.test.ts` beside the membership ones. What makes
   the risk small rather than absent: the handler reads only `data.id`,
   `data.plan.id`, `data.metadata.user_id` and `data.membership.status`, and
   every one of those is present in **every** captured payment payload and does
   not vary by plan type. What could still surprise us is an event a one-time
   purchase emits that a subscription does not.
2. **Redeploy.** `WHOP_PACK_SINGLE`, `WHOP_PACK_FIVE` and `WHOP_PACK_TWELVE` are
   set in Vercel production, and rule 15 applies: a variable added after a build
   started is not in that build. Until the redeploy, `packsConfigured()` is false
   in production and the buy buttons hide themselves — which is the correct
   failure, but it is a failure.
3. **`npm run grade:calibrate` still cannot be run** — every expectation in
   `lib/grade/calibration/fixtures.ts` is `null`. Unchanged by this work and
   unchanged by it: `RUBRIC` and `buildGradeSystemPrompt()` are byte-identical
   and A0 pins both digests.
4. **The ledger still cannot see TTS.** §6 recorded it as deferred and said it
   *"gets harder to defer from D onwards"*. D has now shipped, so a $9 credit is
   being sold whose cost of goods cannot be attributed by model. It is still a
   write to a shared accounting path.
5. **The first real purchase should be watched end to end** — checkout, webhook,
   credits, the switcher appearing, an interview run against a bought credit.
   Everything below that is asserted; the composition of it is not.

---

## 16. The 8 September experience audit — Parts 1–4

The whole finding list and what landed for each is `LAUNCH-GAP.md` §3b. Two
things belong here, because they change what this plan said the track *is*.

### The track's shape changed: a profile and a run

§C1–C3 designed setup as one three-step wizard — role, CV, questions — and the
interviewer picker was bolted on after it. That was right while setup was
something you did once and then trained inside. It is wrong now that the round
and the question difficulty are real dials (§5.1, §5.7): they were buried in
step one of a flow you run once, so the two things anybody actually wants to
change per interview were the two hardest to reach, and the only route back was
an *Edit setup* button that re-entered the whole wizard.

    profile   role · company · job description · field · CV · questions
              asked once, edited from /interview

    run       /interview/interviewers  →  /interview/start  →  brief  →  live
              round · question difficulty · captions · CV, every time

`/interview/start` is the new route. Cold start to microphone went from eight
screens to five, and the wizard's `0X / 03` is honest for the first time — it
was counting three over four screens (§3b, B4).

**The captions toggle moved out of the home sidebar and onto the run setup.**
§5.11 argued it as a setting and that stands; where it lived was the mistake. It
is a per-interview decision, and on a phone it was sitting in a rail of six
equal-weight cards below a full-height hero, drawn at the same importance as the
credit balance.

### §5.6's free screener was unreachable, and that is the finding that matters

The screener credit is granted at sign-up, buys the five-minute round and
nothing else (`spendableFor`). `DEFAULT_ROUND` was `recruiter`. So the default
path was: walk the setup, arrive at `/interview`, read *"a recruiter screen
costs one credit, and there are none in the account"* — with the chrome pill
saying **1 credit**, because that pill shows the account total.

Every account in the database was holding a giveaway worth about 90c to run and
$9 to buy, and it **silently failed at the moment of redemption**. §5.6 budgeted
it, D5 built it, D16 in `LAUNCH-GAP.md` argued it against the free tier's
voice-less definition — and nobody had walked the default path with it.

`openingRound(hasScreener)` is the whole fix: a null setup opens on the round
the free credit can pay for. Two things follow it and both are about the same
class of bug — numbers on one screen disagreeing:

- The hero quotes the **account total**, matching the pill and the credits card,
  with one sentence saying what it cannot buy. Printing the round-aware figure
  there would have kept the disagreement and merely moved it.
- `creditRefusal` is one function and three surfaces say it. It was three
  hand-written strings, two of which only knew about the screener case — and
  since B3 there is a second shape they all have to handle: two credits against
  a three-credit deep technical is not "none left".

### And §5.4's packs are credits now

Rounds are priced by length (`PAYMENTS-NEW-INTEGRATION.md` §14). §5.4 said a
pack decides a balance rather than an entitlement, which is why it needed no
`Plan` value and no migration — that reasoning holds and is what made this
cheap on the pricing side. It did **not** hold on the ledger side: a hold was one
row and the balance counted rows, so the schema could not express a
three-credit round. One migration, `planSpend`, and a settle that writes one row
per source. `npm run db:credits` covers it.

### Still owed by hand, after this pass

Everything in §15's list is unchanged and still owed. Added to it:

1. **A whole interview against a bought credit, end to end**, now that a round
   can cost more than one. `db:credits` asserts the hold and the release; the
   settle-across-two-lots path is asserted in `interview-credits.test.ts` as
   pure arithmetic and has not run against a real graded rep.
2. **Nothing in this pass has been heard out loud** — the same sentence §13.3 is
   emphatic about. It is routing, copy and arithmetic; no prompt, no band, no
   trajectory and no `PIPELINE_*` default moved.
