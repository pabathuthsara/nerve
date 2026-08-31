# Onboarding audit

The run between the sign-up form and the first spoken word, read as a cold
user would meet it, then measured against the rules in `CLAUDE.md` and §02.

> **Status: every item in §3 has shipped.** §7 is the record of what actually
> landed, including three defects that only appeared once the run was driven in
> a browser — one of them a redirect loop that would have shut every Google
> sign-up out of the product. §1 and §2 are left as written, because a fix list
> is worth less than the reasoning that produced it.

Everything below is a finding against the code as it stands on
`elevenlabs-pipeline`. Line references are to the files as read, not to a
commit — they will drift, the reasoning will not.

**Scope constraint, stated up front:** nothing proposed here edits a persona.
`lib/personas/*`, the warmth engine and the persona contracts are out of bounds
for this work, and §5 says exactly where onboarding currently touches persona
surface and how each touch stays a *read*.

---

## 1 · What the run is today

Seven screens between "create account" and the first word spoken:

| # | Route | Asks | Written |
|---|---|---|---|
| — | `/onboarding/age` | Date of birth (gate, §16.4) | `date_of_birth`, `age_confirmed_at` |
| 1 | `/onboarding/track` | Dating / interview / English | `active_track`, `ui_flags['onboarding:track']` |
| 2 | `/onboarding/focus` | What the hard part is | `focus_area` |
| 3 | `/onboarding/experience` | How often, for real | `experience` |
| 4 | `/onboarding/name` | First name (skippable) | `display_name`, `ui_flags['onboarding:name']` |
| 5 | `/onboarding/mic` | Microphone permission + level | `vad_offset_ms` |
| 6 | `/onboarding/ready` | Nothing — it is the brief | `onboarding_complete` |

**Step 6 now spends the one free voice rep the product gives away (31 Aug).**
Free grants no reps a day, so the rep started from this screen is the sign-up
rep, held once per account on `entitlements.onboarding_rep_used_at`
(`PAYMENTS-NEW-INTEGRATION.md` §4). Three consequences for this run
specifically:

- **It has to be the character authored to be won.** That is Tess, rung 1, and
  the run reaches her through `chooseTodayPersona` over the roster the server
  sent — not through a hardcoded slug (see O4/R12 below). A fresh account is at
  `current_level` 1, so she is the only unlocked candidate.
- **Abandoning the run must not cost the rep, and resuming must not mint a
  second.** The stamp answers both, and it is on a table with no user write
  path. Somebody who leaves after the mic step and comes back on Thursday still
  has their rep.
- **A muted microphone must not spend it.** `refundRep` clears the stamp when
  the rep it hands back was the sign-up one, because on free there is not
  another one behind it.

It stays inside the authenticated part of the flow, deliberately: `requireUser`
and `maySpend` both still apply, so the most expensive endpoint in the product
is never reachable anonymously and the per-account spend ceiling still bounds
it.

Password sign-up asks the date of birth itself, so a password account never
sees the gate. Google accounts and every account older than the gate do.

The run is six separate route navigations through the `app/[...slug]`
catch-all. Each one re-runs `enforceFrontendGuard` — `currentUser()` plus a
`profiles` select — before anything renders.

The good decisions already in it, so that nothing below is read as a rewrite:
every answer is written the moment it is given; the guard resumes at the first
unanswered step rather than at step one; the mic step has six states because
`getUserMedia` does not settle while the browser bubble is open; there is a
sign-out inside the chrome. Those were B13's fixes and they hold.

---

## 2 · What is wrong

### 2.1 Answers that buy nothing, and one that lies

**O1 · `experience` is written and read by nothing.**
`saveOnboardingChoice` writes `profiles.experience` (`app/profile/actions.ts:132`).
The only other readers in the repo are `onboardingResumePath`, which uses it to
decide whether this step was answered, and `app/page.tsx`, which selects it for
the same reason. It is absent from `lib/data/queries.ts:83` — so it never
reaches `UserState`, and no screen, no persona choice, no field assignment and
no grading path can see it. It is a question whose entire function is to be a
question.

