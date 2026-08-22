<!--
NERVE — BUILD SPECIFICATION v1.0
Working document for implementation. Suggested use with Claude Code:
  - keep this file at the repo root as NERVE-SPEC.md
  - reference it from CLAUDE.md so it loads as standing context
  - build in the milestone order in section 17; do not skip M0
-->

# Nerve — Build Specification

> A training gym for the conversations you avoid. Live voice reps against AI people who can lose interest, get distracted, and say no — paired with real-world rejection challenges and a scorecard that measures how you played, not whether you won.

**Owner Pabath** · **Date 21 Aug 2026** · **Status Spec — pre-build** · **Stack Vercel · Supabase · OpenAI Realtime**

`34 screens` · `38 modals` · `69 mvp features` · `8 personas` · `12 weeks to beta`

---

## 01. The Product

**Nerve is a conversation gym.** You do timed voice reps against AI characters who behave like real people — some warm, some distracted, some who end the conversation on you. Afterwards you get a scorecard built from what you actually did: how much you talked, how many real questions you asked, whether you read the signals, whether you left with your dignity intact. Then the app sends you into the real world with a graded challenge and asks you to log what happened.

Dating is the headline scenario because it is the one people feel most acutely. It is not the boundary of the product. The same engine trains interviews, negotiations, networking and hard conversations at work, and that ladder is what keeps a user past the point where they stop being scared of strangers.

### Positioning

Branded as training, not as dating. The word "rizz" appears nowhere. This is deliberate and it is load-bearing in three places: Meta and TikTok routinely kill dating-adjacent ad accounts, the App Store treats dating utilities harshly, and the press story for "AI rejection training" is enormously better than the press story for "AI flirting coach."

### Audience at launch

The persona roster, scenario copy and default difficulty curve are tuned for men aged 18–30 approaching women, because that is the sharpest wedge and the clearest pain. The brand, naming, visual system and product copy stay gender-neutral throughout, so widening the roster later is a content release rather than a rebrand. Character names in the roster skew deliberately unisex (Sam, Robin, Alex, Jules) for exactly this reason.

### What Nerve is not

- **Not a reply generator.** We never write your messages for you. Every competitor does the scary part on the user's behalf, which builds no skill and churns the moment the user gets a real date. Our entire differentiation is the opposite promise.
- **Not a companion app.** Characters are training equipment. They do not remember you fondly, they are not available for open-ended chat, and sessions are hard-capped at eight minutes.
- **Not therapy.** No clinical claims anywhere in the product, marketing, or App Store copy. See §16.
- **Not adult content.** Sessions are hard-bounded at PG-13. This is a payment-processor survival requirement, not prudishness.

> **The one-line pitch**
>
> Everyone else built an app that talks to women for you. We built the gym where you learn to do it yourself — including learning that being turned down is survivable.

---

## 02. The Premium Mandate

The technical core of this app — browser connects to a voice model — is a weekend of work, and forty people have already shipped it badly. Perceived quality is therefore the entire moat. The following are not nice-to-haves; they are the specification, and a build that ships without them is a wrapper regardless of how good the prompt engineering is.

**Non-negotiable craft rules**

1. **No spinners, anywhere.** Every loading state is a skeleton that matches the shape of the content arriving. A spinner is an admission that we don't know what's coming.
2. **Ambient room tone under every session.** A coffee-shop scenario plays a low café bed; the bar scenario plays crowd murmur; the train platform has announcements. Mixed at −28dB under the voice via Web Audio. This is the single highest ratio of perceived production value to engineering cost in the entire product — roughly four hours of work that makes the app feel like it cost a million dollars.
3. **Real waveform, real amplitude.** The visualiser is driven by an actual AnalyserNode on both streams. Never a looping canned animation. Users can tell instantly and it destroys trust in everything else.
4. **Sound design as a system.** Session arm, countdown tick, session end, score reveal, level unlock, rejection logged. One coherent kit, all under 400ms, all mutable in one tap.
5. **Haptics on mobile** via the Vibration API: session start, mic capture confirm, score reveal, unlock. Silent on desktop, never on iOS Safari (unsupported) — degrade without comment.
6. **Staged score reveal.** The composite counts up over 900ms; sub-scores stagger in at 60ms intervals. Never dump the number instantly. This is the emotional peak of the session and it deserves choreography.
7. **Every number is tabular.** `font-variant-numeric: tabular-nums` on all data. Jittering digits read as amateur.
8. **Optimistic UI on every write.** Logging a rejection, rating anxiety, accepting a challenge — all land instantly and reconcile in the background.
9. **Full keyboard operation** with visible focus rings, plus `Space` to arm a session and `Esc` to end one.
10. **Honours `prefers-reduced-motion`** across the entire motion system, including the score reveal.
11. **Never blame the user in an error.** "We lost the connection — your rep is saved up to 2:14. Resume?" not "An error occurred."
12. **Copy is written, not generated.** Every empty state, every unlock line, every rejection milestone is hand-authored with a point of view. Empty states are where cheap apps expose themselves.

> **The tell**
>
> Users cannot evaluate model quality, but they can evaluate whether the mic button feels good, whether the room sounds real, and whether the score animation lands. Judge every build decision against: *would this survive a side-by-side demo against a $40M-funded competitor?*

---

## 03. Visual System — Arena

The chosen direction is athletic performance. Nerve should feel like a training log kept by someone serious — closer to a strength app or a lap timer than to a wellness product. Data is the hero. The interface is dark, dense, high-contrast and quiet, and it spends all of its boldness in exactly one place: the volt accent, which is reserved for the live state and for the number that matters.

The app commits to a single dark theme. There is no light mode. This is a product used in the evening, before going out, and the dark ground is part of the identity rather than a preference.

### Palette

| Token | Hex |
|---|---|
| Ground | `#0B0C0A` |
| Surface | `#131511` |
| Surface 2 | `#191C16` |
| Line | `#242820` |
| Volt | `#C4F82A` |
| Cool | `#5AA9FF` |
| Amber | `#FFB020` |
| Red | `#FF4D3D` |
| Ink | `#EDEFE8` |
| Ink 2 | `#9DA396` |

The neutrals carry a deliberate green bias rather than sitting on pure grey — the ground is `#0B0C0A`, not `#000000`. This reads as chosen rather than defaulted, and it lets the volt accent sit in the same family as the surfaces instead of vibrating against them.

**Colour discipline**

- **Volt** is reserved for: the live-session state, the primary action on any screen, the composite score, and the current position in any progression. Never decorative. If volt appears twice on one screen, one of them is wrong.
- **Cool blue** is the second data series only — predicted anxiety against actual, this week against last. It is never an action colour.
- **Amber and red** are semantic only: amber for approaching a limit or a caution, red for a hard stop or a destructive action. Neither ever appears as branding.

### Typography

| Role | Face | Setting | Used for |
|---|---|---|---|
| Display | Barlow Condensed 700 | Uppercase, tight leading, tracking −0.01em | Screen titles, big numbers, score reveal, persona names |
| Body | IBM Plex Sans 400/500/600 | 16px / 1.65, max 68ch | All running text, briefings, technique content |
| Data | IBM Plex Mono 400/500 | 11px, tracking .12em, uppercase for labels | Metric labels, timers, transcript timestamps, tokens |

