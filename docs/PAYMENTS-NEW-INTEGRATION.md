# Payments — the new integration

The decision, taken 31 August 2026, to stop selling voice by the day and start
selling it by the account: **one free voice rep during sign-up, everything else
in voice behind Pro, and a card-backed seven-day trial in front of it.**

This document is the plan of record for that change. It says what was decided,
what it costs, what has to be built, how Creem is configured, and what is still
open. `PAYMENTS-APPROVAL.md` remains the separate, non-code question of getting
a merchant of record to approve us at all; nothing here is reachable until that
is answered.

**Status (31 Aug): steps 1–5 built and verified; steps 6–9 are gated on the
merchant-of-record account and are not code.** §11 is the record of what
actually landed, item by item, and what is still owed by hand. The billing pipe
underneath it was already built and verified (`lib/billing/`,
`app/api/webhooks/creem/route.ts`, `npm run db:billing`) — see `LAUNCH-GAP.md`
B2.

---

## 1 · The decision, in the words it was made in

> In the sign-up process, we let them talk to a new character. Someone flirty,
> someone a bit more engaging than Nadia. Let them win it — make it easy to win.
> Then lock all voice communication and keep text and field challenges. If they
> want voice, they have to be a Pro member. To be Pro you get a seven-day free
> trial and you need to put the card in — nothing to lose there. And Elite at
> $49, because it makes the lower one feel more achievable.

Restated as a model:

| Stage | What they get | Price | What it costs us |
|---|---|---|---|
| Sign-up | One voice rep against the new rung-1 character | — | ~$0.09 once |
| Free, forever | Text mode, field challenges, streak, history, the Sunday letter. **No voice.** | $0 | ~$0 |
| Trial | 7 days of Pro, card captured up front | $0 | ≤ $1.85 once |
| Pro | Voice, 3 reps a day | **$19** | $7.91/mo at full burn |
| Elite | Voice, 6 reps a day, priced as the anchor | **$49** | $15.82/mo at full burn |

The structural change is the middle row. Today free is **1 voice rep a day,
forever** — a recurring cost of **$2.64 per free user per month**, which is 11%
of a Pro subscription burned monthly on somebody who never pays. After this
change, the only free voice in the product is a single rep that happens once,
during sign-up.

---

## 2 · Why this is the right shape

**Freemium works when a free user costs nothing.** Slack, Dropbox and Zoom can
carry a free account indefinitely because the marginal cost of one is rounding
error. Ours is voice minutes against a realtime model. We are not a
freemium-shaped business and the current plan quietly assumes we are.

Per 100 sign-ups at $19, net of the merchant of record (~$17.67):

| Model | Conversion | Payers | Free-user cost | Month 2 onward |
|---|---|---|---|---|
| Freemium — what is built today | 4.5% (median) | 4.5 | **$252/mo, forever** | **−$151** |
| Trial, no card | 14% (median) | 14 | $185 once | +$314 |
| **Trial, card required — chosen** | ~49% | 49 | $185 once | **+$1,098** |

Conversion figures are 2026 industry medians, not our measurements; treat the
ordering as reliable and the magnitudes as indicative. The free-user cost
assumes full daily burn, which is worst case. Neither caveat changes the sign:
freemium is the only row that loses money every month in perpetuity.

**The nearest competitor already does this.** Yoodli's free tier is five
roleplays *total*, not five a week. Orai has no free tier at all, only a
seven-day trial. Our current 1-rep-a-day-forever is the outlier in the category.

**Elite at $49 fixes a real margin hole, not just an anchor.** At $39 with six
reps a day, Elite lands at **53%** gross after the merchant of record — below
the 59% §14 explicitly rejected 200-minute pricing for. At $49 the same plan is
**62%**. The price rise is doing economic work as well as psychological work,
which is why it should happen regardless of the anchoring argument.

| | Price | Voice at full burn | MoR | Margin |
|---|---|---|---|---|
| Pro (spec §14) | $19 | $7.91 | $1.33 | **51%** |
| Pro (built) | $24 | $7.91 | $1.58 | 60% |
| Elite (today) | $39 | $15.82 | $2.31 | **53%** |
| **Elite (proposed)** | **$49** | $15.82 | $2.80 | **62%** |

### 2.1 · Pro at $19 — the case, and the one thing that decides it

**Decided: launch at $19, as an explicit founding-member price.**

The margin gap only opens at the cap. At usage anyone will actually reach, the
two prices are within a few points of each other:

| A Pro user does | $19 | $24 |
|---|---|---|
| 1 rep/day (typical) | 79% | 82% |
| 2 reps/day | 65% | 72% |
| 3/day, every day (the cap) | **51%** | 61% |

$19 needs **26% more subscribers** than $24 to make the same revenue. Crossing
under the $20 line plausibly buys that, and it puts us on the competitor band
rather than above it — Poised is $19 monthly and Speak ~$18, while $24 would
make us the second dearest in the category. The wider $19 → $49 gap also makes
Pro read as the attainable plan, which is the point of pricing Elite at $49.