LAUNCH-GAP §"Three onboarding answers that bought nothing" closed the `focus`
and `name` halves of this and left this one open. It is the survey step, and
users learn to click through surveys.

**O2 · The interview waitlist records no demand.**
`onboarding-screens.tsx:111` prints `Demand recorded` in volt and *"You're on
the list."* Nothing is written. `choose('interview')` sets a boolean after a
180ms timeout and returns; there is no table, no action, no grep hit for a
waitlist anywhere in `app/` or `lib/`. This is the one place in the product
that could tell us whether M4's track is worth building, and it is a screen
that says it did something it did not do. Under CLAUDE.md's honesty rule this
is the same class of defect as a share card that claims a score it did not
earn.

**O3 · "I'll wait" is a dead control.**
Same line. `<Button fullWidth variant="ghost">I'll wait</Button>` has no
`onClick`. It is a full-width button on a two-button screen that does nothing
when pressed. The only way off the waitlist screen is the other button, which
switches the user to dating.

**O4 · The focus answer's first promise is made by a screen that ignores it.**
`lib/data/focus.ts` says `personaSlugs` decides "the character the first rep is
against". `ReadyStep` hardcodes `usePersona('nadia')`
(`onboarding-screens.tsx:372`). It happens to agree today, because Nadia is the
only level-1 persona and `chooseTodayPersona` filters to the top unlocked rung,
but the agreement is a coincidence maintained by hand. The moment a second
level-1 character is seeded, `/train` and `/onboarding/ready` disagree about
who you are meeting and the questionnaire visibly stops mattering on the one
screen where the user is still deciding whether it did.

> **Fixed by R12, and the hypothetical arrived on 31 August.** Tess took rung 1
> and Nadia moved to rung 2, so the hardcoded slug would now be naming a
> character the run cannot reach on a fresh account. The ready screen resolves
> through `chooseTodayPersona` over a server-rendered roster instead, which is
> the same function `/train` runs.

**O5 · Nothing tells the user what an answer buys.**
`FocusStep` and `ExperienceStep` are a heading and four buttons. `NameStep` is
the only step with a subtitle, and it is the only step that reads as considered.
The focus answer genuinely steers three surfaces — first character, first field
challenge, the technique card on the brief — and the screen that collects it
says none of that.

**O6 · No answer can be revised.**
`/profile/settings` edits display name, audio devices, ambience, warmth digits
and data. There is no row for "what you're training for". The answer that
steers the first field challenge and the brief's technique card is set once,
in the first ninety seconds a user ever spends in the product, and is then
permanent.

### 2.2 The escape hatch is a trapdoor

**O7 · "Look around first" ends onboarding forever.**
`MicStep.skip` (`:244`) calls `finishOnboarding()`, which sets
`onboarding_complete`. The guard then bounces every future visit to any
`/onboarding/*` route straight to `/train` (`lib/data/guards.ts:85`). A user who
could not grant the microphone in that moment — wrong device, corporate policy,
a browser that suppressed the bubble — has permanently skipped the mic check
*and* the ready screen, has never seen the rep brief or the "How a rep works"
sheet, and has no route back to either. Their next encounter with the product's
core explanation is the rep itself.

This was the right fix for "onboarding had no exit". It is the wrong shape for
"onboarding can be resumed".

**O8 · The rail promises six steps and the escape exits at five.**
`OnboardingProgress` renders six ticks. Taking the mic escape leaves four
filled, one current and one never reached, with no acknowledgement anywhere
that the run ended early.

### 2.3 Perceived performance — the biggest premium lever

**O9 · Every tap costs two sequential round trips, and nothing on screen says so.**
An option tap runs `saveOnboardingChoice` — a `profiles` update *plus*
`revalidatePath('/', 'layout')` — awaited to completion, then `router.push` to
a dynamic catch-all route that re-runs `currentUser()` and a `profiles` select
before rendering. Six times. The `revalidatePath` is pure waste here: nothing
in the app shell is on screen during onboarding.

The await is deliberate and the comment explains why — navigating before the
write lands sends the guard's resume back to the step just answered. The
reasoning is right; the shape it forced is what makes the run feel slow.