Condensed display against a technical grotesque is what gives Arena its jersey-and-stopwatch character. The pairing is doing deliberate work: Barlow Condensed compresses the big numbers so a score can be enormous without dominating the layout, and Plex Mono makes every label read as an instrument reading rather than a caption.

### Component language

- **Sharp corners.** Border radius is 2px maximum across the entire system. Rounded cards are the visual signature of every app we are trying not to resemble.
- **Hairline separation, not shadow.** Depth comes from 1px lines and surface steps. No drop shadows, no glow, no glass.
- **Full-bleed data blocks.** Tables and charts break the text column and run edge to edge. Reading width applies to prose only.
- **State encoded in form, not just colour.** Locked levels are struck through and desaturated; the active level carries a left rail; completed reps carry a filled marker.

### Motion

Sparse and fast. Nothing eases longer than 240ms except the score reveal, which is the one orchestrated moment in the product. Page transitions are a 120ms opacity step, not a slide. The mic orb breathes at 0.4Hz when idle and tracks real amplitude when live. Everything is suppressed under `prefers-reduced-motion`, score reveal included — it becomes an instant render.

---

## 04. Stack & Architecture

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js 15, App Router | React Server Components for all read paths; client components only around the WebRTC session |
| Host | Vercel | Edge functions for token minting; region set to the closest available to South Asia |
| Database | Supabase Postgres | Row Level Security on every table without exception |
| Auth | Supabase Auth | Email OTP + Google. No password fields anywhere |
| Storage | Supabase Storage | Session audio, private bucket, signed URLs, 30-day auto-purge |
| Voice | OpenAI Realtime — `gpt-realtime-mini` over WebRTC | Shipped behind a `VoiceProvider` interface with an ElevenLabs adapter stubbed from day one. See the abstraction spec below |
| Scoring | OpenAI text model, structured outputs | Runs post-session on the transcript, not in the hot path |
| Payments | Merchant of Record — Creem (primary) or Polar | Stripe does not operate in Sri Lanka. See §14. Both support Sri Lankan sellers with local bank payout |
| Analytics | PostHog | Session funnels, week-4 retention cohorts, feature flags |
| Errors | Sentry | Session replay disabled on the live-session route for privacy |

### Why OpenAI Realtime for the voice

Decided. Three reasons, in order of weight.

- **Architecture.** The WebRTC path lets the browser hold a peer connection directly with the model using a short-lived token minted server-side. There is no media server to run, no audio relayed through our infrastructure, and no WebSocket proxy adding a hop. That is the lowest-latency architecture available to us and it is also the cheapest to operate, because audio never touches a machine we pay for.
- **Cost.** Measured production figures for `gpt-realtime-mini` land at roughly $0.05–0.08 per minute for typical conversational use. ElevenLabs Agents is $0.08 per minute *plus* LLM costs billed separately on top, which lands materially higher for the same session.
- **Consolidation.** Realtime voice, the scoring model and the moderation endpoint are one vendor, one SDK, one bill, one auth story. At this team size that matters more than a marginal quality difference.

**Rejected, with reasons**

- **ElevenLabs Agents** — live candidate, not rejected. See the comparison below: the cost gap is small, and on voice realism it is the presumptive winner. Settled by blind test in M0.
- **Assembled STT → LLM → TTS pipeline** — cheapest per token on paper, but stacks 400–900ms of pipeline latency. At those numbers the conversation stops feeling like a conversation, which is the only thing this product sells.
- **Gemini Live** — competitive latency, but a second vendor for no gain given the credits already sitting on the OpenAI account.

### OpenAI Realtime vs ElevenLabs — the real comparison

|   | OpenAI Realtime mini | ElevenLabs Agents | DIY pipeline |
|---|---|---|---|
| Composition | Native speech-to-speech | Their speech engine + your LLM | Whisper + OpenAI text + EL Flash TTS |
| Voice cost | $0.05–0.08/min all-in | $0.08/min speech engine | $0.05 / 1K chars ≈ $0.023/min |
| LLM + STT | Included | Separate, ≈ $0.01/min | ≈ $0.010/min combined |
| Realistic total | ≈ $0.065/min | ≈ $0.095/min | ≈ $0.033/min |
| Cost per 3-min rep | $0.20 | $0.29 | $0.10 |
| Prosody in | Preserved | Lost at STT | Lost at STT |
| Emotional delivery out | Emergent | Tagged | Tagged |
| Barge-in | Handled by the API | Managed for you | **You build it** |
| Latency | Lowest | Higher — sequential handoffs | Highest, and yours to tune |
| Voice realism | Good | Best | Best |
| Concurrency billing | No burst tier | $0.16/min above plan concurrency | None |
| Vendors in the path | 1 | 2 | 3 |

**Cost is not the deciding factor.** Three points of margin does not decide anything — if ElevenLabs makes the illusion work and OpenAI does not, that difference is trivially worth paying. The decision rests on two other things.

*Argument for OpenAI:* native speech-to-speech generates audio directly, which preserves the hesitation, the flat “mm”, the half-second too long before answering. Disinterest lives almost entirely in those signals. A pipeline generates words and then performs them, which flattens exactly the thing we need most. *Argument for ElevenLabs:* their voices are simply more human, and the whole product rests on believing a person is there.

> **Why the cheapest column is still the wrong one — for this product**
>
> The DIY pipeline is genuinely half the cost of Realtime and a third of Agents. It is rejected anyway, on grounds specific to Nerve rather than general engineering taste. **Speech-to-text discards tone**, handing the model words while throwing away how they were said. Our character needs to hear the shaking voice, the trailing-off, the nervous laugh — we would be building a social-skills trainer on a stack that is deaf to social signals. **Barge-in becomes ours to implement**: detect incoming speech, cancel in-flight synthesis, flush buffers, truncate context to what the user actually heard. That is the hardest engineering in voice apps and it is precisely what Level 5 upward depends on. And the sequential handoffs add latency on top of a network distance that is already the most likely cause of M0 failing.
>
> Keep it documented as the fallback. If M0 shows that *cost* is the binding constraint, this is where we go. If it shows *voice realism* is the binding constraint, ElevenLabs Agents is the managed middle path — their voices, our OpenAI model, someone else’s barge-in.

> **Concurrency — specific to this product**
>
> ElevenLabs applies burst pricing at $0.16/min once plan concurrency is exceeded. Nerve’s usage curve is exceptionally spiky — the whole user base practises between 7 and 9pm on Friday and Saturday, immediately before going out. That is precisely the profile that triggers burst billing week after week and doubles worst-hour cost. OpenAI has no equivalent tier.

**Realism is not one variable**

The binding constraint on this product is believability: the exposure mechanism only works if the user’s nervous system accepts that a person is there. But believability decomposes, and the two candidates split it.

| Component of realism | Winner | Why |
|---|---|---|
| Timbre | ElevenLabs | Clearly more human, deeper voice library |
| Emotional control | ElevenLabs, probably | Tagged delivery can be forced flat and disinterested regardless of what the text says |
| Response timing | OpenAI | Native speech-to-speech has no sequential handoffs. A beautiful voice answering two seconds late is less believable than a decent one answering in 700ms |
| Behavioural coherence | Tied | Almost entirely down to the character contract, not the provider |

