  What's actually wrong

  I pulled every stored dating turn (1,274 agent lines, 586 timed replies, 487 turn operations from the last 7 days) and measured it rather than
  reasoning about it. Three root causes, and one of them reframes your "don't increase the lag" constraint entirely.

  1. She is never inarticulate — and that is the whole tell

  ┌──────────────────────────────────────────────────┬───────┬───────┐
  │         Signal in 1,274 real agent turns         │ Count │ Rate  │
  ├──────────────────────────────────────────────────┼───────┼───────┤
  │ Disfluency (um, uh, hm, er)                      │     6 │  0.5% │
  ├──────────────────────────────────────────────────┼───────┼───────┤
  │ Self-repair (sorry, wait, no, I mean)            │     5 │  0.4% │
  ├──────────────────────────────────────────────────┼───────┼───────┤
  │ Trailing off (…)                                 │     8 │  0.6% │
  ├──────────────────────────────────────────────────┼───────┼───────┤
  │ Asked him to repeat something (what?, say again) │     1 │ 0.08% │
  ├──────────────────────────────────────────────────┼───────┼───────┤
  │ Bare answer (Yeah. / No. alone)                  │     3 │ 0.24% │
  ├──────────────────────────────────────────────────┼───────┼───────┤
  │ Contains a comma                                 │   807 │   63% │
  ├──────────────────────────────────────────────────┼───────┼───────┤
  │ Two or more sentences                            │   393 │   31% │
  ├──────────────────────────────────────────────────┼───────┼───────┤
  │ The [short beat]. [then more] template           │   373 │   29% │
  ├──────────────────────────────────────────────────┼───────┼───────┤
  │ Em-dashes, which the contract forbids outright   │    42 │  3.3% │
  └──────────────────────────────────────────────────┴───────┴───────┘

  Over three minutes, in a noisy café, against a nervous user the STT mangles into "Bro, cords taste like wet cardboard" — she asked "what?" once
  in 1,274 turns. Every other turn was a fluent, complete, well-formed utterance.

  Read her actual lines and the shape jumps out:

  ▎ "Machines hum, people pass, and I get a break from my usual noise." — a tricolon
  ▎ "More crime than true, but close enough to satisfy." — an epigram
  ▎ "Neither is milk, really. Just a name for a liquid." — a witticism
  ▎ "Weird characters usually have stories no one believes, huh." — an aphorism

  The caps are working (mean 7.9 words). The problem was never length. Her wit rate is 100%. Real people are boring most of the time, mishear
  things, answer the wrong question, and say "yeah" and nothing else. She never does any of it.

  Two mechanisms cause this, and both are in the code:

  - The compiled prompt is ~40 prohibitions and zero demonstrations. compileInstructions assembles the contract, five banded prose blocks, exit
    conditions, a clarification rule, and 13 BANNED_REGISTER bullets — and there is not one example line of dialogue anywhere in it. A model given
    a tight budget, forty rules about how not to sound, and no example of how to sound writes the most defensible sentence available: a balanced,
    finished epigram. Your own bands.ts header already spotted this ("thirty-six prohibitions and no demonstrations push a writer towards hedging")
    and then only fixed the length half.
  - The word cap makes disfluency unaffordable. At a six-word ceiling, "Um, I dunno. Work stuff." spends a third of the budget on nothing. The
    model correctly optimises for informative density — and informative density under a hard budget is the epigram. The cap and the register are
    fighting, and nobody told the cap that filler is the point.

  2. Timing is dead, so "reduce the lag" and "make her human" are the same task

  This is the finding that changes the shape of the work.

  ┌─────────────────────────────────────┬─────────────────┐
  │     Measured, 586 real replies      │                 │
  ├─────────────────────────────────────┼─────────────────┤
  │ Median gap, user stops → she starts │          3.40 s │
  ├─────────────────────────────────────┼─────────────────┤
  │ p90                                 │          4.58 s │
  ├─────────────────────────────────────┼─────────────────┤
  │ Replies over 3 s                    │ 390 / 586 (67%) │
  ├─────────────────────────────────────┼─────────────────┤
  │ Replies under 1 s                   │       100 (17%) │
  └─────────────────────────────────────┴─────────────────┘

  lib/warmth/timing.ts is built on Stivers et al. (2009): the universal modal turn gap is ~200 ms, and anything past ~700 ms is decoded
  cross-culturally as a dispreferred response — I don't want to. Its table intends 120–280 ms at INVESTED and 500–900 ms at GUARDED.

  Actual median is 3,400 ms. remainingResponseDelayMs returns 0 on essentially every turn, because the pipeline has already overspent the entire
  budget before audio is ready. The fifth layer of the character does not exist in production. Every persona, at every warmth, on every rung,
  sounds equally reluctant — and the listener reads that as she doesn't want to talk to you, on every single turn, no matter how well the rep is
  going.

  So latency is not a constraint on this work. It is the largest single humanness item in it. Where the time goes, measured over 487 turns:

  ┌────────────────────────────────────────────────────────┬───────────┬──────────┐
  │                         Stage                          │    p50    │   p90    │
  ├────────────────────────────────────────────────────────┼───────────┼──────────┤
  │ Auth (requireUser)                                     │    307 ms │   443 ms │
  ├────────────────────────────────────────────────────────┼───────────┼──────────┤
  │ Admission (maySpend + reservation)                     │    388 ms │   959 ms │
  ├────────────────────────────────────────────────────────┼───────────┼──────────┤
  │ → serial gatekeeping before one LLM token is requested │   ~695 ms │   ~1.4 s │
  ├────────────────────────────────────────────────────────┼───────────┼──────────┤
  │ LLM first token                                        │    752 ms │        — │
  ├────────────────────────────────────────────────────────┼───────────┼──────────┤
  │ LLM complete                                           │    945 ms │ 1,380 ms │
  ├────────────────────────────────────────────────────────┼───────────┼──────────┤
  │ TTS first byte (eleven_v3_conversational)              │    466 ms │        — │
  ├────────────────────────────────────────────────────────┼───────────┼──────────┤
  │ Server request → first audio                           │  2,199 ms │ 3,057 ms │
  ├────────────────────────────────────────────────────────┼───────────┼──────────┤
  │ Client-side VAD hangover + transcription (audit)       │ ~1,400 ms │        — │
  └────────────────────────────────────────────────────────┴───────────┴──────────┘

  ~695 ms of every reply is spent proving who the user is and that they may spend money, strictly before generation starts. That is nearly a full
  second of "dispreferred response" bought for zero conversational value — and it is more than the entire budget I'd want to spend making her sound
  human.

  3. The meter reads shape, not meaning — and leaving is not a state

  Confirmed against the four reps in your audit:

  - Contempt earns warmth. "You're making me miserable" scored +0.67 fast and +1.61 slow, because she'd said "miserable" and the callback reward
    bypasses the hostility guard in fast.ts. "Why are you still here?" was net +2.25. Warmth climbed 27 → 48 during sustained abuse.
  - Real short questions are punished. deadEnd is "under 3 words and not the opener", so "What's up?" and "How come?" — the two best things a
    nervous beginner does — cost him 6 points each, and simultaneously scored as open questions. Same turn, both.
  - She cannot leave. After "Just fuck off" she said "Right. You've made your point. Enjoy your Sunday." — and then answered two more turns,
    because only a [[END_SCENE]] sentinel ends a rep, while wantClauses was concurrently telling her "You are not going yet." Nadia said goodbye
    and then asked a fresh question, because handOverToClosing is consumed once and ordinary steering resumes.

  4. Three leaks that each read as "this is a machine"

  - She knows his name before he gives it. Timestamped, from your Tess rep on 9 Sept: at t=77.4 s she said "…catch me at the book club, John." At
    t=84.0 s he said "My name is John." compileInstructions injects He is called John. You do not know that yet. from profiles.display_name — you
    cannot hand a model a fact and forbid it from knowing the fact. She then used it 5 times in 15 turns against a rule saying "once at most."
  - The cap silently overshoots. 67 turns exceeded their word cap; only 17 were flagged capped: true. capToBudget appends a sentence and then
    checks the total, so a 6-word cap accepts an 8-word reply and reports compliance.
  - 42 em-dashes against a rule that says "Never use em-dashes" — which is a TTS artefact, an audible clipped pause. Prohibitions buried in a wall
    of prohibitions don't stick.

  ---

  The plan

  Seven workstreams, ordered by dependency then by impact per unit of risk.

  W0 — Re-baseline the pin, deliberately (first, blocking)

  CLAUDE.md rule 19 says the dating arm is finished and must not change, and lib/characterization/dating-arm.test.ts enforces it with 52 assertions
  and prompt digests. You are overriding that premise, which is your call to make — but the baseline must be re-taken deliberately, with the diff
  read line by line and recorded in PERSONA-AUDIT.md, never deleted or blanket-updated. I'll do this as its own commit so every subsequent
  behaviour change shows up as a reviewable digest move.

  W1 — Give back ~700–900 ms (funds everything else)

  ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬───────────┐
  │                                                             Change                                                             │  Saving   │
  ├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ Verify the JWT signature locally per turn; hit Supabase once at session open, not once per turn                                │ ~250–300  │
  │                                                                                                                                │        ms │
  ├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ Start the LLM stream concurrently with the reservation, and refuse before audio rather than before generation — maySpend still │ ~350–400  │
  │  gates every paid turn, nothing is weakened, the check simply stops being a serial prefix                                      │        ms │
  ├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
  │ Tighten VAD hangover / start transcription on partials                                                                         │ ~200–400  │
  │                                                                                                                                │        ms │
  └────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴───────────┘

  Nothing here touches auth strength or spend enforcement — maySpend still runs on every turn and still refuses; it just stops being the thing the
  user waits behind. Target: median end-of-speech → audio from ~3.4 s to ~2.2–2.5 s, which is where the personality pause becomes expressible at
  all and INVESTED can finally sound different from CLOSED.

  W2 — Make her inarticulate (the core of "sounds human")

  - Authored few-shot exchanges per persona. Rule 10 permits authored content in the repo — this is the single highest-leverage change and it costs
    zero latency, because the contract is the cached prompt prefix. 6–10 hand-written in-character exchanges per persona, showing the register the
    forty rules are currently gesturing at: fragments, "yeah", a misheard word, a flat answer, a dropped topic.
  - Put a filler budget inside the cap. spokenWordCount shouldn't charge her for "um" — disfluency has to be free, or the arithmetic will keep
    deleting it.
  - Fix capToBudget: keep the first sentence whole, then refuse any subsequent sentence that would breach the cap, rather than admitting it and
    stopping after.
  - Trim the prohibition wall. Move the em-dash rule to a post-generation sanitiser where it's enforced rather than requested, and cut the
    redundant bullets so the remaining rules have weight.
  - Lower PIPELINE_LLM_TEMPERATURE is not the answer here and I won't reach for it — temperature 0.9 isn't producing the epigrams, the instruction
    density is.

  W3 — Make the meter read meaning, not shape

  - One guard so no mechanical reward can ever pay on a hostile turn, callbacks included — closes the "insult her with a question mark" farm.
  - Replace the <3 words dead-end test with a pure, synchronous lexical classification: greeting / acknowledgement / valid short answer / short
    question / dismissal / non-participation. No model call, no latency.
  - Give the slow judge the recent exchange run and the persona's authored likes/dislikes (it's off the hot path — free), and let a slow verdict
    retract a wrong fast reward instead of only adding to it.

  W4 — Leaving becomes a committed state

  Once she's decided to go, she goes: a state that outranks the want clause, the repair invitation and the clock's closing offer, ends the scene in
  code rather than by asking the model for a sentinel, and cannot be undone by the next turn's steering. Explicit dismissal ends it. The
  three-minute format, the 30-second wind-down, the arm-at-65 / keep-at-55 thresholds and "outcome is never scored" all stay exactly as they are —
  a rep that ends in rejection can still score 92.

  W5 — Close the leaks

  Stop injecting his name until he says it (compute it from the transcript, don't hand it over and ask her to forget); enforce the "once at most"
  rationing in code; sanitise em-dashes at the transcript seam.

  W6 — Refuse grades that shouldn't exist (from §7 of your audit)

  A duration/exchange gate so an 18-second hello doesn't score 45 and a session with zero agent turns doesn't grade an infrastructure failure as
  the user's performance; minimum sample sizes for rate metrics so one "Ah" isn't 26 fillers/minute. Hand-authored refusal copy, not a placeholder.

  Latency budget for the whole plan

  ┌──────────────────────────────────────────────┬──────────────────┐
  │                                              │        Δ         │
  ├──────────────────────────────────────────────┼──────────────────┤
  │ W1 savings                                   │  −700 to −900 ms │
  ├──────────────────────────────────────────────┼──────────────────┤
  │ W2 few-shot (cached prefix, first turn only) │     +0 to +40 ms │
  ├──────────────────────────────────────────────┼──────────────────┤
  │ W3 lexical classification (pure functions)   │            +0 ms │
  ├──────────────────────────────────────────────┼──────────────────┤
  │ W4, W5, W6                                   │            +0 ms │
  ├──────────────────────────────────────────────┼──────────────────┤
  │ Net                                          │ ~−700 to −900 ms │
  └──────────────────────────────────────────────┴──────────────────┘

  Every workstream except W1 is latency-neutral by construction. The plan is strictly faster than today.

  ---
---

# What was built — 10 September 2026

All seven workstreams shipped. Nine commits on `elevenlabs-pipeline`.
**2,100 tests pass** (was 2,021), typecheck, lint, production build, and
`db:rep` / `db:verify` / `db:spend` / `db:field` / `db:credits` / `db:billing`
all green.

## W0 · The pin, re-baselined deliberately

Every compiled prompt dumped before and after and **diffed line by line** before
a single digest was retaken. Five reasons recorded inline in
`dating-arm.test.ts`. `tts` and `turn` came through **byte-identical** on all
nine characters under both environments — nothing about her voice, her
stability or her turn-taking moved. `CLAUDE.md` rule 19 rewritten around the
mechanism rather than the premise; recorded as `LAUNCH-GAP.md` D20.

## W1 · Latency — ~250-270ms, not the 700-900 projected

`authMs` p50 was 269ms **on every turn**, because functions run in `sin1` and
Supabase is in `us-east-1`. Fifteen turns a rep, so four seconds of every rep
spent re-establishing that a session valid twelve seconds ago is still valid.
Verification is cached for 60s on success only; the turn route runs auth and
body-parse concurrently.

**The projected 700-900ms assumed overlapping admission with generation, and
that is refused here** — it would spend on the LLM before `maySpend` admitted
the turn (rule 11). The remaining 389ms is winnable by reserving turn N+1 during
turn N's playback, which is a real change to spend correctness and is not being
smuggled in beside a persona retune. Both remaining options are costed in
`PERSONA-AUDIT.md` §14.7.

## W2 · Register — the one that took four auditions

The measurement that reframed everything: across 1,274 real agent turns, **six**
disfluencies, three bare answers, and **one** request to repeat something. Median
eight words — so the caps were working and length was never the defect. She was
never inarticulate.

Four auditions, each of which changed the design:

1. Examples alone → **zero** disfluencies. Being read, then overruled.
2. Block moved last + hesitation named → better, still none.
3. Band directive: **"One sentence, never two" is a spec for a WELL-FORMED
   sentence.** `bands.ts`'s own header made that argument and applied it only to
   the cold bands. Now "Say it how it comes out, not tidily" — **word counts
   byte for byte unchanged.**
4. Shipping ceilings → *"Uh, some one with robots talking in math or whatever."*
   and *"She's into history mostly. And, um, biographies sometimes."*

Also: `capToBudget` asks before spending (67 of 487 turns had exceeded their
cap, 17 were reported), `maxSentences` enforced, `sanitiseForSpeech` for the
em-dash rule, and **the name leak** — she used his name 6.7 seconds before he
gave it.

## W3-W6

The meter reads meaning (contempt now costs instead of paying — replaying the
real rep: peak 45, final 17, was peak 48.6 / final 39.6). `turn-kind.ts`
classifies instead of counting words. `leaving.ts` makes the exit a monotonic
state. The judge gets the run, her authored preferences and the terminal
exchange. `gradeEligibility` refuses the 18-second hello that scored 45 and the
zero-agent-turn session that scored 36.

## What is NOT done, and needs you

1. **None of it has been heard out loud.** Four text auditions is the prompt,
   not the voice. `PERSONA-AUDIT.md` §14.6 lists the five claims that need a
   microphone, ordered by risk.
2. **Tess is truncated on 11 of 16 turns.** Nothing is cut mid-sentence and
   several of the best lines ARE truncations — but only a listening pass can
   tell a clean stop from a clipped one. §14.5a.
3. **The timing layer is still inoperative.** Median gap 3.40s against a
   200-900ms intent. ~250ms came back; the rest is a region decision.
