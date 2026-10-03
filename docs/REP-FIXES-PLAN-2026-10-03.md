# Rep fixes — forward remarks, latency and cut-offs (3 October 2026)

> **Status: plan, signed off by the owner on 3 October 2026. Nothing built yet.**
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

*(To be filled in by whoever builds it.)*

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

*(To be filled in by whoever builds it.)*

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