**The risk is not the price, it is the measurement.** Every voice cost in this
document is projected from four runs; `M0.md` still owes the live ten-rep
measurement from Colombo at 7–9pm. At the ledger fallback rate of $0.195/rep —
2.2× the dearest measured — a maxed-out Pro user costs $17.55 against $17.67 of
net revenue at $19. **That is zero margin.** At $24 the same error still leaves
20%. $24 absorbs a 2× cost surprise; $19 does not.

There is also a selection effect: once free voice is gone, everyone on Pro has
self-selected for wanting voice, so average usage will run hotter than a
freemium population would suggest.

**Which is why the founding-member framing is load-bearing, not marketing.**
`CHECKOUT_NOTE` already promises that founding members keep the launch price.
Launching at $19 under that promise leaves the door open to raise it for new
users later without breaking faith with the early ones. Cutting a price is
easy; raising one is not. **Take the M0 measurement before the live products go
up**, and if it lands near the projection, $19 stands.

---

## 3 · What the free tier keeps, and why it is not nothing

§14 contains a rule that this change must not break:

> Running out never blocks the streak — field challenges cost nothing and keep
> the daily habit intact. This is deliberate, and it is what stops the paywall
> from also being a churn event.

So free is not removed; it is **made voice-less**. It keeps every part of the
product whose marginal cost is approximately zero:

- **Field challenges** — one a day, the prediction captured before they go, the
  log, the predicted-versus-actual chart. This is the retention machinery and
  it costs nothing to run.
- **Text mode** — the same characters, unmetered, no score, capped below
  `ARM_THRESHOLD` so it can never produce the number a voice rep exists to earn.
- **Streak, history, transcripts, the Sunday review letter.**

This turns free from a **$2.64/month liability into a $0 retention surface**. A
user whose trial lapses does not lose their streak, their field log or their
progression — they lose the microphone. That is the difference between a
paywall and a churn event.

---

## 4 · The sign-up rep

### 4.1 What it is for

One voice rep, during onboarding, against a character authored specifically to
be won. It replaces the current day-one grant of three reps (`D11`) as the
product's first-impression moment.

The argument for making it winnable is already in the spec — §06 says Level 1
"must be nearly impossible to fail. A socially anxious person opening their
microphone for the first time is already at seven out of ten." This extends
that logic one rung further down, to somebody who has not yet decided whether
this product is for them.

### 4.2 The character

**Authored as Tess — `lib/personas/tess.ts`, a launderette on a Sunday
afternoon, nineteen minutes left on her machine.** Seeded like every other one
(rule 8 — content is authored in the repo and reviewed in a pull request, never
generated at runtime). The scene is doing most of the work: a launderette is the
one room where a stranger is genuinely stuck, genuinely unoccupied, and has an
obvious shared situation to talk about, so the opener a first-timer can actually
manage is the correct opener rather than a weak one.

**She is a full member of the roster, not a demo character** — decided 31 Aug.
She takes rung 1, is replayable like anybody else, and the ladder renumbers
below her:

| Rung | Before | After |
|---|---|---|
| 1 | Nadia — bookshop | **New character** |
| 2 | Maya — coffee shop | Nadia — bookshop |
| 3 | *(unheld)* | Maya — coffee shop |
| 4 | Robin — hotel lobby | Robin — hotel lobby |

This **closes the gap at rung 3**. The ladder is currently 1, 2, 4 with nothing
at 3, and an unheld rung falls back to its nearest neighbour rather than to an
interpolation nobody designed; after this it is contiguous.

The renumber is cheap and gets dearer with every real user, which is an
argument for doing it now:

- `lib/warmth/levels.ts` builds the level→trajectory map **from the roster**,
  not from a parallel table, so renumbering the personas renumbers the curves.
- The `check (level between 1 and 8)` constraints on `profiles.current_level`,
  `scores.level` and `difficulty_offsets.level` all still hold.
- Live data is 43 sessions, 37 scores, 9 unlocks and **0 difficulty offsets**,
  across 15 dev accounts. Nothing here is worth migrating.
- §12 takes the warmth digits off the screen from level 4. Robin stays at 4, so
  that rule lands on exactly the character it was written for.

The ladder must still test as monotonically harder, which holds by
construction: the new character is easier than Nadia by design, and Nadia is
already easier than Maya.

Proposed dials, against Nadia's for reference:

| Dial | Nadia (rung 1) | Sign-up character | Why |
|---|---|---|---|
| `start` | 32 | **48** | Begins most of the way to a conversation that is going well |
| `gain` | 1.1 | **1.8** | Rewards almost any contribution |
| `decay` | 0.5 | **0.3** | Silence costs less |
| `decayPerTurn` | 0.2 | **0.1** | A slow turn is not punished |
| `maxGainPerTurn` | 3.5 | **4.5** | A strong turn can actually move the meter |
| `sessionCeiling` | 85 | 85 | Unchanged |
| `flirtiness.unlocksAt` | 35 | **30** | Warmer earlier — the "more engaging" note |
| `distraction` | 15 | **8** | She is present, not half-elsewhere |
| `patience` | 80 | **90** | She waits |

