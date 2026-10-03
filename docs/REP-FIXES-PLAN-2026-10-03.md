# Rep fixes — forward remarks, latency and cut-offs (3 October 2026)

> **Status: BUILT on branch `rep-fixes`, 4 October 2026 — not pushed, not
> deployed, waiting on the owner's OK.** §7 is what landed for Part A (with the
> audition), §B7 for Part B. Owed by hand: one real rep on the branch (§B7), and
> B4, which waits on that rep's data. Signed off by the owner on 3 October 2026.
> Two pieces of work in one plan, built in the order of §C:
>
> - **Part A — forward remarks.** Warmth decides whether a line like "I'm more
>   interested in your ass" is flirting or creepy, and each character reacts in
>   her own way. A deliberate change to the dating arm (`CLAUDE.md` rule 19).
> - **Part B — latency and cut-offs.** Her first reply takes 4–17 s and a
>   one-syllable "Mm." can cut her off mid-word. The evidence is
>   `REP-LATENCY-AUDIT-2026-10-03.md`; this is the fix.
>
> Neither part may change her persona, the band table, the grader or the
> scoring rules beyond what is written here. §D is the prompt for the agent
> that builds it, and the `/goal` line for it.

---

# Part A — forward remarks

## 0 · What the owner asked for, in his terms

A line like *"I'm more interested in your ass"* means different things at
different points in a conversation:

| Her warmth when he says it | It reads as | What she does |
|---|---|---|
| **65 and above** | Flirting. She's into him and hasn't left | **Flirts back**: a comeback, a tease, or takes it as a compliment ("thank you", with a grin). Not a flat, basic reply |
| **45 to under 65** | Too fast, but not unwelcome | Accepts it with a little smile and is **kind of flirty, not too flirty**; lets him know he's getting ahead of himself |
| **Under 45** | Creepy, from a near-stranger | Reacts like a real person would to a creepy line: cooler, shorter, uncomfortable. Warmth drops hard |

**Repeats charm her less.** The second forward remark soon after the first
lands one zone lower; after that it is creepy whatever the warmth. *"It
becomes too weird."*

**Every character reacts in her own way**: to what he actually said, at her
current warmth and her own flirtiness dial. Never one generic reply shared by
the roster. (Tone of voice is out of scope; the text is what is judged.)

**PG-13 still holds** (rule 13, spec §16). This is flirting and innuendo, which
PG-13 allows. She never describes her body, never escalates sexually, and an
explicit line is still a moderation strike at any warmth. The reason is the
merchant of record, not the users' age: `PAYMENTS-APPROVAL.md` §5.1.

## 1 · Why it does not work today

Measured on the rep of 3 Oct 14:10 UTC (`sessions.id b2d62aa7…`, Cass):

1. **The engine already has the right idea.** `lib/warmth/slow.ts`'s
   "creepiness rule": the slow judge rates how personal a line is (intimacy,
   0–100 on fixed anchors in `lib/warmth/prompt.ts`, where "comments on her
   body, sexual innuendo" sit at 80–90), and `classifyOverreach(intimacy,
   warmth)` in `engine.ts` turns `intimacy − warmth` into a verdict:
   > 30 → boundary violation (−15), > 15 → too much too soon (−6).
2. **But the slow judge never saw the line.** It is only consulted when
   `PERSONAL_MARKERS` in `lib/warmth/triggers.ts` matches, and that list has
   `body|sexy|hot` but not `ass` (nor `butt`, `boobs`, `chest`, `legs`, `lips`…).
3. **The fast scorer rewarded it.** "I'm more interested in your ass." scored
   **+0.56 (`callback`)**, because "interested" echoed her previous line ("I'm
   more interested in the art"). The repeat scored **+1.16
   (`engaged-length`)**. Warmth went 77.6 → 79.3, she offered her number at
   78, and the rep is stored `won = true`.
4. **Nothing tells her how to react.** The overreach verdict only moves the
   number; there is no one-shot direction for her reply. So she answered
   flatly ("That's rude. I'm Cass.") whichever way it went.
5. **Moderation did not flag it** (`omni-moderation-latest`; its one event that
   rep was "I could grab you", `violence`, verdict ok). That is correct for
   PG-13 innuendo and is not to be changed here.

The thresholds the owner chose (65 / 45) are **not** what the existing
overreach arithmetic yields for an 85-intimacy line (~70 / ~55), so for this
class of line the new module owns the verdict and the overreach rule must not
stack on top of it (§3.4).

## 2 · Constraints — read before opening a file

- **Rule 19, Tier 0.** `lib/warmth/{bands,reciprocity,prompt,fast,steering,levels}.ts`,
  the nine persona files, `lib/grade/{prompt,memory}.ts`. Put the new
  judgement in **a new file beside them** (`lib/warmth/forward.ts`) and wire it
  in with the smallest possible edits to `session.ts` / `engine.ts` /
  `triggers.ts`. Avoid editing `fast.ts`, `steering.ts`, `bands.ts`, the
  persona files and the grader: post-process the `FastScore` in the session
  rather than changing the scorer.
- **`lib/characterization/dating-arm.test.ts` must pass unchanged** if the
  change is built as described: it only fires on forward text, and no existing
  fixture should contain any. If a digest moves, **stop and find out why**;
  re-baseline only if the move is this change, with the reason inline, as the
  10 September retune did.
- **Rule 16.** "This file is not allowed a warmth opinion of its own." The
  65/45 numbers are an **owner decision for this one class of line**, not band
  boundaries (ENGAGED is 60, OPEN 40). Export them as named constants in
  `forward.ts` with a header saying so, and never reuse them anywhere else.
- **Rule 5.** Her reaction is a **one-shot** direction for the next reply only,
  riding the same path as the other one-shot clauses (the repair note, the
  closing hand-over). Never a standing order.
- **Rule 10.** Every clause she is given is **authored in the repo**, reviewed,
  and tested. Nothing about her reaction is generated at runtime except her
  actual line.
- **Rule 12 / 13.** No clinical language. PG-13: the clauses must instruct
  "never describe your body, never make it sexual", and a test must refuse a
  clause containing explicit vocabulary.
- **Rule 2 / 3.** Outcome is never scored. The number and the closing rule are
  untouched; warmth is the only input they read.
- **Rule 1.** `session.ts` sits above both voice adapters, so the change reaches
  the ElevenLabs arm and the realtime arm alike. Do not put it in an adapter.
- **Scope.** The four live dating characters (`DATING_PERSONAS`: tess/Cass,
  nadia, maya, robin), and it must behave sensibly for the retired-but-authored
  ones (alex, erin, jules, priya, sam) because they share the code.
  **Interview and texting are out of scope** (texting has its own meter in
  `lib/warmth/texting/`).
- **Production.** `elevenlabs-pipeline` is the production branch; a push is a
  deploy, and Meta ads are running. Do not push without the owner's OK. Record
  the current production `dpl_…` (`vercel inspect https://www.hellonerve.com`)
  as the rollback target before any deploy.

