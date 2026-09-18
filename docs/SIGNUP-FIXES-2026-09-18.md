# Signup fixes — the prescription

Companion to [`SIGNUP-AUDIT-2026-09-18.md`](SIGNUP-AUDIT-2026-09-18.md). That
document says what is wrong; this one says what to type. Every item names the
real file, the real string and the real rule it has to stay inside.

**Ordering rule for this whole document: nothing below §1 is worth doing until
§1 is done.** Every other change is a guess whose result cannot be read.

---

## 0 · The four sequences

Do not work down this document top to bottom. Work in these four blocks, and
stop after each one for long enough to read the number.

| Block | Items | Effort | Ship before |
|---|---|---|---|
| **A — Make it measurable** | 1.1, 1.2, 1.3 | ~4h | Any further ad spend |
| **B — Unblock the door** | 2.1–2.5 | ~1 day | The next 100 visits |
| **C — Give the page evidence** | 3.1–3.4, 4.1–4.9 | ~2 days | The Day-21 gate |
| **D — Beyond the audit** | §5, §6 | ongoing | — |

> ## Status, 18 September 2026 — A, B and C shipped
>
> Everything in blocks A, B and C is in the tree and verified against a
> running app, both arms, at 390px and 1440px. `LAUNCH-GAP.md` D25 and D26 are
> the decisions; the per-item notes below say what landed and where it differs
> from the prescription.
>
> | Item | State |
> |---|---|
> | 1.1 PostHog | **Code was already done.** Still owed: the key, then a redeploy (rule 15). No code was written |
> | 1.2 Meta Pixel | **Shipped.** `components/meta-pixel.tsx`, mounted in the root layout, `CompleteRegistration` on the account submit, `Lead` on the build screen. Owed: `NEXT_PUBLIC_META_PIXEL_ID` and the campaign objective change, which is the line this document calls its most valuable |
> | 1.3 CAPI | **Deferred on this document's own instruction** — "do this second, not first", and the pixel has not fired for a week yet |
> | 1.4 Dashboard | **Shipped** into `MARKETING-PLAN.md` §9, with the per-step chart named |
> | 2.1 Google | **Shipped** (see the note below for three deviations) |
> | 2.2 Age gate | **Shipped, and it is now screen two on both arms.** One year field. Its payoff is bigger than the audit expected: the year crosses the Google redirect, so `signInWithGoogle` runs `checkAge` **before** the account exists and a `/start` Google sign-up no longer meets `/onboarding/age` at all |
> | 2.3 Account screen | **Shipped** — "Cass is ready.", the cost beside the promise, reassurance at the button, one static password hint |
> | 2.4 Hook screen | **Shipped** — CTA, the free line, the demoted sign-in exit, and the top gap (the headline is at ~100px on a 390×844 screen, was ~240px) |
> | 2.5 Confirmation | **Recorded** as `LAUNCH-GAP.md` D26, which is what this item asked for |
> | 3.1 Cass earlier | **Shipped** — she is screen four of eight, ahead of the one surviving claim |
> | 3.2 Cut `reframe` | **Shipped.** The run is seven screens and the form |
> | 3.3 Audio on `reframe` | **N/A** — the screen was cut, which this item is explicitly conditional on |
> | 3.4 Name the length | **Shipped** — `N of 7`, derived from the list rather than written down |
> | 4.1–4.3 | **Shipped** — hero rewrite, mobile fold, three section CTAs, `START FREE` |
> | 4.4 Social proof | **a and d shipped** (counted reps/people, founder line). **b and c not** — see below |
> | 4.5 Right column | **The scorecard row shipped.** The others are asset builds; see below |
> | 4.6 `repsLine` | **Shipped**, asserted against the feature list rather than a literal |
> | 4.7 `.skip-link` | **Shipped.** It really was rendering as visible text on every page |
> | 4.8 FAQs | **Shipped** — first two open |
> | 4.9 OG image | **Shipped** as `app/opengraph-image.tsx`, 43KB against a 300KB target. `/start` inherits it |
>
> **What was NOT done, and why — none of it is a code problem.**
>
> **4.4b, three real scorecards.** Every piece exists and `assertPublishable`
> would police it, but choosing which real users' reps to publish is a
> decision about other people's data that belongs to the product owner, not
> to whoever is typing. Ready to build the moment three are nominated.
>
> **4.4c, the nervousness-gap chart.** The aggregate is a real query, and with
> 30 accounts it would be a chart of almost nothing. It gets more persuasive
> every week; it is not persuasive today.
>
> **4.5's six-second loop.** The item this document calls "the one worth
> building" is a captured asset, not a component, and rule 10's asymmetry
> binds it: her half must come from the real persona. Same class of work as
> `scripts/hero-audio.ts`, and it spends money.
>
> **§5 entirely.** Block D is marked `ongoing` above. §5.1's `/demo` is the
> highest-ceiling item in the document and is a capture-and-build job; §5.2–5.5
> are campaign and channel decisions that are not in this repo. §5.6 is a list
> of things to keep refusing, and nothing here violates it.