**O10 · The only feedback during that wait is a 2px volt bar, and the card stays live.**
`Option` (`:186`) sets a local `selected` flag and calls the handler. It is not
disabled afterwards. Two quick taps fire two writes and two pushes. On a slow
connection the screen simply sits there, looking like a button that did not
work — which is the exact failure mode B13 §4 was written about.

**O11 · Nothing is prefetched.**
Steps navigate by `router.push` to routes served by a catch-all. There is no
`<Link>` to warm, no `router.prefetch`, and the final step pushes to
`/rep/nadia/live` cold.

**O12 · Going back loses the answer.**
The back arrow exists on every step after the first. `Option`'s selection is
local `useState`; the steps never read the saved value from the profile. So a
user who goes back sees an unanswered question they have already answered, and
the only way forward is to answer it again. The database is right and the screen
is wrong.

**O13 · The mic meter re-renders React at frame rate.**
`setLevel(next)` inside `tick()` (`:282`) drives a state update every
`requestAnimationFrame`, re-rendering `MicStep` and twelve `<i>` children ~60
times a second for as long as the check runs. A CSS variable written straight to
the DOM node does the same job for nothing.

**O14 · The last screen before the first rep fetches from the client.**
`ReadyStep` calls `usePersona('nadia')` and draws a skeleton circle while it
resolves. The server rendering that route already knows who the persona is. It
is the one screen where the user is waiting to start, and it is the one screen
that makes them wait for a client fetch first — against the stack rule that
read paths are RSC.

### 2.4 Honesty and copy

**O15 · The mic confirm shows a transcript of speech nobody transcribed.**
`:354` renders `"testing, one two three"` in `.mic-transcript` — a volt-ruled
quote block in the mono data face, under the heading *"We can hear you"*. No
speech recognition ran. The check measures amplitude and pause length. The
screen presents the phrase the user was *asked* to say as though it were the
phrase the system *heard*, which is the one impression a mic check must not
create — because the user's next assumption is that a rep will understand them
too.

**O16 · "Nothing is recorded to disk" contradicts the privacy page.**
`:318`, on the screen that primes the microphone permission for the whole
product. `components/site/legal-pages.tsx:229` opens with *"We record your
voice"*, and `:288` promises session audio for thirty days with a scheduled
purge — which `app/api/cron/purge-audio/route.ts` implements. The sentence is
true of the mic check in isolation and false as the user will read it, one
screen before the first rep. Per CLAUDE.md's rule that a change to what the
product claims is a change to the legal pages, these two surfaces have to agree.

**O17 · The age gate's stated behaviour is not its actual behaviour.**
The doc comment above `AgeStep` (`:82`) says a refusal is final, that there is
no second attempt offered and that signing out is all that is left. The code
sets a message and leaves Continue live, so a refused date can be edited and
resubmitted indefinitely. One of the two is wrong and the comment is the one
that reflects §16.4's intent.

### 2.5 Design-system fidelity

**O18 · Volt appears twice on four of the mic states.**
CLAUDE.md: *"If volt appears twice on a screen, one of them is wrong."* The
`request` and `requesting` states pair a volt `Mic` glyph (`:316`, `:323`) with
a volt primary `Button`. `confirmed` pairs a volt `Check` (`:352`) with a volt
transcript rule *and* a volt primary Button — three. The `testing` state is the
only one that gets it right, because volt is on the meter, which is the data.

**O19 · The progress rail cannot show where you are.**
`index <= step ? 'done' : ''` — the current step and every completed step render
identically. The rail says how far along you are and not what is happening now,
which is the one thing volt exists to mark ("current position").

**O20 · Onboarding is the only part of the app with no screen-heading pattern.**
Every other screen opens with the `label` eyebrow above a `display-lg`
(`screen-heading`). Onboarding steps are a bare `h1` in a 40px grid. It reads as
a different product's flow bolted onto the front of this one.

**O21 · Consecutive screens have opposite alignment.**
`.mic-check { justify-items: start }` and `.brief-shell` is centred. The mic
step and the ready step are back to back, so the composition jumps left-aligned
→ centred at the last transition before the rep.