With `start: 48` and `gain: 1.8`, a user who speaks at all reaches
`ARM_THRESHOLD` (65) well before the 2:30 mark, and `KEEP_THRESHOLD` (55) is
almost unreachable downward. **Easy, not automatic** — the meter still has to be
moved by talking, or the win teaches nothing and the user knows it.

**Every proposed dial above shipped unchanged**, and the tuning holds where it
was aimed. Against the same scripted good rep the ladder is measured with
(`engine.test.ts`), Tess arms on **turn four** — under a minute into a
three-minute rep — and reaches her session ceiling of 85 by about turn ten.
Fifteen turns of flat, dead-end replies leave her at **46.5**, below both the 65
that arms a rep and the 55 that keeps it. So the win is easy and it is not
automatic, and both halves are assertions rather than intentions.

### 4.3 Four constraints on the tuning

**The baseline is safe, now that she is a real rung.** An earlier draft of this
plan had her as a throwaway demo, which broke §08: the first rep is a
measurement the product re-offers at day 28 and shows side by side, and a
one-off easy character would have made that comparison measure the gap between
two personas rather than the user's improvement. Making her rung 1 removes the
problem — the sign-up rep is a real rep against a real rung, so it is a fair
baseline and the day-28 re-test compares like with like.

**Easy to win is not easy to score.** Warmth 65 arms a rep; a level opens on
two reps *graded* 70+, and the grade scores process rather than outcome (§07).
She can be generous with warmth and still demand a real conversation to score
well against, so the progression ladder keeps its meaning. These two numbers
must not be allowed to collapse into one during tuning.

**"Flirty" is a dial, never a description.** `flirtiness` is an existing gated
layer with a ceiling and an unlock threshold; turning it up is ordinary persona
tuning. But the word must not reach public copy, the persona list, or anything
a merchant-of-record reviewer can read. §14 is unambiguous that every provider
on the shortlist bans dating products by name, and a reviewer who signs up is
shown this character first. She is a person who is pleased to be talked to. She
is not a flirt, and the site must never call her one.

**PG-13 still applies to both streams.** `lib/safety/` is unchanged and runs on
this rep exactly as it runs on every other: first breach is an in-frame decline
and the rep continues, a second ends it, and content involving minors ends it
on sight. A warmer character is not a looser one.

---

## 5 · What has to be built

### 5.1 Plans and copy

| File | Change |
|---|---|
| `lib/site/plans.ts` | Free loses its rep count and gains an honest feature list — field, text, streak, history, no voice. Pro → **$19**, `open: true`. Elite → **$49**, `repsPerDay: 6`. `CHECKOUT_NOTE` keeps its founding-member promise, which §2.1 relies on, and drops "not open yet" |
| `lib/personas/` | The new rung-1 character, and `level` bumped on Nadia (1→2) and Maya (2→3). Robin unchanged. Then `npm run db:seed` |
| `components/site/pricing-page.tsx` | Reads the above; verify the free column does not read as a demo with a price attached |
| `components/screens/profile-screens.tsx` | Same record, in-app |
| `components/site/legal-pages.tsx` | Trial terms, card capture, renewal and cancellation are a claim on the legal pages, per the rule in CLAUDE.md |

`lib/site/plans.ts` is the single record both surfaces read, so the price cannot
drift between the public page and the app. That property must survive this edit.

### 5.2 The voice lock

Voice is gated in exactly one place today — `mayOpenSession` in
`lib/db/progress.ts`, called by `app/api/voice/token/route.ts` after
`requireUser` and `maySpend`. The lock goes there, not in the UI.

- `entitlements.reps_per_day` becomes **0 on free**. `consumeRep` already
  refuses at zero, so the mechanism exists.
- `lib/data/allowance.ts` — the day-one grant of three reps is replaced by the
  single onboarding rep, which is spent against a separate counter so it cannot
  be repeated by a user who abandons and resumes onboarding.
- The refusal needs its own copy and its own screen. "You are out of reps for
  today" is wrong for a free user who has none at all; this is the upgrade
  moment and it is the highest-value screen in the funnel.

**The onboarding rep runs after account creation**, inside the authenticated
part of the flow. This is deliberate: `requireUser` and `maySpend` both still
apply, so the most expensive endpoint in the product is never reachable
anonymously, and the per-account spend ceiling still bounds it.

### 5.3 The trial

- `startCheckout` (`app/profile/subscription/actions.ts`) already exists and
  already stamps `metadata.user_id`. It needs no change for trials.
- `subscription.trialing → grant` is **already mapped and tested** in
  `lib/billing/events.ts`. A trial grants Pro the moment it starts.
