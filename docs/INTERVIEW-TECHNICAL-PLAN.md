# Technical depth — what an interviewer actually asks, and whether the answer was right

**Status: SHIPPED, 7 September 2026. T1–T11 all landed. §13 is what actually
went in and what is still owed by hand — read it before this document, which is
kept in the present tense as the argument rather than rewritten as a record.**
**This is Phase C½. It happened BEFORE Phase D (money) and Phase E (the door).**

`INTERVIEW-PLAN.md` phases A, B and C shipped on 7 September. Four reps against
three interviewers followed, and they were the first evidence from a real
microphone. They were good enough to prove the track works and specific enough
to show that **what it currently trains is not what a technical interview
tests.** This document is that gap and the plan to close it.

---

## 0. The constraint, which has not moved

Everything in `INTERVIEW-PLAN.md` §0 still holds and is not restated here.
Read it. The short version:

**The dating arm is finished. Rule 19. Tier 0 files are not opened.**
`lib/characterization/dating-arm.test.ts` is green on every commit and stays
green on every commit in this plan. Nothing here needs a Tier 0 file, and the
one place it comes close — the composite — is handled in §8.4 by branching
rather than by editing.

**Tier 2 has been spent** (`INTERVIEW-PLAN.md` §14). There are interview
sessions now, so "provable no-op" needs its own proof and cannot lean on "every
session is a dating session" any more.

There is one new constraint, and it is the whole reason this document is
separate from the last one:

> **A rule that is correct on the dating arm can be silently wrong on this one,
> and a rule that is correct in `technical` can be silently wrong in
> `deep_technical`.** The round is now a behavioural variable, not just a
> duration. §4 is where that gets stated properly.

---

## 1. The one-paragraph version

An interviewer opens on a project or on a system design brief depending on the
round. She mines what the candidate says for a technical hook — "you said you built a chat feature; what did you use for the
transport?" — and then probes the fundamental underneath it: how it works, what
it costs, what breaks. She escalates to a hypothetical in the same domain. When
a thread is exhausted she moves to a different domain rather than asking a
sixth follow-up about the same project, and if the projects lead nowhere she
asks the fundamental unmoored: "have you studied design patterns? Tell me about
them." How hard the questions are is a **slider the candidate sets**, separate
from which interviewer they picked. Afterwards, a model reads the probe
questions and the answers and scores **whether the answers were actually
correct** — which is new, and is a change to what Nerve is.

---

## 2. What the four reps proved

Four interview reps ran on 7 September against a real microphone. Every one of
them was ended by the user before the round's own clock ran out.

| Rep | Interviewer | Round | Ran | Turns | Composite |
|---|---|---|---|---|---|
| `4d69be3e` | Aisha | recruiter | 502s / 600 | 18 | 66 |
| `70228d99` | Marcus | recruiter | 537s / 600 | 25 | 65 |
| `79f11e9f` | Elena | recruiter | 217s / 600 | 15 | — |
| `e9c74f80` | Aisha | deep technical | 173s / 1500 | 11 | — |

**Not one question in any of the four asked whether the candidate KNEW
anything.** Every question asked what they had DONE. That is not a tuning
failure — it is exactly what is authored. `lib/data/interview-fields.ts` gives
the `software` field six stems and all six are experiential:

- Walk me through something you built end to end.
- Tell me about a bug that took you longer than it should have.
- How do you decide when something is done enough to ship?
- Describe a time you disagreed with a technical decision.
- What broke in production and what did you do about it?
- How do you pick up a codebase you have never seen?

There is no seventh kind. There is no "how does an API work", no design
patterns, no concurrency, no data modelling — in any of the twelve fields. And
`compileInterviewBrief` points her at the CV in as many words: *"Ask about what
is actually in it."*

**The deep technical round makes it worse, by design.** Its entire authored
behaviour is one line — *"Twenty-five minutes. One problem, taken all the way
down."* — which pushes her further into a single project rather than out of it.
Rep `e9c74f80` was eleven consecutive questions about one web app. That round is
working exactly as written, and what is written is the opposite of what a deep
technical round is.

**Three structural facts that fall out of the same investigation**, each of
which this plan needs:

1. **`RoundType` has no notion of question kind.** It carries `label`,
   `description`, `durationMs`, `questions`, `credits`, `nextSteps`. So
   `technical` and `final` differ only in length and the wind-down.
2. **`dueAgendaBeat` only pushes her sideways.** It says *leave this thread*. It
   has no way to say *go deeper on the thing underneath it*.
3. **She cannot speak first** — recorded here, deliberately NOT fixed by this
   plan. There is no opening-line mechanism anywhere: a turn is generated only in
   response to a user turn, so every rep so far opened with the candidate saying
   "Hello" into silence and waiting eight seconds. It is left alone because it is
   cosmetic next to everything else here, and because it is the same structural
   gap that stops the wind-down firing when input dies — so it belongs with the
   input watchdog (`LAUNCH-GAP.md`, and §11 below), which is where the plumbing
   should be built once rather than twice.

---

## 3. The product decision: correctness is scored now

This is the part that changes what Nerve is, so it is stated on its own and
first.

### 3.1 What was true until today

`lib/grade/interview/rubric.ts` currently says, in these words:

> *Do not penalise a candidate for not knowing something, for asking for a
> moment to think, or for saying they do not have an example. Saying so plainly
> is composure.*

That is a deliberate rule inherited from the dating arm's §07 — score process,
never result. It makes Nerve a gym for **how you handle an interview**.

### 3.2 What is true from this plan onward