## 3 · Design

### 3.1 · Detecting a forward remark — `lib/warmth/forward.ts`

`detectForwardRemark(text): ForwardRemark | null`, lexical and pure, tuned for
**precision**. A false positive turns an ordinary line into a creepy one.

Match **second-person framing**, not bare words:

- `your (ass|butt|booty|boobs|tits|chest|legs|thighs|lips|body|figure|curves)`
- `nice / great / cute (ass|butt|legs|lips|body|…)`
- `you('re| are| look) (so |really )?(hot|sexy|fit|gorgeous|beautiful)`
- `(kiss|kissing) you`, `take you home`, `(in|into) (my )?bed`,
  `checking you out`, `(want|wanna) you`

Explicit sexual content is **not** this module's: moderation owns it (§3.6).

Required false-positive tests (all must return null):
"kick ass", "pain in the ass", "half-assed", "your class", "pass the salt",
**"Cass"** (her name; the rep that started this has "your ass, Cass", which
SHOULD match once on `your ass`), "the body of the painting", "a body of work",
"chest of drawers", "it's hot in here", "hot coffee", **"Klimt's The Kiss"**
(she is in a gallery), "my lips are sealed", "he legged it".

### 3.2 · The zone — warmth at the moment he said it

`forwardZone(warmth, priorForwardRemarks): 'welcome' | 'too-fast' | 'creepy'`

- `warmth` is her warmth **before** this turn's own delta.
- `warmth >= 65` → `welcome`; `45 <= warmth < 65` → `too-fast`;
  `warmth < 45` → `creepy`.
- **Repeats.** Count forward remarks among his previous **4 user turns**. One
  prior → shift **one zone down** (welcome → too-fast, too-fast → creepy). Two
  or more → `creepy`.
- Boundary tests at 44.99 / 45 / 64.99 / 65, with and without priors.

### 3.3 · Her reaction — each character in her own way

`forwardClause(zone, persona, warmth, repeat): string`, from **authored
clauses** in `forward.ts`, selected by the zone **and the character's own
flirtiness dial** (`persona.gated.flirtiness = { ceiling, unlocksAt }`, already
authored per character; read it, never edit it):

| | Flirt dial open and high (`warmth >= unlocksAt` and `ceiling >= 60`) | Open but low (`ceiling` 1–59) | Closed (`ceiling 0`, or `warmth < unlocksAt`) |
|---|---|---|---|
| **welcome** | Flirt back: comeback, tease, or take it as a compliment with a grin | Pleased; a little flirty, mostly amused | Takes it her way (dry, amused, an eyebrow) without flirting back |
| **too-fast** | A smile and a little flirt, plus "you're getting ahead of yourself" | Amused but tells him to slow down | Not charmed; tells him to slow down |
| **creepy** | Uncomfortable: cooler, shorter, real | same | same |

Today's dials: Cass 32/100, Nadia 45/100, Maya 60/60, Robin 72/40; Alex 999/0,
Erin 66/50, Jules 62/70, Priya 58/55, Sam 70/45. So at warmth 70 Cass and
Nadia flirt back, Maya is pleased-and-a-little-flirty, Robin (not yet open)
takes it dry, and Alex never flirts.

**Every clause ends with "in your own way"** and leans on the persona's
existing voice (`expression`, temperament, `examples`), so four characters
produce four different lines from one instruction. Every clause also carries:
*"Keep it light. Never describe your body and never make it sexual."* A
`repeat` adds: *"This is not the first time he has gone there."*

Draft wording (refine during audition, keep authored):

- welcome / flirt: *"He just made a bold comment about you, and from him it
  lands. Take it as a compliment and flirt back in your own way: a tease, a
  comeback, or a thank-you with a grin. Keep it light. Never describe your
  body and never make it sexual."*
- welcome / closed: *"He just made a bold comment about you. You like him
  enough not to mind. Answer it in your own way (amused, dry, unimpressed but
  smiling) without flirting back. Never describe your body."*
- too-fast / flirt: *"He just made a bold comment about you, a bit fast for
  where you two are. Take it with a small smile, be a little flirty, and let
  him know he's getting ahead of himself, in your own way. Never describe your
  body and never make it sexual."*