**O22 · No transition anywhere.**
Six full document navigations. The chrome — rail, back arrow, sign-out — is torn
down and rebuilt each time, and the rail's advance is a repaint rather than a
move. There is no `prefers-reduced-motion` question to answer here yet, because
there is no motion.

### 2.6 Accessibility

**O23** · The rail is a `<div aria-label="Step n of 6">` with no role and no
`aria-current`; a step change is not announced.
**O24** · Focus is not moved on step change. After a `router.push` focus stays
where the document put it, so keyboard and screen-reader users re-enter each
screen from the top of the chrome.
**O25** · Option cards get no `aria-busy` or `disabled` while their write is in
flight (see O10), so assistive tech is told nothing happened.
**O26** · `.mic-meter`'s `aria-label` is rewritten every frame.
**O27** · The waitlist swap (`:111`) replaces the question in place with no
focus management and no live region — for a screen-reader user the screen
silently becomes a different screen.

---

## 3 · What to do

Ordered by leverage. Each item names the file it lands in.

### Tier 0 — Correctness and honesty. Cheap, and not optional.

**R1 · Record the interview demand, or stop claiming it.** (O2)  ·  **shipped**
Cheapest honest version: stamp `ui_flags['waitlist:interview']` with a
timestamp through the existing `saveOnboardingChoice` path — no migration, the
flag pattern the profile already uses for one-time beats, and countable with
one query when M4 is scheduled. Then the copy is true. If we would rather not
carry the flag, the fix is the copy: *"Interview training opens soon"* with no
claim that anything was recorded.

**R2 · Wire "I'll wait" or delete it.** (O3)  ·  **shipped**
It should complete the run on the dating track the same way the other button
does, or it should not be a button. One line either way.

**R3 · Decide `experience`: wire it or cut it.** (O1)  ·  **shipped**
Recommendation: **cut the step.** It removes a screen from a run that has too
many, and nothing downstream loses anything, because nothing downstream ever
had it. Cutting touches `STEPS`, `onboardingResumePath`, `route-view.tsx`'s
route set, and — this is the part that is easy to miss —
`components/site/legal-pages.tsx:241`, which currently tells the world we
collect "your self-described experience level". Under the rule that a change to
what we collect is a change to what the legal pages claim, that edit is part of
the same commit.
If we would rather keep it, the honest wiring that does not go near a persona
is to let it pick the *starting field-challenge tier* and whether the "How a rep
works" sheet opens by default on the ready screen. Both are `lib/` decisions and
neither is a difficulty change.

**R4 · Say what the mic check actually did.** (O15)  ·  **shipped**
Replace the fake transcript block with the thing that was measured: level, and
that the turn-taking window has been set from how they speak. The mono data
face is right for it — it just has to carry a number rather than a quotation.

**R5 · Make the microphone copy agree with the privacy page.** (O16)  ·  **shipped**
One sentence: reps are recorded and kept for thirty days, this check is not. It
is a better sentence than the one there now, because it front-loads the promise
the privacy page already makes rather than contradicting it. Re-read
`PAYMENTS-APPROVAL.md` §5.1 when this lands.

**R6 · Reconcile the age gate with its own comment.** (O17)  ·  **shipped**
Either make the refusal final as documented — message, Continue removed,
sign-out the only control — or change the comment. §16.4's claim is that a
minor has to lie deliberately; an unlimited retry loop on the same form quietly
weakens that, so the code should move, not the comment.

### Tier 1 — Perceived speed. This is what "premium" actually means here.

**R7 · Collapse the run into one route with local step state.** (O9, O11, O12, O22)  ·  **shipped**
The single highest-leverage change, and the pattern already exists in this
repo: `SignupForm` in `auth-screens.tsx` is two steps in one route, with a
comment explaining why — *"a route would be a URL somebody can land on cold, a
back button that walks out of signup, and a half-filled form to restore."* The
same argument applies with more force to six steps.

Shape: `/onboarding` renders one client component holding the step index. Every
answer is still written the moment it is given (unchanged), but the *advance* no
longer waits for the write and no longer costs a navigation. Deep-link resume
survives untouched, because the guard still resolves `onboardingResumePath` on
the cold load and the component opens at that step. Back becomes local state, so
O12 disappears for free — the previous answer is still in memory and still
selected.