**Technical accuracy is scored.** The reason is commercial and the user stated
it plainly: *"that's what people will be paying for — to know if they know."* A
candidate who wants to find out whether their understanding of authentication
survives contact with an interviewer cannot find that out from a composure
score.

### 3.3 What that does NOT change

- **§07 still holds for the outcome.** Whether the interviewer seemed convinced
  still contributes zero. A candidate who gets every fundamental right and
  rambles through all of them still scores badly on structure. The rubric's
  "SCORE THE PROCESS, NEVER THE OUTCOME" paragraph is untouched.
- **Rule 8 still holds.** Nothing surfaces during a live rep. She never says
  "that is wrong", never corrects, never hints. Accuracy lands on the scorecard
  afterwards and nowhere else. This is not negotiable and §10 restates it.
- **Not knowing is still not a character flaw.** Saying "I do not know" plainly
  still scores well on composure. It scores zero on accuracy, and those are two
  different numbers on the same card. That distinction is the whole design: the
  card can say *you handled that well and you were wrong*, which is the most
  useful sentence this product could say to somebody.
- **The dating arm is untouched.** It has no accuracy dimension and never will.

### 3.4 The risk, stated before it is built

A model judging correctness will sometimes be wrong, and **being told you were
wrong when you were right is far more damaging than any soft process score.**
The mitigation is in §8.3 and it is conservative by construction: the grader
flags only what it is confident is wrong, abstains on anything ambiguous or
partially right, and every flag must quote the candidate and state the
correction. An abstention costs nothing. A false accusation costs the account.

---

## 4. The rounds, re-authored

The round becomes a behavioural variable. This is the central structural change
and everything else hangs off it.

### 4.1 The new shape

`RoundType` gains three fields:

```ts
/** What KIND of interview this is. Decides which opener and which ladder. */
shape: 'behavioural' | 'mixed_technical' | 'system_design'
/** How much of the round is knowledge probing rather than experience. 0–1. */
probeShare: number
/** What her FIRST TURN is about. She still answers rather than opens — the
 *  unprompted opening turn was cut on 7 September (§9). */
opener: 'project' | 'brief' | 'background'
```

| Round | shape | probeShare | opener | Why |
|---|---|---|---|---|
| Screener | behavioural | 0 | background | Five minutes. There is no room and it is free. |
| Recruiter | behavioural | 0 | background | A recruiter does not test fundamentals. Real ones do not, and pretending otherwise teaches the wrong thing. |
| **Technical** | mixed_technical | **0.5** | project | Start on a project, mine it for hooks, probe the fundamentals under them, move between domains. |
| **Deep technical** | system_design | **0.7** | brief | She poses a design problem. Not their project at all. |
| Final | behavioural | 0 | background | Behavioural by definition, plus the questions they ask back. |

`probeShare` is a target, not a quota. The lesson from `INTERVIEW-PLAN.md` §14
is explicit about this: **a hard quota gagged an interviewer on four turns in
five and taught the model that the bracketed directive is optional.** So it
drives how often the probe beat is due (§6.4), never a per-turn refusal.

### 4.2 Technical — varied, hard, moving

The round the user actually wanted when they picked deep technical. It opens on
a project and uses it as **raw material rather than as the subject.** The
candidate's own work is where the hooks come from; the hooks are what gets
tested.

Its authored description changes to:

> *Twenty minutes. Your projects, and the fundamentals underneath them.
> Expect to be asked how things work, not only what you built.*

### 4.3 Deep technical — a system design brief, not their project

This is a different interview and needs saying clearly: **the candidate's own
projects do not come up at all.** She opens with a problem and they design
against it for twenty-five minutes.

> *Twenty-five minutes. A system design problem, taken all the way down. Not
> about your CV.*

The ladder is in §6.6. The briefs are authored per field (§7.3) — this is the
one place a question is authored verbatim, because a design brief IS the round
and generating one at runtime would give a different exam every session, which
rule 10 refuses for exactly this reason.

### 4.4 The setup screen has to say which is which

Two of the four reps ran on `recruiter` because it is `DEFAULT_ROUND` and
nothing on the screen said "this one is not technical". A round that changes
what the interview *is* cannot be a quiet dropdown default. The picker shows
`shape` as a visible property, not just a duration.

---

## 5. The hardness slider

### 5.1 It is a second axis, not a rename of the first

There are now two independent dials and conflating them is how this gets
confusing:

| Dial | What it moves | Where it lives |
|---|---|---|
| **Interviewer** (Dan → Aisha → Marcus → Elena) | Her *temperament*. How warm, how patient, how hard to please. Warmth trajectory, gain, decay, patience. | `lib/personas/interview/*`, already built |
| **Difficulty** (1–5) | How hard the *questions* are. Nothing about her mood. | New. `lib/data/interview-difficulty.ts` |

They are genuinely orthogonal and both directions are real: a warm interviewer
can ask brutal questions, and a cold one can ask easy ones. Keeping them
separate is what lets a nervous candidate practise hard questions with a
friendly interviewer, which is a legitimate and probably common thing to want.

### 5.2 The five levels

Authored against seniority, because that is the vocabulary a candidate already
has and it generalises across every field:

| # | Label | Software | What a probe looks like |
|---|---|---|---|
| 1 | Intern | Definitions | "What is an API? What does it do for you?" |
| 2 | Junior | Usage | "How do you authenticate a request to your API?" |
| 3 | Mid | Trade-offs | "Why a token rather than a session cookie? What does that cost you?" |
| 4 | Senior | Failure modes | "The token expires mid-request. What does your client do, and what does the user see?" |
| 5 | Staff | Ambiguity | "Design auth for a service with no reliable clock. What do you give up?" |