> **Decision rule — revised**
>
> An earlier draft of this section defaulted to OpenAI and leaned on the character being able to *hear* the user’s nervousness. That argument was weaker than it looked: the scoring metrics all derive from a timestamped transcript, and a real stranger is not finely calibrating to a micro-tremor either. **The burden of proof has flipped.** Voice realism is the most direct lever on the critical risk in §19, so ElevenLabs is now the presumptive choice and OpenAI has to earn its place on latency.
>
> There is also a better argument for ElevenLabs than any made against it. Our hardest engineering problem is the character drifting warm (§05). Under native speech-to-speech, when the model softens its *voice* softens with it — prosody and content drift together. Tagged TTS lets us force flat delivery independently of the text, which suits a product built entirely out of difficulty dials.
>
> **Still settled by blind test in M0**, because the composite is what matters and neither provider wins all four rows. Build against both behind one interface; ten people, one question: *which one felt more like a real person who wasn’t interested in you?* Budget for ElevenLabs winning and plan the tier caps in §14 around $0.095/min rather than $0.065.

> **Realtime cost accumulates with context**
>
> Realtime pricing re-charges prior audio context on each turn, so cost per minute climbs as a conversation lengthens. The ≈ $0.065/min figure holds for short reps; measured heavy-context sessions reach $0.12–0.15/min. An eight-minute rep with periodic instruction re-injection sits at the wrong end of that range. **The eight-minute cap in §05 is doing economic work as well as product work**, and real cost per rep must be measured in M0 rather than estimated — if it lands above $0.12/min, the tier caps in §14 need revisiting before launch, not after.

> **On the $10 of credits**
>
> At measured rates that is roughly 125–200 minutes of realtime audio, or about 40–65 three-minute reps. That is a development and self-testing budget. It is not a beta budget — twenty beta users doing three reps a week will consume it in under a fortnight. Plan for $150–250 of inference across the private beta.

### Provider abstraction — shipping on OpenAI without marrying it

**Decision: build on OpenAI Realtime, behind an interface, from the first commit.** The credits fund development and testing; the abstraction keeps ElevenLabs a fortnight away rather than a rewrite. Nothing in the application layer may import a provider SDK directly — that single rule is what the rest of this section enforces.

**Module layout**

| Path | Contains |
|---|---|
| lib/voice/types.ts | Our domain events and configs. Zero provider vocabulary |
| lib/voice/provider.ts | The `VoiceProvider` interface every adapter satisfies |
| lib/voice/openai/ | WebRTC transport, ephemeral token mint, persona compiler |
| lib/voice/elevenlabs/ | Stub at MVP. Same interface, WebSocket transport, tag-based persona compiler |
| lib/voice/index.ts | Factory reading `VOICE_PROVIDER`, with a per-user override for A/B |
| lib/voice/conformance.test.ts | One suite both adapters must pass before either ships |

**The interface**

| Member | Contract |
|---|---|
| connect(persona, calib) | Opens a session. Transport is the adapter’s business — WebRTC for OpenAI, WebSocket for ElevenLabs |
| on(event, handler) | Our events only: `user.speech.start/stop`, `user.transcript`, `agent.speech.start/stop`, `agent.transcript`, `session.end`, `error` |
| reinforce(text) | Character re-injection (§05). Session update on OpenAI, prompt update on ElevenLabs |
| setInterruptible(bool) | The Level 5 difficulty dial, expressed once and mapped per provider |
| getAnalyser() | Returns AnalyserNodes for both streams so the visualiser never knows the provider |
| end() | Closes cleanly and resolves with `{ seconds, provider, model, rate }` for the ledger |

**Persona compilation**

The persona schema in §05 stays provider-neutral. Each adapter owns a compiler that turns it into provider configuration. Two fields carry real translation work:

- **Turn detection.** We store one number — the user’s calibrated silence threshold in milliseconds. The OpenAI adapter maps it to `silence_duration_ms` on server VAD; the ElevenLabs adapter maps it to that platform’s turn model. The application never sees either.
- **Delivery.** This is the leakiest seam and worth naming honestly. Under OpenAI, flat and disinterested delivery is *emergent* — it comes out of the character contract. Under ElevenLabs it is *tagged* — explicit audio markers force it. The schema therefore carries an abstract `delivery` descriptor and each compiler realises it in its own idiom.

**Two invariants that protect the data**

1. **Normalised transcripts.** Both adapters must emit the identical turn shape — `{ speaker, text, t_start, t_end }`. Scoring reads only this. Break it and scores stop being comparable across a provider switch, which silently corrupts every user’s progression history.
2. **Provider stamped on every row.** `usage_ledger` records provider, model and rate; `scores` records the voice provider alongside the model version. A switch mid-life then leaves historical cost and score data auditable rather than ambiguous.

> **What the abstraction does not buy**
>
> The plumbing swaps in about a week. The *content* does not. Because delivery is emergent on one provider and tagged on the other, all eight character contracts need re-tuning, the VAD calibration constants may not transfer, and the tier caps in §14 shift with the per-minute rate. **Budget two weeks for a real switch, not one**, and re-run the golden-transcript calibration harness against the new provider before any user sees a score from it.

> **Deadline on “for now”**
>
> Run the blind A/B **before M3**. The ambient mix levels and the whole sound kit get tuned against whichever voice ships, and re-tuning them after the fact is wasted work. A per-user provider override in the factory is what makes both the A/B and any later canary rollout possible, so it goes in at M0 rather than being retrofitted.

**Latency test, before anything else**

Round-trip conversational latency needs to sit under about 800ms to feel natural and degrades badly past 1.5s. Colombo to the nearest OpenAI region is a real distance. **Measure this in week one from an actual home connection in Sri Lanka before a single screen is designed** — the result either confirms the architecture or forces a rethink, and it costs two hours to find out.

---

## 05. The Voice Engine

This section is the product. Everything else is packaging around it, and the two engineering problems below are what separate a demo from something a stranger will pay for.

### Problem one — turn-taking

Voice activity detection decides when the user has finished speaking. Set the silence threshold too low and the character talks over a hesitating user; set it too high and there is dead air that breaks the illusion. Our user is, by definition, nervous and hesitant — the exact speech pattern that default VAD settings handle worst.

- Start confident users at `silence_duration_ms: 600`; widen from per-user mic calibration toward 900–1400 for hesitant speakers. M0 measured 178ms model response, so the old 900ms default was the largest avoidable part of perceived latency.
- Keep server VAD but disable its automatic response creation. The client owns a one-response-at-a-time gate: each committed user turn requests one response, extra commits while a response is generating or playing are coalesced, and the pending response starts only after generation and playback settle. This prevents overlapping responses before they consume output rather than merely hiding the second transcript.
- **Calibrate per user during onboarding.** The mic-check screen has them read two sentences and we measure their natural inter-clause pause, then store it on the profile and offset the threshold from it. This is a genuinely differentiating feature and nobody in the category does it.
- **Model interruption is a difficulty dial, not a default.** Levels 1–4 never interrupt the user, ever. Interruption switches on at Level 5 and becomes aggressive at Level 7, where being talked over is part of the training.
- A **Patience** setting in preferences lets a user widen the threshold permanently without explaining why.