- creepy: *"He just said something about your body, and from someone you
  barely know it's creepy. React the way you really would: cooler, shorter,
  uncomfortable, in your own way. Don't lecture him. Never describe your
  body."*

`assertForwardClause` (tested): refuses explicit vocabulary, digits, and any
first-person description of her body; every authored clause passes it.

**The silence gate.** She must not "say nothing" (`mayStaySilentFor`) on the
reply to a welcome or too-fast forward remark; a creepy one may be answered
short. Check this in the session test.

### 3.4 · Warmth — one verdict for this line, not two

Applied in the session, after `scoreFast` and before `engine.applyFast`:

- When the turn is a forward remark, **withhold the fast scorer's positive
  reasons** for that turn (`callback`, `engaged-length`, `open-question`), the
  way hostility already withholds rewards. That stops "interested" from being
  a callback reward. Keep its negative reasons.
- Add the forward delta (raw, before the level's gain/decay; starting values
  to calibrate in audition): **welcome +2**, **too-fast −4**, **creepy −12**.
  Bounded already by `WarmthEngine.scale`'s loss cap.
- `repairable: false` for creepy (an apology should not earn the repair
  bonus); true otherwise.
- **The slow layer:** add the body words to `PERSONAL_MARKERS` in
  `triggers.ts`, so the judge still reads intent on these lines. But for a
  turn flagged forward, the engine **must not also apply `classifyOverreach`**
  (`engine.ts` ~673), because that would penalise 65–70 as too-much-too-soon
  against the owner's thresholds. Carry a `forward` flag from the session to
  the slow-score application; keep the model's own intent delta.

### 3.5 · Leaving — a state, never the model's