Block A and B together are about a day and a half and are where the return is.

---

## 1 · Block A — make the spend readable

### 1.1 · PostHog: it is built, it is unkeyed, it is one environment variable

`components/analytics.tsx` is finished. It has a bounded pre-init queue, a
per-route replay rule, wrapped calls that fail silent per §05, and a dynamic
import so an unkeyed deployment fetches nothing. `lib/analytics/events.ts` has
`start_step_viewed`, `start_answered`, `start_account_submitted` and
`start_account_failed` already authored and already called from
`start-screens.tsx`.

There is no code to write.

```bash
# Vercel → Settings → Environment Variables → Production
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com   # optional, this is the default
```

**Then redeploy.** Rule 15's second half: an env var added after a build starts
is not in that build. Setting it and waiting changes nothing.

Verify by loading `www.hellonerve.com/start` and checking `window.posthog` is
an object, then walking the run and watching eight `start_step_viewed` events
land in PostHog's live feed.

Build one insight the day it is keyed: a funnel on `start_step_viewed` broken
down by the `step` property, ordered hook → track → reframe → focus →
mechanism → name → build → account. **That chart is the thing D21 asked for
and has never had.** Every recommendation in §3 below is a hypothesis about
that chart, and half of them will turn out to be wrong.

### 1.2 · Meta Pixel — new file, same pattern as Sentry  ·  **SHIPPED 18 September 2026**

Do not reach for a tag manager. Follow the shape the repo already uses: keyed
or silent, dynamic, never in the critical path.

New file, `components/meta-pixel.tsx`:

```tsx
'use client'

/**
 * The Meta Pixel, and the only file that knows the ad platform exists.
 *
 * Same contract as `components/analytics.tsx` and
 * `instrumentation-client.ts`: no id, no network traffic. That keeps
 * development, CI and any unkeyed deployment silent, and it keeps the landing
 * page — which §14 has a merchant-of-record reviewer opening — free of an ad
 * script it has no use for until somebody turns it on deliberately.
 *
 * It is `afterInteractive`, not `beforeInteractive`. The page's own paint is
 * 494ms cold and an ad pixel does not get to be in front of it.
 */

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

const ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

declare global { interface Window { fbq?: (...args: unknown[]) => void } }

/** Fire a standard or custom event. No-ops when the pixel is not keyed. */
export function metaTrack(event: string, props?: Record<string, unknown>): void {
  try { window.fbq?.('track', event, props) } catch { /* never user-facing */ }
}

export function MetaPixel() {
  const pathname = usePathname()

  // The App Router does no document load between screens, so the snippet's
  // own PageView fires once and never again — the same reason
  // `analytics.tsx` sets `capture_pageview: false`.
  useEffect(() => { if (ID) metaTrack('PageView') }, [pathname])

  if (!ID) return null
  return (
    <Script id="meta-pixel" strategy="afterInteractive">{`
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
      document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init','${ID}');
    `}</Script>
  )
}
```

Mount it beside `<Analytics />` in `app/layout.tsx`:

```tsx
<body><ProductProvider><ToastProvider><ShellFrame>{children}</ShellFrame></ToastProvider><Analytics /><MetaPixel /></ProductProvider></body>
```

Then fire the one event that matters, in `AccountStep`'s `onSubmit` in
`components/screens/start-screens.tsx`, on the same line as the existing
`capture('start_account_submitted', …)`:

```tsx
metaTrack('CompleteRegistration', { content_name: answers.track ?? 'dating' })
```

And one upper-funnel event on the `build` step, so the optimiser has something
denser than registrations to learn from while volume is tiny:

```tsx
metaTrack('Lead')   // in BuildStep, on mount
```

> **Why `CompleteRegistration` and not a custom event:** Meta's optimiser has
> priors on the standard events. A custom event with 3 conversions a week
> never leaves the learning phase. A standard one borrows.

**Then change the campaign objective to Sales/Leads optimising for
`CompleteRegistration`.** The pixel without that change buys you retargeting
and nothing else — the optimiser only optimises for what the campaign asks
for. This is the single highest-value line in this document.

### 1.3 · The Conversions API, once the pixel has fired for a week

Browser-side pixels lose 20–40% of iOS conversions to attribution. A server
event from the one place that knows a real account was created —
`app/api/webhooks/whop/route.ts` already proves the pattern for service-role
side effects — deduplicates against the browser event by `event_id`.

Do this second, not first. A pixel with no CAPI still works; CAPI with no
pixel does not deduplicate.

### 1.4 · One dashboard, three numbers, read weekly  ·  **SHIPPED 18 September 2026 into `MARKETING-PLAN.md` §9**

`docs/MARKETING-PLAN.md` §9 is where the result goes. Give it three columns it
can actually be filled from after §1.1:

| | Source | Target |
|---|---|---|
| Visit → `start_step_viewed[hook]` | PostHog | >90% (below this, the page is slow or the link is wrong) |
| hook → account submitted | PostHog funnel | **3% is the floor. Under 1.5% and §2 has not worked** |
| account → first `rep_completed` | PostHog | It is 90% today. Watch it does not fall |

---

## 2 · Block B — unblock the door

### 2.1 · Sign in with Google  ·  **SHIPPED 18 September 2026**

`app/auth/actions.ts` already says this is configuration rather than code, and
`/auth/callback` was deliberately left in place so that stays true. It has
been true and unexercised for a month.

> **What landed, and the three places it is not what this section prescribed.**
> The provider is configured, the button is on `/login`, `/signup` and
> `/start`'s last screen, and `npm run db:funnel` covers the crossing on both
> doors. Recorded as `LAUNCH-GAP.md` D25.
>
> **1. The answers cross in a cookie, not in the query string.** Step 3 below
> appends `START_FIELD` to `redirectTo`. That works and it was not taken:
> the string contains a first name the person typed, and a `redirectTo` rides
> through Google's and Supabase's access logs on the way out and comes back
> editable by its subject. `START_COOKIE` is `httpOnly`, ten minutes, deleted
> on read. **`sameSite: 'lax'` is load-bearing** — `'strict'` is not sent on a
> cross-site navigation, and the return leg from Google is exactly that, so
> the answers would vanish on every sign-up while every test that never left
> the origin still passed.
>
> **2. The write moved out of `app/auth/actions.ts` entirely.** It could not
> be shared from there: that file is `'use server'`, where every export is a
> Server Action the browser may call with arguments of its choosing, and
> `stampNewAccount(userId, …)` would have handed anybody a way to write a
> track, a focus and a display name onto somebody else's profile. It lives in
> `lib/db/start-crossing.ts` now, which both doors import and neither
> publishes — and, as a side effect, `verify-start.ts` tests **the real
> function** rather than the reconstruction it used to rebuild from
> `startProfileWrite`.
>
> **3. The button is BELOW the form, not above it, and this is the one to
> revisit.** Step 4's argument is that the fastest path goes first, and it is
> right the moment 2.2 ships. It is not right today: with the age gate still
> on the account screen, a Google sign-up is the *longer* route — it lands on
> `/onboarding/age` for a date the email form would already have collected —
> so promoting it would steer the traffic this audit is about into more
> friction, not less. **Move it above the form in the same commit as 2.2.**
>
> **And Step 5's trap did not fire, for a reason worth keeping.** It predicts
> "the exact 'asked all three again' failure `/start` exists to prevent".
> That failure needs the *answers* to be lost, not the date — and
> `crossOAuthAccount` carries the track, the focus or the role, the name and
> the interview setup across the redirect, so none of the three is asked
> twice. What is left is one extra screen asking for a date, which is a
> friction cost and not a correctness one. **2.2 is therefore no longer
> blocking on 2.1 — it is the thing that makes 2.1 good.**

**Step 1 — Google Cloud Console.** Create an OAuth 2.0 Client ID (Web). Authorised
redirect URI is the Supabase callback, not yours:

```
https://ujhtzjcwwefqhwlpzhao.supabase.co/auth/v1/callback
```

**Step 2 — Supabase.** Authentication → Providers → Google → enable, paste the
client ID and secret. Site URL and redirect allow-list must both name `www`
(rule 15): `https://www.hellonerve.com/**`.

**Step 3 — one action.** In `app/auth/actions.ts`:

```ts
export async function signInWithGoogle(startAnswers: string): Promise<AuthResult> {
  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // The run's answers survive the round trip through the provider, so a
      // Google account lands in the same place a password account does
      // rather than at question one. `/auth/callback` decodes it.
      redirectTo: `${await siteOrigin()}/auth/callback?next=/&${START_FIELD}=${encodeURIComponent(startAnswers)}`,
    },
  })
  if (error) return { ok: false, message: error.message }
  redirect(data.url)
}
```

**Step 4 — the button, above the form, not below it.** Order matters: the
fastest path goes first and the email form becomes the fallback.

```tsx
<GoogleButton answers={answers} />
<Hairline label="or use an email address" />
<form className="auth-form" action={action}> … </form>
```

**Step 5 — the trap that `auth-screens.tsx` §118 already records.** A Google
account arrives with no date of birth, so §16.4 would have to be satisfied at
`/onboarding/age` afterwards — which is the exact "asked all three again"
failure `/start` exists to prevent. **This is why 2.2 has to ship in the same
commit**, not after it.

### 2.2 · Move the age gate to screen 2, and make it one field  ·  **SHIPPED 18 September 2026**