### Problem two — keeping the character cold

Our core feature is a character who is uninterested, distracted, or says no. That fights directly against how these models are trained. Left alone, the character softens, apologises, over-explains, and eventually slips into helpful-assistant register — "I'm happy to keep chatting!" — which detonates the entire premise.

**Countermeasures**

1. **Character contract** in the system instructions: identity, situation, mood, what earns warmth, what loses it, exact exit conditions, and an explicit clause that the character never acknowledges being an AI, never offers help, and never breaks frame regardless of what the user says.
2. **Negative constraint list** enumerating banned assistant register: offers of assistance, "as an AI", "let me know if", summarising the conversation, asking how it can help.
3. **Event-driven instruction re-injection** after a detected break, via a session update carrying a compressed character reminder plus a small, safely quoted rolling continuity snapshot. The reminder must say to continue the current encounter, retain corrections, and never re-greet; a static biography-only reminder can itself feel like a scene reset. Do not update on a blind timer: the five-minute M0 run showed response-cost spikes around scheduled updates, so cache reuse and the cost curve must be re-measured before any cadence returns.
4. **Out-of-character detector.** A cheap text model watches the streaming transcript for assistant-isms and fires an immediate re-injection when one appears.
5. **Character breaks per session is a tracked engineering metric** with a target below 0.2. It goes on the dashboard next to latency. If we cannot hold a character for five minutes, we do not have a product.

### Persona schema

Every character is a config record, not code. Adding a character is a database row and a voice ID. Four independent difficulty dials, mixed freely, generate far more variety than a single difficulty slider ever could.

| Field | Type | Purpose |
|---|---|---|
| receptiveness | 0–100 | Starting warmth and how fast it moves |
| effort | 0–100 | How much the character carries the conversation versus making the user lead |
| distraction | 0–100 | Phone, friends, in a hurry, wearing headphones |
| signal_clarity | 0–100 | How plainly disinterest is expressed. Low clarity is the hardest skill in the product and is reserved for Level 7+ |
| interrupts | bool | Whether the model may cut across the user |
| exit_conditions | text[] | Explicit triggers that end the scene — three dead-end replies, a boundary crossed, time elapsed |
| outcome_weights | jsonb | Probability distribution over receptive / neutral / rejecting for this rep |
| voice_id | text | Provider voice |
| room_tone | text | Ambient audio bed keyed to the scenario |
| memory_summary | text | One line about the user's last attempt, injected on return visits |

> **Outcome is rolled, not scripted**
>
> At every level the result is drawn from a distribution rather than fixed. Level 1 is receptive 90% of the time; Level 8 is receptive 30% of the time. There is always a real chance it goes well and always a real chance it doesn't. This mirrors reality, teaches the correct lesson — you own the process, not the result — and produces variable-ratio reinforcement, the strongest engagement schedule there is, pointed for once at something that actually helps the user.

### Session rules

- Hard cap of 8 minutes; typical rep runs 2–4. The cap protects margin and prevents the product drifting into companionship.
- Characters can end the scene early. An exit is a terminal domain action, not merely a line of dialogue: after one final spoken line the provider closes the live session with reason `character`. Being walked away from at 40 seconds is a legitimate, scoreable outcome, not a bug.
- Audio recorded to private storage, transcript retained, both user-deletable, audio auto-purged at 30 days.
- No coaching during the rep. Nothing on screen but a timer, a live waveform and the mission you were given. Interruption to coach would destroy the only thing being trained.

---

## 06. Persona Roster

Eight characters at MVP, one per level. Named characters rather than anonymous difficulty tiers — a user can bomb with Maya on Tuesday and come back to her on Friday, and she references it. Continuity costs one text field and buys disproportionate attachment.

| Lvl | Character | Scene | Recep. | Effort | Distr. | Clarity | Skill trained |
|---|---|---|---|---|---|---|---|
| 1 | Nadia | Bookshop | 90 | 85 | 5 | 95 | Speaking out loud at all |
| 2 | Priya | Gym floor | 80 | 70 | 15 | 90 | Asking a second question |
| 3 | Maya | Coffee shop | 70 | 45 | 20 | 85 | Not running dry at 90 seconds |
| 4 | Jules | Bar, with a friend | 60 | 40 | 45 | 75 | Earning attention in 20 seconds |
| 5 | Erin | Train platform | 50 | 30 | 70 | 70 | Opening with something worth answering |
| 6 | Sam | House party | 40 | 20 | 40 | 60 | Warming up a guarded person |
| 7 | Robin | Gallery opening | 35 | 35 | 30 | 20 | Reading ambiguous interest correctly |
| 8 | Alex | Bar, alone | 30 | 25 | 35 | 95 | Being told no and exiting well |

**Level 1 must be nearly impossible to fail.** A socially anxious person opening their microphone for the first time is already at seven out of ten. First-session drop-off is where apps in this category die, so Nadia is delighted to be spoken to and will carry the conversation single-handedly if she has to.

**Level 7 is the interesting one.** Ambiguous signals are the skill nobody trains and everybody actually struggles with — not handling a clear no, but working out whether this is a no. Robin is polite throughout and never says anything cutting, and the scorecard grades whether the user correctly identified disinterest and exited on their own terms.

---

## 07. Scoring

> **The single most important decision in the product**
>
> **Outcome is never scored.** Whether the character gave a number, agreed to a date, or walked off is recorded but contributes zero points. A clean rep that ends in rejection can score 92. A sloppy rep that got lucky scores 54. Score the outcome instead and users optimise for results they don't control, feel like failures on unwinnable reps, and quit — and we've built a slot machine instead of a gym.

### Composure Score

A single 0–100 composite, weighted 60% deterministic and 40% model judgement. Deterministic metrics carry the majority precisely because they are stable — the same performance scoring 62 on Tuesday and 81 on Thursday would destroy the credibility of the entire progression system.

**Deterministic layer — 60%, computed locally from the transcript**

| Metric | Target band | Why it matters |
|---|---|---|
| talk_ratio | 40–55% | Dominating and disappearing both fail; the band is the lesson |
| questions_asked | ≥ 3 per 3 min | The most reliable single predictor of a conversation continuing |
| open_closed_ratio | ≥ 2:1 | Yes/no questions are where conversations go to die |
| filler_rate | < 4 per min | Proxy for nerves; the number people most enjoy watching fall |
| longest_monologue | < 22 s | Catches the anxious over-explaining spiral |
| mean_response_latency | < 1.8 s | Hesitation before answering, tracked over weeks |
| specific_plan_offered | bool | "Coffee Thursday?" beats "we should hang out sometime" |
| clean_exit | bool | Left warmly without pushing, after a no |

**Judgement layer — 40%, structured output from a text model**

Warmth, depth of curiosity, signal reading, recovery after a knock-back, and grace on exit. Fixed rubric, few-shot anchored, temperature zero. **Calibration harness:** twenty hand-scored golden transcripts re-run nightly; drift beyond five points on any dimension fires an alert. Without this the scoring silently rots as models update.

### What the user sees

| Sub-score | Example |
|---|---|
| Opening | 78 |
| Curiosity | 64 |
| Listening | 71 |
| Signal reading | 42 |
| Composure | 83 |
| Close | 35 |