- `subscription.expired → revoke` lands them on free, which after this change
  means voice off and everything else intact.
- What is missing is UI: a trial countdown, the card-on-file state, and a
  cancel path that does not require emailing us. **The countdown needs a read
  fixed first** — a trialling subscription is stored with `status = 'active'`,
  because status comes from the event type and the event is
  `checkout.completed`. See §12.

### 5.4 The buy button

There is no UI in front of `startCheckout` today. Needed: `/profile/subscription`
as a real screen, and an upgrade route from the refusal in §5.2.

---

## 6 · Creem setup

### 6.1 Products

Two recurring products, created once in test and again in live. Ids differ
between the two environments, which is why they are environment variables and
not code.

```bash
creem products create \
  --name "Nerve Pro" \
  --description "Voice practice: three timed reps a day, graded on delivery." \
  --price 1900 --currency USD \
  --billing-type recurring --billing-period every-month \
  --tax-mode exclusive --tax-category saas

creem products create \
  --name "Nerve Elite" \
  --description "Voice practice: six timed reps a day, graded on delivery." \
  --price 4900 --currency USD \
  --billing-type recurring --billing-period every-month \
  --tax-mode exclusive --tax-category saas
```

`--tax-mode exclusive` means tax is added on top and we keep the full $19. This
matches §14's margin arithmetic, which treats the price as gross revenue.
Inclusive would silently cut each tier by the local VAT rate.

**The seven-day trial is set on the product** (`trialDays: 7`), via the
dashboard or the API — the CLI's `products create` does not expose the flag.
Card capture at trial start is Creem's default for a trialling subscription.

### 6.2 Environment

```bash
CREEM_API_KEY=            # creem_test_… or creem_live_…; the prefix picks the API host
CREEM_WEBHOOK_SECRET=     # Dashboard → Developers → Webhooks
CREEM_PRODUCT_PRO=        # prod_… for Nerve Pro
CREEM_PRODUCT_ELITE=      # prod_… for Nerve Elite
```

An unrecognised product id grants **nothing** and logs loudly — the webhook
records the money and leaves the plan alone. A typo costs a support ticket, not
free Elite for anyone who finds the checkout link.

### 6.3 Webhook

Endpoint `POST /api/webhooks/creem`, registered in the dashboard. Already built
and verified against signed payloads; it refuses with 503 when
`CREEM_WEBHOOK_SECRET` is unset rather than trusting an unsigned body.

| Event | Effect |
|---|---|
| `subscription.trialing` | **grant** — trial starts, Pro is live |
| `subscription.paid`, `.active`, `.update`, `checkout.completed` | grant |
| `subscription.past_due`, `.unpaid` | record — access **kept**, provider is still retrying |
| `subscription.scheduled_cancel` | record — kept until the period ends |
| `subscription.expired`, `.canceled`, `.paused` | revoke → free |
| `refund.created`, `dispute.created` | revoke immediately |

### 6.3a The account as it actually stands, 31 Aug

Checked against the live test account rather than assumed. `npm run creem:verify`
re-checks all of it and is the gate to run before any deploy that can charge.

| | State |
|---|---|
| Account | Exists. `~/.creem/config.json`, environment `test`, a `creem_test_…` key |
| App configuration | **None.** No `CREEM_*` variable is set locally or on Vercel, so `checkoutConfigured()` is false and the buy button is correctly hidden |
| Products | **One.** `prod_1UPb0Txvljc9F1u9uiC31f` · "Nerve Training" · $19/mo · recurring · tax exclusive/saas · active |
| Free trial | **NOT SET on that product** |
| Elite | Does not exist |

Three things follow, in order of danger.

**The trial is the dangerous one.** Creem sets it on the product, in the
dashboard, at creation time — the CLI has no flag for it and the products API
does not return the field. Meanwhile every paid surface in this app promises
`TRIAL_DAYS` free: the pricing page, `TRIAL_NOTE`, the countdown on
`/profile/subscription`, and clause 07 of the terms. Wiring the existing product
up as it stands would charge $19 the instant somebody clicks *Start 7 days free*
— a false claim on a payment page, which is precisely the dispute pattern §14
says closes a merchant-of-record account. **Both products must be created with
Trial Period on.**

**The existing product's description is the retired plan.** It reads "60 minutes
of practice reps per month", which is §14's minutes model, not the three-reps-a-
day plan we now sell. It is on the receipt and in the dashboard a reviewer reads.
`creem:verify` warns on it.

**A test key must never reach production.** `test-api.creem.io` takes no money
but emits the same correctly signed webhooks as live, so a test key in
production means checkout "succeeds", `subscription.paid` arrives, and
`applyBillingEvent` grants a real paid plan against a payment that never
happened — free Elite for anyone who finds the button. `checkoutConfigured()`
therefore returns **false** on a production runtime unless the key is
`creem_live_`, and the screen falls back to the notify-me list. Asserted in
`lib/billing/plans.test.ts`. A live key needs the account approved, which is
`PAYMENTS-APPROVAL.md` and is not code.