**The default is derived from the role title and then overridable.** "Intern
Software Engineer" defaults to 1–2; "Senior Backend Engineer" to 4. A candidate
who wants to be beaten up sets it to 5 regardless. Deriving it is a convenience,
never a lock.

### 5.3 What the difficulty does NOT do

It does not touch warmth, gain, decay, patience or the band table. A hard
question asked by Dan is still asked warmly, and he is still pleased by a good
answer at the same rate. **`interviewTrajectory` is not read by this file and
must not be**, which is the same separation `lib/warmth/reciprocity.ts` had to
learn: that file is not allowed a warmth opinion of its own, and neither is
this one.

---

## 6. The probe ladder

### 6.1 What is authored and what is generated

Rule 10 says content is authored in the repo and seeded, never generated at
runtime. That rule has to survive a feature whose entire point is that the
question emerges from the conversation. The resolution:

> **The DOMAIN is authored. The QUESTION is hers.**

`lib/data/interview-probes.ts` authors a list of probe domains per field —
"authentication", "concurrency", "data modelling", "API design", "testing",
"caching", "error handling". Each carries what a good answer touches and what a
vague one sounds like, at each of the five difficulty levels. What it never
carries is a question string.

She picks the domain that the candidate's own answer just made relevant, and
asks in her own words, exactly as she does with the field stems today. The list
is reviewed in a pull request; the wording is generated, like every other line
she has ever spoken.

This is the same shape as `lib/data/interview-fields.ts` and deliberately so.

### 6.2 The hook

A **hook** is a technical noun the candidate said out loud that opens onto a
domain. "We used WebSockets" hooks `transport`. "I stored the tokens in
localStorage" hooks `authentication` and `security`. "It got slow" hooks
`performance`.

Hook extraction is the model's job, not a keyword list — a regex over
`vocabulary` would fire on "service" in "customer service". The probe directive
tells her to find one; it does not tell her which.

**Relevance is the whole point.** The user's example is the specification: *if
it is a chat service, ask whether they used WebSockets or REST, then ask them to
explain the difference.* Asking about database sharding when they built a static
site is worse than asking nothing, because it teaches the candidate that the
interviewer is not listening.

### 6.3 The ladder, in `technical`

```
  1. OPEN          Her first turn. "Walk me through something you built."
  2. GROUND        One or two follow-ups until something concrete is on the table.
  3. HOOK          "You said you used X for that. Why X?"
  4. PROBE         The fundamental underneath. "How does X actually work?"
  5. ESCALATE      A hypothetical in the same domain, at the difficulty level.
  6. MOVE          Existing agenda beat. New domain, new hook, back to 3.
```

Steps 3–5 are the new machinery. Step 6 already exists.

### 6.4 The new beat

`dueAgendaBeat` pushes sideways. This is its sibling and pushes **down**:

```ts
export function dueProbeBeat(input: {
  elapsedFraction: number
  round: RoundTypeId
  difficulty: DifficultyLevel
  /** How many probes have fired this rep. */
  fired: number
  /** Whether the candidate has put anything concrete on the table yet. */
  grounded: boolean
}): ProbeBeat | null
```

It returns a bracketed direction on the same channel as every other direction
she gets, and — like `dueAgendaBeat` — **it never names the topic**, because a
direction naming the question is a script and §05 and §11 both refuse one.

> *(Stop asking what they did. Take one technical thing they just named and ask
> how it actually works — the mechanism, not their experience of it. One
> question, and make it one they cannot answer from memory of their own
> project.)*

`grounded: false` suppresses it entirely. Probing a candidate who has not
managed to describe anything yet produces the interrogation in rep `e9c74f80`,
where nine of eleven turns were increasingly narrow demands for one specific
detail.

### 6.5 The unmoored fallback

The user's requirement, in their words: *"even though the projects don't lead
anywhere, they should be able to ask, so tell me, have you learned about design
patterns? Tell me about design patterns."*

When the project thread is exhausted — which the agenda beat already detects —
the probe fires with the relevance gate dropped. She asks the fundamental
directly, with no pretence that it came from anything they said. This is also
the graceful path for a candidate with a thin CV or no CV at all, which is the
case `compileInterviewBrief` already handles for stems.

### 6.6 The ladder, in `deep_technical`

Different round, different ladder, no project mining:

```
  1. BRIEF         Her first turn is an authored design problem (§7.3).
  2. REQUIREMENTS  Does the candidate ask what it needs to do? Scored under
                   listening whether they do or not — it is the tell.
  3. SHAPE         "How would you lay this out?"
  4. CHOICE        "What would you use for X? Why that?"
  5. DEPTH         One component, taken down. Data model, or scale, or failure.
  6. CURVEBALL     A constraint added late. "It has to work offline." "The
                   traffic is ten times what I said."
```

Steps 2 and 6 are what make it a *deep* technical rather than a long one, and
step 6 is where difficulty 4 and 5 actually live.

### 6.7 The band problem

Her turns cap at 34 words (`lib/warmth/interview/bands.ts`). A system design
brief is 40–70. So the band table needs a carve-out for a turn that poses a
problem — a `turnKind` the cap respects, defaulting to the existing ceiling for
everything else.

That file is this arm's own and is not Tier 0, so this is a normal edit. It is
called out because a word cap is a runtime ceiling that changes what customers
hear (rule 4), and because `DEFAULT_VERBOSITY_MEDIAN`'s interview equivalent is
derived from the same table and moves with it.

---

## 7. Fields, and why software goes first

### 7.1 The shape

Each field gets probe domains beside its existing stems. Same file pattern,
same authoring discipline, same review.