Six sub-scores plus the composite. The weakest two are surfaced as the focus for the next rep, and each links to the matching technique in the library. The scorecard always names one thing that went well before it names anything that didn't — a user who feels flayed after their third rep never comes back for a fourth.

---

## 08. Progression

- **Unlock on demonstrated skill, not reps served.** Level N+1 opens at two sessions scoring 70+ on level N. Grinding does not advance you.
- **Adaptive difficulty, applied silently.** Two strong scores bumps the dials up within the level; two weak ones eases them back. *Never announce a downward adjustment.* Telling a struggling user you've made it easier lands as humiliation and is the fastest way to lose them.
- **Character memory.** Returning to a character injects a one-line summary of the last attempt. "You again. Did you ever read that book?"
- **Ranks** spanning the eight levels — Rookie, Regular, Contender, Closer — shown as a rail on the home screen rather than as a badge shelf.
- **Sim levels gate field tiers.** Clearing Level 4 in the gym unlocks Tier 2 challenges in the real world. This is the join that makes the two halves one product rather than two features sharing a login.
- **Baseline rep.** The very first session is framed as a measurement, not a test. It is re-run at week four and the two are shown side by side. This makes session one valuable in itself and plants a retention hook four weeks deep on day one.

---

## 09. The Field — Rejection Training

Simulation builds skill; the field is where it transfers. Graded exposure is the mechanism, laddered deliberately — going too hard too early sensitises rather than habituates, and users quit feeling worse than when they arrived.

| Tier | Gate | Character | Example challenges |
|---|---|---|---|
| T1 · In-app | Day one | No social risk | Ask a character for something and be turned down; ask Alex out knowing she'll decline |
| T2 · Low stakes | Sim L4 | Transactional, no social exposure | Ask for a discount; ask for a free refill; ask a stranger for directions you don't need; request a menu item that isn't on the menu |
| T3 · Social | Sim L6 | Real interaction, non-romantic | Compliment a stranger and keep walking; ask to join a table; ask a shop assistant for a genuine recommendation and talk for two minutes |
| T4 · Romantic | Sim L7 | The real thing | Ask for a name; ask for a number; ask someone out with a specific plan |

### The log — and the chart that carries the product

Each logged ask records the challenge, the outcome, **predicted anxiety 0–10 taken before** and **actual discomfort 0–10 taken after**. Plotting predicted against actual over time produces the one chart that does the therapeutic work: actual is almost always lower than predicted, and watching your own data prove it is more persuasive than any amount of encouragement. It is also, not incidentally, the most screenshot-able thing in the app.

- Rejections collected is the headline counter, not successes. Streaks run on asks made, never on asks accepted.
- Milestones at 10, 25, 50, 100 rejections, each with hand-written copy.
- Weekly summary: *"You were turned down seven times this week. You're still fine."*
- Field challenges consume no voice minutes, which means the free loop carries engagement on days the metered loop isn't used. This directly repairs the margin problem in §18.

> **Challenge library safety rule — absolute**
>
> Every challenge must be one where the worst realistic outcome is a polite no. Nothing involving persistence after a refusal, filming strangers, approaching people who cannot leave (staff on shift, someone alone at night), or anything that makes a stranger the unwilling subject of an exercise. Every challenge is hand-written and reviewed; none are model-generated at runtime. One viral clip of "this app told me to harass a woman at the gym" ends the company, and that is a product decision, not a legal footnote.

---

## 10. Feature Inventory

`[MVP]` ships in the private beta. `[V2]` is the first release after. `[Later]` is on the roadmap and deliberately not scoped now.

#### A · Training Loop
*12 features — all MVP*

- Live voice rep over WebRTC
- Pre-rep briefing with a three-point mission
- Armed-state countdown and mic confirm
- Live HUD: timer, real waveform, mission recall
- Ambient room tone per scenario
- Character-initiated early exit
- End rep early, saved and scored
- Post-rep scorecard with staged reveal
- Annotated transcript with timestamps
- Scrubbable session audio replay
- "One thing that worked" callout, always first
- Immediate re-run of the same scenario

#### B · Progression
*8 features*

- Eight-level ladder with skill-gated unlocks `[MVP]`
- Named persona roster with profiles `[MVP]`
- Silent adaptive difficulty `[MVP]`
- Character memory across sessions `[MVP]`
- Baseline rep and week-four re-test `[MVP]`
- Rank rail: Rookie → Closer `[MVP]`
- Per-character history and best score `[MVP]`
- Custom scenario builder `[Later]`

#### C · The Field
*9 features*

- Four-tier challenge library, hand-written `[MVP]`
- Daily challenge assignment `[MVP]`
- Accept / skip / swap a challenge `[MVP]`
- Predicted-anxiety capture before `[MVP]`
- Outcome + actual-discomfort log after `[MVP]`
- Predicted-vs-actual chart `[MVP]`
- Rejection counter and milestones `[MVP]`
- Free-text field notes `[MVP]`
- Photo evidence attachment `[V2]`

#### D · Coaching Content
*7 features*

- Technique library, one concept per card `[MVP]`
- Technique of the session, tied to weakest sub-score `[MVP]`
- Opener bank by setting — gym, café, party, transit, work `[MVP]`
- Follow-up ladders: facts → opinions → feelings `[MVP]`
- Recovery lines after a flat response `[MVP]`
- Graceful exit scripts `[MVP]`
- Technique mastery tracking `[V2]`

#### E · Insight & Data
*7 features*

- Composure trend over time `[MVP]`
- Six sub-score trend lines `[MVP]`
- Filler-rate and talk-ratio history `[MVP]`
- Weekly review, generated Sunday `[MVP]`
- Streak tracking on asks made `[MVP]`
- Baseline vs current comparison `[MVP]`
- Exportable progress card for sharing `[V2]`

#### F · Premium Craft
*12 features — all MVP*

- Web Audio ambient mixing
- AnalyserNode-driven visualiser
- Full sound-design kit
- Haptics via Vibration API
- Staged score-reveal choreography
- Skeleton loaders throughout, no spinners
- Optimistic writes on every mutation
- Per-user VAD calibration
- Keyboard operation end to end
- Reduced-motion compliance
- PWA install with offline shell
- Hand-authored empty and error copy

#### G · Account & Billing
*8 features — all MVP*

- Email OTP and Google sign-in
- Merchant-of-record checkout and portal
- Live minute meter
- Low-balance and exhausted states
- Plan switching mid-cycle
- Recording retention controls
- Full data export
- Account deletion with hard purge

#### H · Safety
*6 features — all MVP*

- Age gate at sign-up
- Moderation on both audio streams
- Content-boundary intervention
- Distress detection and resource sheet
- Challenge library review workflow
- Report-a-problem on every session

**69 features at MVP** across eight groups. The count is high because a third of it is craft rather than function — which is exactly the point of §02.

---

## 11. Screen Inventory

34 routes. Next.js App Router paths.

**Public & marketing — 6**

| Route | Screen | Notes |
|---|---|---|
| / | Landing | Hero is a live 30-second demo rep with no sign-up. The product sells itself or it doesn't sell |
| /how-it-works | Method | The sim → field → log loop explained; the predicted-vs-actual chart as proof |
| /pricing | Pricing | Two tiers, minute caps framed as reps, honest about why the cap exists |
| /legal/terms | Terms |  |
| /legal/privacy | Privacy | Explicit on recordings, retention, deletion |
| /legal/safety | Safety & scope | Not-therapy statement and clinical signposting |