What it removes: six route round trips, six guard executions with a `profiles`
select each, the prefetch problem, the chrome teardown, and the back-loses-
answer bug. What it costs: the per-step URLs. Worth it — nobody deep-links to
step three except the resume, and the resume can keep its URLs by having
`/onboarding/[step]` render the same component with a starting index.

**R8 · Drop `revalidatePath('/', 'layout')` from the onboarding writes.** (O9)  ·  **shipped**
`updateProfile` revalidates the whole layout because the shell reads the
profile. The shell is not on screen during onboarding. Either take a
`revalidate: false` option on `updateProfile` for these calls, or revalidate
only on `finishOnboarding`, which is the one write the shell actually needs to
see.

**R9 · Make the option card state its own progress, without a spinner.** (O10, O25)  ·  **shipped**
Disable the card and set `aria-busy` while the write is in flight; let the volt
edge be the affordance. §02 forbids spinners, not feedback. This also removes
the double-fire.

**R10 · Prefetch the first rep.** (O11)  ·  **shipped**
`router.prefetch('/rep/nadia/live')` — or, once R14 lands, the persona the
choice actually resolves to — from the mic step. Route only. Nothing that mints
a token or spends money runs early.

**R11 · Take the mic meter out of React.** (O13, O26)  ·  **shipped**
Write the level to a CSS custom property on the meter node from inside `tick()`
and let the bars fill off it. No state, no re-render, no per-frame `aria-label`
churn; give the meter one stable label and a `role="img"`.

**R12 · Server-render the ready screen's persona.** (O14)  ·  **shipped**
Pass it in from the route rather than fetching it client-side. The last screen
before the first rep should not open with a skeleton.

### Tier 2 — Feel, inside the design system.

**R13 · Rebuild the rail so volt marks position, not history.** (O19)  ·  **shipped**
Three states: completed = `--line-bright`, current = volt, pending = `--line`.
This is what the design system already says volt is for, and it resolves the
"two volts" tension on the question screens rather than adding to it. Add
`aria-current="step"` and give the rail a `role="group"` with the label it
already has (O23).

**R14 · One volt per mic state.** (O18)  ·  **shipped**
Volt belongs to the meter — the data — and to the primary button. The `Mic` and
`Check` glyphs go `--text-dim`; the transcript rule (or whatever replaces it
under R4) drops its volt border. The `waiting` and `denied` states are already
correct: amber and red are semantic there, not decorative.

**R15 · Give every step the screen-heading pattern.** (O20)  ·  **shipped**
`label` eyebrow + `display-lg` + one hand-authored line saying what the answer
changes — for focus, that it picks who you meet first, your first field
challenge and the card on your brief. It makes the questionnaire visibly
load-bearing, which is the actual fix for "this feels like a survey", and it
costs four sentences.

**R16 · Add the step transition R7 makes possible.** (O22)  ·  **shipped**
Once the run is one route: 160–200ms cross-fade with an 8px rise on the question
block, the rail tick advancing under a width transition, chrome untouched
because it never unmounts. Hairlines and opacity, no shadows, no scale.
`prefers-reduced-motion` collapses it to an instant swap, as everywhere else.

**R17 · Move focus to the step heading on advance.** (O24)  ·  **shipped**
`tabIndex={-1}` on the `h1` and focus it when the step changes. Fixes the
screen-reader re-entry and makes keyboard traversal feel deliberate rather than
accidental. Also fixes the waitlist swap (O27) if the same helper covers it.

**R18 · One haptic tick on selection.** (O — feel)  ·  **shipped**
`lib/haptics.ts` already exists, already respects `prefers-reduced-motion`, and
is currently used only by the date wheel. Reuse `tap()` on option select. Do not
add a second haptics mechanism; the file's comment explains why iOS gets
nothing and that is the right answer here too.

**R19 · Settle the alignment.** (O21)  ·  **shipped**
Centre the mic step to match the ready step, or left-align both. Centred is the
better choice: the last three screens then read as one arrival sequence into the
brief, and the mic meter is a full-width element either way.