```ts
export interface ProbeDomain {
  id: string
  label: string
  /** What a good answer touches, per difficulty level. Never a question. */
  substance: Record<DifficultyLevel, string>
  /** What a vague answer sounds like here. */
  vagueness: string
  /** Hooks that open onto this domain, as guidance for her, not a matcher. */
  opensFrom: string[]
}
```

### 7.2 Software first, properly, and the others after

The user's instruction, and it is the right one. Twelve fields × seven domains ×
five levels is a lot of authored prose, and authoring it all before any of it
has been heard out loud is how the field stems ended up all-experiential without
anyone noticing.

So: **`software` is authored fully, shipped, and run against a real microphone.
The other eleven fields keep behaving exactly as they do today until it has
proved itself.** A field with no probe domains falls back to the current
behaviour, which is a working interview.

For the record, and not to be built yet, the generalisation does hold:
healthcare probes differential diagnosis, escalation criteria and consent;
finance probes accrual versus cash, revenue recognition and controls; teaching
probes assessment design and differentiation. The machinery is field-general
even though the content is not yet written.

### 7.3 Design briefs

`deep_technical` needs authored briefs per field — three to five each, chosen by
seed so a candidate does not get the same one twice running. This is the one
verbatim-authored question in the plan, and §4.3 says why.

Software's first set: a URL shortener, a rate limiter, a chat service, a job
queue, a notification fan-out. Deliberately ordinary: the brief is not supposed
to be clever, it is supposed to have enough surface for six turns of depth.

---

## 8. Scoring technical accuracy

### 8.1 It needs to know which turns were probes

The grader cannot score correctness over a whole transcript, because "walk me
through what you built" has no correct answer. It needs the **probe questions
paired with the answers that followed them.**

So a probe turn is marked when it is generated, and the mark rides the
transcript through to the grade. This is the one place where the transcript
schema grows: a turn gains an optional `kind` discriminator. Both adapters
already emit `{ speaker, text, t_start, t_end }` and §04 requires that to stay
identical — so `kind` is optional, absent on the dating arm, and absent turns
behave exactly as they do today.

### 8.2 The pass

A separate call, not folded into the existing grade prompt. Three reasons: the
existing prompt is already long and a twenty-five-minute transcript makes it
longer; accuracy needs a different model temperature and probably a stronger
model than `gpt-4.1-mini`; and a separate call can be **skipped entirely** for
`behavioural` rounds, which is most of them.

Input is the probe pairs, the field, and the difficulty level. Output is
per-pair.

### 8.3 It abstains by default

The conservative construction §3.4 promised:

```
For each pair, return one of:
  CORRECT      The substance is right, whatever the phrasing.
  INCOMPLETE   Right as far as it goes, missing something a candidate at this
               level would be expected to say.
  WRONG        Contains a specific claim that is false. Quote it and correct it.
  UNSCORABLE   Ambiguous, partially right, garbled by transcription, or the
               candidate said plainly that they did not know.

Default to UNSCORABLE. It costs nothing to abstain and a false WRONG costs the
account. Never mark WRONG on phrasing, on an incomplete-but-true answer, or on
anything the transcript may have mangled — speech recognition destroys technical
words worst of all.

Never penalise "I do not know" said plainly. Return UNSCORABLE and let composure
score it.
```

The dimension score is computed from the CORRECT / INCOMPLETE / WRONG counts
only. `UNSCORABLE` pairs are excluded from the denominator entirely — an
interview where everything abstained returns null, not zero.

### 8.4 Where the number goes

A seventh dimension, `technical_accuracy`, nullable, populated only on interview
reps with probe pairs.

**The composite has to become track-aware, and this is the one place this plan
touches shared judgement.** The dating branch must reach the identical
arithmetic it reaches today — pinned by A0, with a new assertion added for the
seventh slot being absent on the dating path. Nullable is load-bearing: a
behavioural interview round has no accuracy score and its composite is the
existing six.

Migration: one column on `scores`, nullable, plus the mark glyph and registry
entry that every score dimension carries (`lib/marks/registry.ts`, whose test
walks the real unions and will fail without it).

### 8.5 What the candidate sees

On the scorecard, after the rep, never during it. The valuable sentence is the
one that separates the two numbers:

> *Composure 78 · Technical accuracy 41*
> *You stayed steady and explained yourself clearly. Three of the seven things
> you were asked about were wrong.*

Then the specific corrections, quoting them and stating the right answer. That
is a feedback surface this product does not currently have and it is the thing
being paid for.

**It is not a lesson.** One line per wrong answer, what was said and what is
true. No tutorial, no links, no encouragement copy.

---

## 9. The plan

Sizes are rough and assume the existing test discipline.

| # | Item | Size | Depends on |
|---|---|---|---|
| T1 | `RoundType` gains `shape`, `probeShare`, `opener`; the five rounds re-authored; setup screen shows shape | S | — |
| T2 | `lib/data/interview-difficulty.ts` — five levels, derived default from role title, setup control | S | — |
| T3 | `lib/data/interview-probes.ts` — the domain schema, `software` authored fully at all five levels | L | T2 |
| T4 | `dueProbeBeat` and the grounded gate; wired into the tick beside `dueAgendaBeat` | M | T1, T3 |
| T5 | Turn `kind` on the transcript; probe turns marked through to the grade | S | T4 |
| T6 | Design briefs for `software`; `deep_technical` opens on one; the band carve-out for a brief turn | M | T1 |
| T7 | The `deep_technical` ladder — requirements, shape, choice, depth, curveball | M | T6 |
| T8 | Accuracy grading pass, abstaining by construction | M | T5 |
| T9 | `technical_accuracy` column, track-aware composite, mark glyph, A0 pin | M | T8 |
| T10 | Scorecard surface — the two numbers and the corrections | S | T9 |
| T11 | `rep:audition` extended to drive a technical round end to end | S | T4, T7 |

