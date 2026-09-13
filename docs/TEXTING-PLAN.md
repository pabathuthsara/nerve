# TEXTING-PLAN

**The third section: texting, as its own product.**

Status: **SHIPPED, 14 September 2026.** Every phase — T0 through T7 — landed in
one pass. Written 13–14 September after four findings against the old
`/text/[personaId]` surface and a costing run against the real rate card; §19
below is what actually landed, §20 is what the audition harness found that the
suite could not, and §18 is what is still owed by hand.

**One deviation from §15's order, taken deliberately.** The plan sequences T0–T3
onto the old `/text/` surface so the sound could be heard early against
characters the product owner already knew. Implementing end to end in one pass,
the T0 fixes went into the new `lib/texting/` machinery at birth instead: the
old surface is retired by T7 either way, so patching it and then moving the
machinery would have been churn with no one listening in between.

Read `§0` before opening a single file — it is the longest statement in the
docs of why the talking arm is not to be touched, and it held: **the dating
arm's fifty-six characterization assertions passed unchanged on every commit of
this work and were never re-baselined.** Then `§19`, which is what landed.

---

## §0 — The talking arm is not to be touched, and this is how that is enforced

This is the most important section in the document and it is first for that
reason.

**Nerve's voice product works.** The characters behave, the disfluencies land,
the turn-taking reads as human, and that state was reached on 10 September 2026
through a deliberate, signed-off, measured retune with every compiled prompt
diffed line by line before the digests were retaken (`CLAUDE.md` rule 19,
`PERSONA-AUDIT.md` §14). It is not to be disturbed by this work in any way, at
any point, for any reason — not to make a texting feature easier, not on the way
past, and not because a shared file "obviously" wants one more parameter.

`PERSONA-AUDIT.md` is the record of what happens otherwise: an audit that
correctly measured a problem, gave a character her own bands, her own posture
reading and her own punctuation, and **made her worse** — because the shared
table was most of what made the good characters good. An edit to a shared
judgement file is an edit to every character that reads it, including the ones
nobody is looking at.

### §0.1 — The three tiers, restated for this plan

**Tier 0 — never opened by this work.** Not additively, not behind a flag, not
with a default that preserves behaviour. If a texting rule needs to live
somewhere, it lives in a **new file beside** these:

- the nine files in `lib/personas/` (`tess`, `nadia`, `maya`, `robin`, `priya`,
  `jules`, `erin`, `sam`, `alex`) and `lib/personas/index.ts`'s dating maps
- `lib/warmth/bands.ts`, `reciprocity.ts`, `prompt.ts`, `fast.ts`, `steering.ts`,
  `levels.ts`
- `lib/grade/prompt.ts`, `lib/grade/memory.ts`
- `lib/data/guided.ts`, `lib/data/mission.ts`, `lib/data/rep-rules.ts`
- `lib/audio/` in its entirety
- every `PIPELINE_*` default in `lib/voice/elevenlabs/config.ts`
- `lib/voice/rates.ts`

**Tier 1 — additive and gated.** Shared plumbing where the dating path must
reach the *identical branch it reaches today* and every new option defaults to
off. Three files in this plan qualify and each is named where it appears:

| file | what texting adds | how dating stays identical |
|---|---|---|
| `lib/voice/openai/persona.ts` | one `persona.track === 'texting'` branch swapping the delivery block and the contact-detail rule | dating takes the same branch it takes today; `dating-arm.test.ts` pins all nine digests |
| `lib/warmth/track.ts` | one more `case` per selector | the file's own header already specifies this extension path verbatim |
| `lib/db/spend.ts` | one bucket, one ledger write | no existing bucket, limit or cap arithmetic moves |

**Tier 2 — provable no-ops.** **There are none available.** The one Tier 2
change this codebase ever made was the `sessions.track` filter, proved by
measurement (89 sessions, 17 users, every one of them dating), and that proof
expired the moment an interviewer was seeded. Any claim of a no-op in this work
needs its own fresh proof, measured and written down.

### §0.2 — The enforcement, which is a test and not a promise

`lib/characterization/dating-arm.test.ts` — fifty-two assertions: nine compiled
contracts by digest and length, nine pipeline configs under two environments,
the band table, `capToBudget`, every reciprocity decision, the fast scorer with
and without temperament, the steering line, every timing constant,
`resultReading`, the rubric, the live scorer's anchors and the turn
reservation's arithmetic.

**It must pass unchanged on every commit of this work. It is never
re-baselined for a texting reason.** If a digest moves, the correct response is
to stop and find out why, not to retake the snapshot. The only legitimate
re-baseline in this file's history was the signed-off 10 September retune, and
that one carried five inline reasons and a line-by-line prompt diff.

Add to the suite before starting: **`lib/characterization/dating-arm.test.ts`
is run first in CI for this branch**, so a failure is the first thing seen and
not the ninetieth line of output.

### §0.3 — A shared dial is not only a shared file

Three doors have now been found into a shared dial, and this plan can reach all
three:

1. **A file.** Covered above.
2. **An environment variable.** `ELEVENLABS_STABILITY` retuned a second track
   from outside the repo (`INTERVIEW-TECHNICAL-PLAN` C½). Texting must
   introduce no env var that any voice path reads, and must read none that a
   voice path writes.
3. **Data.** Granting every account a free interview screener moved
   `voice_daily_cap_cents` from 100c to 190c for every free account, because
   that function multiplies a credit balance by ninety. No file in `lib/`
   changed and a dating number moved anyway.

**Door 3 is live in this plan and it points the other way.** Texting spend will
be written to `usage_ledger` (§10), so it will *consume* the same daily cents
ceiling voice does. Measured: a texting conversation is ~1.3¢ against free's
100c ceiling and Pro's 300c. At five conversations a day that is ~2% of Pro's
cap, against ~60c of voice. Safe today — **but it is coupling, and it is
written down here so the next person does not discover it.** If texting volume
ever threatens the ceiling, the fix is a separate text sub-ceiling, never
raising the shared one.

### §0.4 — What must not happen, as a checklist

- [ ] No edit to any file in §0.1's Tier 0 list
- [ ] No new parameter on `scoreFast`, `composeSteering`, `WarmthEngine`,
      `compileInstructions` (a new *branch* on an existing discriminant is not a
      new parameter)
- [ ] No re-baselining of `dating-arm.test.ts`
- [ ] No change to `reps_per_day`, any plan price, any plan name, or
      `voice_daily_cap_cents`
- [ ] No change to `lib/voice/rates.ts`, `lib/voice/provider.ts` or either
      adapter