### Tier 3 — Flow and shape.

**R20 · Make the mic escape resumable rather than terminal.** (O7, O8)  ·  **shipped**
"Look around first" should not set `onboarding_complete`. Stamp
`ui_flags['onboarding:deferred']` instead and teach `enforceFrontendGuard` to
treat it as a pass, then put one quiet row on `/train` — "Finish setup · check
your microphone" — that returns to the step. The guard change is small and
local: the `!profile?.onboarding_complete` branch gains an `&& !deferred`.
Users who defer keep a way back to the brief and the "How a rep works" sheet,
which today they lose permanently.

**R21 · Let the focus answer be changed.** (O6)  ·  **shipped**
A row in `/profile/settings` under Training, reusing `FOCUS_OPTIONS` and
`saveOnboardingChoice`. Read-only with respect to everything a user could pay to
change — `focus_area` is a preference, not an entitlement, so this is inside
rule 9, not against it.

**R22 · Resolve the ready screen's persona through the same function `/train` uses.** (O4)  ·  **shipped**
`chooseTodayPersona(personas, [], 1, focusArea)` over the seeded roster instead
of the hardcoded `'nadia'`. Same rule, one place. See §5 — this is a read, and
it changes no persona and no selection rule.

**R23 · Consider whether the run should be five screens.** (O1 + shape)  ·  **shipped**
With `experience` cut (R3) the run is age → track → focus → name → mic → ready.
That is defensible. If it should be shorter still, the honest candidate is
`name`, folded into the ready screen as an inline field above Start — "she'll
call you ___" is a better moment there than as a screen of its own, because it
sits next to the character who will use it. Flagging it as a decision rather
than recommending it: the name step is the one step whose copy already works.

### Tier 4 — Measurement.

**R24 · The onboarding funnel is the first thing PostHog should carry.**  ·  **still owed, blocked on B7**
Per-step drop-off is unmeasurable today; B7 has analytics specified and not
installed. Every recommendation above is an argument from the code, and the
only one that could be settled by evidence instead — how many people leave, and
on which screen — needs the thing B7 is already tracking. Do not build a
bespoke counter for it.

---

## 4 · Suggested order

1. **R1, R2, R3, R4, R5, R6** — the honesty set. Small, independent, and two of
   them (R3, R5) touch the legal pages, so they should travel together with one
   read of `PAYMENTS-APPROVAL.md` §5.1.
2. **R7 + R8 + R9 + R12** — the single-route rebuild. This is the change the
   rest sit on, and it is where the "feels slow" complaint is actually resolved.
3. **R13, R14, R15, R16, R17, R18, R19** — the feel pass, all of it cheap once
   R7 has landed and the chrome stops unmounting.
4. **R20, R21, R22** — the flow fixes, each independent of the others.
5. **R10, R11, R23, R24** — the tail.

---

## 5 · The persona constraint

No item in §3 edits a persona. Stated precisely, because two of them are near
the boundary:

- **`lib/personas/*` is untouched.** No contract, no dial, no trajectory, no
  level, no visual entry. R22 *reads* the seeded roster through
  `chooseTodayPersona`; it does not rank, filter or author anything.
- **`lib/data/focus.ts` is untouched.** `personaSlugs` stays the last tie-break
  in `chooseTodayPersona` and keeps behaving as its comment describes — settling
  the first rep and then getting out of the way. R15 only makes the existing
  behaviour visible to the user in copy; it does not change what the answer does.
- **`lib/warmth/*` and `lib/data/rep-rules.ts` are untouched.** Nothing here
  changes the rep format, the thresholds, the ladder or difficulty. R3's
  alternative wiring for `experience` was deliberately routed to the field-
  challenge tier and a sheet default *because* the tempting version — using
  self-reported experience to adjust difficulty — would be a silent difficulty
  change, and §08/§12 forbid announcing one, which makes it exactly the wrong
  place to put a user's own answer.
- **Rule 8 holds.** Every new string above is hand-authored in the repo and
  reviewed in a pull request. Nothing is generated at runtime.

The one thing that does change about persona *surface* is that
`/onboarding/ready` stops hardcoding a slug — which makes the roster harder to
break, not easier.