**Order: T1, T2 → T3 → T4, T5 → T6, T7 → T8, T9, T10 → T11.**

**The interviewer speaking first is deliberately not here.** It was cut on
7 September as not needed yet — she opens on her first turn instead, which is
today's behaviour and costs the candidate about eight seconds of silence at the
start. The finding is kept in §2 because the plumbing it needs is the same
plumbing the input watchdog needs, and building it once is better than twice.

### Done when

- A `technical` rep grounds on a project and then asks at least three questions
  that are about how something works rather than what the candidate did.
- A `deep_technical` rep never mentions the candidate's CV and spends its whole
  length on one design problem.
- The difficulty slider visibly changes the questions at 1 and at 5, judged by
  ear on the same CV.
- The scorecard reports accuracy separately from composure, and a deliberately
  wrong answer is caught and quoted.
- A deliberately *right* answer phrased badly is NOT marked wrong. This is the
  regression that matters most and it needs its own fixtures.
- `dating-arm.test.ts` green, and the recruiter and screener rounds behave
  exactly as they do today.

---

## 10. What stays refused

Carried from `INTERVIEW-PLAN.md` §11 and extended:

1. **No coaching during a live rep.** Accuracy is computed after and displayed
   after. She never corrects, never hints, never says how it is going. Rule 8,
   and §05 is the reason.
2. **No question is authored verbatim except a design brief.** The domain is
   authored; the wording is hers. A directive that names the question is a
   script (§11).
3. **No hard per-turn quota.** `probeShare` moves how often the beat is due and
   nothing else. `INTERVIEW-PLAN.md` §14 records what a 40% quota did the first
   time.
4. **No accuracy score without abstention.** A grader that must choose between
   right and wrong on an ambiguous answer will invent confidence. `UNSCORABLE`
   is the default and null is a valid dimension value.
5. **No memory of a previous rep's wrong answers.** Rule 9 and §14 — an
   interviewer who remembers your last attempt is the companion-app framing, and
   `lib/grade/interview/rubric.ts` deliberately produces no memory line.
6. **The difficulty slider gets no warmth opinion.** §5.3.
7. **No tutorials on the scorecard.** One line per correction. Nerve is a gym,
   not a course, and a course is a different product with different obligations.

---

## 11. Where this sits

**This is Phase C½ and it happens before Phase D.** The reasoning: Phase D sells
interviews for money, and what is being sold has to be worth the money first.
Four reps against the current build produced four interviews that never asked
the candidate whether they knew anything — which is a fine product and is not
the one the pricing page will describe.

The known defects from the same four reps are tracked in `LAUNCH-GAP.md` and
`INTERVIEW-PLAN.md` §14 rather than here. Three of them are worth fixing
alongside this plan and one of them is worth fixing first:

- **The input watchdog.** A rep whose transcription dies goes silent, never
  closes, and scores the candidate 22 on a close they were never offered. It is
  destroying reps and scores today. Do it first — and it is also where an
  unprompted turn belongs, if the interviewer is ever given one.
- **The interview metric bands.** `talkRatio` is scored against 40–55%, a dating
  band, so a candidate talking 68% of the time — correct interview behaviour —
  scores zero.
- **The round is not recorded on the session.** It is recoverable only by
  inferring from `budget_usd`, which will get harder as this plan adds rounds
  that differ by more than duration.

---

## 12. Docs owed when this ships

- `INTERVIEW-PLAN.md` — §14 gains what landed; the Phase D section notes that
  C½ came first.
- `docs/README.md` — a row in the table for "a probe domain, a design brief, or
  the difficulty ladder".
- `PRODUCT.md` — the product now tests knowledge as well as delivery. That is a
  change to what Nerve claims to be and the public copy has to agree with it
  before `PAYMENTS-APPROVAL.md`'s reviewer reads it.
- `NERVE-SPEC.md` — **not edited.** §07's "outcome is never scored" is not what
  changed; the spec's target stands and the divergence, if any, is recorded in
  `LAUNCH-GAP.md` §4.

---

## 13. What shipped — 7 September 2026

All eleven items landed in one pass. `dating-arm.test.ts` is green and gained
two assertions rather than losing any; the suite is 1,865 assertions across 104
files; `npm run db:verify`, `db:rep` and `db:credits` all pass; `build:check`
is clean.

### 13.1 The items