> **Two corrections to what is written below, both found while building it.**
>
> **1. The derivation is 31 DECEMBER, not 1 January.** This section says 1
> January and then states the intent — "a person born in December of the
> qualifying year is treated as still 17 for a few months" — and the two do
> not agree. 1 January treats everybody born in that year as the OLDEST they
> could be, which admits a real seventeen-year-old born in November for
> eleven months. 31 December treats them as the youngest. The intent is
> right and is what shipped, in `birthDateFromYear`, with a test at the
> boundary: born 2008 is refused on 18 September 2026, born 2007 is not.
>
> **2. The screen must not hand an unfinished field to `checkAge`.**
> `birthDateFromYear` pads, so a half-typed `19` becomes `0019-12-31` — a
> well-formed ISO string that gets past the regex and into `Date.UTC`, which
> maps years 0–99 onto 1900–1999. The roll-over check then fires and the
> screen told somebody mid-keystroke that their birthday "is not a real
> date". `AgeStep` requires four digits before it asks for a verdict.
>
> The step list shipped is eight long, not nine: `reframe` was cut by §3.2
> and `build` moved up by §3.1 in the same commit.

Two changes, and they unlock each other.

**Where.** Add `'age'` to `StartStep` in `lib/data/start-funnel.ts` and put it
at index 1 on **both** lists, immediately after `hook`:

```ts
const DATING_STEPS    = ['hook', 'age', 'track', 'reframe', 'focus',  'mechanism', 'name', 'build', 'account'] as const
const INTERVIEW_STEPS = ['hook', 'age', 'track', 'reframe', 'role',   'mechanism', 'name', 'build', 'account'] as const
```

The two lists stay the same length and still differ at exactly one index, which
is the property `start-funnel.test.ts` asserts — update the index the test
reads, not the property.

**What.** One control, not three. `checkAge` is a pure function with tests and
does not have to change; what changes is what is handed to it.

```tsx
// Screen two. Asked while nothing is invested, which is the whole move.
<h1 className="display-lg">How old are you?</h1>
<p className="onboarding-sub">
  Nerve is 18+. It is the only thing we keep from this answer, and it is why
  we can promise the characters stay PG-13.
</p>
<Input label="Year of birth" inputMode="numeric" maxLength={4} placeholder="2001" />
```

Year alone makes the 18+ check *more* conservative, not less: derive from
1 January and a person born in December of the qualifying year is treated as
still 17 for a few months. That is a safe direction to be wrong in, and §16.4
is satisfied before the account exists exactly as it is today.

**Why this is worth doing even though it does not remove a question.** A
birthday asked at the point of purchase reads as a data grab. The same
birthday asked on screen two, with a sentence explaining it, reads as the
product being careful — and it is the *only* sentence on the whole run that
demonstrates the safety position §16 spent months building. You are currently
hiding your best trust signal in your worst-placed form field.

Keep the server-side `checkAge` in `signUpWithPassword` exactly as it is. The
gate moves on screen; it does not move in the action.

### 2.3 · Rewrite the account screen  ·  **SHIPPED 18 September 2026**

`AccountStep`, `components/screens/start-screens.tsx` ~line 559.

**Headline.** Replace:

```
Last thing
Where do your scores go?
```

with the dating arm:

```
Last thing
Cass is ready.
```

and the interview arm:

```
Last thing
Your interviewer is ready.
```

The screen before it just introduced her by name, drew her avatar and named
the gallery. Naming her again here makes the account the door to a person
rather than a filing cabinet for scores. `answers.displayName` is already
threaded to this component for the button label; the character is one prop
further.

**Subhead.** Keep the promise, add the cost:

```
One free voice rep and one free five-minute interview, on every account.
No card now, and none ever if you stay free. Takes about twenty seconds.
```

"None ever if you stay free" is true (`price: null`, `no card, ever` on the
plan card) and it answers the objection that stops most free signups: *what
happens when the trial ends*.

**At the button, not 400px above it.** Move the reassurance so it is the last
thing read before the tap:

```tsx
<Button size="lg" fullWidth type="submit" busy={busy}>
  {interview ? 'Start the interview' : 'Start the rep'}
</Button>
<p className="start-foot">No card · Recordings auto-delete after 30 days</p>
<p className="auth-fine">By continuing, you agree to the terms and privacy policy.</p>
```

The 30-day deletion line is on the landing page footer and nowhere near the
form. It is a privacy promise and the form is where privacy is being decided.

**Password minimum.** Keep 8. Drop the live strength coaching
(`'Keep going — 8 characters minimum.'` → `'Good enough. Longer is stronger.'`
→ `'Strong.'`). It is three strings of unsolicited judgement at the most
fragile moment in the funnel. One static hint is enough.

### 2.4 · The hook screen  ·  **SHIPPED 18 September 2026**

`HookStep`, same file, ~line 296.

**The CTA.** `Start` promises nothing. Use:

```tsx
<Button size="lg" fullWidth onClick={onStart}>Set mine up — 40 seconds</Button>
```

That is not a marketing claim; time it. If it is 60, say 60.

**Add the free line.** Today the word *free* first appears on screen 8. It
should appear on screen 1, under the button, in the slot the exit links
currently occupy alone:

```tsx
<p className="start-foot">Free · no card · your first rep is included</p>
<p className="start-foot">
  <Link href="/how-it-works" className="volt-link">What is this?</Link>
  <span aria-hidden="true"> · </span>
  <Link href="/login" className="volt-link">I have an account</Link>
</p>
```