---

## 6 · Doc upkeep when this lands

Per `docs/README.md`'s table:

| If you ship | Update |
|---|---|
| R3 (cut `experience`) or R5 (mic copy) | `components/site/legal-pages.tsx`, then `PAYMENTS-APPROVAL.md` §4 and re-read §3 |
| R6 (age gate refusal) | `lib/safety/age.ts` tests are the argument; `LAUNCH-GAP.md` B3 |
| R7 (single-route run) | `LAUNCH-GAP.md` §"routes" table row for `/onboarding/*`, and `INTEGRATION-GAPS.md` if any screen moves off a fixture |
| R20 (deferred onboarding) | `DATA.md` — the new `ui_flags` key and what the guard does with it |
| R21 (focus in settings) | `PRODUCT.md`, and `LAUNCH-GAP.md` §4 if it now disagrees with the spec |
| Anything in §3 at all | this file — mark the item shipped, with what actually landed and what is still owed by hand |

Verification unchanged: `npm run typecheck`, `npm run lint`, `npm test`,
`npm run build:check`. R20 changes the guard, so `npm run db:verify` as well.
Nothing here touches grading, so `grade:calibrate` is not implicated.

---

## 7 · What landed

Twenty-three of the twenty-four items in §3 shipped. R24 is not code we can
write — analytics are B7 and PostHog is still not installed, and building a
bespoke counter for one funnel is what that item explicitly says not to do.

The run is now **five screens and a gate**: age → track → focus → name → mic →
ready. `experience` is gone, and the privacy page's collection list changed in
the same edit because it named the answer we no longer take.

### 7.1 Three defects the audit did not predict

All three were found by driving the run in a browser as a cold user, not by
reading it. Two of them the read could never have found, because they are
behaviours of the router and of the redirect graph rather than of any one file.

**N1 · The age gate was an infinite redirect for every account without a date.**
This is the serious one, and it was live. `enforceFrontendGuard` excluded
`/onboarding/age` from the set of routes exempt from the "send an unfinished run
to its resume step" rule — deliberately, and the comment explained why: a user
who had *finished* onboarding and had no date on file would otherwise be bounced
to `/train` and back here forever.

It answered one shape and created the other. A brand-new Google account has no
date **and** no finished run, so the same rule sent it from `/onboarding/age` to
`/onboarding/track`, which had no date either and sent it straight back. The
screen §16.4 exists to show could not be reached by the accounts it exists for —
which is every account that does not come through the password form, because
that form is the only door that collects a date of birth. The guard now returns
on the age route: past the two rules above it, the date is missing and this
screen is the only thing allowed to render, so nothing below may send them
anywhere.

**N2 · Rewriting the URL mid-run threw away every answer.**
R7 was implemented first with `history.replaceState`, so the address bar would
follow the step without paying for a navigation. It works going forward and
destroys the run going back: the App Router treats a pathname written through
the History API as router state, and re-entering a path it has already seen
remounts the segment — so the back arrow reset `track`, `focusArea` and
`displayName` to the values the server sent on first load, which is precisely
the bug the single route existed to fix. Caught by instrumenting the component
with a mount id and watching it change.

So the address bar is not the record of where somebody is. The database is, and
it always was. The run opens at `resumeRoute` — the first unanswered step —
however it was reached, which makes a reload at any point land on the step they
had actually got to. That is a stronger guarantee than the five-route version
gave, and it needs no cooperation from the router.

**N3 · The track question opened pre-answered.**
`active_track` carries a database default, so seeding the selected state from it
showed "Talking to people I'm attracted to" already chosen to somebody who had
chosen nothing. It is the same trap `onboardingResumePath` has a flag to avoid,
sprung one screen further along, and it was introduced by R12's fix rather than
found by it. The context now reads the answer only when
`ui_flags['onboarding:track']` says there is one.

### 7.2 Two things fixed on the way past

**Redundant redirect on every sign-in.** `app/page.tsx` resolved the onboarding
resume path without checking the age gate first, so an account with no date was
sent to its resume step and bounced from there — two redirects and a screen
nobody was allowed to see, on every sign-in until the date was given. It now
orders the two the way the guard does.

