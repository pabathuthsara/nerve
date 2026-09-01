> **P0 and all three P1s shipped 1 September 2026.** Progress is visible, the
> funnel is instrumented, the live session has a production layer, one mission
> now runs from scorecard to Train to brief to live to text, and text mode has
> a cue rail. What landed and what is still owed is recorded at the bottom of
> this file under **P0 — what shipped** and **P1 — what shipped**. The audit
> text itself is left exactly as written; it is the record of what was found,
> and rewriting a finding to match the fix loses the finding.

The core problem is not that Nerve is visually ugly—it is polished. The problem is that it feels like a performance dashboard without a coach. The user sees characters, scores, charts, and lessons, but nobody ties them into a personal journey.

The strongest product direction is:

> Nerve should feel like a coach preparing you, putting you under pressure, reviewing the tape, and assigning the next rep.

## What I found

The good news:

- The public positioning is excellent and much more defensible than a reply generator.
- Train works well on mobile.
- Character memory, field challenges, process scoring, and technique cards are genuinely differentiated.
- The scorecard has much more substance than most dating-coach products.

The friction:

- Text mode opens onto an enormous empty space with “Say something.”
- The library is a flat collection of 14 similar cards.
- The scorecard is informative but cognitively heavy.
- Progress shows numbers without telling the user what changed or what to do next.
- Every screen uses nearly the same dark-card/hairline treatment, so characters, lessons, milestones, and statistics all carry the same emotional weight.
- The pre-rep screen says `GOAL — GET HER NUMBER`, while the scorecard later explains that the outcome is irrelevant. That is a significant product contradiction: [onboarding-screens.tsx](/Users/pabath/Documents/nerve/components/screens/onboarding-screens.tsx:880).
- The Progress trend is currently almost black-on-black. The chart uses `chart-score`, but the stroke is only defined beneath `.warmth-chart`, not `.trend`: [progress-screens.tsx](/Users/pabath/Documents/nerve/components/screens/progress-screens.tsx:154), [globals.css](/Users/pabath/Documents/nerve/app/globals.css:833). It also says “Composure score” while plotting composite scores.

## What I would build, in order

| Priority | Change | Why it matters |
|---|---|---|
| P0 | Fix Progress visibility and add analytics | You currently cannot see the growth proof clearly or reliably measure the retention funnel. PostHog/Sentry are still absent: [LAUNCH-GAP.md](/Users/pabath/Documents/nerve/docs/LAUNCH-GAP.md:472). |
| P1 | Finish the live-session production layer | Add the 3·2·1 start, tick/haptic, room tone, scene-specific sound, stronger character entrance, full-screen exit beat, and staged score reveal. These are already correctly identified in [M3-PLAN.md](/Users/pabath/Documents/nerve/docs/M3-PLAN.md:247). This is the highest-leverage fix for “lifeless.” |
| P1 | Introduce one persistent training mission | Carry one personalized objective from scorecard → Train → brief → next scorecard. The product currently recommends techniques, but they feel like unrelated links. |
| P1 | Turn text mode into a guided warm-up | Preserve authorship but add cue chips such as “Notice the room,” “Use what she remembered,” and “Offer an opinion.” These direct attention without writing the user’s line. The present empty state deliberately refuses coaching: [text-screens.tsx](/Users/pabath/Documents/nerve/components/screens/text-screens.tsx:153). |
| P2 | Add annotated session replay | Let the user hear the five seconds around “the moment it worked” and “the moment it didn’t.” Tone, pacing, hesitation, and interruptions are the point of a voice trainer. The recording already exists; the player does not. |
| P2 | Add a weekly commitment loop | Let users choose “2, 3, or 5 reps this week,” show progress on Train, and send user-chosen reminders. This is more forgiving and meaningful than relying primarily on a daily streak. |

## The hint question

I agree that users need more help—but I would not put generated replies inside scored live reps. That would quietly turn Nerve into the thing its positioning argues against.

