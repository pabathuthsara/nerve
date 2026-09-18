# Signup audit — 18 September 2026

A walk of `www.hellonerve.com` and `/start` as a cold visitor off paid social,
at 400px wide and at 1200px, plus the production database and the deployed
page's own network traffic. Written because 64 Facebook visits and the earlier
42 (D21) have produced zero accounts between them.

Everything below is either something I measured on the live site or something I
read in this repo. Where I am guessing, it says so.

---

## 0 · What the numbers actually say, before any opinion

**106 paid visits, 0 signups.** That is the combined D21 cohort (42, 4–10 Sep)
and the 64 the owner reports from Facebook.

Do not treat this as proof the page is broken, and do not treat it as noise
either. Run the arithmetic:

| If the true signup rate were | P(zero in 106 visits) |
|---|---|
| 5% | 0.4% |
| 3% | 4% |
| 1.5% | 20% |
| 1% | 35% |

So 106 visits rules out a healthy rate with reasonable confidence, and does
*not* rule out a poor-but-normal one. The honest statement is: **the page is
almost certainly converting under 3%, and everything else about it is
unmeasured.** The benchmark band for cold paid social is 1–6%, median ~6.6%
across all sources ([Leadpages 2026](https://leadpages.com/blog/landing-page-conversion-benchmarks-2026)),
so "under 3%" is bad but not catastrophic. It is a page that needs work, not a
page that is dead.

**The part that IS catastrophic is that none of it was instrumented.** See §1.

### The half of the funnel that works

Measured against production on 18 September:

| | |
|---|---|
| Accounts | 30 |
| Accounts that ran at least one session | **27 (90%)** |
| Total sessions | 129 (~4.8 per activated account) |
| Email confirmations pending | 0 |

Median B2B SaaS activation is ~37.5%, top quartile ~61%
([Userpilot 2026](https://userpilot.com/blog/saas-user-onboarding-funnel/)).
Nerve is at 90%. **The product converts once somebody is inside it.** Every
finding in this document is about the door, not the room. Spending effort on
retention, pricing or the rep itself right now is spending it on the half that
already works.

---

## 1 · The two blockers that make the ad spend unlearnable

These are not conversion-rate findings. They are the reason there is nothing to
read after the money is spent, and both are configuration rather than code.

### B-A · There is no Meta Pixel. There is no pixel of any kind.

Executed against the live page:

```
fbq: undefined     ttq: undefined     gtag: undefined
dataLayer: undefined
third-party scripts loaded: []
```

Zero. Not a misconfigured pixel — no tracking script of any kind reaches the
browser on `/` or `/start`.

Three consequences, in order of cost:

1. **Meta's optimiser has no conversion signal**, so a campaign cannot be
   optimised for signups at all. Without a pixel event Meta can only optimise
   for link clicks, which selects for the cheapest, most reflexive, least
   intentful click in the auction. The 64 visits were, by construction, the
   64 worst visits the budget could buy. This alone can explain a 0.
2. **No retargeting and no lookalikes.** The 106 people who visited are gone
   and cannot be reached again, and there is no seed audience to build from.
   That is the whole compounding asset of a paid-social block, discarded.
3. **No conversions API, so nothing survives iOS attribution loss.**
   ([Meta's own docs](https://developers.facebook.com/docs/meta-pixel/implementation/conversion-tracking/))

**Fix:** pixel in `app/layout.tsx` behind a `NEXT_PUBLIC_META_PIXEL_ID` env
check, exactly the pattern `instrumentation-client.ts` already uses for Sentry
(no key → no network traffic). Fire `PageView` on `/start`, a custom
`StartStepViewed` per step, and `CompleteRegistration` on successful signup.
Then set the campaign objective to Conversions on `CompleteRegistration` and
let it learn. **Do not spend another dollar before this exists.**

### B-B · PostHog is still not installed, so D21's per-step drop cannot be read

`window.posthog` is `undefined` on the deployed site. `lib/analytics/events.ts`
has authored `start_step_viewed`, `start_answered`, `start_account_submitted`
and `start_account_failed` — the exact four events that would answer "which of
the eight screens are they leaving on" — and **not one of them is going
anywhere.**

D21 says the lesson of 0/42 is that "the per-step drop is" the evidence. That
evidence has never been collected. `/start` shipped, the run was rebuilt on
16 September (D24), and the whole point of building it — knowing where people
leave — is still unavailable.

This is `LAUNCH-GAP.md` B7 and it has outlived two funnel rewrites. It is one
env var and one `<Analytics />` mount.

> **Both of these are worth more than every design change in this document
> combined**, because without them the next 64 visits teach you exactly as
> much as the last 64 did.

---

## 2 · The account screen — the single highest-leverage screen in the product

`/start`, screen 8. Read from the live DOM:

```
textbox  you@example.com   (email)
textbox  Password          (min 8 characters)
textbox  DD  /  MMM  /  YYYY   (date of birth, three separate inputs)
button   START THE REP
```

**Five input fields, on a phone, from somebody who has been on the site for
under ninety seconds and has no reason yet to believe any of it.**

### 2.1 There is no "Sign in with Google" button, and the provider was never configured  ·  **FIXED 18 September 2026**

> Shipped. The provider is configured, the button is on `/login`, `/signup`
> and `/start`'s last screen, and the funnel's answers cross the redirect in a
> cookie so a Google sign-up is not asked its three questions again.
> `LAUNCH-GAP.md` D25 and `SIGNUP-FIXES-2026-09-18.md` §2.1 are the record,
> including the two places the prescription was not followed and why. **The
> date of birth is the part that did not move**: §2.2 is still open, so a
> Google account answers §16.4 at `/onboarding/age` on its first render.

`app/auth/actions.ts` says it plainly: Google is not offered because the OAuth
credentials were never created in the Google Cloud console. `/auth/callback`
already handles the code exchange and was deliberately left in place. So the
work is: create a client ID, paste two values into the Supabase dashboard, add
one `signInWithOAuth` button.

Reported lifts for adding Google sign-in: +107% trial starts in one documented
A/B test (7.48% → 15.50%), and a more sober **+8.2 percentage points** across
79 companies in Heap's benchmark
([il.ly](https://il.ly/blog/google-signin), [Corbado](https://www.corbado.com/blog/social-login-conversion-rate)).
Take the conservative number and it is still the largest single change
available here. It removes the password field, the email typo risk, and the
confirmation email in one move.

**Do this first, after the pixel.**

### 2.2 Date of birth is three fields at the worst possible moment

§16.4 requires an age gate before the account exists, and that requirement is
correct and non-negotiable. *Where* it sits is not.

A DD/MMM/YYYY triple is the heaviest control on the screen, it is asked of a
stranger, and it reads — fairly — as "why does a conversation app need my
birthday." The copy under it ("Nerve is 18+. The date is the only thing we
keep.") is good and is doing real work, but it is answering an objection that
did not have to be raised at that moment.

Three options, in order of preference:

- **Move the age gate to screen 1 or 2 of the run**, before any commitment, as
  a single "Are you 18 or over?" confirm plus the date. A question asked
  early, while nothing is invested, costs far less than the same question
  asked at the point of purchase. It also means Google sign-in has a date
  already and does not need `/onboarding/age` afterwards — which is the exact
  problem `auth-screens.tsx` §118 records.
- Or ask **year only** and derive the 18+ check from it. `checkAge` would need
  a 1 Jan assumption, which is more conservative, not less. One field instead
  of three.
- Or keep it where it is but make it a single native `<input type="date">` on
  mobile so it opens the OS picker.

### 2.3 The headline on the screen sells nothing

> **"WHERE DO YOUR SCORES GO?"**

This is the last thing a person reads before deciding whether to hand over an
email, and it is a filing question. It frames the account as *storage* — a
chore, an obligation, a place your data goes — at the exact moment the screen
needs to frame it as *the door to the thing you came for*.

The reassurance line under it is the better headline and is buried in body
text: "One free voice rep and one free five-minute interview, on every
account. No card."

Rewrite as something closer to:

> **YOUR FIRST REP IS READY.**
> Cass is waiting. One free voice rep and one free interview on every account —
> no card, now or ever, if you stay free.

### 2.4 The submit button is right and everything around it is not

`START THE REP` is a good CTA — specific, names the reward, not "Submit". Keep
it. What is missing beside it:

- No "takes 10 seconds" / "no card" microcopy *at the button* (it is 400px
  higher up, above three fields).
- No count of anything. No "27 people trained this week." Nothing.
- The terms/privacy line is the last thing before the button and it is the
  only line in the lower third of the screen. It is legally correct and
  psychologically it is the final note you leave a stranger on.

---

## 3 · The `/start` run, screen by screen

Walked at 400×860 on the dating arm. Eight screens.

| # | Screen | Verdict |
|---|---|---|
| 1 | hook — "The conversation you keep not having" | Strong idea, weak execution. See 3.1 |
| 2 | track — what are you training for | **Best screen in the run.** Concrete, cheap, theirs |
| 3 | reframe — "Reading about it doesn't transfer" | Pure claim. First real drop point. See 3.2 |
| 4 | focus — what's the hard part | Good |
| 5 | mechanism — "Inside, then outside" | Second wall of claim. See 3.2 |
| 6 | name — what should she call you | Good, and correctly skippable |
| 7 | build — CASS reveal | **Second best screen.** See 3.3 |
| 8 | account | See §2 |

### 3.1 The hook screen wastes its one job

Above the headline there are roughly 200px of nothing on a 717px viewport —
28% of the first screen a stranger ever sees, empty. The headline then starts
a third of the way down.

The screen has no progress indicator (deliberate, per `start-screens.tsx:188`,
and that is defensible), but it also has no answer to the two questions a
person off an ad is actually asking:

- **How long is this going to take?** Nothing says "under a minute", which is
  true and is the single most reassuring fact available.
- **Is it free?** Nothing on screen 1 says free. The word "free" first appears
  on **screen 8**, after seven screens of investment.

The CTA is `START`. It is the most generic verb available and it promises
nothing. `START — takes 40 seconds` or `SET MINE UP` (which the run already
uses on screen 5, and uses better) both outperform it.

`What is this?` and `I have an account` are both underlined links directly
below the primary button, at the same visual weight as each other. `I have an
account` is an exit for the 0.1% of visitors who have one, sitting at the same
prominence as the explanation link for the 99.9% who do not.

### 3.2 Two of the eight screens are advertisements

`reframe` (screen 3) and `mechanism` (screen 5) ask nothing, offer nothing to
touch, and make a paragraph-long argument with a button underneath. The file's
own comment anticipates this — "three claims in a row before they have touched
anything is an advertisement, which is the thing they just clicked out of" —
and then ships two of them anyway, separated by one question.

`reframe`'s button is literally **`GO ON`**. That is the label on a screen
whose only job is to be got past.

These screens exist to build belief before the ask, which is the right
instinct. The problem is that they build it with *assertion*, and assertion is
the cheapest currency on the internet. What would build it for free:

- Replace `reframe`'s copy with **eight seconds of actual audio** — Cass's real
  voice, from the seeded persona, saying one line. Rule 10's asymmetry applies
  (his half may be authored, hers must be captured), and `scripts/hero-audio.ts`
  and `public/hero/` are still in the tree from the removed landing demo.
  Hearing the thing is worth ten paragraphs about the thing.
- Or replace `mechanism` with the **real scorecard component**, filled with the
  Maya 87 that the landing page already ships. Showing the output is showing
  the product.
- If neither, **cut one of them.** Eight screens to an email box is at the
  upper edge of what cold traffic tolerates; six is safer.

### 3.3 The CASS reveal is the best asset in the funnel and it is on the wrong screen

Screen 7 is the first moment the product becomes a *thing* rather than an
argument: an avatar, a name, a place, a time, a "watching for". It is
concrete, it is visual, it is the only image in the entire funnel, and it
arrives **after** every abstract screen has already shed its visitors.

Move it earlier — ideally screen 2 or 3, right after the track question, where
it answers "who am I actually going to talk to" while curiosity is still
alive. The run then reads: *what do you want → here is who you'll meet →
what's hard for you → set it up*. That is a product demo. The current order is
three arguments and then a product demo.

---

## 4 · The landing page — visual audit

Measured: **9,322px tall on desktop (11.3 screens), 10,639px on mobile
(14.8 screens), 1,513 words, 0 images, 0 video, 0 audio.**

Load is not a problem: TTFB 56ms, fully loaded 494ms, 17KB transferred,
31 requests. It is one of the fastest pages I have measured. Nothing here is a
performance finding.

### 4.1 The page has no pictures of anything

Zero `<img>` elements. On a page selling a *voice* product, there is no audio.
On a page selling a *scored* product, the scorecard is rendered in live DOM
(good) but nothing else is.

`VISUAL-AUDIT.md` §1 is right that photographs of people are the one thing this
product must never ship — that decision should hold. But "no stock photos of
smiling strangers" is not the same instruction as "no visual evidence that the
software exists." The gap between those two is where every missing asset
lives:

- A short screen recording of a live rep — the timer counting down, the
  waveform moving, the warmth meter. Silent, looping, 6 seconds. No faces
  required.
- The scorecard reveal animation.
- The four persona avatars from `lib/personas/visual.ts` — they already exist,
  they already carry a hue, and the roster section describes four characters
  using **only text**.

### 4.2 Half of the desktop viewport is empty on every section

Every section opens with an eyebrow, a two-line display headline and a
paragraph — all constrained to roughly the left 47% of a 1200px window. The
right half is pure `#0B0C0A`. Screenshotted at four scroll positions; it is
empty at every one.

This is restraint taken past the point where it reads as intentional and into
where it reads as unfinished. It is also the exact hole the removed hero rep
used to fill (rule 10's note). Something has to go there: the persona avatars,
a scorecard fragment, the 01–04 loop diagram (currently squeezed to the left
of the loop cards), a live warmth meter.

### 4.3 Only two signup buttons in 14.8 screens of mobile page

CTA positions on mobile, measured:

| y | Label |
|---|---|
| 33 | START TRAINING (sticky header — good) |
| 657 | START TRAINING FREE (hero, at the very edge of the fold) |
| **9,625** | START TRAINING FREE |
| 10,157 | Start training (footer link) |

Between y=657 and y=9,625 there are **thirteen screens with no way to sign
up** other than the small header button. Someone convinced by the scorecard
section, or by the roster, or by the interview section, has to scroll to the
bottom or go find the header.

The sticky header saves this from being fatal. But that header button says
`START TRAINING` — not free, no reward named — and it is the smallest CTA on
the page.

Add a CTA after the scorecard section, after the roster, and after the
interview section. Three more.

### 4.4 The hero CTA sits exactly on the fold on a phone

At 400×717 the hero button's top edge is at y=657 of a 717px viewport. On a
real phone with browser chrome the usable height is closer to 640–680, which
means for a meaningful share of devices **the primary call to action is below
the fold.** The spec table (LENGTH / ENDS / SCORED ON) is what pushes it down.

That table is good content in the wrong slot. Move it below the buttons.

### 4.5 The hero paragraph is written for somebody who already has the concept

> "A rep is a timed conversation, out loud, with someone who can lose interest,
> get distracted and say no. You are scored on how you talked — never on
> whether it worked. A clean rep that ends in rejection can score 92."

Four seconds off a Facebook video, this paragraph asks the reader to absorb a
redefined noun ("a rep"), a scoring philosophy, and a counter-intuitive number
(92 for a rejection) before it has established what the software *is*. "A clean
rep that ends in rejection can score 92" is a brilliant sentence for somebody
on their third visit and an incomprehensible one on their first.

The headline is excellent — THREE MINUTES. ONE STRANGER. NO SCRIPT. is the best
copy on the site. The paragraph under it should say the plainest possible true
thing and get out of the way:

> You talk out loud to an AI character for three minutes. She can get bored and
> leave. Afterwards you get a score on how you handled it — not on whether it
> worked. One free rep with every account, no card.

Save the 92 for the scorecard section, where it lands.

### 4.6 There is no social proof of any kind, anywhere

Not one testimonial, review, user count, rating, screenshot of a real
scorecard, press mention, "as used by", or founder note. On the entire site.

For a cold visitor deciding whether to give an unknown `.com` their email and
voice, this is the largest missing category on the page. 106 of them were asked
to trust a black page with no evidence that any other human has ever used it.

You have 30 accounts and 129 completed sessions. That is real. Options that
are honest and available today:

- **"129 reps run so far"** — a counted number, never asserted, in the pattern
  `lib/db/founding.ts` already establishes for the founding allocation.
- **Three real anonymised scorecards** with real composites, dimension bars and
  the real "went well" line, presented as what they are.
- **A founder line.** "Built by one person in Sri Lanka because I was bad at
  this." A solo founder saying so is stronger proof than a fake testimonial and
  costs nothing.
- **The nervousness-gap chart** from an aggregate of the field log — expected
  vs actual nervousness across all users. That is a claim only this product can
  make and it is a chart, not a sentence.

Do not fabricate testimonials. §12 and terms clause 08 aside, an invented
review on a page a merchant-of-record reviewer opens is an account-closing
risk.

### 4.7 The pricing block gives free nothing to want

The free tier reads:

> **FREE · $0 · no card, ever · Reps per day: None**
> "The outside half of the work, and every record of it. No voice."

`Reps per day: None` is the most discouraging string on the site. It is
accurate — `entitlements.reps_per_day = 0` is the paywall (rule 11) — but the
free tier *does* include one voice rep at signup and one five-minute interview,
and the pricing table does not say so. A visitor comparing the columns sees
"$0 → None" and concludes the free account cannot do the thing the entire page
just spent 1,500 words describing.

Change the free row to name what it actually grants: **"1 voice rep + 1 five-minute
interview, then unlimited text mode and field work."**

### 4.8 The OG image is a brand card, not a product card

`public/og.png` is the wordmark NERVE in volt on black with concentric rings
and a tagline. It is a handsome piece of design and it is the wrong artefact
for a Facebook feed: it shows a logo for a brand nobody has heard of, and it
conveys nothing about what the product does or why to stop scrolling.

It is also 1.18MB, which is ~4x larger than it needs to be.

Replace with a screenshot of the scorecard — the 87 composite, the six
dimension bars, MAYA · TIER 3 · SHE LEFT — with three words of overlay. That
image answers "what is this" in the feed, which is where the decision is
actually made.

### 4.9 Smaller things

- **`Skip to content` renders as visible black-on-black text** at the very top
  of the page on both widths. It is supposed to be visually hidden until
  focused. First glyph on the page and it is a bug.
- **The FAQ items are collapsed by default** and there are six of them. "Do I
  have to actually speak out loud?" is the single most common objection to this
  product and it is behind a click. Expand at least the first two.
- **`practice job interviews` is a link inside the hero paragraph** — the only
  competing link in the hero, pointing away from the conversion path, seven
  words before the CTA.
- **Nothing on the page says where the company is or who runs it.** No about
  page, no founder, no address. Combined with no social proof, a cold visitor
  has zero signals of a real entity behind the product.

---

## 5 · Why they skip — the read

Taking all of the above together, here is the honest account of a person
arriving from a Facebook ad on a phone:

1. **They land and cannot tell what it is in two seconds.** The headline is
   great but the paragraph under it defines a private vocabulary. There is no
   picture, no motion, nothing to look at. Black page, white text, 1,500 words.
2. **There is no evidence anybody else has used it.** No count, no review, no
   face, no name, no company. For a product asking you to talk out loud about
   your love life, that is a lot of trust to extend to an anonymous page.
3. **If they click through, they are asked to invest before being given
   anything.** Seven screens, two of which are arguments, before the word
   "free" appears once.
4. **At the end of that investment they meet five form fields including a
   birthday**, with no Google button, and no way to try the thing without
   completing them.
5. **And the campaign that sent them was optimised for clicks**, because there
   is no pixel — so the people arriving were selected for their willingness to
   tap, not their willingness to sign up.

The run is not badly designed. It is designed for somebody who already wants
this, and paid social does not deliver those people. It delivers the
half-curious, and the half-curious need to *see* something before they will
spend ninety seconds on it.

---

## 6 · What to do, in order

**Gate: do not buy another click until 1 and 2 are live.**

| # | Change | Effort | Expected |
|---|---|---|---|
| 1 | Meta Pixel + `CompleteRegistration`, campaign objective → Conversions | 2h | The largest item on this list. Without it nothing below is measurable |
| 2 | PostHog key + mount; `start_step_viewed` reaching a dashboard | 1h | Turns the next 100 visits into a per-step drop chart |
| 3 | Sign in with Google on `/start` screen 8 and `/signup` | 3h | +8 to +100% on signup, depending on whose number you believe |
| 4 | Age gate → one field, moved to screen 2 | 2h | Removes 2 of 5 fields from the decision moment |
| 5 | Rewrite screen 8's headline; "free / no card / 20 seconds" at the button | 30m | Free |
| 6 | Move the CASS reveal to screen 3; cut `reframe` or `mechanism` | 2h | 8 screens → 6, and the demo moves before the arguments |
| 7 | Social proof block on `/` — counted reps, 3 real scorecards, founder line | 3h | The largest missing category on the landing page |
| 8 | Rewrite the hero paragraph in plain language; move the spec table below the CTA | 30m | Fixes the fold on mobile |
| 9 | Three more CTAs down the landing page; header button → "START FREE" | 30m | Closes a 13-screen gap |
| 10 | Fix `Skip to content` visibility; expand first two FAQs | 20m | Free |
| 11 | Free tier row → "1 voice rep + 1 interview, then unlimited text" | 10m | Stops the pricing table contradicting the page |
| 12 | New OG image: the scorecard, not the wordmark; compress to <300KB | 1h | Changes what a Facebook feed actually shows |
| 13 | 6-second silent screen recording of a live rep, in the empty right column | 4h | Fills 4.2 and gives the page its first evidence the software runs |
| 14 | Cass's real voice, 8 seconds, on the reframe screen | 4h | Rule 10's asymmetry: capture hers, never write it |

Items 1–5 are roughly a day and a half and are where the return is.

---

## 7 · Two things I could not check

- **Where the ads actually point.** If the Facebook campaign links to `/`
  rather than `/start`, everything in §3 is moot for that traffic and the
  first fix is the link. Worth confirming before anything else.
- **What the ad creative says.** Message match between the ad and the page is
  the first item on every conversion checklist and I cannot audit it from
  here. If the ad promises something the hero does not repeat in the same
  words, that alone can produce a 0.