**The mic check could not finish for a hesitant speaker.** Both exits from the
`testing` state want a phrase held long enough to take gaps out of, and
`aboveSince` resets on every silent frame — so somebody who says "testing, one
two three" in three short bursts satisfied neither and the screen listened
forever. Not a dead end, because *Look around first* is on it, but the wrong
check to put in front of a product whose user is defined as hesitant. There is a
twelve-second ceiling now, reached only once something has actually been heard:
settling on a silent microphone would put "We can hear you" over the evidence
that we cannot.

### 7.3 What was verified, and how

Typecheck, lint, the full test suite (942 passing), the production build and
`npm run db:verify` (51 RLS checks) all pass.
`lib/data/guards.test.ts` is new — nine assertions on
`onboardingResumePath`, including that neither `active_track` nor `display_name`
is ever read as an answer, and that the cut step can never be returned.
`lib/safety/age.test.ts` gained the assertion that matters most on this run:
exactly one refusal is final, and every correctable one stays correctable.

Beyond that, the run was **driven end to end in a real browser** against a
throwaway account, three times over, because none of N1–N3 was visible from the
code:

- the gate: a malformed date keeps Continue, an under-age verdict removes it
- the run: five ticks, the current one volt, no answer pre-selected
- the waitlist records the ask, says only that, and offers a way back
- advancing does not reload the document (a marker set on `window` survives the
  whole run), and the back arrow shows the answer already given
- the mic copy names thirty days, the meter is driven by a custom property
  rather than a React render, and the confirm reports a measurement
- *Look around first* defers, `/train` offers the way back, the row returns to
  the step, and the deferral survives a reload
- the ready screen renders a real character with no skeleton, uses the name that
  was given, and Start goes straight to `/rep/<id>/live` rather than to a second
  brief

### 7.5 Eight tests that a persona tuning pass had broken

Not caused by this work and not left behind by it. Eight assertions across
`lib/voice/`, `lib/warmth/` and `lib/tuning/` were failing on arrival, all from
one cause: they restated a shipped character's *current* dial values —
`expression: 'dry'`, `humour: 60`, `flirtiness: { ceiling: 60, unlocksAt: 55 }`
— and an in-progress tuning pass had moved them.

That is a test-design defect, and a self-defeating one: `lib/tuning/` exists so
a character can be retuned, and its own tests failed the moment somebody did it.
The fix is in the tests, never in the character. **`lib/personas/nadia.ts` is
untouched** — the dials are the author's, and the assertions now read them
rather than remember them:

- `EXPRESSION_TAG` and `EXPRESSION_CLAUSE` are exported from
  `lib/voice/elevenlabs/persona.ts` and `lib/warmth/steering.ts`, so a test can
  name the *mapping* — which is what it was ever claiming — instead of one
  persona's current position in it.
- "leaves the neighbouring dials alone" is now a line diff asserting that
  exactly one line moved. Stronger than the three remembered numbers it
  replaced, and it cannot rot.
- The gate rewrite reads `unlocksAt` out of the file and asserts it survived,
  rather than asserting what it is.
- Two assertions were *added* while doing it: that every expression the schema
  allows has a non-empty steering clause, and that the whole tag table round
  trips. Reading a table off a persona is only sound if the table is total, and
  a missing entry would have dropped layer 2 out of the steering line silently.

Nothing in the onboarding work reads a persona file.

### 7.4 Still owed by hand

1. **R24.** Per-step drop-off. Blocked on B7.
2. **`profiles.experience`** keeps its column and its old values. Dropping it
   would rewrite a migration that has run, and applied migrations are a record.
   Nothing reads it.
3. **The name step was considered for folding into the ready screen** (R23's
   open question) and left alone. It is the one step whose copy already works,
   and "she'll call you ___" beside a Start button is a decision worth taking
   deliberately rather than as a side effect of shortening a list.
4. **The Settings mic test** still drives its meter through React state and
   rewrites its `aria-label` every frame. It is the same defect as O13 in a
   different file, was not in scope, and is a five-line change whenever somebody
   is next in `profile-screens.tsx`.