**Demote the sign-in link.** `I have an account` is an exit for a fraction of a
percent of this page's traffic, at the same weight as the explanation link. Put
it on its own line at Ink-3, or move it to a small top-right corner control.

**Fix the top gap.** 28% of the first screen a stranger ever sees is empty
`#0B0C0A`. `.start-hook` should top-align on short viewports rather than
centring; the headline wants to be within the first 150px.

### 2.5 · Let email confirmation stay off, and make sure it does  ·  **RECORDED 18 September 2026 as `LAUNCH-GAP.md` D26**

Production has 30 accounts and 30 confirmations, so confirmation is off at the
provider and `signUpWithPassword` takes the `data.session` branch straight to
`/`. **Keep it that way.** One 2026 analysis of 25,000 SaaS signups lost 8,325
users between account creation and verification. The `state.ok` branch and
`/verify-email` are correctly kept in step with `/signup` as a fallback; they
should stay a fallback.

Write this down in `docs/LAUNCH-GAP.md` as a deliberate setting, because it is
a one-click change in a dashboard that would silently cost a third of signups
and nothing in the repo currently says not to flip it.

---

## 3 · Block C1 — the run

### 3.1 · Move the character reveal before the arguments  ·  **SHIPPED 18 September 2026**

> Landed with `age` at index 1, so the list is
> `hook, age, track, build, focus|role, mechanism, name, account`. Both
> consequences this section predicts were real and are handled: the
> `Watching for` row is **dropped** rather than defaulted (printing "How you
> open" for somebody who has chosen nothing would be the one screen whose job
> is to be believed inventing an answer), and the button says `Go on`.

Today: hook → track → **claim** → focus → **claim** → name → **CASS** → form.
That is three arguments and then a demo.

Proposed: hook → age → track → **CASS** → focus → mechanism → name → form.

```ts
const DATING_STEPS = ['hook', 'age', 'track', 'build', 'focus', 'mechanism', 'name', 'account'] as const
```

Two consequences to handle:

- `BuildStep` currently reads `answers.focusArea` for its `Watching for` row.
  Moved ahead of the focus question it has no answer, so that row becomes
  `Watching for → How you open` (the default) or drops to two rows. Two rows
  is fine; `Where` and `Time` are the concrete ones.
- The button label changes from `Create your account` to `Go on`, because it is
  no longer the last screen. The account CTA moves to the real last screen,
  which it already is.

**Why.** Screen 7 is the only image in the funnel and the only moment the
product stops being an argument and becomes a thing. It currently arrives after
every abstract screen has taken its cut. This costs nothing and is the highest-
value change in the run. **Check it against the §1.1 funnel chart before and
after** — this is exactly the hypothesis that chart exists to settle.

### 3.2 · Kill one of the two claim screens  ·  **SHIPPED 18 September 2026**

`reframe` and `mechanism` both ask nothing and argue. The file's own comment
says three claims in a row is "an advertisement, which is the thing they just
clicked out of" — and then ships two, one screen apart.

With `build` moved to position 4, cut `reframe` entirely. Its argument
("reading about it doesn't transfer") is made better by meeting Cass than by
reading a paragraph about meeting Cass.

Run goes to **seven screens**, one of which is now a demo.

### 3.3 · If you keep `reframe`, give it something to hear  ·  **N/A — the screen was cut**

Rule 10's asymmetry survives the removal of the landing hero rep:
*his half may be authored and read aloud verbatim, hers must be captured from
the real persona and never hand-written.* `scripts/hero-audio.ts` and
`public/hero/` are still in the tree and nothing reads them.

Eight seconds. One authored line from him, one captured line from Cass. A play
button, no autoplay, `prefers-reduced-motion` respected. That screen stops
being an advertisement and becomes the product.

`GO ON` is not a button label. If the screen survives, it says
`Hear ten seconds of it`.

### 3.4 · Name the length  ·  **SHIPPED 18 September 2026**

> `N of 7`, **derived from `steps.length`** rather than written down, so a
> screen added or cut can never leave a stale number on the rail — which is
> exactly what the hand-written "seven screens" in three docstrings had
> already done.

Nothing in the run says how many screens there are. The progress rail shows
dots, which communicates "there are more" and not "there are two more". A
stranger cannot tell whether they are one third or one tenth of the way in.

`StartProgress` already receives `steps`. Print it: `2 of 7` in the mono face
beside the rail, at Ink-3.

---

## 4 · Block C2 — the landing page

### 4.1 · Rewrite the hero paragraph  ·  **SHIPPED 18 September 2026**

`components/site/landing.tsx:150`. The headline stays — it is the best copy on
the site. The paragraph is written for a third-time visitor.

Replace:

> A rep is a timed conversation, out loud, with someone who can lose interest,
> get distracted and say no. You are scored on how you talked — never on
> whether it worked. A clean rep that ends in rejection can score 92.

With:

> You talk out loud to an AI character for three minutes. She can get bored,
> get distracted and walk away. Afterwards you get a score on how you handled
> it — not on whether it worked.

Then move `The same engine runs practice job interviews` to its own line below
the rule block, at Ink-2. A competing link seven words before the primary CTA
is a leak in the highest-value paragraph on the site.

**Keep "a clean rep that ends in rejection can score 92" — move it to the
scorecard section**, where the 87 is already on screen and it lands as a fact
rather than a riddle.

### 4.2 · Fix the mobile fold  ·  **SHIPPED 18 September 2026**

> Measured after, not asserted: the primary CTA's top edge is at ~397px at
> 390×844, against this section's target of under 520px and a starting point
> of 657px.

At 400×717 the hero CTA's top edge is at y=657. On a phone with browser chrome
that is below the fold for a meaningful share of devices, and the thing pushing
it down is the `LENGTH / ENDS / SCORED ON` rule block.

Reorder inside `.hero`: headline → paragraph → **buttons** → fine print →
rule block. Good content, wrong slot. Target: primary CTA top edge under 520px
at 390px wide.

### 4.3 · Three more CTAs  ·  **SHIPPED 18 September 2026**

Between y=657 and y=9,625 on mobile there is no way to sign up but the header.
Add a primary `Start training free` at the end of:

- the scorecard section (the moment the differentiator lands)
- the roster section (the moment they have picked a character in their head)
- the interview section (a different buyer entirely, currently sent to the
  bottom of a dating page to convert)

And change the sticky header button from `START TRAINING` to **`START FREE`**.
It is the most-seen CTA on the site and it withholds the single most persuasive
word available.

### 4.4 · Social proof, honestly  ·  **a and d SHIPPED 18 September 2026; b and c open**

The largest missing category. Four options, all true today, none fabricated:

**a. Counted, never asserted.** `lib/db/founding.ts` already establishes the
pattern and the reason — a number nobody counts is a compliance risk on the
page a merchant-of-record reviewer opens. Add a sibling:

```ts
/** Reps actually completed, for the landing page. Counted, never asserted. */
export async function repsRun(): Promise<number> {
  const { count } = await supabaseAdmin
    .from('sessions').select('id', { count: 'exact', head: true })
  return count ?? 0
}
```

Rendered as one line under the hero: **`129 reps run · 27 people training`**.
Small numbers are more credible than round ones, and at this stage honesty about
being early is an asset.

**b. Three real scorecards.** Anonymised, real composites, real dimension bars,
the real *went well* line. Everything must pass `assertPublishable`
(`lib/share/cards.ts`) — it already refuses rather than sanitises, which is
exactly the guarantee this needs. This is the strongest single proof asset
available and the component to render it already exists.

**c. The nervousness-gap chart.** Aggregate predicted-versus-actual from the
field log across all users. No competitor can show that chart, it is a chart
rather than a sentence, and it is the visual the landing page's empty right
column has been waiting for.

**d. A founder line, with a name and a face — yours, not a stock one.**
"Built by one person in Sri Lanka, because I was bad at this." §14's reviewer
reads a solo founder as a real entity; a cold visitor reads it as a reason to
trust the page. `VISUAL-AUDIT.md` §1 forbids photographs of *people as
product* — models, users, characters. It is not an instruction to hide the
company. Confirm the reading before you ship a face, but the text line is
unambiguous either way.

**Do not fabricate testimonials.** Rule 12, terms clause 08, and an invented
review on `/` is a payment-account risk that costs more than every signup it
could buy.

### 4.5 · Fill the empty right column  ·  **the scorecard row SHIPPED 18 September 2026**

Every section is a left-column headline with an empty black right half at
1200px. Screenshotted at four scroll positions; empty at all four. Candidates,
in order of cost:

| Section | Put here |
|---|---|
| Hero | 6-second silent loop: the timer counting down, the waveform moving, the warmth meter drifting. No faces required |
| The scorecard | The `ScorecardArtifact` already exists — move it right, alongside the copy, instead of below it |
| The roster | The four `FluidPersona` avatars from `lib/personas/visual.ts`, which already exist and are currently described in words only |
| The loop | The 01–04 diagram, at full size instead of squeezed left |
| Pricing | The nervousness-gap chart from 4.4c |

The 6-second loop is the one worth building. It is the only asset on this list
that proves the software runs.

### 4.6 · Fix the free plan row  ·  **SHIPPED 18 September 2026**

`lib/site/plans.ts:660`. `repsPerDayLine` returns `'None'` on free, and the
pricing card prints it directly under `$0`.

The precedent for the fix is **in the same file, thirty lines away**:
`interviewsLine` returns `'1 free'` for free rather than `'None'`, with a
comment saying a card that printed `None` beside a bullet promising one free
interview "would be contradicting itself on the page a merchant-of-record
reviewer reads."

That argument applies verbatim to voice reps, and the free plan's own feature
list says *"One voice rep when you sign up, so you know what you are deciding
about."*