### 6.3b What was created and proven, 31 Aug

Two products, through the API, with the copy the plan specifies:

| Plan | Product id | Price |
|---|---|---|
| Pro | `prod_7HgaFo2ZPTuCuih2gETbsh` | $19.00 / month |
| Elite | `prod_2PCQm3Do9eDLiMTryPQucZ` | $49.00 / month |

Both recurring monthly, tax exclusive / saas, active, test mode, with
`default_success_url` set to `https://www.hellonerve.com/profile/subscription?bought=1`.

**The product-level return URL is a backstop, not the main path**, and it is
worth having for two reasons. `startCheckout` sends a `success_url` on every
session and that one wins — but it can only send one if an origin resolves from
the environment, and `NEXT_PUBLIC_SITE_URL` is set to an empty string, which
`??` does not treat as unset. Until that was fixed, no checkout carried a return
URL at all. Second, a product carries its own hosted payment link
(`product_url`), which never passes through our code; the product default is the
only thing that brings that buyer back. Note that such a purchase also carries no
`metadata.user_id`, so `applyBillingEvent` cannot attribute it — see
`resolveUserId`. Those links should not be circulated.

The www host is deliberate: the apex 308-redirects to it. `/profile/subscription`
now treats the provider's own `checkout_id` parameter as a completed purchase as
well as our `bought=1`, so the confirmation banner does not depend on our query
surviving a redirect or a link we did not build. The original
`prod_1UPb0Txvljc9F1u9uiC31f` ("Nerve Training", stale minutes-based
description) is left in place and unused — retiring it is a dashboard decision.

`npm run creem:verify` passes every static check on both. `npm run creem:verify
-- --checkout` opens real sessions through `createCheckout`, the same function
the buy button calls, and both return a `checkout_url`. **That closes the first
half of §6.4:** everything from the button to the vendor's checkout page is
proven. What is left is the webhook coming back, which needs a public URL.

**The trial is confirmed absent, empirically.** The product API rejects
`trial_days`, `trial_period_days`, `free_trial_days`, `trialDays`,
`trial_period`, `free_trial`, `trial`, `has_trial` and `trial_enabled` with
"property … should not exist", and the created checkout session contains no
trial field anywhere in its payload. So it is dashboard-only, and until Trial
Period is switched on **these two products charge immediately** while the app
promises `TRIAL_DAYS` free. They must not be wired into a live deployment in
this state.

### 6.5 Rehearsing on the production domain, and the flip to live

**Decided 31 Aug: the rehearsal runs on `hellonerve.com`, not through a tunnel.**
The domain is not published anywhere yet, and the only honest way to prove a
payment flow is to run it where it will actually run — a tunnel to a laptop
exercises none of the real domain, the real redirect, the real cookie or the
real webhook route.

That is not free. A test key in production grants real plans for payments that
never happened, and test mode gives every product a public hosted payment link.
So the state is **chosen rather than stumbled into**, and three things hold it:

| | |
|---|---|
| `CREEM_TEST_MODE_IN_PRODUCTION=1` | One variable, named for what it does. Its absence is the safe default, so nobody reaches this state by copying a key between environments. It is the only thing that opens either guard |
| The banner | `/profile/subscription` tells every visitor, in the copy itself, that checkout is a sandbox rehearsal and no card is charged. Amber, because it is a warning |
| `npm run creem:verify` | Refuses to report the deployment ready while the flag is set, whatever else passes |

Without the flag, production refuses twice over: `checkoutConfigured()` hides
the buy button, and `billingEnvironmentRefusal()` stops the webhook applying any
event. Both are asserted in `lib/billing/plans.test.ts`.

#### The flip

**It is four values, not one, and that is Creem's shape rather than ours.**
Products are minted per mode, so `prod_…` ids differ between test and live, and
the webhook signing secret differs with them. Anything claiming a single switch
would be granting plans against the wrong catalogue.

Before flipping: create both products **in live mode with Trial Period on**, and
register a **live** webhook at `https://www.hellonerve.com/api/webhooks/creem`.
Then one paste:

```bash
vercel env rm  CREEM_TEST_MODE_IN_PRODUCTION production   # the rehearsal ends here
vercel env add CREEM_API_KEY          production   # creem_live_…
vercel env add CREEM_WEBHOOK_SECRET   production   # the LIVE webhook's whsec_
vercel env add CREEM_PRODUCT_PRO      production   # the LIVE prod_…
vercel env add CREEM_PRODUCT_ELITE    production   # the LIVE prod_…
vercel --prod                                      # env changes need a rebuild
```

Removing the flag is in the same block on purpose: a live key makes it a no-op,
so leaving it behind is harmless but it is exactly the kind of thing that
survives for a year and confuses the next person.