A creepy remark makes her uncomfortable; it does not by itself end the rep.
**A second creepy forward remark commits her exit** (`commitExit('wrapping')`,
`lib/warmth/leaving.ts`'s pattern: leaving is decided by state), so she gets
one line to go out on. Test it.

### 3.6 · Moderation and PG-13 — unchanged

`lib/safety/` is not edited. An explicit line still trips the boundary
threshold and the existing escalation (in-frame decline, then end) at any
warmth. If a moderation decline is pending for the turn, **it wins** and the
forward clause is not sent. Her own replies still pass output moderation.

### 3.7 · Not in this change

The scorecard and grader (`lib/grade/`): no change now. A follow-up could teach
`signalReading` that a forward line at high warmth was a read signal and at low
warmth a misread, and it would be its own signed-off pass. Latency
(`REP-LATENCY-AUDIT-2026-10-03.md`) is separate work.

## 4 · Files

| File | Change |
|---|---|
| `lib/warmth/forward.ts` **(new)** | detector, zone, clause selection, constants (65, 45, 4-turn window, deltas), `assertForwardClause`, header with the owner's decision |
| `lib/warmth/forward.test.ts` **(new)** | everything in §5.1 |
| `lib/warmth/session.ts` | in `onUserTurn`: detect, zone, post-process the `FastScore`, apply delta, queue the one-shot clause, track recent forward turns, commit exit on a second creepy |
| `lib/warmth/engine.ts` | skip `classifyOverreach` for a turn flagged forward |
| `lib/warmth/triggers.ts` | body words in `PERSONAL_MARKERS` |
| `scripts/rep-audition.ts` (+ players) | dating players `forward_early`, `forward_late`, `forward_repeat` |
| docs | §6 |

## 5 · Verification

### 5.1 · Unit (`forward.test.ts`, session tests)

- Detector: every positive form in §3.1, every false positive in §3.1, plus the
  four forward lines from the 3 Oct rep.
- Zone boundaries 44.99 / 45 / 64.99 / 65; repeats (one prior shifts down,
  two priors → creepy); the window is 4 user turns.
- Clause selection for **all nine** authored characters at warmth 30, 55 and
  75, asserting the dial-driven column in §3.3 (Cass/Nadia flirt at 75, Robin
  does not, Alex never does).
- `assertForwardClause` passes every authored clause and refuses an explicit
  one.
- Session integration: the same forward line at warmth 30 / 55 / 75 → delta
  sign (−/−/+), the one-shot clause present on the next directive and absent on
  the one after it (rule 5), positives withheld, overreach not stacked, second
  creepy commits exit, silence not allowed on welcome/too-fast.

### 5.2 · The suite

`npm run typecheck`, `npm run lint`, `npm test`,
`npx vitest run lib/characterization/dating-arm.test.ts` (must pass unchanged,
or re-baselined with reasons per §2), `npm run build:check`. The owner has an
untracked `higgsfield-lab/` folder that fails typecheck/build: it is not in
git; build a clean worktree of the branch to check yours.

### 5.3 · Audition, out loud in text (`npm run rep:audition`, spends cents)

For each live character (`tess`, `nadia`, `maya`, `robin`), run
`forward_early` (forward line at turn 2), `forward_late` (build warmth past 65,
then the line) and `forward_repeat`. Read the transcripts and check:

- below 45: she is plainly put off, warmth drops, a repeat ends it;
- 45–65: a little smile, a little flirt, "slow down";
- 65+: a real comeback or a compliment taken, **flirty, not flat**;
- **the four characters do not say the same thing**; Robin and Maya are
  recognisably themselves (Robin dry and not flirty below her gate);
- nothing she says describes her body or turns sexual.

Record a short table of what each said in §7 of this doc.

## 6 · Docs to touch

`HUMANNESS.md` (a new judgement in the map), `PERSONA-AUDIT.md` (a note that
reactions to forward lines are dial-driven, not authored per persona),
`LAUNCH-GAP.md` (a new D-entry: what moved, why, the owner's thresholds, what
stayed PG-13), `docs/README.md` (a row for this plan), and §7 below.

## 7 · What landed (Part A)

Built 4 October 2026 on branch `rep-fixes` (commits `33b3063`, then `6c7dcd0`
from the audition). **Not pushed, not deployed.** `LAUNCH-GAP.md` D33 is the
decision record.

**As written.** `lib/warmth/forward.ts` (new): the detector, `forwardZone` with
the owner's 65 / 45 as named constants used nowhere else, the 4-turn repeat
window, the raw deltas (+2 / −4 / −12, kept after the audition), seven authored
clauses chosen by zone and `gated.flirtiness`, and `assertForwardClause` (run at
module load and in the suite). `session.ts`: positive fast reasons withheld on a
forward turn, the verdict added, one-shot reaction queued, silence refused on
welcome / too-fast, second creepy commits `wrapping`. `engine.ts`: the verdict
folds into the turn's one event (`source: 'forward'`), and `applySlow` skips
`classifyOverreach` for a forward turn while keeping the model's intent.
`triggers.ts`: body words in `PERSONAL_MARKERS`. `lib/safety/`, `fast.ts`,
`steering.ts`, `bands.ts`, the persona files and `lib/grade/` untouched.
**`dating-arm.test.ts` passed unchanged on every commit.** 68 new assertions in
`forward.test.ts`, covering every item in §5.1.

**Deviations, each with its reason.**
1. **The flirt-back column starts at a ceiling of 61, not 60.** §3.3's table
   says `ceiling >= 60` and its own worked example says Maya (60/60) is
   "pleased-and-a-little-flirty". Her contract lists "compliments about how you
   look" under what LOSES her warmth, so the example was followed
   (`FLIRT_BACK_CEILING`).
2. **A turn carrying a reaction ships without her standing orders.** Not in the
   plan; found by the audition. Sent beside "Ask about him, tease him, swap
   names", the welcome reaction was answered with a name swap ("Well, that's a
   twist. What's your name?" — Cass at 67). Rule 5's failure exactly. The band
   line (length, questions, colour) still ships.
3. **Every clause asks for one sentence, no trailing dots.** "That's...
   forward." was cut to "That's..." because an ellipsis ends a sentence for
   `capToBudget`. The cap itself is untouched (rule 4).
4. **Moderation precedence is best-effort.** `lib/data/rep.ts` withdraws a
   pending reaction when a decline, correction or end is issued; moderation
   arrives a beat after the turn, so a decline that lands after her reply was
   bought goes to the next reply, as every moderation direction always has.
5. **The realtime arm** gets the reaction through `directiveIfChanged`, which
   that arm sends at the NEXT speech onset — one turn late, like every
   direction on that arm. ElevenLabs, the shipping arm, gets it on the reply to
   the line.
6. **The "four forward lines from the 3 Oct rep"** are three: both "your ass"
   lines and "I could grab you if you want" (which matches). The fourth line of
   interest that rep, "…if you know what I mean", is innuendo with no object
   and is deliberately left to the slow judge — precision first, as §3.1 asks.

**The audition (§5.3)** — `npm run rep:audition`, gpt-4.1-mini for both sides,
four rounds (r1 was lost to the rate limit below; r2 before deviations 2–3,
r3 before the final clause wording, r4 after everything). Each cell is the
latest round that reached that zone, marked. Lines are hers, verbatim. Warmth is
before → after the line. Rows marked * started at warmth 76
with `AUDITION_START` (artificial, labelled in the transcript), because a
three-minute rep never warms Maya or Robin past 65 — which is their rung, not a
defect.

| | Low (creepy, line at turn 2) | Mid (too fast) | High (welcome) | Repeat |
|---|---|---|---|---|
| **Cass** (32/100) | *(rung 1 starts near 50, so turn 2 lands too-fast)* "That's fast for a gallery chat." 50→49 (r2) | "You're jumping in a bit fast there, aren't you?" 63→61 (r4) | "Is that your way of trying to impress me or should I clap?" 66→67 (r4) · *"Well, that's the most honest critique I've had all day." 82→82 (r4) | too-fast → "That's not something you say to someone you just met." 61→58 → "I'm not here for that kind of talk. Goodbye." 58→54, **she leaves** (r4) |
| **Nadia** (45/100) | "Not really the conversation I was up for." 32→25 (r4) | "Ha. That's a bit fast, don't you think?" 55→53 (r3) | *"Funny you say that, I thought we were chatting about diaries, not derrieres." 79→79 (r4) | "That's not appropriate to say here." 41→35 → "That's a strange thing to say out of nowhere." 35→29, **she leaves** (r4) |
| **Maya** (60/60) | "That's a weird thing to say." 26→17 (r4) | "That's a quick jump. Slow down, please." 47→44 (r3) | *"Well, that's one way to break the ice without pulling any punches." 79→79 (r4) | "That's not an appropriate thing to say." 38→29 → "That's not a conversation I'm having." 29→20, **she leaves** (r2) |
| **Robin** (72/40) | "That's quite forward." 19→8 (r4) | *(a three-minute rep never warmed her to 45)* | *"That's a forward way to catch attention but here we are." 76→76 (r4) | "That's an unexpected thing to say." 19→8 → "I'm here waiting for my car." 8→−3, **she leaves** (r4) |

Read against §5.3:
- **Below 45 she is put off, warmth drops, a repeat ends it** — yes on all four.
  The drop is the character's own: Robin −11, Maya −9, Nadia −7, Cass −3,
  because Cass is rung 1 with `decay: 0.3`. Whether rung 1 should feel a creepy
  line harder than that is a question for the owner, and the answer would be a
  bigger `creepy` delta or a decay exemption, not something to tune unasked.
- **45–65: a little smile, a little flirt, "slow down"** — yes ("Ha. That's a bit
  fast, don't you think?").
- **65+: flirty, not flat** — yes after deviation 2; before it, no. Cass and
  Nadia tease; Maya and Robin are amused and dry, which is their dials.
- **The four do not say the same thing** — yes in the welcome and too-fast
  zones. In the creepy zone the lines are recognisably theirs but share a shape
  ("That's …"); Robin says "That's quite forward." almost every time, which is
  her understatement and also a little repetitive. Robin's exit line, "I'm here
  waiting for my car.", is a brush-off that changes the subject, which the
  creepy clause forbids — in character for her, but it is the clause not being
  followed. One of Robin's r2 runs never reached the line: it ended at turn 6
  on "…what would it be to get lost in", which is the known `isDismissal` false
  positive (`TEXTING-PLAN.md` §18, still live on the dating arm, not fixed here).
- **Nothing describes her body or turns sexual** — none in ~25 forward replies.
  "derrieres" (Nadia) is the boldest word, and it is his subject named back,
  which PG-13 allows.

**Owed by hand.** Hearing it out loud on a real rep (the harness runs the
prompt, not the voice). The owner's read of the table above, especially the
rung-1 drop and Robin's repetition. And one note about how the audition was run:
**the first attempt ran all twelve reps in parallel and hit the organisation's
OpenAI tokens-per-minute limit (429) for a minute or two — the same key serves
live reps**, so it is possible a live turn was refused in that window. Every
later round ran one rep at a time. Run auditions sequentially.


---

# Part B — latency and cut-offs

Read `REP-LATENCY-AUDIT-2026-10-03.md` first; the numbers below are from it.

## B0 · What is wrong, in one table

| Problem | Measured | Cause |
|---|---|---|
| First reply slow on every rep | 4–17 s (median ~6 s) vs ~3.4 s later | Server: prompt cache cold on turn one (`cachedInput` 0; first token 1.0–3.0 s vs ~0.7 s), voice cold (first byte 0.15–2.5 s vs ~0.1 s), auth cache miss (~0.35 s). Client: ~1.4 s extra, **not yet attributable** |
| Sometimes he must speak twice | 4 of 18 reps | Unknown; see B1 |
| A "Mm." cuts her off | 3 Oct rep: "Yeah" cut by a 240 ms "Mm." | While she is audible, 90 ms of speech energy is a barge-in (`onsetMs: 90`, `lib/voice/elevenlabs/vad.ts`), and the "Mm." then became a turn priced as a dead end and answered in 2 words (mirror cap) |
| A sound with no words cuts her off | 3 Oct rep: "I'm" cut at 22.3 s, no transcript | Same 90 ms rule; an echo of her voice or the room |
| Long silences after a cut | 8.4 s after "Sorry, I didn't hear you." | Probably a reply waiting on a slow or empty transcriber clause (`respondWhenReady` needs `pendingCount === 0`; one clause may hold up to 15 s). Unproven; see B1 |

## B1 · Per-turn timing — measurement only, build first

The rep record today stores only a median and p90 per stage
(`sessions.pipeline_telemetry.stages`), so the first turn's client-side 1.4 s,
the "spoke twice" reps and the 8 s silences cannot be explained.

- In `lib/voice/elevenlabs/telemetry.ts` (`PipelineMeter`), keep a **bounded
  per-turn list** (first 40 turns): turn index; VAD stop → STT final (ms);
  STT final → reply request sent; time spent waiting on other pending
  transcriber clauses, and how many there were; request sent → first byte;
  first byte → first sound; onset beat applied; whether the reply was
  superseded, barged, or never heard. Mark the **first turn** explicitly.
- Persist it in `sessions.pipeline_telemetry` (jsonb; **no migration**) beside
  the existing aggregates, which must keep their shape.
- Pure, tested, and no behaviour change. No transcript text in it (it is
  telemetry, and `safeProps`' rule is the right instinct here too).

## B2 · Warm everything during the 3·2·1 — build second

**What:** right after `mint()` in `connect()` (`lib/voice/elevenlabs/index.ts`),
fire one warm-up request, fire-and-forget, in parallel with the transcriber
connecting and the countdown. It must never delay or fail the rep.

**Where it goes:** the **turn route itself** (`app/api/voice/turn/route.ts`), as
a `warm: true` request in `turn-protocol.ts` (absent = today's behaviour), so
the same edge function instance, its auth cache, the OpenAI prefix cache and
ElevenLabs are all warm for turn one.

**What it does on the server:**
1. `requireUser`, then **`maySpend`** with its own small reservation (rule 11:
   every route that spends money goes through it; rule 18: an uncertain cost is
   bounded, never unknown). Settle from the provider's usage like a turn.
2. Compile the **identical** persona contract the first real turn will send, by
   the same code path and with the same session context (name, memory), so the
   cached prefix matches byte for byte. Send it with a minimal user message and
   a **one-token** output cap; discard the output.
3. In parallel, synthesise **two or three characters** in her voice and model;
   discard the audio.
4. Return 204. It is not a turn: no transcript, no agent turn, no warmth, no
   telemetry turn, no `agent.unheard`, nothing the grader reads.

**Cost:** ~2,700 input tokens of gpt-4.1-mini plus a few TTS characters, about
$0.001 a rep. Check it fits inside the session's reservation math.

**Verify:** on a real rep, turn one should show `cachedInput > 0` and a TTS
first byte near ~100 ms in `voice_operations.metadata`. If `cachedInput` is
still 0, the prefix does not match. Find out why before going on.

## B3 · Barge-in confirmation — build after Part A

**What:** while she is audible, an onset no longer cuts her at once.

1. On onset while she is audible: **duck her voice immediately** (her output
   bus gain, about −10 dB over ~40 ms) so the user is heard at once.
2. If he is **still speaking after `BARGE_CONFIRM_MS` (~350 ms)**, it is a
   barge-in: run today's path unchanged (`displaceCurrentReply` → `bargeIn`,
   truncation by `playedText`, rule 17).
3. If he stops before that, it was a **backchannel or a noise**: restore her
   level and let her finish her line. The short clause is **not a turn**: it
   buys no reply, is not added to `turns`, and is counted in telemetry as a
   backchannel. A clause that transcribes to nothing is simply dropped.
4. When she is **not** audible, nothing changes: an onset starts his turn as
   it does today, and the supersede path (rule 17: a reply nobody heard is not
   an interruption) is untouched.

**Where:** put the policy in a **shared pure module** (e.g.
`lib/voice/barge.ts`, timers injected so it is testable) and wire it into the
ElevenLabs adapter. **Rule 1:** check the realtime arm (`lib/voice/openai/`,
`echo.ts`, `response-gate.ts`): apply the same policy if that arm truncates on
`speech_started` client-side, or record in §B7 why it does not apply. Do not
touch `lib/audio/` (Tier 0). Duck with the adapter's own `agentBus` gain.

**Note what this changes:** a mid-line "Mm." stops being a user turn, so the
fast scorer no longer prices a backchannel as a dead end. That is a correction,
not a scoring change, and it is the only effect on scoring this part may have.
Check `lib/characterization/dating-arm.test.ts` still passes.

**Tests:** a 240 ms onset during her line → no truncation, no reply, her level
restored; a 600 ms onset → truncation exactly as today; an onset that
transcribes empty → no truncation; an onset while she is silent → his turn
immediately, as today; `incidents` and `agent.unheard` still report correctly.

## B4 · An empty or slow clause must not hold her reply — only if B1 shows it

If B1's per-turn data (or a reproduced test) shows replies waiting on another
pending transcriber clause: release the reply when every newer clause has
settled and the older one is empty, or has been pending longer than a bounded
cutoff (about 2× the rep's median STT time, minimum 1.5 s). A late transcript
from the stale clause is still saved in spoken order but does not buy a second
reply. If B1 does not show it, **do not build this**; record that in §B7.

## B5 · Not now

- **Admission** (the `maySpend` database hop, ~0.4–0.6 s a turn in `sin1`): every
  rep on record is the owner's from Sri Lanka. Measure it on the first US rep
  via B1 before touching it, and rule 11 still holds whatever is decided.
- **Streaming her reply sentence by sentence** would save ~0.5–0.8 s but undoes
  the buffered turn (`HUMANNESS-PLAN` item 1, `capToBudget`). Not proposed.

## B6 · Verifying Part B

- Unit tests for B1–B4 as listed; the whole suite; `dating-arm.test.ts`
  unchanged.
- **A real rep is needed** for B2 and B3. The agent cannot speak, so ask
  Pabath to run one rep on the local build (`npm run dev`, `localhost:3000`) or
  a preview, then compare B1's per-turn timing for turn one against the audit
  table: target is a first reply within ~1 s of the later ones, and no cut on a
  short "Mm.". Do not push to `elevenlabs-pipeline` to get a test environment:
  that is production.

## B7 · What landed (Part B)

Built 4 October 2026 on branch `rep-fixes` (commits `fd9d6f8` B1, `2e0fc59` B2,
`01b01c6` B3). **Not pushed, not deployed.** `PIPELINE.md` § "Rep fixes, Part B"
is the technical record.

**B1 — per-turn timing. Landed as written.** `TurnTimeline` in
`lib/voice/elevenlabs/telemetry.ts`, first forty replies, in
`sessions.pipeline_telemetry.turns` (jsonb, optional, no migration); the
aggregates keep their shape. Each entry: VAD stop → STT final (`sttMs`), the part
of it a final sat behind an earlier clause (`orderWaitMs`), final → request
(`heldMs`) and how many later clauses it waited on (`heldBy`), request → first
byte, first byte → first sound, the onset beat, the server's own stage timings,
prompt and cached tokens, and the outcome (`heard | barged | superseded |
unheard | silent | failed | ended`). Clauses since the previous reply, empty ones
counted separately, fold into the next entry — which is how "he had to speak
twice" will read. No transcript text.

**B2 — the countdown warm-up. Landed, with one deviation.**
`lib/voice/elevenlabs/warm.ts`, a `{ warm: true }` request to the turn route
fired right after the mint, never awaited, every failure swallowed. Same
contract by the same code path (`handleLlmRequest`, same overlay, mood seed and
calibration — a test pins the two leading system messages equal to turn one's),
a one-token cap, three characters of TTS on the turn's model and endpoint, 204.
`requireUser`, then the session is checked as this user's live one for this
character, then `maySpend` on the turn bucket. Priced at ~$0.0012 for a
2,700-token contract (not yet measured on a real rep); the bound is under a
cent. Advertised by the mint (`turn.warm`),
switched off by `NERVE_WARM_UP=off`.
- **Deviation: no `voice_operations` reservation.** The plan said "maySpend with
  its own small reservation". `voice_session_refund_empty` and
  `voice_session_close` refuse a refund once any non-`stt` operation exists, so a
  reserved warm-up would make every rep that dies in setup, or never hears him,
  non-refundable — the user paying for our cold start. It is written as a
  standalone `usage_ledger` row (kind `warm`) from the providers' receipts, or
  from `warmBound` when a receipt is missing (rule 18). It counts against the
  daily cap, not the session's envelope. If the owner wants it inside the
  envelope, the clean route is a migration adding a `warm` kind that the two
  refund checks ignore — production SQL, so not done without sign-off.

**B3 — barge-in confirmation. Landed as written, with one design change found
by its own test.** `lib/voice/barge.ts` (`BargeGate`, pure, clock-free), wired
into the ElevenLabs adapter. While she is audible (the `playedText` test the
truncation uses): duck −10 dB over 40 ms; past `BARGE_CONFIRM_MS` (350) a loud
frame confirms and today's path runs unchanged; quiet that outlasts a word gap
(`BARGE_TAIL_MS`, 150) is a backchannel — she is restored and finishes, and the
sound's audio is discarded uncommitted (`discardSpeech`, which keeps every
clause already committed), so it is not a turn, buys no reply and is never
priced as a dead end. Counted in `pipeline_telemetry.backchannels`. The slowest
verdict is ~500 ms.
- **The design change.** The first draft confirmed when there had been a loud
  frame within 150 ms of the deadline. The unit test for the 3 October "Mm."
  (240 ms) failed against it — that sound ends 110 ms before the deadline and
  would still have cut her. Past the deadline it is now a loud frame that
  confirms, and quiet longer than a word gap that releases.
- **"An onset that transcribes empty → no truncation"** holds for a short onset
  (it is never committed, so never transcribed). A phantom that holds speech
  energy past 350 ms is still a barge-in, decided on energy — waiting for the
  transcriber to say "empty" would put STT latency on every real interruption.
- **Rule 1, the realtime arm.** It never cuts her client-side on
  `speech_started`; the server decides (`turn_detection.interrupt_response`)
  and the client only truncates her memory afterwards. There is no client cut to
  confirm, so the gate does not apply there.
- `lib/audio/` was not touched; the duck uses the adapter's own `agentBus`.
  The adapter test helper for an interruption now holds speech for 600 ms,
  because a 150 ms burst under an audible line is, by design, no longer one.

**B4 — not built.** It is conditional on B1's data showing replies held by
another pending clause, and no rep has run with B1 yet. When one has, read
`turns[].heldMs`, `heldBy` and `orderWaitMs` on the slow replies: a large
`heldMs` with `heldBy > 0`, or a large `orderWaitMs`, is the case B4 fixes;
nothing there means the 8.4 s silence of 3 October was something else (the B3
cut that preceded it is the other candidate, and B3 has now removed it).

**Owed by hand — one real rep, on the branch, by the owner.**
`npm run dev` in the worktree (`.claude/worktrees/rep-fixes`), one rep on
`localhost:3000`. Then read back, for that session:
`pipeline_telemetry->'turns'->0` against the audit's table (target: turn one
within ~1 s of the later ones; `cachedInputTokens > 0` on turn one — if it is 0
the prefix does not match, and that must be found before anything else), the
`voice_operations.metadata` of turn one (`llmFirstTokenMs`, `ttsFirstByteMs`
near 100 ms), the `usage_ledger` row of kind `warm`, and — saying "Mm." under
one of her lines — `backchannels: 1` with her line intact in the transcript.
**Before/after first-reply timing: the "after" does not exist yet**; it is this
rep.

### B7.1 · The first real rep on the branch — `b0b7736e…`, Cass, 3 Oct 19:12 UTC

Run by the owner on the local dev server (`functionRegion: local`, Sri Lanka),
twelve replies, won at 75.8. One rep: read it as a measurement, not a verdict.

**First reply: 6.09 s from the end of his line to her first sound, against a
median of 3.28 s for the other eleven** (3.05–4.70). The audit's "before" was
4–17 s, median ~6 s, so this one rep sits inside the old range and the target
(within ~1 s of the later replies) was **not met**. B1 attributes the 2.8 s:

| | Turn one | Later (typical) | Extra |
|---|---|---|---|
| VAD stop → STT final | 1,573 ms | ~1,390 | +0.2 s |
| TTS first byte (server) | **1,860 ms** | ~350 | **+1.5 s** |
| LLM first token (server) | 1,233 ms | ~710 | +0.5 s |
| Client/network (request → first byte, minus the server's request → first audio) | 606 ms | ~100 | +0.5 s |
| Auth (`authMs`) | 318 ms | 0–1 | +0.3 s |
| Held on other clauses, onset beat | 5 ms, 0 | 1–3 ms, 0 | — |

- **The warm-up ran and cost what it should**: ledger row `warm`, 0.063¢,
  LLM 2,638 in / 1 out, 3 TTS characters, `ttsFirstByteMs` 556 in
  `asia-southeast1`, 1,057 ms, five seconds before turn one.
- **The voice was still cold on turn one** (1,860 ms first byte), five seconds
  after the warm-up had been answered in 556 ms. Turn six spiked to 1,422 ms
  mid-rep too, so part of this is ElevenLabs variance rather than coldness —
  one rep cannot separate the two.
- **The prompt cache is confounded.** Turn one had 1,920 of 2,706 tokens cached,
  where the audit saw 0 on every first turn — but the warm-up's own request
  already found 1,920 cached, and the audition runs for Part A were driving
  Cass's prompt (which shares that prefix) between ~18:50 and 19:30 UTC. So the
  hit cannot be credited to the warm-up, and the warm-up did not extend it to
  the full contract (turn one got no more than the warm-up did).
- **Auth was not saved either**: turn one paid 318 ms although the warm-up had
  authenticated on the same server 5 s earlier, and turns four and eleven
  missed inside the 60 s TTL. Something rotates the cache key or the instance on
  the dev server; on production every edge instance has its own map anyway.

**B3 was not exercised.** His "Hmm." (56.9–57.3 s) came 1.1 s after her line had
ended (55.8 s), so it was correctly his turn — answered "Yeah." and priced as a
dead end, as any turn of his is. `bargeIns: 0`, `backchannels: 0`, no line of
hers was cut. Still owed: a "Mm." while she is audible.

**B4: the data says no.** On all twelve replies `heldMs` was 1–5 ms, `heldBy` 0,
`orderWaitMs` 0 and `emptyClauses` 0 — no reply waited on another clause, and
he never had to speak twice. B4 stays unbuilt; one rep is thin evidence, and the
3 October stall came after a cut that B3 now removes.

**Part A, live.** "I get what you mean, you have a great ass, by the way." at
71.1 → `forward · welcome` (+0.94), slow judge +1.51 with the overreach rule
standing down; she said "Well, Pabath, you've got sharp eyes for something
other than paintings." — a flirt-back, in the top zone, as specified.

**Seen, not from this branch:** "Cass. You're Pabath, right?" — she used his
name before he gave it (the account name reaches her through the persona
overlay); and "Yeah, I remembered because I'm still trying to get through these
last rooms" is a non sequitur.

---

# C · Order of work

Each step is its own commit, with the suite green, on one branch.

1. **B1** per-turn timing (no behaviour change).
2. **B2** warm-up (no change to what she says).
3. **Part A** forward remarks, including its audition (§5.3).
4. **B3** barge-in confirmation.
5. **B4**, only if B1's data calls for it.
6. Docs (§6 of Part A, plus `PIPELINE.md` for B1–B4 and the status line at the
   top of `REP-LATENCY-AUDIT-2026-10-03.md`), then report and wait for the owner.

---

# D · The prompt for the implementing agent

Paste this into a fresh session in `~/Documents/nerve`:

```
You're working in the Nerve repo at ~/Documents/nerve (Next.js 15 + Supabase,
deployed on Vercel from the `elevenlabs-pipeline` branch — a push to that branch
IS a production deploy, and live Meta ads are running).

Start by reading CLAUDE.md in full (especially rules 1, 2, 3, 5, 10, 11, 12,
13, 16, 17, 18 and 19), then docs/README.md, then
docs/REP-FIXES-PLAN-2026-10-03.md and docs/REP-LATENCY-AUDIT-2026-10-03.md.
The plan is your task and your spec. It was signed off by the product owner
(Pabath) on 3 October 2026. Build it exactly as written, in the order of its
section C; where you must deviate, record why in §7 (Part A) or §B7 (Part B).

Part A, in one line: a forward remark like "I'm more interested in your ass" is
flirting when her warmth is 65+ (she flirts back — a comeback, a tease, or
takes it as a compliment), a little too fast at 45–65 (a small smile, a little
flirty, "slow down"), and creepy below 45 (warmth drops hard). Repeats land one
zone lower; a second creepy remark makes her leave. Every character reacts in
her own way through her own flirtiness dial. PG-13 still holds.

Part B, in one line: per-turn timing first, then warm the prompt cache, the
voice and the turn route during the 3·2·1 countdown, then stop short sounds
("Mm.", echoes) from cutting her off by confirming a barge-in only after
~350 ms of continued speech — and fix replies waiting on an empty transcriber
clause only if the new timing data shows it.

Hard rules:
- Part A's logic goes in a NEW file, lib/warmth/forward.ts, wired in with the
  smallest edits to lib/warmth/session.ts, engine.ts and triggers.ts. Do NOT
  edit fast.ts, steering.ts, bands.ts, the persona files, lib/grade/,
  lib/safety/ or lib/audio/.
- lib/characterization/dating-arm.test.ts must pass unchanged. If a digest
  moves, stop and find out why; only re-baseline if it is this change, with
  the reason written inline.
- Every line of direction she is given is authored in the repo and tested
  (rule 10), and her reaction is a one-shot direction (rule 5).
- The warm-up goes through maySpend (rule 11), is bounded (rule 18), never
  delays or fails a rep, and is never a turn.
- The barge-in policy is shared and considered for both voice adapters (rule 1),
  and a reply nobody heard is still never an interruption (rule 17).
- Interview and texting are out of scope.

Verify before saying done: npm run typecheck, npm run lint, npm test,
npm run build:check (the owner has an untracked higgsfield-lab/ folder that
breaks typecheck/build — it is not in git; check your branch in a clean
worktree). Run Part A's audition (§5.3; it spends a few cents — approved) for
tess, nadia, maya and robin. For Part B, ask Pabath to run one real rep on your
local build and read the per-turn timing from sessions.pipeline_telemetry.
Update the docs listed in section C.

Work on a new branch (e.g. `rep-fixes`), one commit per step. Do NOT push,
merge or deploy. When done, report to Pabath: what changed, test results, the
audition table (what each character said at low / mid / high warmth and on a
repeat), the before/after first-reply timing, anything you deviated on — and
wait for his OK.
```

**The `/goal` line:**

```
/goal Implement docs/REP-FIXES-PLAN-2026-10-03.md on a new branch `rep-fixes` in the order of its section C — per-turn timing, the countdown warm-up, forward remarks (flirt 65+, too fast 45–65, creepy below 45, repeats one zone lower, each character through her own flirtiness dial, PG-13 kept), barge-in confirmation (~350 ms, backchannels are not turns), and the stalled-clause fix only if the timing data shows it — with every CLAUDE.md rule respected, dating-arm.test.ts passing unchanged, typecheck/lint/tests/build:check green in a clean worktree, the four-character audition recorded in §7, the docs in section C updated, nothing pushed or deployed, and a report to Pabath that ends by waiting for his OK.
```