```ts
/**
 * The card meter asks "what do I get", not "how many a month" — the
 * distinction `interviewsLine` already draws. Free grants one voice rep at
 * sign-up, and the feature list two inches below says so, so `None` here is
 * the card contradicting its own bullet.
 *
 * `repsPerDayLine` is unchanged: `/profile/subscription` is reporting a live
 * entitlement, where a zero is the truth.
 */
export function repsLine(plan: PublicPlan): string {
  if (plan.id === 'free') return '1, then text mode'
  return repsPerDayLine(plan.repsPerDay)
}
```

Keep `repsPerDayLine` exactly as it is — E3's reconciled line is a different
question and a zero there is correct.

### 4.7 · The skip link renders as visible text  ·  **FIXED 18 September 2026**

**Confirmed bug.** `.skip-link` is used in `components/site/site-chrome.tsx:128`
and `components/app-shell.tsx:236`, and there is **no `.skip-link` rule
anywhere in `app/globals.css`.** So it paints as an ordinary link at the top
of every page — the first glyph a visitor sees on the landing page is an
accessibility affordance that was supposed to be invisible.

```css
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 100;
  padding: 0.75rem 1rem;
  background: var(--volt);
  color: var(--ground);
  font-family: var(--font-display);
  text-transform: uppercase;
  border-radius: 2px;
}
.skip-link:focus { left: 0.5rem; top: 0.5rem; }
```

Max 2px radius, volt on ground, Barlow Condensed uppercase — Arena-compliant,
and it only takes volt while focused, so the once-per-screen rule holds.

### 4.8 · Open the first two FAQs  ·  **SHIPPED 18 September 2026**

Six collapsed items, and the first is *"Do I have to actually speak out
loud?"* — the single most common objection to this product, behind a click.
Render the first two expanded by default. The answer to the biggest objection
should never be a tap away.

### 4.9 · Replace the OG image  ·  **SHIPPED 18 September 2026**

`public/og.png` is the wordmark on black: 1.18MB, and in a Facebook feed it is
a logo for a brand nobody has heard of. Build it as a route instead of a static
file so it can never drift from the product:

```
app/opengraph-image.tsx   → next/og ImageResponse
```

Contents: the scorecard. `COMPOSITE 87`, six dimension bars, `MAYA · TIER 3 ·
SHE LEFT`, and three words of overlay — **"Scored on how you talked."** That
image answers *what is this* in the feed, which is where the decision is
actually made. Target under 300KB.

Update `app/layout.tsx`'s `openGraph.images` and `twitter.images` at the same
time, and give `/start` its own — the run has its own `metadata` block already
and currently inherits a wordmark.

---

## 5 · Beyond the audit — things nobody asked about that move signups

### 5.1 · A public demo that costs nothing to serve

The strongest possible fix — *let them try one rep before signing up* — is
already refused by D21, correctly: `maySpend` is keyed to a user id (rule 11),
so an anonymous rep is uncapped voice spend with no owner, and §16.4 makes it a
dating conversation with an unverified age. **Do not reopen that.**

The compliant version is a **replay**, and rule 10's note preserves exactly the
constraint that makes it safe: his half may be authored and read aloud
verbatim, hers must be captured from the real persona and never hand-written.

Build `/demo`: 45 seconds of a real rep as audio, with the transcript
advancing in time and the scorecard assembling at the end. It costs one
generation to make, zero per visitor, and it is the only page you could put in
an ad that shows the product working. Every public CTA on it points at
`/start`.

This is the highest-ceiling item in this document and the one most likely to be
what actually fixes the number.

### 5.2 · The ad layer is half the problem and none of the audit

I could not see the creative or the campaign, and three things there outrank
everything on the page:

- **Where the ad points.** If it links to `/` rather than `/start`, every fix
  in §3 is invisible to that traffic. Check first.
- **Message match.** The first item on every conversion checklist. Whatever the
  ad's first line promises, the hero headline should repeat in *the same words*.
  If the ad says "practice rejection" and the page says "three minutes, one
  stranger, no script", the visitor spends their first two seconds
  reconciling two products instead of evaluating one.
- **Objective.** Covered in 1.2, and it is the whole ballgame. A traffic
  campaign buys taps. A conversion campaign buys signups. You have been buying
  taps.

### 5.3 · $340 does not buy a Meta test

`MARKETING-PLAN.md` §1 already priced this honestly: US CPC $2.69, so the
whole eight-week budget is ~126 clicks. **A conversion campaign needs roughly
50 conversions in a week to exit the learning phase.** At a 3% signup rate,
126 clicks is 4 conversions. The optimiser will never learn.

Two ways out, and they are not exclusive:

- **Optimise for a cheaper event.** Set the campaign on `Lead` (§1.2's
  `BuildStep` event) rather than `CompleteRegistration`. At ~15% of clicks it
  produces enough volume to teach, and it sits one screen from the account.