| # | Landed as |
|---|---|
| T1 | `RoundType` gains `shape`, `probeShare`, `opener` (`lib/data/interview-credits.ts`), plus `RoundShape`, `RoundOpener`, `ROUND_SHAPE_LABEL` and `roundProbes`. The five rounds re-authored to §4.1's table exactly; `technical` and `deep_technical` descriptions rewritten. The setup screen's round option now reads `Technical · Projects + fundamentals · 20 min` |
| T2 | `lib/data/interview-difficulty.ts` — five levels, `difficultyFromRoleTitle`, `difficultyFor`. `interview_setups.difficulty` (nullable smallint, 1–5). A setup control that appears only on a round that probes |
| T3 | `lib/data/interview-probes.ts` — `ProbeDomain`, and **eight** domains for `software` authored at all five levels. `probeDomainsFor` returns empty for the other eleven fields |
| T4 | `dueProbeBeat` and `isGrounded` in `lib/data/interview-agenda.ts`, wired into the tick beside `dueAgendaBeat` through `dueInterviewBeat` |
| T5 | `TranscriptTurn.kind?: 'probe' \| 'brief'`; the mark applied in `lib/data/rep.ts` and carried to the grade by `markTurns`; validated in `parseGradeTranscript` |
| T6 | `lib/data/interview-briefs.ts` — five authored problems for `software`. `INTERVIEW_BRIEF_WORD_CAP` and `INTERVIEW_BRIEF_DIRECTIVE` in `lib/warmth/interview/bands.ts`, reached through `WarmthSession.openingTurnKind` |
| T7 | `DESIGN_LADDER` and `designRungDirection`; `dueProbeBeat` climbs it in order on a `system_design` round |
| T8 | `lib/grade/interview/accuracy.ts` and a second call inside `/api/grade`, skipped on every behavioural round |
| T9 | `scores.technical_accuracy` and `scores.accuracy`; `judgementMeanOf` branching on the layer's presence; `dim-accuracy` in `lib/marks/registry.ts` and `components/marks/`; the A0 pin |
| T10 | `TechnicalAccuracy` in `components/screens/session-screens.tsx`, and `.accuracy-*` in `app/globals.css` |
| T11 | `npm run rep:audition -- <slug> <player> <reps> <round> <difficulty>`, driving the real compiled brief through the real beats. Two new archetypes: `confidently_wrong` and `plain_speaker` |

### 13.2 Five decisions this plan did not make, taken while building it

1. **The brief's material lives in the CONTRACT, not in the beat.** §6.6 implied
   the DEPTH and CURVEBALL rungs would carry their subject, which would have put
   the authored table on the browser — either shipping it to the client or
   plumbing a rotation seed through five layers the dating arm shares. Instead
   `renderDesignBrief` puts the depth items and the late constraints in the
   cached prefix and the rung says *"choose one of the parts you were told are
   worth going at"*. It is the same split as everything else here — the material
   is authored, the sentence is hers — and it kept rule 19 out of it entirely.

2. **The two beats are arbitrated in TIME, not in arithmetic.** Two evenly
   spaced schedules collide by construction, and "leave this thread" arriving
   with "go deeper on what they just named" is two directions at once — the
   argument `LAST_BEAT_FRACTION` already settled once. `dueInterviewBeat` owns
   both clocks and returns at most one, with nothing firing inside one exchange
   (`INTERVIEW_EXCHANGE_MS`) of the last. **The probe wins a tie**, because
   §6.3's ladder puts it before the move.

3. **`requirements` and `shape` are not marked as probes.** Asking a grader
   whether *"how would you lay this out"* was CORRECT is asking it to invent a
   verdict. Only `choice`, `depth`, `curveball` and the mixed-technical probe
   produce pairs.

4. **The transport bound had to move, and one of them was already broken.**
   `MAX_REQUESTED_WORD_CAP` (90) replaced `UNSTEERED_WORD_CAP` (40) in
   `parseTurnRequest`, which would have truncated every design brief to a
   sentence and a half. Separately — and this was a live defect, not a
   consequence — `SCORING_LIMITS.sessionSeconds` was **600** and a deep technical
   is **1,500**: any interview past ten minutes failed `parseGradeTranscript`,
   `/api/grade` answered 400, and the longest round the product sells was
   silently ungradeable. It is 1,800 now, with `gradeTurns` and
   `gradeCharacters` moved to match, and the tests express themselves against
   the constants rather than against literals so it cannot drift back.

5. **The accuracy pass reserves under its own operation id.** A bound grade
   settles under the literal `'grade'`; a second call on the same session would
   have settled the first one's reservation on top of itself and reported one of
   two costs (rule 18). `runScoringCall` takes an `operationId` override and the
   accuracy pass passes `'grade-accuracy'` — same session, same budget bucket,
   two lines.

### 13.3 What is still owed by hand

- **Nothing here has been heard out loud.** §9's "Done when" list is five
  claims about how a rep sounds and one about a test suite. The suite is green;
  the five need `npm run rep:audition -- marcus-vance confidently_wrong 1
  technical 4` and its `plain_speaker` twin, and then a real microphone. The
  harness spends money and is run by hand.
- **The other eleven fields have no probe domains**, deliberately (§7.2). They
  run exactly as they did before this plan. Authoring the next one is a
  judgement call that should wait until `software` has been heard.
- **`GRADE_ACCURACY_MODEL` is unset**, so the accuracy pass runs on `GRADE_MODEL`.
  That is the right default and is worth revisiting once there are real
  verdicts to read: this is the wrong place to save a fraction of a cent, and
  also the wrong place to spend one for nothing.
- **Two of the three §11 defects are still open** and are still tracked where
  §11 put them: the input watchdog, and the round not being recorded on the
  session. The first is still the one to do first. **The interview metric bands
  are fixed** — see §14.

---

## 14. The UI pass — 7 September 2026

Everything in §13 was correct and none of it had been *looked at*. A pass over
every interview screen, sheet, dropdown and scorecard row found seventeen
defects, and the four largest were not cosmetic at all.

### 14.1 The scoring defects the UI pass found

**Four of the eight deterministic bands scored correct interview behaviour at
zero, and that is sixty percent of the composite.** §11 recorded one of them
(`talkRatio` against a dating 40–55%); the pass found the other three and the
arithmetic on the shape of the whole thing:

| Band | Dating target | What a good candidate scored |
|---|---|---|
| talk ratio | 40–55% | **0** at 68%, which is the ratio they should have |
| questions / 3 min | 3–8 | **12/100** for asking twice in twenty minutes — the close, done right |
| longest monologue | ≤ 22s | **0** for a 58-second answer to "walk me through something you built" |
| the ask / the exit | *"Coffee Thursday?"* / *warm, no push* | permanently unmeasured, rendering as two blank rows |