Then `npm run creem:verify` against the production environment. It reports ready
only when the key is live, both products resolve at the right prices, and the
flag is gone.

### 6.4 What is not yet proven

~~Creem has never called the endpoint.~~ **Closed on 1 September** — a real
checkout on the production domain delivered a signed webhook and moved the plan
without anybody touching the database. See §12.

What is left unproven is the *end* of the trial: whether the first charge lands
seven days on, and what arrives when it does. Test mode has no clock control, so
that one is a live-mode observation rather than a rehearsal.

---

## 7 · Rollout

1. Author the new rung-1 character; tune her against real reps until a
   competent first-timer wins and a silent one does not.
2. Renumber the ladder — Nadia 1→2, Maya 2→3 — and confirm the monotonicity
   test still passes. `npm run db:seed`. Do this before there are real users.
3. Flip `lib/site/plans.ts`: free without voice, Pro open at $19, Elite $49.
4. Set `reps_per_day = 0` for free; replace the day-one grant.
5. Build the refusal screen and `/profile/subscription`.
6. Create both products in Creem test, set `trialDays: 7`, fill the four
   environment variables.
7. Register the webhook against a tunnel; run one real checkout end to end.
8. Repeat 6–7 in live once the merchant-of-record account is approved.
9. Update `LAUNCH-GAP.md` D2 and B2, and `PAYMENTS-APPROVAL.md` §4.

Steps 1–5 are ours and are **done** — see §11. Steps 6–9 are gated on approval,
which is not code and is tracked in `PAYMENTS-APPROVAL.md`.

---

## 8 · Risks, honestly

**Card-required trials raise disputes.** A ~49% conversion rate is bought partly
with users who forget they subscribed. Our merchant-of-record account is a
single point of failure and §14's whole survival argument is about not
accumulating the patterns that close one. Mitigations, all of which should ship
with the trial rather than after it: an email before the first charge, a
visible countdown in the app, and a cancel button that works without contacting
us. The webhook already revokes on `dispute.created`, which protects the
product but not the account.

**One free voice rep per sign-up is a cost surface.** ~$0.09 each; a thousand
junk sign-ups is $90. It sits behind `requireUser` and `maySpend`, so it is
bounded per account, but nothing yet bounds accounts per person. Watch it.

**The easy win must not become a bait-and-switch.** If the sign-up character is
dramatically easier than Nadia, the second rep is a cliff. The gap between the
sign-up dials and rung 1 should be tuned deliberately, and the honest framing —
that this one is meant to be won — is better than pretending otherwise.

**Removing daily free voice removes a habit loop.** Field and text are the
replacement and they are genuinely good, but the assumption that they carry
daily retention on their own is untested. It is the thing to instrument first
(`LAUNCH-GAP.md` B7 — PostHog is still not installed).

---

## 9 · Open decisions

| # | Question | Note |
|---|---|---|
| 1 | ~~Pro at $24, or $19?~~ | **Resolved 31 Aug — $19, as a founding-member price. See §2.1.** Closes the price half of `LAUNCH-GAP.md` D2 |
| 2 | ~~The rung-1 character's name and scene~~ | **Resolved 31 Aug — Tess, a launderette on a Sunday afternoon. `lib/personas/tess.ts`.** See §4.2 |
| 2b | ~~Is she a demo or a real rung?~~ | **Resolved 31 Aug — a real, replayable rung 1. Nadia moves to 2, Maya to 3, Robin stays at 4. See §4.2** |
| 3 | Trial length — 7 days, or 3? | **Built at 7**, in `TRIAL_DAYS` (`lib/site/plans.ts`), which the pricing page, the refusal sheet, the subscription screen and the terms all read. Changing it is one constant and the product setting at Creem, in the same edit — a shorter trial converts sooner and costs less, and nothing in the code assumes seven |
| 4 | Annual billing | §14 says not at launch, and the reasoning holds. But every competitor quotes an annual price ~40% below monthly, so we always lose the sticker comparison |
| 5 | Does the trial grant Pro or Elite? | **Pro.** `subscription.trialing → grant` resolves the plan from the product bought, so an Elite trial would work if a product were configured for it; nothing offers one |
| 6 | The email before the first charge | **Not built, and it is the one §8 mitigation still missing.** The countdown and the cancel button both shipped. There is no transactional mail in this product at all yet, which makes it a piece of infrastructure rather than a ticket |

---

## 10 · Where this touches other documents

| Document | Why |
|---|---|
| `PAYMENTS-APPROVAL.md` | The MoR application. Nothing here is live until it is approved, and a reviewer signs up and meets the new character first |
| `LAUNCH-GAP.md` | D2 (the pricing drift this resolves), D11 (day-one reps, which this replaces), B2 (billing) |
| `NERVE-SPEC.md` §14 | The spec's tiers are minutes-based and $19/$39. This is a deliberate divergence, recorded as drift rather than by rewriting the spec |
| `ONBOARDING-AUDIT.md` | The sign-up run gains a rep step |
| `PRODUCT.md` | What a plan includes is a product rule |
| `DATA.md` | `entitlements.reps_per_day = 0` on free is a schema-semantics change |