**Auth — 4**

| Route | Screen | Notes |
|---|---|---|
| /auth/sign-in | Sign in | Email OTP + Google. No passwords in the product at all |
| /auth/sign-up | Create account | Age gate inline |
| /auth/verify | Enter code | Six-digit, auto-advance, paste-aware |
| /auth/callback | OAuth return | Skeleton, never a spinner |

**Onboarding — 6**

| Route | Screen | Notes |
|---|---|---|
| /start/goal | What are you here for | Dating / making friends / work conversations. Sets scenario emphasis |
| /start/baseline | Self-assessment | Five questions. Stored as the week-four comparison point |
| /start/mic | Mic check & VAD calibration | Read two sentences; we measure natural pause length and store it |
| /start/brief | First mission | Explains that level one is unfailable, in those words |
| /start/rep | Baseline rep | Nadia, level 1. Framed as a measurement, never as a test |
| /start/result | Your baseline | Score revealed, week-four re-test promised, first field challenge offered |

**Core app — 18**

| Route | Screen | Notes |
|---|---|---|
| /home | Today | Next rep, today's field challenge, streak, minutes remaining, rank rail |
| /train | The roster | Eight levels; locked ones struck through, current one railed |
| /train/[persona] | Character profile | Scene, your history with them, best score, last-attempt memory line |
| /session/[id]/brief | Briefing | Scene, mission, technique of the session. Arm button |
| /session/[id]/live | Live rep | Timer, waveform, mission. Nothing else on screen |
| /session/[id]/score | Scorecard | Staged reveal, six sub-scores, what worked, focus for next time |
| /session/[id]/transcript | Transcript | Annotated, timestamped, tied to the audio scrubber |
| /sessions | Rep history | Filterable by character, level, score band |
| /field | Field — today | Assigned challenge, tier, accept/swap |
| /field/browse | Challenge library | All unlocked tiers |
| /field/[id] | Challenge detail | What to do, what counts as done, the safety line |
| /field/log | The log | Every ask made, outcome, both anxiety ratings |
| /field/log/new | Log an ask | Fast path, three taps, optimistic write |
| /progress | Progress | Composure trend, sub-score lines, predicted-vs-actual, streaks |
| /progress/week/[id] | Weekly review | Generated Sunday. The "you were turned down seven times" screen |
| /library | Techniques | Grouped by the sub-score they improve |
| /library/[slug] | Technique detail | The idea, why it works, three examples, the paired drill |
| /library/openers | Opener bank | By setting; ladders and exits included |

**Settings — 6**

| Route | Screen | Notes |
|---|---|---|
| /settings | General | Name, goal, notification preferences |
| /settings/session | Session preferences | Patience threshold, ambient volume, sound kit, haptics |
| /settings/billing | Plan | MoR customer-portal handoff |
| /settings/usage | Minutes | Consumed, remaining, per-session breakdown |
| /settings/privacy | Recordings & data | Retention toggle, bulk delete, full export |
| /settings/danger | Delete account | Typed confirmation, hard purge, no soft-delete |

---

## 12. Modals, Sheets & Popups

38 overlays. On mobile everything below renders as a bottom sheet; on desktop as a centred dialog. One component, two presentations.

**Session flow — 11**

| Overlay | Trigger | Behaviour |
|---|---|---|
| Mic primer | Before the browser prompt | Explains why we need the mic *before* the OS dialog fires. Skipping this step is the single biggest cause of permanent permission denial |
| Mic denied | Permission refused | Browser-specific recovery instructions, detected from user agent |
| Headphones nudge | First session, no headset detected | Dismissible. Prevents echo and doubles perceived audio quality |
| Audio check | Pre-arm | Level meter plus a 2-second ambient preview |
| Countdown | Arm pressed | 3·2·1 with tick sound and haptic. Non-dismissible |
| End rep early | Esc or End | "Ending now still scores the rep." Confirm / keep going |
| Reconnecting | ICE drop | Auto-retry ×3 with the timer paused and visible |
| Connection lost | Retries exhausted | "Saved up to 2:14." Resume / score what we have |
| Character left | Exit condition met | Full-bleed moment, not a toast. This is a designed emotional beat |
| Scorecard explainer | First scorecard only | Explains that outcome isn't scored. Load-bearing for retention |
| Report a problem | Any session | Character broke, audio failed, content concern |

**Progression & celebration — 8**

| Overlay | Trigger | Behaviour |
|---|---|---|
| Level unlocked | Two reps at 70+ | New character introduced by name and scene |
| Rank promotion | Rank boundary | Rail advances; hand-written line per rank |
| Difficulty raised | Adaptive bump | Announced. "Maya's going to make you work today" |
| Difficulty eased | Adaptive drop | **Silent. Renders nothing.** Never tell a struggling user you made it easier |
| Personal best | Score beats previous max | Count-up emphasis on the delta |
| Streak milestone | 7 / 14 / 30 / 60 days |  |
| Streak at risk | 20:00 local, nothing logged | Push if permitted, otherwise in-app. Once only, never nagging |
| Baseline re-test ready | Day 28 | The retention hook planted in onboarding, finally cashed |

**Field — 6**

| Overlay | Trigger | Behaviour |
|---|---|---|
| Challenge accept | Accept pressed | Captures predicted anxiety 0–10 before you go |
| Log outcome | Returning from a challenge | Outcome, actual discomfort, optional note. Three taps |
| First rejection | First "no" logged | The most important copy in the entire product. Congratulatory, unironic |
| Rejection milestone | 10 / 25 / 50 / 100 | Hand-written per milestone |
| Tier unlocked | Sim level gate cleared | Explains what changes and why now |
| Challenge safety note | First T3 and first T4 | What is and isn't in bounds, in plain language |

**Money & limits — 6**

| Overlay | Trigger | Behaviour |
|---|---|---|
| Free reps used | After rep 3 | The primary conversion moment. Shows the baseline they'd be abandoning |
| Minutes low | 10 min remaining | Amber. Non-blocking |
| Minutes exhausted | 0 remaining | Field challenges stay open — the free loop keeps the streak alive |
| Upgrade | Any paywall | Two tiers, minute maths shown honestly |
| Mid-session cutoff | Balance hits zero live | Grace to the end of the current rep, then blocked. Never cut mid-sentence |
| Cancel confirm | Downgrade | Shows the streak and rank at stake. Honest, not manipulative |

**System, safety & data — 7**

| Overlay | Trigger | Behaviour |
|---|---|---|
| Age gate | Sign-up | Date of birth, 18+, hard block |
| Content boundary | User steers explicit | Character declines in-frame; second occurrence ends the rep with a plain notice |
| Distress resources | Distress signals detected | Calm, non-clinical, offers real resources. Never diagnostic, never alarmist |
| Delete recording | Per session | Irreversible, stated plainly |
| Delete account | Danger zone | Type the email to confirm |
| PWA install | Third visit | Once. Never asked again if dismissed |
| Feedback prompt | After rep 5 | One question: did anything change in real life? |

---