- **Stop buying US clicks with this budget.** The plan's own base case is 35–55
  customers from *creator content*, not ads, and its honest read is that $340
  is "creator payroll rather than advertising". The ads' real job right now is
  to collect a retargeting pool and validate the funnel — which needs the pixel
  (§1.2), not more money.

### 5.4 · Cheaper traffic that matches the product better

Paid social is the coldest, worst-converting source on the benchmark table
(1–6%) and you are buying it at US rates from Sri Lanka. Sources where this
specific product has an unfair advantage:

- **Reddit.** r/socialskills, r/dating_advice, r/cscareerquestions. Not ads —
  answers. The product is a legitimate answer to questions asked there daily,
  and the traffic converts several times better than paid social.
- **The interview track is the easier sell and it is buried.** "Practice a
  technical interview with an AI that has read your CV" is a search term with
  intent behind it. `/interviews` is already a public page. It has no ad spend,
  no SEO work, and it is the arm where somebody has a deadline.
- **Product Hunt.** `marketing/product-hunt/` exists in this repo and has never
  shipped. One launch is worth more than the whole ad budget and costs a day.
- **Your own network.** 30 accounts is not a launch. Sri Lankan university
  students preparing for interviews are reachable, free, and on the arm of the
  product that does not need the dating framing.

### 5.5 · Capture the 97% who leave

97% of visitors will not sign up today, and right now every one of them is
gone forever. Two low-cost catches, both of which must stay inside §16 and rule
12 — no clinical framing, no "fix your anxiety":

- **Email-only fallback on the hook screen.** "Not ready? I'll send you the
  three-minute breakdown of what a rep scores." One field, no account, no age
  gate (nothing is granted), feeding `lib/email/`, which already exists and
  already sends the one pre-charge message §14 requires.
- **Retargeting.** Free once §1.2 ships. The 106 people already lost cannot be
  recovered; the next 106 can.

### 5.6 · Things to keep refusing

Written down so a future session does not "improve" them back:

- **No rep before the account.** Rule 11 and §16.4. D21's refusal stands.
- **No paywall inside the run.** D21. The free rep costs ~8¢ and is the most
  convincing thing you own; selling before the first scorecard sells at the
  moment of lowest earned belief.
- **No statistic on the reframe screen.** Rule 12, terms clause 08. Every
  number about people avoiding conversations is one clause from a prevalence
  claim.
- **No discount, no annual offer, no referral.** `LAUNCH-GAP.md` §3b Part 7,
  S1's argument: a percentage off a metered product recruits the cohort that
  uses it hardest.
- **No fabricated social proof.** §12, and it is an account-closing risk.
- **No photographs of people as product.** `VISUAL-AUDIT.md` §1, and §14's
  reviewer is the reason.
- **No countdown timers, fake scarcity or exit-intent guilt.** The founding
  allocation is counted rather than asserted for exactly this reason
  (`lib/db/founding.ts`); a "places left" nobody counts is the same class of
  claim.

---

## 6 · What to measure, and when to stop

Run these in order. Each one is a week or 100 visits, whichever is later.

| # | Change | Read | Kill criterion |
|---|---|---|---|
| 0 | §1 ships | The funnel chart exists | — |
| 1 | Google sign-in + age gate moved (§2.1, 2.2) | hook → account | No lift after 200 visits: the problem is upstream of the form |
| 2 | CASS moved to screen 4, `reframe` cut (§3.1, 3.2) | Per-step drop | Drop moves rather than shrinking: you relocated it, try 3.3 |
| 3 | Social proof + hero rewrite (§4.1, 4.4) | Visit → hook | No lift: the ad creative is the constraint, go to §5.2 |
| 4 | `/demo` (§5.1) | Visit → hook, and time on page | — |

**Before any of this, re-read the arithmetic in the audit's §0.** At a true 3%
rate, 100 visits produces zero signups 5% of the time. Do not kill a change on
80 visits, and do not celebrate one on three signups. Fixing the instrumentation
is what makes that discipline possible; without §1 every one of these gates is
a coin flip read as a verdict.

---

## 7 · Docs to update when these ship

Per `docs/README.md`'s table:

| Change | Touches |
|---|---|
| Pixel, PostHog key | `LAUNCH-GAP.md` B7 — mark it closed with what landed |
| Google sign-in, age gate position | `ONBOARDING-AUDIT.md`, `LAUNCH-GAP.md` D24, `components/site/legal-pages.tsx` (it lists the setup answers we keep) |
| Any `/start` step added, removed or reordered | `LAUNCH-GAP.md` D21 and D24, `lib/data/start-funnel.test.ts` |
| Anything on `/` — hero, pricing row, OG, social proof | `LAUNCH-GAP.md` B1 and B4, `VISUAL-AUDIT.md`. The site is the second audience §14 names, so a claim added there is a claim somebody will check against the build |
| `repsLine` | `lib/site/plans.test.ts`, which pins the plan strings |
| The demo at `/demo` | `VISUAL-AUDIT.md` (it is the first embedded product media on the site) and rule 10's note in `CLAUDE.md` |
