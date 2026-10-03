# Forward remarks — warmth decides whether it was flirting or creepy

> **Status: plan, signed off by the owner on 3 October 2026. Nothing built yet.**
> This is a deliberate change to the dating arm (`CLAUDE.md` rule 19). It is
> allowed to change how she reacts and how warmth moves on one class of line;
> it is not allowed to change anything else she does.

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

## 7 · What landed

*(To be filled in by whoever builds it.)*