## 13. Data Model

Supabase Postgres. RLS on every table, keyed to `auth.uid()`, with zero exceptions.

| Table | Key columns | Purpose |
|---|---|---|
| profiles | id, goal, vad_offset_ms, rank, current_level, baseline_score, patience | One row per user |
| personas | slug, name, scene, level, dials jsonb, voice_id, room_tone, prompt_contract | Character configs. Content, not code |
| sessions | id, user_id, persona_id, started_at, duration_s, outcome, ended_by, audio_path | One row per rep |
| transcripts | session_id, turns jsonb | Speaker, text, t_start, t_end per turn |
| scores | session_id, composite, six sub-scores, metrics jsonb, model_version, voice_provider | Versioned so recalibration is auditable and comparable across a provider switch |
| persona_memory | user_id, persona_id, summary, last_seen_at | The one-line callback on return |
| unlocks | user_id, kind, ref, unlocked_at | Levels, tiers, techniques |
| techniques | slug, title, body, targets_subscore, examples jsonb | Library content |
| field_challenges | id, tier, title, brief, done_when, reviewed_by | Hand-written and reviewed. Never generated |
| field_logs | user_id, challenge_id, outcome, anxiety_pre, anxiety_post, note, logged_at | Powers the chart that matters |
| streaks | user_id, current, longest, last_active_on | Counts asks made, not asks accepted |
| usage_ledger | user_id, session_id, seconds, provider, model, rate, cost_cents, created_at | Append-only. Source of truth for metering; provider and rate stamped so a switch keeps history auditable |
| subscriptions | user_id, provider_ids, tier, minutes_included, period_end | Mirrors the MoR; the provider stays authoritative. Keep provider IDs abstract so switching MoR is a migration, not a rewrite |
| weekly_reviews | user_id, week, stats jsonb, copy | Generated Sunday 06:00 local |
| safety_events | user_id, session_id, kind, handled_at | Boundary hits, distress flags, reports |

---

## 14. Money & Metering

| Tier | Price | Voice minutes | Field | Max voice cost | Gross margin |
|---|---|---|---|---|---|
| Free | $0 | 3 reps ≈ 9 min | Tier 1–2 | $0.72 | — |
| Training | $19/mo | 60 | All tiers | $4.80 | 75% |
| Serious | $39/mo | 150 | All tiers | $12.00 | 69% |

> **Correction from earlier planning**
>
> The top tier was originally scoped at 200 minutes for $39. At worst-case voice cost that lands at 59% gross margin, which is too thin once merchant-of-record fees and infrastructure come out. **Set it at 150 minutes.** Very few users will reach even 60, but the ones who do are the ones who would have destroyed the unit economics.

### Payment rails — Stripe is not an option

**Stripe does not operate in Sri Lanka.** A Sri Lankan founder can only reach Stripe by incorporating abroad. That makes a merchant of record the correct rail, and an MoR brings a second benefit worth having anyway: it becomes the seller of record and handles global VAT and sales tax registration and remittance, including Sri Lanka’s 18% VAT on digital services. For a solo founder selling into 40 countries, that is not a convenience, it is the difference between compliant and not.

| Provider | Sri Lankan sellers | Indicative fee | Verdict |
|---|---|---|---|
| Creem | Yes — local bank transfer | 3.9% + $0.40, plus payout fee of €7 or 1% | `[Primary]` Cheapest of the viable set, explicitly supports Sri Lanka |
| Polar | Yes — via Stripe Connect Express payouts | ≈ 4–5% + fixed fee | `[Backup]` Works, but its policy names “AI relationship services” as prohibited — a reviewer could misread us |
| Dodo Payments | Yes — markets to emerging markets | Comparable | `[Backup]` Newer and less proven; keep as a third option |
| Paddle | Not clearly listed | ≈ 5% + $0.50 | `[Rejected]` Its policy bans “dating services/applications, or any other products/services intended for this industry” outright |
| Lemon Squeezy | Yes — bank payouts | ≈ 5% + $0.50 | `[Avoid]` Being folded into Stripe Managed Payments, which covers far fewer countries. Migration risk we do not need |
| Stripe direct | Only via a US or UK entity | 2.9% + $0.30 | `[Later]` Best economics. Revisit once revenue justifies an entity and its accounting |

> **Every merchant of record bans dating products**
>
> Paddle prohibits dating applications by name. Polar prohibits AI relationship services by name. This is not a billing footnote — **it independently validates the positioning decision in §01 and makes it a condition of getting paid at all.** A human reviews your site during onboarding. If the landing page leads with getting her number, we are declined by every provider on this list. If it leads with training for hard conversations, with scored sessions, an eight-minute cap and no companionship features, we are an ordinary communication-skills SaaS.
>
> Practical consequences: the reviewer is a second audience for the landing page, alongside users. Apply early in M4, because approval takes days and can fail. And keep provider IDs abstract in the schema from day one so that being declined by one provider costs a migration rather than a rewrite.

**Metering rules**

- Billed per second from WebRTC connect to disconnect; append-only ledger, never a mutable counter.
- Minutes are framed as **reps** everywhere in the UI, never as minutes. "Four reps left this week" is a training constraint; "12 minutes left" is a meter running.
- The cap is presented as a feature, honestly: three reps a day is how training works, and unlimited practice is not how anyone gets better at anything.
- Running out never blocks the streak — field challenges cost nothing and keep the daily habit intact. This is deliberate, and it is what stops the paywall from also being a churn event.
- No annual plan at launch. We have not yet earned a year of anyone's trust.

---

## 15. Edge, Empty & Error States

Cheap apps expose themselves in exactly these screens. Every one gets hand-written copy.

| State | Where | Treatment |
|---|---|---|
| No reps yet | /sessions, /progress | Shows what the chart will look like with the axes already drawn, not a shrug |
| No asks logged | /field/log | The first challenge offered inline, one tap |
| Not enough data | /progress trends | "Three more reps and this becomes a line." Says exactly what unlocks it |
| All levels locked | /train | Only ever true pre-onboarding; routes straight into the baseline rep |
| Mic unavailable | Session | Device-specific guidance; offers a text-mode fallback rep |
| Offline | Global | Field logging queues locally and syncs; sessions cleanly refuse to arm |
| Slow network | Pre-arm | We measure RTT before arming and warn rather than starting a rep that will feel broken |
| Model unavailable | Session | Honest: "The gym's closed for a few minutes." Field challenges still offered |
| Scoring failed | Post-session | Transcript and audio still shown; score backfills silently when it recovers |
| Session under 20s | Post-session | Not scored, not counted against minutes, offered again free |
| Duplicate tab | Session | Only one live session per account; second tab is told plainly |
| Expired auth | Global | Re-auth in a sheet; the user never loses their place |

---

## 16. Safety & Legal