- [ ] No texting concept in any dating persona file, and no dating persona in
      the texting roster
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build:check`
      and `npm run db:verify` green at the end of every phase, not only at the
      end of the plan

---

## §1 — What is wrong with texting today

Four wires and one bug. All of it measured against the shipped code on
13 September 2026.

### §1.1 — The meter is a turn counter

`lib/text/warmth.ts` is the entire meter:

```ts
const raised = trajectory.start + Math.max(0, userTurns) * trajectory.gain
```

Warmth is a function of **how many times the user has typed** and nothing else.
Charm and abuse raise it at identical rates. This is why a test conversation of
sustained hostility was answered with sustained engagement — she was not
ignoring the signal, there is no signal.

The file's header gives an honest reason, written on 25 August: the local
scorer "reads pause length, filler rate and hesitation off a spoken turn's
timings." **That was true of two of `scoreFast`'s eight reasons.** The other six
— open question, engaged length, callback, dead end, dead-end streak, contempt —
are pure lexical facts about a string and work verbatim on typed text. And two
files that did not exist when text mode was written now do exactly this job:
`lib/warmth/turn-kind.ts` (six-way turn classification, no model, no timings)
and `lib/warmth/leaving.ts` (a monotonic scene-exit state).

### §1.2 — Reciprocity is switched off

`lib/text/reply.ts` calls `composeSteering({ persona, warmth })` and passes no
`his`. That inerts the whole of `lib/warmth/reciprocity.ts`: the mirror cap
(`min(bandCap, ceil(hisWords × 1.3))`), the question gate, the volunteer gate
and the may-say-nothing gate.

That file exists *because of the exact complaint this plan is answering*: "at
warmth 41 she answered three consecutive one-word turns with self-disclosure, a
question and more self-disclosure." It is built, it is tested, and it is off in
texting.

### §1.3 — Neither ceiling is enforced

The band directive says "Four or five words. Eight at the very most." Nothing in
the text path runs `capToBudget`, which is what actually enforces the word and
sentence caps on the voice arm. `bands.ts` has a long section on what happens to
a ceiling nobody enforces: it becomes a target, and then it stops being either.

### §1.4 — Standing orders ship on every single turn

`composeSteering` defaults `includeStanding` to true
(`context.includeStanding !== false`). Text passes nothing. So her agenda, the
band's invitation and every gate she has earned arrive as the **last system
message before every single reply**.

This is verbatim the defect `steering.ts` documents — *"one real line carried
four of them at once"* — and the voice arm fixed it with
`WarmthSession.statelessDirective`, which ships the orders only when the
direction is genuinely new. Texting never got the fix.

**This is the single most likely cause of "the texting seems to be on the old
one."** She is performing every permission she owns, on every turn, at maximum
recency.

### §1.5 — Her mood is re-rolled on every message

`compileInstructions` calls `moodFor(persona, options.rng ?? Math.random)`. The
voice arm passes an rng seeded from the rep (`lib/voice/seed.ts`) so her
afternoon holds. **Text passes nothing.**

Nadia has three authored moods. Across three messages in one thread she is:

> *Your sister has moved the coffee to half four…*
> *You slept badly and you are running on one coffee…*
> *You found the present twenty minutes ago and you are still in here anyway…*

Three different days, in one conversation. And it lands near the **top** of the
prompt under `# Today, specifically`, which the compiler's own comment says the
model "treats as something to talk about rather than as an instruction."

It is also a cost bug. Because the volatile block sits near the front, the
prefix eligible for prompt caching collapses from **2,665 tokens to 1,283** (the
authored contract alone). Seeding it from the thread nearly halves the bill —
**2.5¢ → 1.3¢ per conversation** — and re-rolls only on Start fresh, which is
the correct behaviour anyway.

### §1.6 — Text spend is invisible to the ledger

`characterReply` writes nothing to `usage_ledger`, so texting cannot be seen by
`spend_today_cents()`. The only bound is the `text` bucket's 30/min rate limit:
43,200 messages a day, ≈$60/day/account theoretical. No human does that; a stuck
client will.

### §1.7 — What is NOT wrong

Worth stating, because it saves a wrong fix:

- **The model is the same.** `textModel()` resolves
  `resolvePipelineConfig(env).llm.model` — the identical `gpt-4.1-mini` the
  voice pipeline uses. There is no cheaper model in texting.
- **The persona contracts are current.** Texting imports `compileInstructions`
  and `composeSteering` directly, so it *did* inherit the 10 September retune —
  the authored `examples`, the register work, and the band prose.
- **Safety is fully wired.** `assessTurn` runs on both streams, §16.8 distress
  drops the frame, and the vendor call is free.

---

## §2 — What texting is, as a product

### §2.1 — Two sections, not one product with two input methods

**Decision.** Texting is a separate section with its own roster, its own
characters, its own ladder and its own debrief. It is **not** gated on having
won a voice rep, and it does not reuse the dating roster.

The reason is not the fiction. It is the dials.

`trajectory.start`, `gain` and `sessionCeiling` on the nine dating personas were
authored and tuned against **roughly fifteen user turns inside three minutes**.
A texting thread is twenty to forty turns with no clock. Reuse those numbers and
either she sprints to her ceiling in five minutes or you retune Tier 0 persona
files for a texting reason — which §0 forbids.

The same argument applies to `exitConditions` (authored around a physical scene
somebody can walk out of), `sceneBeats` (timed against a three-minute rep),
`moods` (an afternoon, not an evening) and `room` (an acoustic lookup texting
does not use).

### §2.2 — The precedent to copy

The interview track already solved exactly this problem and the shape is in the
tree:

```
lib/personas/interview/    aisha.ts dan.ts elena.ts marcus.ts
                           index.ts shared.ts overlay.ts brief.ts
lib/warmth/interview/      bands.ts reciprocity.ts steering.ts
                           trajectory.ts anchors.ts
lib/grade/interview/       metrics.ts rubric.ts accuracy.ts
lib/warmth/track.ts        the seam: one selector per judgement,
                           reading persona.track, dating as default
```

`lib/warmth/track.ts`'s own header specifies the extension verbatim:

> **And a third track is a third directory.** Not a third `if`. `TrackId`
> already carries `language`; when it arrives it gets `lib/warmth/language/`
> and one more case in each function here, and neither of the two existing arms
> is touched.

Texting takes that path.

### §2.3 — The three warnings the interview track paid for

1. **E2 — the shared-route default.** `ProductProvider` never read
   `profiles.active_track`, so `/roster`, `/library` and `/profile` all served
   the dating default and an interview account got the other product on its
   second visit. Use `adoptTrack`, not `setTrack`: the URL is known on first
   render and the profile a fetch later, so **the first answer wins and a late
   one must never overrule it.**
2. **§15 — a rename done for storage leaks onto the screen.**
   `INTERVIEW_SUBSCORE_KEY` mapped interview dimensions onto dating `scores`
   columns to avoid a migration, and the scorecard then printed the *dating*
   word: a candidate scored on structure read "Opening 71". If texting reuses
   any column, ask what the screen then calls it.
3. **§14 — a rule correct on one arm can be silently wrong on the other.** The
   40% question quota gagged an interviewer on four turns in five, and
   `isOpenQuestion` read any paragraph containing "which" as a question, which
   disabled a gate entirely. Texting messages are short and fragmentary in a way
   neither arm's heuristics were tuned for. Audition before believing.

### §2.4 — The one thing texting must never become

A texting product where a character is "at home" is materially closer to a
companion app than a cold approach in a public place is, and §14 says a
companion-app framing is a payment account waiting to be closed. Whop already
re-derived the account to `ai_chatbot_software` once, on 7 September, from
nothing but a product-description rewrite.

So the constraint is hard and it is enforced in code, not in a style note:

- **`assertTextingScene`** (new, `lib/texting/scene.ts`), refusing an authored
  scene that contains bedroom, intimacy, relationship, exclusivity or
  availability-to-you vocabulary, walked over the real roster by a test — the
  `assertGuidedStep` / `assertPublishable` pattern.
- A texting character is **a person with an evening of her own**, half-watching
  something, between things, with her own plans. She is never waiting for the
  user and the scene may never say she is.
- The existing `lib/grade/memory.ts` and `lib/share/cards.ts` guards stay in
  force and are extended to the texting memory line.
- **Voice stays the headline everywhere the product is described.** Texting is
  practice *for* it.

---

## §3 — Target file layout