Measured end to end, a rep a candidate did well scored **under 40** on the
deterministic half against the dating table and **over 85** against the new one
(`lib/grade/interview/metrics.test.ts`). `lib/grade/interview/metrics.ts` is
five bands — answer share 55–78%, longest answer 25–85s, fillers, thinking time
under three seconds rather than 1.8, and *did you ask anything back at all* —
selected at the existing `lib/grade/track.ts` seam. `scoreMetrics()` with no
argument is still the dating table, byte for byte, and A0 now pins every number
in it.

**The grader was being told the dating targets in prose as well.** `renderMetrics`
puts *"talk ratio 46% (target 40-55%)"* into the prompt, so the same wrong
number reached the judgement layer a second time and marked the rep down on
every dimension that touches delivery. `renderInterviewMetrics` is the same
block against the interview bands, and the two dating booleans are gone.

### 14.2 The dropdowns

**`.arena-select` was a class name with no rule behind it.** Three native
`<select>` elements on the interview setup rendered as browser chrome — a light
popup in the platform font — in the middle of a dark-only design system. That
is the whole of "the dropdowns are old school", and it is also why the round
picker could not say what a round *is*: `<option>` holds one line of text, and
"Technical · Projects + fundamentals · 20 min" is three things.

`components/ui` `Select` replaces it: a real listbox with a label, a
description and a trailing value per row, arrow keys, Home/End, Escape,
click-outside, focus returned to the trigger, and `aria-activedescendant`.
Arena bounds — hairlines, 2px, no shadow, **volt on the selected row only** so
an open dropdown still spends the screen's one accent once.

### 14.3 One field, and it says so

The picker offered twelve fields and exactly one has probe domains, design
briefs and accuracy grading behind it. Offering "Healthcare" is selling a round
that cannot ask a healthcare fundamental, pose a healthcare brief, or say
whether either answer was right.

All twelve stay **authored** — a stored row still resolves, and the prose is
reviewed rather than deleted and rewritten later. What is **offered** is derived
from which fields have probe domains, so authoring the next field's domains is
what opens it and there is no second list to remember. With one field the
control is a stated value rather than a one-option dropdown, and it becomes a
picker on its own when there are two. `DEFAULT_FIELD` moved from `general` to
`software`, because a default with no probe domains gave a technical round
nothing to test.

### 14.4 The rest of the seventeen

- **Four classes with no CSS at all**: `.interview-readiness`,
  `.interview-dimensions` (a `<ul>` rendering as a browser-default bulleted list
  inside an Arena card), `.interview-captions`, `.cv-warning`.
- **The audit line assumed six metrics.** `METRIC_MAX = 10` is only correct when
  exactly six scored; the interview table has five, so the line would have
  disagreed with a correct composite and marked itself `.danger` on every
  interview scorecard. It is sixty spread across the rows that actually scored,
  which is ten each for a dating rep and unchanged there.
- **Technical accuracy joins the breakdown**, beside the six it was averaged
  with, as well as keeping its standout card with the corrections. A scored
  dimension that moved the composite and appeared nowhere in the working reads
  as a footnote.
- **The mission and the library links are dating-only now.** `MISSIONS` is
  authored about a stranger in a shop and the library cards are dating
  techniques; on an interview scorecard the mission told a candidate to open
  with something about the room. `scorecard.tryNext` carries interview prose
  instead (`lib/data/interview-scorecard.ts`).
  **The rail was still offering the whole section, though — fixed 8 September.**
  This pass took the library links off the scorecard and left `navItems` listing
  `/library` under both tracks, so the conclusion reached the one surface that
  linked *into* a card and not the one that advertised the section. See §15.
- **Every metric note was dating prose**, including *"Questions stacked up
  faster than answers. It reads as an interview"* — on an interview.
- **`RuleBlock` said `Time 8:00`**, a number no round has had since length
  became a property of the round, and *"It ends when they've heard enough"*,
  which is not how it ends.
- **`HowItWorksSheet`** said three minutes and her number. **`ScorecardExplainerSheet`**
  said *"Whether she gave you her number is worth nothing"* — and now makes the
  distinction that matters here: the outcome is worth zero AND the answers are
  scored. **`TrainingWheelsOffModal`** and **`EndRepModal`** likewise; the
  latter now says the credit is spent either way, because leaving at minute
  fourteen is a decision about money.
- **"This rep was not graded" claimed the rep had been given back.** A credit is
  not a daily rep and is not returned that way, and telling somebody their money
  is back when it is not is the one sentence on that screen that costs trust.
- **`Level Interview`** on the scorecard, and a roster tier mark beside it — the
  dating rung has no meaning where all four interviewers are open from the first
  credit (§5.10). Both dropped.
- **"Next persona" → `/roster`** from an interview scorecard.
- **The interviewer picker said "Style changes the questions"**, which was true
  when she was the only dial and is now the exact confusion the two-axis design
  exists to avoid. It says what she decides and points at the other control.
- **The interviewer card printed "level 3"**, implying a ladder this track
  deliberately does not have.
- **The home stats** now carry the round's shape and the difficulty, which are
  the two things that decide what the interview will be.

---

## 15. What the first browser run found — 7 September 2026

The first run through a real browser got as far as the microphone and stopped:
three `POST /api/voice/token 402`, a screen saying **"Connection lost"**, a
Retry that failed twice more, and an End button that did nothing at all. Three
separate defects, and the first one is a product bug rather than a UI one.