1. **No clinical claims, anywhere.** "Confidence training", never "treatment for social anxiety". No mention of therapy, treatment, diagnosis or clinical outcomes in product, marketing or store copy. Medical claims invite regulatory attention and liability we cannot carry.
2. **Signpost properly.** A quiet, permanent line in `/legal/safety` and in settings noting that people with diagnosed social anxiety should work with a clinician, and that Nerve is training, not care.
3. **PG-13, enforced.** Moderation on both streams. A user steering explicit gets an in-frame decline first, then the rep ends. Logged to `safety_events`. This protects the merchant-of-record account, which is the company’s oxygen supply — every MoR in §14 bans adult content outright.
4. **18+ only.** Age gate at sign-up. The category attracts teenagers and we are not equipped for them.
5. **Challenge library is human-reviewed.** Never model-generated at runtime. Every entry passes the test in §09: worst realistic outcome is a polite no.
6. **No manipulation content.** No negging, no persistence past a refusal, no pressure closes, nothing framed as overcoming someone's reluctance. Beyond ethics this is a brand and press liability, and it locks us out of half the eventual market.
7. **Recordings are the user's.** Private bucket, signed URLs, 30-day auto-purge, per-session delete, bulk delete, full export, hard purge on account deletion.
8. **Distress handling.** If a session surfaces genuine distress, we exit the exercise, drop the training frame entirely, and offer real resources without diagnosing anything.

---

## 17. Build Order

Every milestone has an exit gate. A failed gate stops the build rather than deferring the problem — that is the whole point of ordering it this way.

#### M0 — The spike  *(Week 1)*

Voice loop only. One persona, no UI worth the name, no database. **The `VoiceProvider` interface and the per-user override land here, in the first commit** — OpenAI implemented, ElevenLabs stubbed. Answers the three questions that can kill the project: does conversational latency hold from a Colombo home connection, can a character stay cold for five minutes, and — once the ElevenLabs adapter is filled in before M3 — which provider actually sells the illusion?

> **GATE — median round trip < 900ms · character breaks < 0.5 per 5-min session · blind provider A/B run with 10 people. Fail either of the first two and re-architect before spending another rupee.**

#### M1 — The loop  *(Wk 2–4)*

Auth, schema with RLS, three personas, brief → live → scorecard, transcript, deterministic scoring. Ugly but complete end to end.

> **GATE — you run ten reps on yourself and genuinely want an eleventh.**

#### M2 — Progression & field  *(Wk 5–7)*

All eight personas, unlock logic, adaptive difficulty, character memory, the four-tier challenge library, the log, the predicted-vs-actual chart, streaks.

> **GATE — scoring calibration harness green across all twenty golden transcripts.**

#### M3 — The premium layer  *(Wk 8–9)*

Everything in §02. Ambient beds, sound kit, real waveform, haptics, score choreography, skeletons, empty-state copy, keyboard paths, reduced motion, PWA shell.

> **GATE — side-by-side demo against RizzAgent with three strangers; Nerve reads as the more expensive product to all three.**

#### M4 — Billing & safety  *(Week 10)*

MoR integration, metering ledger, all six paywall overlays, age gate, moderation, distress handling, retention and deletion, legal pages. Submit for MoR review at the *start* of this milestone, not the end — approval takes days and can fail.

> **GATE — MoR account approved · metering reconciles to the cent against the OpenAI dashboard across fifty test sessions.**

#### M5 — Private beta — 20 users  *(Wk 11–12)*

Recruit twenty. Instrument everything. Weekly qualitative calls with five of them. Budget $150–250 of inference.

> **GATE — the only number that matters: **week-4 retention above 25%** among users who did three or more reps. Below 10%, stop and reconsider the whole shape.**

---

## 18. Unit Economics

| Line | Value | Basis |
|---|---|---|
| Voice cost | $0.05–0.08/min | Measured production rates for gpt-realtime-mini |
| Cost per rep | ≈ $0.21 | 3-minute average at the top of the band |
| Scoring per rep | < $0.01 | ~2k tokens, text model, post-hoc |
| Free user burn | $0.72 | Three reps before the paywall |
| Blended margin | 70–75% | At capped tiers; most users use far less than the cap |
| Break-even conversion | ≈ 4% | Free-to-paid needed to cover free-tier burn alone |

Those margins are before payment fees. A merchant of record takes roughly 4–5% plus a fixed fee per transaction — materially more than a raw gateway — which pulls the $19 tier from about 75% down to roughly 68%. That is the honest price of selling worldwide from Sri Lanka without a foreign entity, and it is worth paying at this stage.

The economics work at the margin level. They do not automatically work at the acquisition level, and that is the actual business risk: with dating-adjacent ad creatives regularly banned on Meta and TikTok, paid acquisition is either blocked or expensive, and a $19 subscription retained for three months yields roughly $57 of lifetime value against a plausible $30–60 acquisition cost. **Organic distribution is not a growth channel here, it is a survival requirement** — which is precisely why rejection challenges, with their native affinity for short-form video, are load-bearing rather than a nice extra.

---

## 19. Risk Register

| Risk | Sev | Mitigation |
|---|---|---|
| Practice with an AI doesn't transfer to real situations — the body never registers real threat, so no habituation occurs | `[Critical]` | Unknown and untested by anyone. The field log is the measurement instrument: if real-world outcomes don't move by week four, the core premise is wrong. Ask it directly in the M5 interviews |
| The avoidance paradox — the people who need it most are the least likely to open it | `[Critical]` | Unfailable level one, sub-60-second first rep, field challenges that keep the streak alive without courage on the hard days |
| Product cures the customer; LTV structurally capped | `[Critical]` | The ladder into interviews, negotiation and workplace conversations. Scoped as V2 but the reason the brand is neutral from day one |
| Ad accounts banned for dating-adjacent creative | `[High]` | Training positioning, neutral brand, organic-first via rejection content |
| Character drifts into assistant register | `[High]` | Contract prompts, re-injection, drift detector, tracked metric with a target |
| Turn-taking feels broken for nervous users | `[High]` | Per-user VAD calibration, raised default threshold, no interruption below level 5 |
| Latency from South Asia breaks the illusion | `[High]` | Measured in M0 before anything else is built |
| Scoring inconsistency destroys trust in progression | `[High]` | 60% deterministic weighting plus a nightly calibration harness |
| A challenge causes real-world harm | `[Critical]` | Human-written and reviewed library, hard safety rule, no runtime generation |
| Merchant of record declines the account, reading Nerve as a dating product | `[High]` | Training positioning throughout the public site; apply early in M4; abstract provider IDs so a second application is cheap; three viable providers identified |
| No Stripe access from Sri Lanka caps payment options and adds ~5% in fees | `[High]` | Merchant of record from day one; revisit a foreign entity only once revenue justifies it |
| A well-funded incumbent ships the same thing | `[Low]` | The category is crowded but shallow. Competition is not the binding constraint — retention is |

> **The honest summary**
>
> The margins work, the competition is weak, and the build is tractable. The risk is not that someone builds it better — it is that people buy it, feel briefly hopeful, and never open it again. Every design decision in this document, from the unfailable first level to scoring process instead of outcome to field challenges that cost nothing to run, is aimed at that one risk. Week-4 retention is the only number that decides whether this is a company.

---

Nerve — build specification v1.0 · 21 August 2026

 Decisions locked: Arena visual system · men-first UI with a neutral brand · conversation-gym positioning · free tier with a $19 metered subscription · ship on OpenAI Realtime behind a provider interface, ElevenLabs A/B before M3, on Vercel and Supabase · merchant-of-record billing, not Stripe.

 Next action: M0 spike — measure latency from Colombo and character stability over five minutes, before anything else is built.