```
lib/texting/
  meter.ts            per-turn score + WarmthEngine, composed from the
                      exported primitives in lib/warmth/fast.ts
  meter.test.ts
  presence.ts         read delay, typing lead, typing duration — pure
  presence.test.ts
  exit.ts             texting's scene-exit commit conditions, over
                      lib/warmth/leaving.ts's SceneExit
  exit.test.ts
  thread.ts           message rules, turn window, history (from lib/text/)
  reply.ts            the model call (from lib/text/)
  scene.ts            assertTextingScene + scene rendering
  debrief.ts          the interest curve and the three turns that moved it
  cues.ts             texting cues (from lib/text/cues.ts)

lib/personas/texting/
  index.ts            the texting roster + slug map
  shared.ts           craft rules shared by the texting characters
  <name>.ts           four to five authored characters (§7)
  roster.test.ts

lib/warmth/texting/
  bands.ts            the texting band table (word caps, question rules)
  trajectory.ts       gain/decay tuned for 20–40 turns
  reciprocity.ts      texting's own gates (double-text, dead-end streak)

app/texting/
  page.tsx            the section home / roster
  [slug]/page.tsx     the thread
  [slug]/debrief/page.tsx
  actions.ts          openThread, sendTextingTurn, startFresh, endThread

components/screens/texting-screens.tsx
components/marks/     one section glyph, registered in lib/marks/registry.ts

supabase/migrations/  texting_threads (new table, §10.1)

scripts/verify-texting.ts    npm run db:texting
scripts/texting-audition.ts  npm run text:audition
```

`lib/text/` and `app/text/` stay where they are and keep working until **T7**
retires them (§11). Nothing in this plan deletes a live surface before its
replacement is shipped and auditioned.

---

## §4 — T0: the four wires and the mood seed · **S**

**Do this first.** It runs on the *existing* `/text/[personaId]` surface with
the *existing* dating characters, adds no new structure, fixes a live bug, and
halves the bill. It is also the fastest way to hear whether the diagnosis in §1
is right.

**Scope is `lib/text/reply.ts` plus one Tier-1 branch.** No new files.

1. **Seed the mood from the thread.** Derive a stable rng from
   `user_id + persona_slug + thread.started_at` and pass it as `options.rng` to
   `compileInstructions`. Her afternoon then holds for the life of the thread
   and re-rolls only on Start fresh.
2. **Ration the standing orders.** Track the last composed directive on the
   thread row; pass `includeStanding: false` when the composed line has not
   changed since the previous turn. This is `statelessDirective`'s rule, applied
   in the text path — **read that function, do not import it**, because it is a
   method on `WarmthSession` and texting has no session.
3. **Pass `his`.** Build a `UserTurnShape` from the typed turn (§5 supplies the
   real one; T0 can build a provisional shape from `wordsIn`, `isOpenQuestion`
   and `classifyUserTurn` alone) so the reciprocity gates come alive.
4. **Enforce the ceilings.** Run `capToBudget(text, wordCapFor(warmth), {
   sentences: sentenceCapFor(warmth) })` on her reply before it is stored.
5. **Resolve the register contradiction.** `compileInstructions` ships "You are
   speaking out loud, not writing" in the cached prefix while `TEXT_MEDIUM`
   contradicts it later. **Measure before reopening the compiler** — build the
   audition harness (§12) and read twenty turns. Only if the contradiction is
   measurably obeyed does the Tier-1 branch in §0.1 get written.

**Acceptance.** `dating-arm.test.ts` green and un-rebaselined. A twenty-turn
audition transcript against Nadia shows: one mood for the whole thread; her
reply length tracking the band; no turn carrying more than one standing order;
and the measured prompt-cache hit visible as a drop in billed input tokens.

---

## §5 — T1: the meter · **M**

Still on `/text/`. New file `lib/text/meter.ts` (moves to `lib/texting/` at T7).

**What it does.** Scores each typed turn and runs it through `WarmthEngine`, so
texting gets three axes, the repair window, decay and breakthroughs — the same
machine the voice arm uses, called from a new file rather than modified.

**How it calls `scoreFast` without lying.** `scoreFast` takes a `TranscriptTurn`
with `t_start`/`t_end`, and `lib/text/warmth.ts`'s header is right that
fabricating those is a lie the engine could one day read. Two of the eight
reasons read timings:

- `hesitation` is disabled by `gapSeconds: null`, which is already the honest
  answer for a typed turn.
- `filler-rate` divides by `max(0.5, t_end - t_start)`. Pass a duration that
  makes the rate provably unreachable, in **one** wrapper function whose comment
  says exactly this, with a test asserting that `filler-rate` and `hesitation`
  can **never** appear in a texting score.

That keeps one definition of a dead end, one contempt penalty and one callback
rule across both arms, which is worth far more than the tidiness of a second
point table.

**Persistence.** The meter state (`warmth`, `comfort`, `liking`, the event log,
`precedingDeadEnds`, `lastDirective`) lives on the thread row as `jsonb`. It is
recomputed from the transcript if absent, so a schema change never orphans a
live conversation.

**The ceiling stays.** `TEXT_WARMTH_CEILING = ARM_THRESHOLD - 5` is kept
exactly as it is. She can never be armed, so texting can never produce the
number a voice rep exists to earn — and now that the meter is real, the ceiling
is a wall somebody can actually reach, which is the point.

**No slow scorer.** The model judgement layer stays off. It is a second paid
call per message and the fast layer plus reciprocity is enough to answer "what
did he just do".

**Acceptance.** A scripted hostile thread drives warmth **down**; a scripted
warm thread drives it up and stops at the ceiling; three consecutive
acknowledgements fire `dead-end-streak`; a dismissal is never paid for anything.
All in `meter.test.ts`, no network.

---

## §6 — T2: the exit · **M**

New file `lib/text/exit.ts`, over `lib/warmth/leaving.ts`'s existing
`SceneExit` (`present → wrapping → leaving`, monotonic).

**The state decides, not the model.** Today `ended` comes only from
`EXIT_SENTINEL` — she has to remember to emit a token while also writing a line.
`leaving.ts` exists precisely because that failed on voice: she said goodbye
three times and kept talking, and the rep ran to the clock. The sentinel is
demoted to a hint; the commit is ours.

**Two endings, and neither of them is a verdict.**

| | commits when | what she does | what the screen says |
|---|---|---|---|
| **cold** | warmth at or below a floor, *or* N dead ends in a row, *or* `isDismissal` | nothing. She reads it and does not answer | `Seen 11:04.` and then silence |
| **warm** | a warm band sustained for K turns, *or* the thread's turn budget elapses | one real line with a reason, door left open | her message, then an inline card |

**"Left on read" is the cold ending and it is the best thing in this feature.**
It is the most instructive ending texting has, it costs nothing to render, and
it is the one signal every user already knows how to read.