Instead, create two distinct modes:

- **Scored rep:** timer, character, scene, body-language signal. No suggestions.
- **Guided drill:** explicitly unscored and cannot unlock ranks. It may reveal conceptual cues such as “build on her last detail” or “make the ask concrete,” but never a sentence to repeat.

A guided drill could be a 60-second text or voice warm-up immediately before the real rep. This lets nervous users get unstuck without contaminating the measurement.

## Reframe each rep as a small arc

Before the rep:

> **Tonight’s mission**  
> Ask one open follow-up, then add your own opinion.  
> Success means doing it twice—not getting her number.

After the rep:

> You did the follow-up twice.  
> You stacked four closed questions when the conversation slowed.  
> Next rep: let one answer breathe before asking again.

Then the CTA should be:

> **Run a focused rep**

—not the generic “Run it back.”

That single mission should appear on Train, the brief, the scorecard, and Progress. It becomes the connective tissue the product currently lacks.

## What to borrow from RizzAgent

RizzAgent’s current product emphasizes a guided first win, weekly practice schedule, accountability hub, coach memory, scene imagery, clear missions, celebrations, and rolling directly into the next exercise. Its official listing also advertises live hints, titles, and a weekly growth arc. [App Store listing](https://apps.apple.com/us/app/rizzagent-ai-dating-coach/id6758960974)

Borrow:

- Guided first win
- Clear personalized plan
- Scene imagery and atmosphere
- Weekly commitment
- Strong celebrations
- Immediate next exercise
- A bounded pre/post-session coach

Do not borrow:

- Exact live replies
- Outcome-heavy “numbers/dates” progression
- Parasocial 24/7 companion framing
- Leaderboards as the main motivation

Nerve’s advantage is that it can hook users on demonstrated mastery: “I handled that moment better than last week.” That is more durable than crowns or pickup lines.

## Two important operational gaps

The Sunday review—one of the four explicit comeback mechanisms—is built but never scheduled, so nobody receives it: [LAUNCH-GAP.md](/Users/pabath/Documents/nerve/docs/LAUNCH-GAP.md:747).

There is also no product analytics capable of answering the company’s stated week-four retention gate. Instrument this funnel before redesigning too much:

`brief viewed → rep started → first user turn → rep completed → scorecard viewed → technique opened → focused rep started → field challenge accepted/logged → D7/W4 return`

I did not consume one of the test account’s remaining voice reps. I inspected the deployed brief, saved scorecard and transcript, responsive screens, and the live-session implementation. No files were changed; the worktree remains clean.

---

# P0 — what shipped

*Appended 1 September 2026. The audit above is unedited; this section is the
response to its P0 row.*

## Verification

| Check | Before | After |
|---|---|---|
| `npm run typecheck` | clean | clean |
| `npm run lint` | clean | clean |
| `npm test` | 1072 passed, 56 files | **1100 passed**, 59 files |
| `npm run build:check` | succeeds | succeeds, 18/18 static pages |
| First Load JS shared by all | 103 kB | **103 kB** — see *The bundle* below |

Not run, because nothing here touches the database, billing or grading:
`db:verify`, `db:rep`, `db:field`, `db:spend`, `db:billing`, `creem:verify`,
`grade:calibrate`.

## 1 · Progress visibility

**The finding was exact.** `.chart-score` was styled only beneath
`.warmth-chart` (`app/globals.css:837`), which is the profile screen. Inside
`.trend` the polylines fell back to the SVG defaults — `stroke: none` and
`fill: black` — and painted black shapes on the `#0B0C0A` ground.

It was not one chart. `Trend` is used twice in `progress-screens.tsx`: once for
the composite line and once per sub-score, so **all seven charts on the screen
were invisible**, on the one screen whose whole job is showing the number going
up. It typechecked, linted and passed every test.

**What landed** (`app/globals.css`, after `.trend--compact svg`):

```css
.trend polyline { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
.trend .chart-score { stroke: var(--volt); }
.trend--compact .chart-score { stroke: var(--cool); stroke-width: 1.5; }
```

`fill: none` is the half that made them invisible rather than merely
uncoloured. The composite line is Volt because Arena assigns Volt to the
composite score; the six sparklines are the second series and take Cool, which
keeps exactly one Volt element on the screen.

**The mislabel is fixed too.** The card read `Composure score` while plotting
`composites` — and Composure is one of the six §07 dimensions with its own cell
in the card directly below, so the label named a different number that is also
on that screen. Both the heading and the chart's `aria-label` now say
*Composite score*.

**Guarded by test**, not by a note: `lib/data/progress-chart.test.ts`, five
assertions. It reads `globals.css` and asserts *reachability* — that a stroke
rule exists for `.trend .chart-score`, that the fill is killed, that the
compact rule is written after the composite one (they tie on specificity at
(0,2,0), so order is the only thing making the sparklines Cool), and that the
profile warmth chart still has its own rule. A component test cannot see this
class of defect; a value being wrong is not what broke, a rule being reachable
from one ancestor and not another is.

**Still owed:** a visual confirmation. The Chrome extension was not connected
during this session, and there is no headless browser in the toolchain, so the
fix is verified in the compiled stylesheet (`.next-check/static/css/…`
contains all three rules in the right order) rather than in a screenshot.

## 2 · Analytics

`posthog-js` and `@sentry/nextjs` are installed and wired. `LAUNCH-GAP.md` B7
said "neither package is in `package.json`"; both are now, and the funnel the
audit specified is instrumented end to end.

**The nine events**, in `lib/analytics/events.ts`, in the audit's own order:

| Event | Fired from |
|---|---|
| `brief_viewed` | `rep-screens.tsx` — once the brief has a character, not while it is a skeleton |
| `rep_started` | the commit point in `start()`, so the next gap still contains reps that never connected |
| `rep_first_user_turn` | off the hook's own `heardUser`, with ms since the session went live |
| `rep_completed` | with the adapter's real `endReason` |
| `scorecard_viewed` | `session-screens.tsx`, once the grade is on screen |
| `technique_opened` | `library-screens.tsx`, with `from` = library / scorecard / train |
| `focused_rep_started` | the "Run a rep on this" CTA, carrying the card's target sub-score |
| `field_challenge_accepted` | `field/flow.tsx`, with the predicted anxiety |
| `field_challenge_logged` | both the ask and the honest non-ask |

`rep_first_user_turn` is the one that looks redundant and is not: the drop
between it and `rep_started` is somebody opening a microphone, hearing a
stranger, and freezing. No other pair of events can see it.

**M5's gate is answerable.** *Week-4 retention above 25% among users who did
three or more reps* — the cohort is defined on the event stream ("performed
`rep_completed` at least 3 times"), deliberately **not** as a `reps_completed`
person property, which would be stale between every rep and its next identify
call. `identifyPerson` sends three traits and no email or name.

**Two rules are enforced in code rather than in configuration:**

- `safeProps` refuses anything that is not an id, enum, finite number or
  boolean. A transcript turn, a display name or a field-log note cannot travel
  with an event. It **throws in development** so the bug is found in the pull
  request, and **drops the property in production** so a live rep is never
  ended by instrumentation — the same asymmetry `lib/safety/assess.ts` argues
  for.
- `sessionReplayAllowed` is §04's "replay disabled on the live-session route",
  applied on every navigation rather than once at startup, and widened to every
  surface that draws a conversation: the live rep, text mode, a saved
  transcript or scorecard, and the field log. Sentry has **no replay
  integration installed at all**, deliberately — two recorders with two sets of
  route conditions is two places to get the same privacy rule wrong.

**Both are off until keyed.** No `NEXT_PUBLIC_POSTHOG_KEY` and no DSN means the
SDKs are never initialised and, because the imports are dynamic and inside the
key check, never even fetched. That is the state in development, in CI, and in
any deployment where the variables are blank — so installing these packages
changed nobody's network traffic. `.env.example` documents all four variables.

**The bundle.** A static import of both SDKs pushed First Load JS from 103 kB
to 176 kB on *every* page, the landing page included — which §14 has a
merchant-of-record reviewer opening. Both imports are now dynamic and inside
their key checks, and shared first-load is back to **103 kB exactly**. The
trade is that errors thrown in the first moments after hydration are missed;
that is stated in `instrumentation-client.ts` rather than left to be
discovered.

**One small change outside the analytics layer.** `useRepSession` now returns
`endReason` (`lib/data/rep.ts`). The adapter has always reported it and
`finishSession` has always written it down, but the screen could only guess —
and `rep_completed` is a reliability measure, where "she left" and "the
transport died" are the two cases worth telling apart. `outcome.won` cannot
separate them.

**Still owed by hand:**

1. **Create the PostHog project and set the key.** Nothing is recorded until
   then. This is the half of B7 that is an account, not code.
2. **Create the Sentry project and set the DSN.** Same.
3. **Source maps.** `withSentryConfig` is not wired into `next.config.ts`,
   because uploading source maps needs an auth token that does not exist yet.
   Until it is, a production stack trace will be minified.
4. **Confirm the first events land.** The funnel is written but has never been
   seen arriving in a real project.

## What this response did not touch

The audit's P1s and P2s are open and untouched: the live-session production
layer, the persistent training mission, guided text-mode cues, annotated
session replay, and the weekly commitment loop. So is the second operational
gap — **the Sunday review is built but never scheduled**
(`LAUNCH-GAP.md`:747), which is a cron job, not an analytics problem.

The audit's reframing argument — that the product is a dashboard without a
coach, and that one persistent mission should run from scorecard to Train to
brief to next scorecard — is a product decision, not a bug, and it is the
right thing to read before the P1s are picked up.

---

# P1 — what shipped

*Appended 1 September 2026. All three P1 rows. The P2s — annotated session
replay and the weekly commitment loop — are untouched.*

## Verification

| Check | Before P0 | After P1 |
|---|---|---|
| `npm run typecheck` | clean | clean |
| `npm run lint` | clean | clean |
| `npm test` | 1072 passed, 56 files | **1144 passed**, 64 files |
| `npm run build:check` | succeeds | succeeds, 18/18 static pages |
| First Load JS shared by all | 103 kB | **103 kB** |

Every route touched by this work compiles and answers 200 in dev with nothing
in the log: `/train`, `/rep/:id/brief`, `/rep/:id/live`, `/text/:id`,
`/progress`, `/profile/settings`, `/library/:slug`, `/field`.

**Visual pass done 1 September**, signed in against the real database. It found
two defects that every automated check had passed, both now fixed:

- **The cue rail sat flush against the left edge of the viewport** while the
  thread and composer it belongs to were centred. It had no width and no auto
  margins; it has `.text-rep__compose`'s now.
- **The active cue was not styled at all.** `aria-current="step"` was on the
  right chip and looked identical to the other two, so "exactly one cue is
  active" was true in the markup and invisible on screen. Worse, `--done` was
  the volt one, which pointed the eye at the cue already behind you. Brightness
  now runs forwards: passed is quietest, active is brightest, coming is in
  between, and no volt anywhere — the send button is that screen's one accent.

Confirmed working: the Progress trend in Volt with six Cool sparklines under a
**Composite score** label; the mission reading *Signal reading* identically on
Train, the brief and the scorecard; the cue rail appearing only after the first
message; both Settings toggles live; the 404's Go home; `/icon.svg` served as
`image/svg+xml`.

The **staged reveal was measured rather than eyeballed** — sampling the DOM
across a real load gives composite `5 → 36 → 53 → 62 → 65` over ~900 ms on the
cubic ease-out, `data-revealing` flipping true→false, then the seven rows
arriving `0 → 3 → 6 → 7` behind it. That is exactly §02's "900ms, sub-scores at
60ms".

**Still owed: the live rep in situ, and the sound.** The 3·2·1 overlay is
confirmed only against injected markup with the real stylesheet — correct
Volt count, correct label, correct full-bleed ground — because opening the real
screen starts a Realtime session, which spends a voice rep and real money. The
kit has still never been heard out loud, and the room tone has never played.

## 1 · The live-session production layer

The audit called this "the highest-leverage fix for lifeless", and the
diagnosis under it was right: the screen was already *correct* — timer, orb,
band, wrap cue — and correct is not staged. A rep began the instant a WebRTC
connection happened to open, and ended when a component swapped.

**Four beats, in `lib/hooks/use-rep-production.ts`.**

| Beat | What happens |
|---|---|
| arm | 3·2·1 full-bleed over the orb, a tick and a haptic on each count |
| open | a resolving tone an octave above the ticks |
| mark | thirty seconds out — the quietest sound in the kit, and **no haptic** |
| close | a falling tone, a two-pulse haptic, and the whole screen dims |

**The ordering is the part that matters.** `onGo` fires on the *first* tick,
not the last, so the session is connecting underneath the count. Counting first
and connecting after would have spent 2.1 seconds on ceremony and then handed
the user a silent pause with a stranger in it — which is the thing that made
the entrance feel dead in the first place. The overlay replaces "Connecting ·
she can't hear you yet" rather than queueing behind it.

**The sound kit is synthesised, not sampled** (`lib/audio/kit.ts`). Six sounds,
zero bytes over the wire, and — the real reason — a table of frequencies and
envelopes is reviewable in a diff the way six binary files are not, which is
what rule 8 asks of content. Every pitch is an interval from one root (392 Hz),
so the countdown tick and its resolution are a phrase rather than two beeps.
Seven assertions in `kit.test.ts`, and one of them **failed on first run**: the
exit sound rang for 410 ms against §02's 400 ms ceiling. The sound moved, not
the bound.

`wrap` has no haptic and is the quietest thing in the kit, asserted in the
tests. §05 forbids coaching mid-rep, and a buzz against the leg while somebody
is mid-sentence is the most literal interruption available.

**Room tone came back, without reopening the intelligibility decision.**
`docs/AUDIO.md` records that convolution was switched off because it made her
harder to understand, and that decision stands. But one flag was answering two
questions: `sceneForRoom` returns null with acoustics off, both adapters then
skip building a `Room` at all, and **the ambient bed went silent with the
convolver** — even though AUDIO.md's own graph shows them as independent
chains. The bed was collateral damage.

`lib/audio/room-tone.ts` is the bed on its own. No convolver, no wet send, and
**no voice input node at all** — there is physically nothing for her audio to
be routed through, which is what makes it unable to undo the fix. It replays
the beds already authored in `scenes.ts` rather than specifying new ones, so a
new scene stays a config row. AUDIO.md predicted this shape: *"Recorded room
beds arrive as audio files later and are a different mechanism from this one."*
This is that mechanism, synthesised rather than recorded.

That also closed a loop in Settings. The **Room ambience** toggle was disabled,
reading *"Rooms are silent while the new sound is recorded"*. It is live, and
`roomToneAvailable()` now answers the bed question separately from
`roomAcousticsEnabled()`, which answers the convolver one.

**Staged score reveal** (`lib/hooks/use-staged-reveal.ts`): the composite
climbs over 900 ms on a cubic ease-out, the six rows arrive behind it at 60 ms,
and the kit's only chord lands when the number settles. §02 names the score
reveal as *the* example of the reduced-motion rule, so under that preference
both hooks return their finished state on the first render — not a faster
animation, no animation.

**A `Rep sounds` toggle** is in Settings, per §02's "mutable in one tap". Per
browser rather than per account: whether you want the countdown audible is a
fact about the room you are sitting in.

**One change outside the production layer.** `useRepSession` gained nothing
here — but `start()` is no longer called from a bare effect, so the live screen
now has an explicit `repReady` predicate instead of a five-term boolean inline
in a dependency array.

## 2 · One persistent training mission

`lib/data/mission.ts`. Six missions, one per §07 dimension, **derived not
stored**: `Scorecard.focus` is already "the two weakest, surfaced as the focus
for the next rep" and `useLatestFocus` already reads it, so the mission is
`focus[0]` plus authored copy. No column, no migration, and no way for it to
disagree with the scorecard that produced it.

It says the same sentence in five places, which is the entire point — the
audit's complaint was that the recommendation and the next attempt "feel like
unrelated links":

| Surface | Form |
|---|---|
| scorecard | `MissionCard`, kicker "Next rep" — set from the rep just graded |
| Train | `MissionCard`, above the day's character |
| brief | `MissionNote`, one line above Start |
| live rep | `MissionLine` — §05 rule 6 allows exactly "timer, waveform, mission" |
| text mode | the cue rail below |

**The rule that makes it safe: a mission may never contain a line to say.**
This is the one surface positioned to turn the product into the thing its
landing page says it is not — it is what you read immediately before speaking.
`assertNoScript` refuses a quotation, the first person, or a cue long enough to
be read out loud, and it **throws rather than trimming**, the same way
`assertPublishable` and `lib/grade/memory.ts` do. It caught one of my own cues
on first run: *"Use what is in front of you"* was seven words. The cue changed.

The live-rep line is `aria-hidden`. That screen already has two polite live
regions, and a third string read aloud while she is mid-sentence is the audio
equivalent of coaching; it is announced on the brief instead, which is where a
screen-reader user meets it.

## 3 · Text mode as a guided warm-up

`lib/text/cues.ts` and a rail above the composer. The audit's wording was
careful and it is the whole specification: *"direct attention without writing
the user's line."*

**It does not contradict the comment it sits beside.** `text-screens.tsx` says
*"No coaching, and no examples to copy. Saying the first thing is the skill
being trained."* That is right and it stays — the distinction is between a
**line** ("So what got you into that?" — you say it, you learned nothing) and a
**direction** ("Go deeper, not wider" — you still have to find the words, which
is the part that transfers). The empty state is untouched: the first thing you
say still gets no help at all, and the rail only appears once a conversation
exists. It disappears when she has gone, because a direction about a finished
conversation is advice about something that can no longer be done.

The cues are the **mission's own**, so text mode points at the same objective
the scorecard set rather than inventing a second vocabulary. Attention moves
with the conversation: the active cue advances on the user's own turn count —
never the total, so a character who replies twice cannot advance somebody's cue
for them.

## Files

```
lib/audio/kit.ts                     new — six synthesised sounds
lib/audio/kit.test.ts                new — 7 tests, incl. §02's 400ms ceiling
lib/audio/room-tone.ts               new — the bed, without the convolver
lib/audio/room-tone.test.ts          new — 5 tests
lib/hooks/use-rep-production.ts      new — the four beats
lib/hooks/use-staged-reveal.ts       new — count-up and stagger
lib/data/mission.ts                  new — six missions + assertNoScript
lib/data/mission.test.ts             new — 14 tests
lib/text/cues.ts                     new — the cue rail
lib/text/cues.test.ts                new — 11 tests
lib/data/production-styles.test.ts   new — 7 class-reachability tests
components/mission.tsx               new — the three sizes
lib/haptics.ts                       three named patterns
lib/audio/scenes.ts                  roomToneAvailable(), separate from the convolver
app/globals.css                      the beats, the mission, the rail, the reveal
components/screens/rep-screens.tsx   countdown replaces the bare start effect
components/screens/session-screens.tsx  staged reveal + the mission it sets
components/screens/train-screen.tsx  the standing mission
components/screens/text-screens.tsx  the cue rail
components/screens/profile-screens.tsx  Rep sounds toggle; Room ambience enabled
```