### 15.1 A screener credit passed every gate and could buy nothing

The account held **one screener credit and no purchases**. `creditBalance()`
sums every source, so `available` was 1 — the pill said one credit, the brief
let the rep start, the live screen let it connect. But a screener credit only
buys the five-minute screener round (`nextLotToSpend` skips it for anything
else, which is the rule and is correct), so the token route refused.

**Every gate in the UI was asking a question whose answer had nothing to do with
whether the rep could run.** `spendableFor(lots, { round })` is the same
question the spender asks, and a test now walks every round against every lot
shape asserting the two agree.

Worse, and the reason the account was stuck: **the round picker filtered the
screener out on `credits > 0`** — which is the round the screener credit exists
to pay for. A granted screener was unspendable from the setup screen, so there
was no round this account could have chosen. The picker offers it when the
account holds one, and `user.interviewScreenerCredits` is counted apart from the
total for that reason.

### 15.2 A refusal was rendered as a lost connection

`mint()` read `response.status` and threw `token_mint_failed` for everything,
so a 402 with a written sentence in its body arrived as a network fault. The new
`VoiceErrorCode` `'refused'` separates *we said no, and here is why* from *the
transport broke*: `lib/voice/refusal.ts` reads the body once, both adapters call
it (rule 1 — one function rather than two that will drift), and the hook shows
the route's own sentence on its own screen with no Retry, because retrying a
decision can never work.

### 15.3 The End button was dead

```ts
const voice = providerRef.current
if (!voice || finishedRef.current) return   // ← the `!voice` half
```

A failed mint runs `disposeAttempt()`, which nulls `providerRef`, and *then*
raises the error modal. Every button on that modal called `stop()`, which saw no
provider and returned without touching one piece of state — no status, no end
reason, nothing. `stop()` now does a local teardown in that case (there is
genuinely nothing to persist: no transport, no session row, no held credit), and
the modals navigate explicitly, because the screen's navigation is keyed on an
outcome that a rep which never started does not have.

### 15.4 Still owed

**The account that found this is still at zero paid credits.** Running a paid
round needs `npm run db:interview -- <email>`; the screener round is now
reachable without it.

## 15 · Two things the second track was still borrowing — 8 September 2026

Found by walking the interview arm rather than the money surfaces. Both are the
same shape: **the interview track showing the dating product's furniture**, and
in both cases the interview material already existed and was not being reached.

### The judged half of the breakdown was labelled with dating dimensions

An interview is graded on **structure, specificity, listening, signal reading,
composure and the questions asked back** (§8, `lib/grade/interview/rubric.ts`).
`INTERVIEW_SUBSCORE_KEY` then renames those onto the `scores` columns the dating
arm already had — `structure → opening`, `specificity → curiosity` — because all
six are one number out of a hundred in a fixed slot and a second set of columns
would only be a second place for the composite to be computed from. §8.4 argues
that and the argument still holds.

**The rename was a storage decision and it leaked onto the screen.**
`toScorecard` read the stored key and printed the DATING word for it, so a
candidate scored on whether their answer had a shape read *"Opening 71"*, and
one scored on evidence read *"Curiosity 64"*. Every number was right and every
label on the judged half was describing the other product. Four of the six —
Opening, Curiosity, Signal reading, Close — name something an interview is not
scored on at all.

`subScoreLabel(key, interview)` is the fix, and `INTERVIEW_SUB_SCORE_LABELS` is
**derived rather than authored a second time**: `DIMENSION_LABEL` is already this
arm's naming and `/interview`'s readiness panel already prints it, so a third
hand-written list would be a third thing to keep in step. It inverts
`DIMENSION_COLUMN`, and `interview-scorecard.test.ts` walks the real union — plus
one assertion that no dating dimension can appear on an interview card, and one
that the dating six are byte-for-byte what they were (rule 19).

The measured half needed nothing: `INTERVIEW_METRIC_BANDS` has read *answer
share · longest answer · fillers / min · thinking time · questions back* since
§14, which is already the "how did they talk" half of the breakdown, and
technical accuracy is already the "did they know it" half.

### `/progress` was drawing interview scores as dating trends

`fetchProgress` read `scores` unfiltered. Every interview writes a `scores` row
into those same six columns, so an interview's **structure** score was being
plotted on the Opening line and its **specificity** on Curiosity — a candidate
who did four interviews watched their dating trends move without doing a dating
rep, on a screen titled *"Six sub-scores"* beside a warmth chart. Two different
measurements averaged into one line.

It filters to `sessions.track = 'dating'` now. The interview arm has always had
its own trend — `useInterviewProgress` reads the interview sessions and
`ReadinessPanel` draws it in this arm's words — so this is the other half of a
filter that was only ever applied on one side. Sessions are read first because
the track lives there and `scores` has no column for it, and the session window
is doubled before the score window closes it: an ungraded session is a common
row, and taking exactly twenty sessions would quietly return fewer than twenty
points.

### And the library is dating-only

§11 lists the library under both tracks, and `navItems` did. The argument was
that the cards are about holding a conversation with somebody who is not helping
you — which an interview is. **That argument does not survive reading the
cards**: *"Open with the room, not with her"*, *"Use what she already gave
you"*, *"Ask for something specific"*, and five sets of openers for a café, a
gym, a platform, a party and a conference. There is no reading of an interview
in which **Openers — gym** is guidance.

The rail stops offering it. The route is untouched and the track switcher is two
taps away, so nothing a dating user had is gone; what is fixed is a second track
advertising the first one's material as its own. §11 is the drift here rather
than the code — recorded in `LAUNCH-GAP.md` §4 as D17.