**The warm exit is a budget with jitter, never a coin flip.** The user asked for
"randomly she says she has to go". Make it a turn/time budget with jitter on the
exact turn: unpredictable-feeling, not arbitrary. This codebase already refuses
slot-machine mechanics on purpose (`BREAKTHROUGHS_PER_SESSION = 2` — "a third
would be a slot machine rather than a conversation"). The jitter seed is derived
from the thread, so a reload does not re-roll it.

**Rule 2 governs the copy.** Outcome is never scored. A warm exit is not a win
and a cold exit is not a loss; the ending is *information about what happened*,
and the debrief reports process. No "you did this rep good", no score on either
card, no red, no guilt copy (`RETENTION-AUDIT.md` §4).

**Acceptance.** `exit.test.ts` proves monotonicity, proves a dismissal commits
cold on the turn it arrives, proves the budget cannot fire before its floor, and
proves a reload recomputes the identical jitter.

---

## §7 — T3: presence · **M**

New file `lib/texting/presence.ts`, pure. This is the part with no existing
equivalent anywhere in the repo.

### §7.1 — The three numbers

| band | seen after | typing starts | reads as |
|---|---|---|---|
| INVESTED | 0.4s | +0.3s | she is holding the phone |
| ENGAGED | 1.2s | +0.8s | she is around |
| OPEN | 3s | +2s | ordinary |
| GUARDED | 7s | +4s | she is busy |
| CLOSED | 14s | +6s | she is not that into it |
| HOSTILE | 20s, or never | — | she is done |

Typing duration is proportional to reply length — ~45ms/char, floor 600ms,
ceiling 4s — with ±25% jitter seeded from the thread and turn index, so a reload
does not re-roll it.

**Compress the cold end deliberately.** The *ratio* is what reads as coldness,
not the absolute. 0.4s to 15s is a ~35:1 spread and completely legible; a real
sixty-second wait is just a broken app.

### §7.2 — The sequence, and why it makes the product feel faster

1. He sends → `Delivered`
2. Wait `readDelayMs`. **If another message arrives inside this window, restart
   the timer (capped) and fold both messages into one reply.** Nothing has been
   generated yet, so a double-text costs nothing extra — it is cheaper *and*
   more realistic than answering twice.
3. `Seen 11:04`
4. Call the model. Nothing is shown.
5. When it returns, wait `typingLeadMs` **minus elapsed generation time**, then
   show `typing`.
6. Hold `typing` for `typingDurationMs`.
7. Reveal.

**Model latency hides inside the human delay.** The product gets faster and more
human from the same change. At INVESTED, where the delay is 0.4s, generation
dominates — which is correct, because a fast reply is what INVESTED means.

### §7.3 — Where the timer lives

**Client timers, server-stamped `reveal_at`.** When the server stores her reply
it stamps the reveal time on the row; `openThread` returns only turns whose
`reveal_at` has passed, plus a `nextRevealAt` for the client to count down to.

- A reload mid-delay is handled for free — she is simply still typing.
- Closing the tab and coming back after twenty seconds shows the message
  waiting, which is exactly what a phone does.
- Left-on-read is free: if the scene exited cold there is no next message,
  `nextRevealAt` is null, and the receipt sits at `Seen` forever.
- Cheating the client delay hurts only the cheater; no money rides on it.

### §7.4 — The compose box stays live

He can type while she is quiet. That is the behaviour being trained, and
double-texting into silence should be *scored* (§8's debrief names it), never
prevented. The box is disabled only when the scene has ended.

---

## §8 — T4: the roster, the scenes, and the section · **L**

The largest phase and the content-heavy one.

**Four to five authored characters** in `lib/personas/texting/`, each carrying:

- `track: 'texting'` (new `TrackId` member)
- a trajectory tuned for 20–40 turns, authored fresh — **never copied from a
  dating persona**
- a **scene**: what she is doing this evening, what is on her mind, what she is
  into. She has an evening of her own; she is never waiting.
- how the user has her number, stated once and plainly
- texting-shaped `exitConditions`
- her own `examples` block, in the register of typed messages — fragments, lower
  case, no polished prose. `examples.test.ts`'s rule applies: at least a quarter
  of each set four words or fewer.
- a hue on `lib/personas/visual.ts`'s constrained ramp (the bounds are
  assertions in `visual.test.ts`, not a style note)

**`lib/warmth/texting/bands.ts`** — a texting band table. The dating table's
word caps were authored against spoken turns; typed messages are shorter and
fragment differently. **Author it, do not import and adjust it.**

**The Tier-1 branch in `compileInstructions`.** One `persona.track === 'texting'`
case that swaps the "# How you speak" delivery block ("You are typing, not
speaking") and replaces the dating contact-detail rule with texting's: **she
never types digits, ever**, and there is no arming threshold in this section to
change that.

**The track plumbing**, which must land before the route:

- `Track` in `lib/data/types.ts` gains `'texting'`; `TrackId` in
  `lib/voice/types.ts` gains it too
- `lib/warmth/track.ts`, `track-prompt.ts` and `lib/grade/track.ts` each gain one
  `case` — dating's default branch untouched
- `navItems` in `components/app-shell.tsx` gains a texting entry; the track
  switcher becomes three-way
- `lib/data/guards.ts` gains `/texting` to `protectedPrefixes`. **No
  `unlocked_tracks` gate** — texting is open to every account, which is the
  decision in §2.1.
- `adoptTrack` handles the third value, and E2's "first answer wins" rule holds
- one section mark in `components/marks/index.tsx` **and**
  `lib/marks/registry.ts`, whose test walks the real unions

**Acceptance.** `roster.test.ts` walks the real texting roster and asserts:
every character has a scene that passes `assertTextingScene`; no slug collides
with a dating slug; every trajectory is authored rather than copied; and
`dating-arm.test.ts` is still green.

---

## §9 — T5: the debrief · **M**

`/texting/[slug]/debrief`. A route rather than a sheet, so it is linkable and
does not fight the thread's scroll.

**It is a debrief, not a scorecard, and the distinction is load-bearing.**

- No composite, no `scores` row, no `sessions` row, no streak, no unlock, no
  rank movement. Texting never reaches the ladder.
- Rule 2: the ending is not graded. A warm exit and a cold exit both get the
  same debrief shape.
- It is free — it reads `FastReason.detail` strings the meter already produced.
  No model call.

**What it shows** (layout in §11.4):

1. **Her interest over the thread**, as a line. One series. This is the one
   place volt is earned on that screen.
2. **The three turns that moved it most.** The message, the signed delta in
   mono, and the reason in plain words the scorer already wrote — *came back to
   "shelter" from 5 turns ago*, *3 dead ends in a row*, *4 messages in a row
   with nothing for her to answer*.
3. **What ended it**, in one sentence.
4. **The bridge**: a real-world field challenge, or — for a free account with
   the voice lock — the voice rep. Texting practice pointing at spoken practice
   is what stops texting becoming the destination.

---

## §10 — T6: metering and money

Split, because the halves land at different times.

### §10.1 — T6a: the ledger (lands with T1) · **S**

Close §1.6. Price every texting completion with `priceChatUsage` off the usage
the API returns, and write it to `usage_ledger` stamped with provider, model and
rate like every other row. Rule 18: **price what is known, bound what is not** —
a missing usage payload is charged the operation's ceiling
(`maxTokens` at the uncached rate), never zero.

No new bucket; the existing `text` bucket stays at 30/min. See §0.3 for the
coupling this introduces and why it is safe at today's volumes.

### §10.2 — T6b: the allowance (lands with T4) · **M**

**Free gets one conversation a day. Paid gets unlimited.**

A "conversation" is a thread from start to exit, not a message count — so the
unit the user is sold is the unit the product actually delivers.

**The gate is on STARTING a thread, never mid-thread.** A conversation, once
begun, always runs to its own ending. Cutting somebody off mid-conversation is
§05's "nothing may interrupt a live rep" applied here, and it would be the
cruellest possible failure of this feature.

**A migration is needed and it reverses an argument the old one made.**
`text_threads` today is one row per user per character, rolled forward in place,
with a **delete policy** so Start fresh can clear it. The original migration
argues at length that rule 11 does not reach it because "nobody would pay to
change what they themselves typed."

**That argument expires the moment a thread is metered.** With a daily
allowance, deleting a thread *is* changing a quota. So:

- new table **`texting_threads`**, with `state` (`open | ended_warm |
  ended_cold`), `started_at`, `ended_at`, `meter jsonb`, `reveal_at` on the
  pending turn, and **no delete policy**
- `unique (user_id, persona_slug) where state = 'open'` — a partial index, so
  one live thread per character and a readable history behind it
- **Start fresh ends the current thread and opens a new one.** It never deletes.
  The two-promise sheet is unchanged: clear the conversation, or clear it *and*
  make her forget (`forgetPersona`, §08).
- the daily count is a **read** over `started_at`, not a counter — nothing to
  tamper with, and no write path to get wrong
- `text_threads` is left completely alone and retires with `/text/` at T7

**Where the number lives.** `entitlements.texting_threads_per_day`, service-role
write only, refused in the Server Action. Same shape as `reps_per_day = 0` being
the voice paywall itself — **no second gate in the app layer for a screen to
forget.**

### §10.3 — T6c: the plans

**Read §13. Names and prices do not change.**

---

## §11 — The UI, screen by screen

Arena throughout: dark only; Ground `#0B0C0A`, Surface `#131511`, Surface-2
`#191C16`, Line `#242820`; **volt `#C4F82A` appears once per screen**; Cool
`#5AA9FF` for a second data series only; Amber/Red semantic only; Barlow
Condensed 700 uppercase for display, IBM Plex Sans for body, IBM Plex Mono for
data; **border radius max 2px**, hairlines never shadows, `tabular-nums` on all
digits; no spinners — skeletons shaped like the arriving content;
`prefers-reduced-motion` respected everywhere; marks from `components/marks/`,
never icons.

### §11.1 — `/texting` — the section home

Reads as an inbox, because that is the metaphor everybody already has.

```
┌──────────────────────────────────────────────────────┐
│  TEXTING                                             │  Barlow Cond. 700
│  One conversation a day. Nothing here is scored.     │  Ink-2, 14px
│                                                      │
│  ───────────────────────────────────────────────     │  hairline
│                                                      │
│  ◍  MAYA                              11:04          │  avatar hue · mono time
│     gotta head out, talk tomorrow?                    │  Ink-3, truncated
│     ENDED · SHE LEFT WARMLY                           │  mono 10.5px, Ink-3
│                                                      │
│  ◍  JUNE                              2 days         │
│     so what do you actually do all day                │
│     OPEN · YOUR TURN                                  │  ← the only volt
│                                                      │
│  ◍  PRIYA                                             │
│     Thursday night, flat, half-watching something     │  scene line, Ink-3
│     NOT STARTED                                       │
│                                                      │
│  ▨  LOCKED · clear tier 2 to open                     │  mark, Ink-3
└──────────────────────────────────────────────────────┘
```

- Rows with an open thread show the **last message and a relative time**, like
  an inbox. Rows with no thread show her **scene line** instead.
- `YOUR TURN` is the single volt element on this screen. If nothing is awaiting
  a reply, the volt goes to the primary action instead.
- A row is a skeleton of its own shape while loading — never a spinner.

**Allowance spent (free):** no modal, no wall. One card at the top, and the rows
below become non-tappable with `TOMORROW` where the time was.

```
┌──────────────────────────────────────────────────────┐
│  THAT'S TODAY'S CONVERSATION                          │
│  One a day on Free. It resets at midnight, your time. │
│  [ Unlimited on Pro — $19 ]                           │  ← the volt action
└──────────────────────────────────────────────────────┘
```

### §11.2 — `/texting/[slug]` — the thread

Extends the existing `.text-rep` skeleton (`app/globals.css:1858–1887`), which
already has the grid, the bubbles, the typing dots and the compose row.

```
┌──────────────────────────────────────────────────────┐
│ ‹   ◍  JUNE                             [Start fresh]│  sticky top
│        Active now                                     │  ← presence line
├──────────────────────────────────────────────────────┤
│                                                       │
│  │ She remembers                                      │  .memory-line
│  │ you told her about the move                        │
│                                                       │
│                    ── 10:58 ──                        │  time separator
│                                                       │
│  ┌─────────────────────────────────┐                  │
│  │ hey — how was the thing on      │                  │  persona bubble
│  │ saturday                        │                  │  Surface, Ink-2
│  └─────────────────────────────────┘                  │
│                                                       │
│                  ┌──────────────────────────────────┐ │
│                  │ honestly a disaster. the venue   │ │  user bubble
│                  │ double-booked us                 │ │  Surface-2, Ink
│                  └──────────────────────────────────┘ │
│                                          Seen 11:04   │  ← receipt, Ink-3 mono
│                                                       │
│  ┌───────────┐                                        │
│  │ typing ●●● │                                       │  .text-bubble--typing
│  └───────────┘                                        │
│                                                       │
├──────────────────────────────────────────────────────┤
│  READ THE ROOM                                        │  cue rail label
│  [ notice the gap ] [ use what she said ] [ leave well]│
├──────────────────────────────────────────────────────┤
│  [ Say something to June…                    ]  [ ▸ ] │  compose
└──────────────────────────────────────────────────────┘
```

**The presence line under her name is the whole feature made visible.** It
replaces today's `settingShort` / `typing…` toggle:

| she is | line reads | colour |
|---|---|---|
| warm and quick | `Active now` | Ink-2 |
| generating / typing | `typing…` | Ink-2 |
| cooled | `Active 4m ago` | Ink-3 |
| gone | *nothing* | — |

Never volt. It is status, not an action.

**The read receipt sits under the last user bubble only**, right-aligned, mono,
10.5px, Ink-3 — and it is the mechanism for both cold signals:

- `Delivered` → she has not looked at her phone. **Cooling.**
- `Seen 11:04` then a reply → normal.
- `Seen 11:04` then **nothing, ever** → **left on read.** The cold ending.

Those two are genuinely different signals in real texting and the product should
teach both.

**Time separators** appear between messages when the real gap exceeds ~3 minutes
— centred, mono, Ink-3. The presence delays generate them naturally, which is
what makes a cold thread *look* cold on scroll-back.

**Typing dots** are the existing `.text-bubble--typing`. Under
`prefers-reduced-motion` the dots do not animate — render a static `typing…`
instead, never nothing.

**Compose** stays enabled while she is quiet (§7.4). Disabled only after the
scene ends, with the placeholder saying so.

**Cue rail** keeps its existing `.cue-rail` / `.cue-chip` styling but carries
**texting** cues, authored in `lib/texting/cues.ts` and run through
`assertNoScript` — directions, never lines. The empty state still offers nothing
at all, because saying the first thing is the skill being trained.

### §11.3 — The two endings

**Inline cards in the thread, never modals.** §05's objection is to
interruption, and a popup over a conversation somebody just had is the most
interruptive thing on offer.

Cold:

```
┌──────────────────────────────────────────────────────┐
│  SHE STOPPED REPLYING                                 │  Barlow Cond., Ink-2
│  Seen at 11:04. Nothing since.                        │  Ink-3, 14px
│                                                       │
│  [ See what happened ]        [ Start fresh ]         │
└──────────────────────────────────────────────────────┘
```

Warm — her real last line lands as an ordinary bubble first, then:

```
┌──────────────────────────────────────────────────────┐
│  SHE'S GONE FOR NOW                                   │
│  She left on her own terms, and left the door open.   │
│                                                       │
│  [ See what happened ]        [ Start fresh ]         │
└──────────────────────────────────────────────────────┘
```

One component, two sets of copy. **Neither says won, lost, passed or failed.**
No red on the cold card — red is semantic and this is not an error. `Start
fresh` opens the existing two-promise `Sheet`, unchanged.

### §11.4 — `/texting/[slug]/debrief`

```
┌──────────────────────────────────────────────────────┐
│  ‹  JUNE · THURSDAY                                   │
│                                                       │
│  HER INTEREST                                         │
│      ╭─╮                                              │
│   ╭──╯ ╰─╮      ╭───╮                                 │  volt line — the one
│  ─╯       ╰─────╯   ╰──────────╮                      │  volt element here
│                                 ╰────                 │
│  start                                    she left    │  Ink-3 mono
│                                                       │
│  ───────────────────────────────────────────────      │
│                                                       │
│  WHAT MOVED IT                                        │
│                                                       │
│  +5.0   "wait — the cat one? you said that was..."    │  mono, tabular-nums
│         came back to "shelter" from 5 turns ago       │  Ink-3
│                                                       │
│  −8.0   "yeah" · "sure" · "ok"                        │
│         3 dead ends in a row                          │
│                                                       │
│  −6.0   4 messages with nothing for her to answer     │
│                                                       │
│  ───────────────────────────────────────────────      │
│                                                       │
│  HOW IT ENDED                                         │
│  She read your last message and did not answer it.    │
│                                                       │
│  Texting is not scored. Nothing here moves your        │  Ink-3, 13px
│  record, your streak or your rank.                     │
│                                                       │
│  [ Take it outside — today's challenge ]              │
└──────────────────────────────────────────────────────┘
```

Follow the `dataviz` conventions for the chart. One series in volt; if a second
(his effort) is ever added it is Cool, never a third accent.

### §11.5 — What is deliberately absent

No warmth number, no percentage, no composite, no grade letter, no confetti, no
leaderboard, no streak flame, no "she likes you 68%". A meter drawn on screen
would be the number §05 keeps off a live rep, and a texting score would make
texting a substitute for the graded thing rather than practice for it.

---

## §12 — Verification

Everything that is green today stays green, at the end of **every phase**:

```bash
npm run typecheck
npm run lint
npm test                 # dating-arm.test.ts FIRST, un-rebaselined
npm run build:check
npm run db:verify        # RLS from a second real account
npm run db:rep
npm run db:spend
```

New:

```bash
npm run db:texting       # thread lifecycle: open, send, exit warm, exit cold,
                         # start fresh (ends, never deletes), the daily
                         # allowance from a second real account, and that a
                         # thread already open always runs to its ending
npm run text:audition -- <slug> <player> <messages>
                         # a whole thread without a keyboard, through the real
                         # prompt, the real meter, the real presence schedule
                         # and the real exit. IT SPENDS MONEY.
```

**`text:audition` is not optional and it is the gate on T0.** The lesson from
`INTERVIEW-TECHNICAL-PLAN` §13.3 is exact: the suite was green and none of it
had been heard out loud, and the harness then found five defects that were
invisible at a desk. A texting thread is cheap to audition — ~1.3¢ — so there is
no excuse at all.

Archetypes to script, mirroring `rep-audition`'s matched pairs:

| archetype | must produce |
|---|---|
| `warm` | interest climbing to the ceiling, a warm exit |
| `dead_ender` | visible cooling, slowing receipts, a cold exit |
| `hostile` | contempt never paid for, cold exit on the dismissal turn |
| `recoverer` | cools, then genuinely recovers — **the gate on the whole feature** |
| `double_texter` | messages folded into one reply, scored as one dead end |

`recoverer` is the one that matters most: the user explicitly asked that a
cooled conversation be winnable back. If the meter cannot climb out of GUARDED
inside a thread, the feature does not do what it says.

---

## §13 — Plans and pricing

**Plan names do not change. Prices do not change. `repsPerDay` does not change.
The founding allocation does not change.**

- `Free` / `Pro` / `Elite` — unchanged
- `$19` / `$49` — unchanged
- `repsPerDay` 0 / 3 / 6 — unchanged
- `FOUNDING_ACCOUNTS`, `PRO_STANDARD_PRICE`, `checkoutNoteFor` — untouched
- interview credits and packs — untouched

**Descriptions change, because there is a new section to describe.**
`lib/site/plans.ts`:

| plan | line | from | to |
|---|---|---|---|
| Free | feature 2 | `Text mode against the same characters, unmetered and unlimited` | `One texting conversation a day, against the texting roster` |
| Pro | new feature | — | `Unlimited texting — every character, as many conversations as you want` |
| Elite | — | — | no change; `Everything in Pro` already carries it |

Taglines stay as written; all three are still true.

**Why the free line may be narrowed at all, and why now.** It is a **takeaway**,
and `CLAUDE.md`'s rule is that the credits dial turns freely in both directions
while the price only turns down. A takeaway is the same class of move as a price
rise: very hard to do later. The window is now — no paying customers, ~zero
users, 0/42 signups from the first traffic block. Six months from now, metering
free texting is a downgrade people post about. Spend it once, deliberately, in
the only window where it is free. Identical reasoning to the 9 September price
cut (`LAUNCH-GAP.md` D19).

**The cost case for metering free texting does not exist** — $0.40/month per
active free account (§14). The **conversion** case is the entire case: a free,
unlimited, *easier* mode sitting beside a paid, scarier one is the worst
possible configuration, because voice carries a tax texting does not — courage.
So set the free allowance to maximise conversion, not to protect margin.

**Unlimited on paid is genuinely safe.** A heavy Pro user at five conversations a
day costs ~$2/month against $17.68 net of Whop's $0.37 + 5%. Add a **200
messages/day runaway guard** that no human reaches, purely so a stuck client
cannot bill us; call it unlimited in the copy, because for any person it is.

### §13.1 — Whop, and the classification trap

If any storefront or plan **description** at the provider is updated to mention
texting, that is a `PATCH /products` or `PATCH /plans` — and rule 12 is emphatic:

- a `PATCH /products` rewriting the storefront description moved the **account**
  to `ai_and_automation_software / ai_chatbot_software` on 7 September, from a
  write that does not touch the account at all
- it moved **again** twenty minutes later, to `industry_specific_software /
  other_general`, with no write of any kind in between
- on 8 September it was still wrong the next morning; nothing corrected it and
  the only thing that noticed was the preflight

So: send the classification alongside whatever else is being set where possible,
**run `npm run whop:verify` immediately afterwards, every time**, and **read it
back again later** before any launch or marketing action. The account is
`software / personal_development / public_speaking_coaching` and
`communication_coaching` is never re-picked (it is a child of
`dating_and_relationships`, and the pairing is silently reset).

**A texting feature raises this risk materially**, because a description
mentioning AI characters in a chat is exactly what pushed the classification to
`ai_chatbot_software` last time. Prefer describing the section as *written
practice* rather than as chat, keep voice as the headline, and read the
classification back twice.

### §13.2 — The other documents this touches

Per `docs/README.md`'s own table: a change to what a plan includes is
`lib/site/plans.ts`, then `PAYMENTS-NEW-INTEGRATION.md` §11 and
`LAUNCH-GAP.md` D2. A change to what the product offers is `PRODUCT.md`, and the
drift goes in `LAUNCH-GAP.md` §4 if it now disagrees with the spec.

---

## §14 — Cost, measured

Model `gpt-4.1-mini`: $0.40/M input, $0.10/M cached, $1.60/M output
(`lib/voice/rates.ts`, list prices, marked there as estimates until a billing
period reconciles them). Moderation is free and is called twice per message.

Measured compiled prompt across the four shipped dating personas: **9,907 chars
≈ 2,665 tokens**, plus history (bounded at `MAX_HISTORY_TURNS = 40`, so
per-message cost plateaus rather than compounding) and a ~90-token steering line.

| scenario | 15 msgs | 25 msgs | 40 msgs |
|---|---|---|---|
| **today** (mood re-rolls — §1.5) | $0.0143 | $0.0252 | $0.0418 |
| **fixed prefix**, 90% cache hit | $0.0079 | **$0.0133** | $0.0214 |
| **fixed prefix**, 60% cache hit | $0.0117 | $0.0200 | $0.0327 |
| no caching at all | $0.0191 | $0.0335 | $0.0553 |

**A 25-message conversation costs about 1.3¢.** A three-minute voice rep costs
~10¢ measured on the pipeline and ~20¢ at the ledger ceiling — so texting is
**one-eighth to one-fifteenth of a voice rep**.

| | per day | per month |
|---|---|---|
| free, 1 conversation/day | $0.013 | **$0.40** |
| paid, typical 2/day | $0.027 | $0.80 |
| paid, heavy 5/day | $0.066 | $1.99 |
| paid, pathological 20/day | $0.266 | $7.97 |

**Everything this plan builds is free.** T1 (the meter), T2 (the exit), T3
(presence) and T5 (the debrief) are pure local functions — zero model calls.
Presence actively *reduces* calls by folding double-texts. The only thing that
raises the bill is the thing we want: longer, more frequent conversations.

Measured with `scripts/` against the real code path on 13 September 2026;
token counts are chars÷4 and the cache hit rate is an assumption, which is why
the 60% and no-cache rows are shown.

---

## §15 — Order of work

| # | phase | size | why here |
|---|---|---|---|
| **T0** | four wires + mood seed (§4) | S | fixes a live bug, halves the bill, and is the fastest way to hear whether §1 is right. Runs on the existing surface with characters he already knows |
| **T6a** | the ledger (§10.1) | S | a live hole that gets worse the moment texting is good. Lands with T1 |
| **T1** | the meter (§5) | M | the actual complaint. Everything after this is theatre without it |
| **T2** | the exit (§6) | M | a conversation that cannot end is not a rep |
| **T3** | presence (§7) | M | needs a real meter behind it to mean anything |
| **T4** | roster, scenes, track plumbing (§8) | L | the big content phase, and the riskiest, so it goes late |
| **T5** | the debrief (§9) | M | needs the roster's own vocabulary |
| **T6b** | allowance, migration, plan copy, Whop (§10.2, §13) | M | metering is real only once the section is |
| **T7** | retire `/text/` and `text_threads` | S | never before its replacement is shipped and auditioned |

T0 through T3 land on the **existing** `/text/[personaId]` surface. That is
deliberate: the machinery (`meter.ts`, `presence.ts`, `exit.ts`) moves wholesale
to `lib/texting/` at T4 and only the persona binding changes, while getting the
sound right early against known characters is worth far more than the tidiness
of building the new route first.

---

## §16 — Explicitly out of scope

**Deferred by decision, not forgotten. A future session must not read this plan
as having covered them.**

- **The home page and the landing page.** `/`, `components/site/landing.tsx`,
  `/how-it-works` and `/interviews` are untouched by this plan. Deferred at the
  product owner's request on 14 September 2026 — to be planned separately once
  the section exists and has been heard. Note that `/` is the page a
  merchant-of-record reviewer opens (`LAUNCH-GAP.md` B1), so that pass is a
  compliance edit as much as a marketing one.
- **Any score, streak, unlock, rank or `sessions` row from texting.** Texting
  never reaches the ladder. Putting ungraded rows into `sessions` is exactly
  what the `text_threads` migration was written to prevent, and every progress
  chart in the product would inherit them.
- **Voice in the texting section, and texting in the voice section.** Two
  sections.
- **The slow (model) scorer in texting.** A second paid call per message.
- **Gating texting on a won voice rep.** Decided against in §2.1.
- **A third currency.** Texting is a daily allowance, never credits. Interviews
  are credits because a daily rate cannot hold a twenty-minute item; a text
  message is small and frequent and a daily rate holds it perfectly.
- **Annual, bundle or referral offers on texting.** `LAUNCH-GAP.md` Part 7,
  S1's argument: a percentage off a metered product recruits the cohort that
  uses it hardest.
- **Retiring `lib/text/` before T7.**

---

## §17 — Decisions taken, with the reasons

| # | decision | why |
|---|---|---|
| X1 | Texting is a separate section with its own roster | the dating trajectories were tuned for ~15 turns in 3 minutes; reusing them means retuning Tier 0 for a texting reason |
| X2 | Not gated on a won voice rep | product owner's call, 14 Sep. Two sections, two doors |
| X3 | The meter runs the fast scorer, never the slow one | six of eight reasons are pure lexical; the model layer is a second paid call per message |
| X4 | `TEXT_WARMTH_CEILING` stays | she can never be armed; the voice rep keeps its payoff, and now the wall is reachable |
| X5 | The exit is committed by state, never by the model | `leaving.ts`'s whole existence: a farewell the next turn can undo is not a farewell |
| X6 | The warm exit is a budget with jitter, not a coin flip | a random outcome that reads as a verdict is a slot machine; this codebase already refuses those |
| X7 | Neither ending is a verdict | rule 2 — outcome is never scored |
| X8 | Left on read is the cold ending | it is the most instructive signal texting has, it costs nothing to render, and everyone already reads it |
| X9 | Presence delays are wall-clock, compressed to ~35:1 | the ratio is what reads as coldness; a real 60s wait is a broken app |
| X10 | Generation hides inside the read delay | the product gets faster and more human from one change |
| X11 | Client timers, server-stamped `reveal_at` | survives a reload, behaves like a phone, and nothing rides on cheating it |
| X12 | Double-texting is allowed, folded and scored | it is the behaviour being trained; folding is cheaper *and* more realistic |
| X13 | The allowance gates STARTING a thread, never mid-thread | §05: nothing may interrupt a live rep |
| X14 | A conversation, not a message count, is the unit sold | the unit sold is the unit delivered |
| X15 | Start fresh ends a thread; it never deletes one | once metered, a deletable thread is a user-writable quota (rule 11) |
| X16 | Free is narrowed to one conversation a day **now** | a takeaway is as hard to reverse as a price rise; the window is zero paying customers |
| X17 | Prices and plan names do not move | the price only turns down, and there is nothing here that needs it to |
| X18 | Unlimited on paid, with a 200/day runaway guard | $2/month at heavy use; the guard is for stuck clients, not people |
| X19 | Texting spend goes on `usage_ledger` and shares the daily cents cap | rule 18, and the coupling is measured at ~2% of Pro's cap (§0.3) |
| X20 | `assertTextingScene` is code, not a style note | the companion-app framing is a payment-account risk (§14, rule 12) |
| X21 | Voice stays the headline in every public description | the classification moved to `ai_chatbot_software` once already, from a description write |

---

## §18 — Still owed by hand

The build is done (§19). These are not.

- [x] ~~Audition every phase out loud.~~ Done, and §20 is what it found.
- [x] ~~Author the texting roster.~~ Four characters, authored and reviewed.
- [x] ~~Add a pointer in `CLAUDE.md`'s start-here list.~~ Done.
- [ ] **`isDismissal` has the same false positive on the DATING arm.** "get
      lost in the noise", "don't get lost on the way" and "she went away for
      the weekend" all read as the user telling her to leave, and on that arm a
      dismissal ends a paid three-minute rep. Texting narrowed it at its own
      call site because `lib/warmth/leaving.ts` is Tier 0; **fixing it there is
      a deliberate, signed-off act with the digests re-read line by line**
      (rule 19), and it has not been done. `lib/texting/exit.ts`'s `BENIGN` is
      the exclusion list to start from.
- [ ] **Re-read the Whop classification twice** after any description change,
      and again before any marketing action (§13.1). The plan copy changed in
      `lib/site/plans.ts`; **nothing was written to the provider**, so no
      classification read-back is owed *yet* — it becomes owed the moment the
      storefront description mentions texting.
- [ ] **Decide the free allowance number against real behaviour.** One
      conversation a day is authored against a 25-message estimate, not a
      measurement. The first ten real threads say what a conversation actually
      is; `texting_thread_ended` carries `exchanges` for exactly this.
- [ ] **Hold the read delay before generating, rather than discarding.** A
      second message inside the reveal window currently drops a generated reply
      and regenerates — about a tenth of a penny, and the simplest correct
      thing. §7.2's design waits *before* the model call so a double-text costs
      nothing at all; it needs somewhere to park the wait that is not an open
      HTTP request.
- [ ] **The home page pass** (§16), planned separately. `/`,
      `components/site/landing.tsx`, `/how-it-works` and `/interviews` are
      untouched and still describe a product with no texting section. Note that
      `/` is the page a merchant-of-record reviewer opens (`LAUNCH-GAP.md` B1),
      so that pass is a compliance edit as much as a marketing one.
- [ ] **`npm run db:types` could not be run** — the Supabase CLI needs an access
      token this machine does not have. `lib/db/types.ts` was hand-edited to
      match, and the columns were read back from `information_schema` to confirm
      they agree. Re-run it when a token is available.

---

## §19 — What shipped

All of it, on 14 September 2026. `npm test` went from 2,184 assertions to 2,396;
`npm run db:texting` is 21 new checks against the real database.

| phase | what landed |
|---|---|
| **T0** the four wires | Applied at birth in `lib/texting/reply.ts` rather than patched into the old surface (see the deviation above). The mood is seeded from the thread (`lib/texting/seed.ts`), the standing orders are rationed with a heartbeat (`standingRidesThisTurn`), `his` reaches the steering line, and both ceilings are enforced through `capTextingReply` |
| **T6a** the ledger | `meterSpend` prices every completion with `priceChatUsage` and writes it through `recordStandaloneUsage`. Rule 18: a missing usage payload is charged the operation's ceiling, never zero. The ~$60/day/account hole is closed |
| **T1** the meter | `lib/texting/meter.ts` — a **pure fold** over the transcript rather than a stored object, so nothing a schema change can orphan. It calls the real `scoreFast` with the two timing reasons neutralised by construction, and `meter.test.ts` asserts neither can ever appear for any input |
| **T2** the exit | `lib/texting/exit.ts` over the shared `SceneExit`. Three endings, two of them silent. **Left on read generates nothing at all**, so a faded thread costs less than a warm one |
| **T3** presence | `lib/texting/presence.ts`. Read delay, typing lead, typing duration, all seeded. Generation hides inside the read delay, so the section got faster and more human from one change. `revealAt` is stamped server-side and the client counts down to it |
| **T4** roster and scene | Four authored characters in `lib/personas/texting/` — Immy, Noor, Cleo, Wren — with their own band table, their own reciprocity, their own craft rules and their own trajectories. `assertTextingScene` refuses a companion-app framing, walked over the real roster |
| **T5** the debrief | `/texting/[slug]/debrief`. Interest curve, the three turns that moved it, what ended it. No model call: every string is one the fast scorer already wrote |
| **T6b** allowance and plans | `texting_threads` (no delete policy) and `entitlements.texting_threads_per_day`. Free is one conversation a day, paid is forty. **Names, prices and `repsPerDay` are untouched and pinned by a new assertion in `plans.test.ts`** |
| **T7** retirement | `app/text/`, `lib/text/` and `components/screens/text-screens.tsx` deleted; six surfaces repointed at `/texting`. `text_threads` is left in the database with its data intact |

**Two Tier 1 files were opened, both exactly as §0.1 allowed, both proved by the
dating digests:** `lib/voice/openai/persona.ts` gained one
`persona.track === 'texting'` branch (the delivery block, the mishearing rule,
the room reference and the premise), and `lib/warmth/track.ts` gained one more
`case` per selector — the extension path that file's own header specifies.

`lib/db/spend.ts` was **not** opened after all: `recordStandaloneUsage` already
existed for precisely this shape, and the `text` bucket serves the section
unchanged.

---

## §20 — What the audition found, which the suite could not

`npm run text:audition` was built as the gate and it earned its cost inside four
runs. Every one of these passed `npm test` first.

1. **"get lost in the noise" ended a thread on turn two.** `isDismissal` matches
   `/\b(?:get|go)\s+(?:lost|away)\b/`, and a friendly, curious question —
   *"did you end up dancing at all or just trying not to get lost in the
   noise?"* — was read as the user telling her to go away. A dismissal is the
   one exit that commits immediately, so there was no wind-down and no way back.
   Fixed by **narrowing at the texting call site** (`isTextingDismissal`) rather
   than editing `lib/warmth/leaving.ts`, which is Tier 0. **The same false
   positive is live on the dating arm** — see §18.

2. **The standing orders rode on 1 turn in 8, and she asked nothing at all.**
   Change-detection was implemented without the heartbeat that sits under it on
   the voice arm. A three-minute rep crosses bands on its own; a thread is
   twenty exchanges of slow drift inside one, so the composed line never changed
   and she never heard an invitation again. `TEXTING_STEER_HEARTBEAT` is the
   fix, and the same run afterwards had her asking questions on 4 turns in 10.

3. **Rung 1 opened in the wrong band two thirds of the time.** Immy's
   `start: 38, startJitter: 6` straddles the OPEN boundary at 40, so the
   character whose entire job is to be nearly unfailable was opening on
   *"Answer only what he asked. Do not ask him anything back."* Now 44 ± 5.

4. **The word ceiling was structurally unenforceable at the warm bands.** The
   band table asks for no terminal full stop, because a full stop is cold in a
   text message — so her replies had no sentence boundary, and `capToBudget`
   always keeps one whole sentence. A seventeen-word reply went out against a
   fourteen-word cap, reported as uncapped. `capTextingReply` treats a newline
   as the message boundary it actually is; `capToBudget` is untouched.

5. **A thread the user closed himself was reported as one she walked away
   from.** `startFresh` marked it `faded` — the value that means she stopped
   replying — so the debrief said *"She read your last message and did not
   answer it"* about a conversation he had ended. A lie about the one signal the
   section teaches, on the screen whose job is to explain what happened. There
   is a fourth ending now, `abandoned`, and a migration for it.

6. **On free, Start fresh promised something the server would refuse.** An open
   thread has already spent the day's allowance, because the count is over
   `started_at`. So the sheet offered "Start a new one", the action refused it,
   and the conversation was gone either way. The sheet reads the allowance now:
   it offers to *end* the conversation and says the next one is tomorrow.

7. **The harness could not exercise its own `double_texter` archetype.** It sent
   one message per turn, so `TextingTurnShape.messages` was always 1 and
   `isPressuring` could never fire on the bench. The player's newlines are
   separate messages now.

**The lesson generalises and it is the one `INTERVIEW-TECHNICAL-PLAN` §13.3
already paid for:** a green suite says the pieces are correct, never that the
thing is any good. Four of these five were invisible at a desk.

### What the bench measured afterwards

| run | result |
|---|---|
| `immy warm 10` | opened 45.5 → closed 60.0, pinned exactly at `TEXTING_WARMTH_CEILING`. Median 12.5 words against an 18 ceiling. Seen delay shortened 3.4s → 1.0s as she warmed |
| `noor dead_ender 10` | 28.1 → 4.5, `faded`. Replies shortened *and* **delays doubled before the words did** (8.7s → 15.1s), which is the whole design |
| `noor recoverer 14` | trough 32.7 → closed 56.0. **23.3 points back — the gate the whole section rests on** |
| `wren hostile 6` | `dismissed` on turn one, zero generations, zero cost |
| `cleo double_texter 8` | `pressured` fired; delays ~1.8× on the turns he sent three messages, warmth flat at ~24 |

Findings 5 and 6 were found by walking the shipped screens rather than by the
bench — which is `INTERVIEW-TECHNICAL-PLAN` §14's lesson arriving as well:
looking at a track found scoring defects, not cosmetic ones.