---

## 11 · What actually shipped, 31 August

Steps 1–5 of §7. Verified by `npm run typecheck`, `npm run lint`, `npm test`
(1027 assertions), `npm run build:check`, and the live harnesses `db:verify`,
`db:rep`, `db:field`, `db:spend` and `db:billing`.

### The character, and the ladder under her

`lib/personas/tess.ts` — rung 1, seeded, replayable, and a full member of the
roster. `lib/personas/presentation.ts` and `lib/personas/visual.ts` carry her
half of the roster card; her avatar hue is a green at ~140°, which is the only
unclaimed arc left between Robin's teal-green and the band Volt occupies, and
`visual.test.ts` enforces that rather than a style note.

Nadia moved 1→2 and Maya 2→3; Robin stayed at 4. **Nobody's dials changed** —
`lib/warmth/levels.ts` builds the level→trajectory map off the roster, so
renumbering the characters renumbered the curves and nothing else.

Four shipped rungs meant four UI tiers, so `Level` widened to `1 | 2 | 3 | 4`
and `progression.ts`'s two translation tables became the identity across the
shipped range. Three consequences worth writing down, because each was a place
the renumber could have quietly cost a real user something:

- **Nobody's ladder position moved.** `uiLevel` and `engineRung` stay exact
  inverses, and a stored `profiles.current_level` of 4 still means Robin.
- **Nobody's rank moved.** The three earned ranks stayed anchored to the
  characters they were written about — Nadia earns Regular, Maya Contender,
  Robin Closer — so the rank blurbs still describe the character being cleared.
  Tier 1 mints no rank: Tess is authored to be won, and a rank for clearing her
  would be the badge shelf §08 rules out.
- **The field ladder is untouched.** `unlockedTier` reads engine rungs, and the
  rungs a user reaches for T2 and T3 are the same numbers they were before.

The one deliberate change: **Maya is now earned rather than given.** Tiers 1 and
2 are open from the start, as they always were, and those are now the two
receptive characters — so Maya sits behind two qualifying reps against Nadia,
which is where §06's own eight-rung ladder had her before the roster shrank.
Robin's gate is identical: two qualifying reps against Maya, before and after.

### The voice lock

`entitlements.reps_per_day = 0` on free, defaulted to 0 for new accounts,
migration `20260831090000_p2_signup_rep_and_voice_lock.sql`. **No gate was added
anywhere in the application layer** — `consumeRep` and `mayOpenSession` already
refused at zero, so the column is the lock, which is also why no screen can
forget to check it.

`entitlements.onboarding_rep_used_at` replaces the day-one grant. Additive,
spent last, stamped in the same conditional UPDATE that moves the daily counter,
and cleared by `refundRep` when the rep being handed back was the one-off one —
a free account's only voice rep must not be lost to a muted microphone.
`lib/data/allowance.ts` is the whole rule, pure and tested.

The refusal carries a `kind` from `consumeRep` and `mayOpenSession` through
`/api/voice/token` to the sheet. "You are out of reps for today" is true for a
Pro account at three of three and a lie to a free account whose reps never
reset, so `upgrade` and `daily` are different screens rather than one string the
UI has to interpret. The reps pill in the chrome becomes a link rather than a
countdown to a midnight that changes nothing.

### The plans, the trial and the buy button

`lib/site/plans.ts`: free at 0 reps with an honest feature list, Pro $19, Elite
$49, `TRIAL_DAYS`, `TRIAL_NOTE`, and a `CHECKOUT_NOTE` that keeps the
founding-member promise §2.1 rests on and no longer claims checkout is shut.
`lib/site/plans.test.ts` asserts the ordering, the copy and that no plan surface
uses a word a payment reviewer bans by name.

`/profile/subscription` is a real screen: a buy button behind `startCheckout`, a
trial countdown that names the day the card is charged, a `?bought=1` banner for
the seconds between the redirect and the webhook, and a **Manage** button that
opens the provider's own portal — so cancelling never requires emailing us,
which is the §8 mitigation that matters most for account survival.
`checkoutConfigured()` keeps that button off a deployment with no
merchant-of-record variables and falls back to the notify-me list, so the
current pre-approval state shows an honest control rather than one that errors.

`components/site/legal-pages.tsx` §07 now states the trial length, the card
authorisation, the charge date, the cancellation route and what the free plan
actually contains — per the CLAUDE.md rule that a change to what the product
promises is a change to what the legal pages claim.

### One thing removed that the plan did not ask for

**The scorecard's Pro gate is gone.** Four of the six metric rows, the
judgement row, both moments and the transcript link were drawn under a
`LockOverlay` for a free account. It had to go, for three reasons that all
point the same way:

- It contradicted `lib/site/plans.ts`, which says a plan changes voice volume
  and nothing else, and `/pricing`, which lists "the full scorecard — six
  dimensions, evidence, transcript" under what a plan never changes. §14 has a
  merchant-of-record reviewer reading that page.
- It was never enforced. `/session/[id]/transcript` has no plan check on it —
  only the link was hidden — so it was a claim rather than a gate, which is the
  same defect `LAUNCH-GAP.md` D12 resolved for the persona gate, and the answer
  there was to make the copy true rather than to build the gate.
- After this change it lands on precisely the wrong screen. A free account now
  gets one scorecard, ever, from the sign-up rep, and it is the product's whole
  first impression. Showing it half-obscured argues against buying.

What replaced it on that screen is the upgrade moment itself: **Run it back**
opens the paywall sheet for a voice-locked account rather than walking them to a
brief that will refuse them. Somebody who has just finished the sign-up rep and
wants to go again is the entire funnel in one click.

Recorded here rather than acted on silently, because it is the one thing in this
change that was a judgement call rather than an instruction in §5.

### Still owed, and not code

Steps 6–9: the two Creem products with `trialDays: 7` set on them, the four
environment variables, a tunnel and a registered webhook, one real checkout end
to end, and then the same again in live. All of it waits on
`PAYMENTS-APPROVAL.md`. The pre-charge email (open decision 6) needs
transactional mail, which this product does not have yet.

`M0.md` still owes the live ten-rep measurement from Colombo at 7–9pm, and §2.1
says plainly that $19 does not absorb a 2× cost surprise. **Take it before the
live products go up.**

---

## 12 · The first real checkout, 1 September

A real purchase went through the deployed site under
`CREEM_TEST_MODE_IN_PRODUCTION=1` (§6.5): card `4242 4242 4242 4242` on Creem's
test mode, the hosted page, the redirect back to
`/profile/subscription?checkout_id=…`, and the webhook arriving unprompted.

**That closes §6.4.** Creem has now called the endpoint. `evt_…` verified,
`checkout.completed` applied, `subscriptions` row written with
`prod_7HgaFo2ZPTuCuih2gETbsh`, and `entitlements` moved to `pro` /
`reps_per_day = 3` without anybody touching the database. The whole path from
the button to the plan is proven, in production, on the real domain.

Two things came out of it.

### The trial is on, and we cannot see it

`current_period_end` came back seven days out rather than a month, which is the
trial doing its job — the Trial Period switch is on both products in the
dashboard, so §6.1's warning about products that charge immediately no longer
applies to the test-mode pair.

**But `subscriptions.status` says `active`, not `trialing`.** Status is read
from the event type alone (`INTENTS` in `lib/billing/events.ts`), and the event
that arrives on a trialling checkout is `checkout.completed`, which maps to
`active`. Creem's own `status: "trialing"` is in the payload and ignored. That
is harmless for access — a trial grants Pro either way, which is the intent —
and wrong for anything that has to *say* something about the trial. §5.3 already
owes a trial countdown and a card-on-file state; neither can be built off a
status that reads `active` on day one. Fix the read before building that UI.

**What the trial-end charge does is still unproven**, and cannot be rehearsed by
waiting: test mode has no clock control, so the seven days would have to pass in
real time, and the rehearsal is meant to be over before then. The path itself is
covered — `subscription.paid → grant` renews, `past_due` keeps access while the
retries run, `expired` revokes — and `npm run db:billing` exercises all three
against the real tables. Treat the calendar test as a live-mode observation on
the first real trial, not as a gate.

### The sign-up rep was being charged to the plan somebody had just bought

The account that bought Pro was shown **two** reps, not three. It had spent its
sign-up rep during onboarding twenty minutes earlier, and `reps_used_today = 1`
was still sitting in today's counter when `reps_per_day` moved from 0 to 3.

The grant is additive by design (§P2, `lib/data/allowance.ts`) but the counter
holds both it and the plan's reps, and remaining was `allowance − used`. That
subtraction is fine while the plan's number does not move. It is exactly wrong
on the day it does — which is the most likely day for it to move, because
upgrading immediately after the free rep is the funnel the whole pricing model
is built on. **The first thing a new subscriber saw was one fewer rep than the
page they had just paid on.**

Fixed read-side, in `lib/data/allowance.ts`: `signupRepSpentOn` says whether the
grant is inside today's counter, `planRepsUsedToday` takes it back out, and
`repsRemainingToday` counts the plan's own use against the plan. No write, no
migration, and nothing for the webhook to know about — `applyBillingEvent` still
touches only the plan. `refundingSignupRep` decides the same question in reverse
for `refundRep`, which had the mirror-image mistake: it would have handed a
refunded grant back as a plan rep and left the stamp set.

Covered by `lib/data/allowance.test.ts` and, against the real database, by the
"upgrading on the day you signed up" block in `npm run db:rep`. No repair was
needed for existing rows: the derivation is a read, so the affected account was
correct on its next page load.
