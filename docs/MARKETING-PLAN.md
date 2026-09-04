# Marketing plan — 100 paying customers in 60 days

**Block: 4 September → 2 November 2026. Budget $340. Effective selling window
46 days.**

This is the operating plan for the US launch, and it is also the place the
result gets recorded. It was drafted as an artifact on 4 September and moved
here so that any agent — and any future session — can read it, act on it and
mark it off without a browser.

## How to use this document

- **Day rows are checkboxes.** Mark `[x]` when the day's work is actually done,
  not when it was attempted. A day left unticked is a day owed, and §9's log is
  where the reason goes.
- **Gates are decisions, not milestones.** Five of them (Days 14, 21, 35, 49,
  60). Each says what to do if the number is under target. Write the real
  number into §9 on the day, including when it is bad — the whole point of a
  gate is that it changes the plan, and a gate nobody answers honestly is a
  date on a calendar.
- **§3 is the baseline as measured, not as assumed.** Re-measure rather than
  trusting the numbers there; they were true at 04:55 UTC on 4 September and
  the whole plan is about making them wrong.
- **§4 is what has to be fixed before Day 1 works.** Two of those items will
  break `npm run whop:verify` or a promise in the terms if they are done
  carelessly, and both are called out.

---

## 1 · The honest read

**$340 buys about one customer. Everything else has to come from content made
by hand and creators who sell for a cut.**

US Meta CPC is $2.69 and CPM is $23, so the whole eight-week budget buys
roughly 126 clicks — one paying customer through a normal funnel. That is not
an argument against the budget, it is an argument for spending it as creator
payroll rather than as advertising.

| | Figure | Why |
|---|---|---|
| Allowed CAC | **$3.40** | $340 ÷ 100 customers. US CPC alone is $2.69 |
| Base case | **35–55** | What this plan lands with no breakout video |
| Hitting 100 needs | **1 video over ~1M views** | Roughly a 1-in-5 outcome |
| MRR at 100 | **$1,300** | 60 on a new $9 tier, 40 on Pro at $19 |

### The funnel, priced out

Three faceless accounts, three posts a day, 46 posting days — about 400 videos.
Most land under 2,000 views. A working format throws off a handful at
20k–100k. This is the median outcome, not the good one.

| Stage | Rate | Out |
|---|---|---|
| Total views across all accounts | median | 2,000,000 |
| Bio-link clicks | 0.25% | 5,000 |
| Free signups | 20% | 1,000 |
| Trials started | 5–8%, → 12% at $9 | 120 |
| **Paying customers** | 45% card-required | **54** |

Two lines are worth arguing with. The 0.25% bio-click rate is where a breakout
video changes everything — one post at a million views doubles the top of the
funnel on its own. And the 5–8% free-to-trial rate is why the $9 tier exists:
at $19 behind a card-required trial, a nineteen-year-old in Ohio does not
convert on impulse, and there is no brand to borrow trust from yet.

### The constraint nobody sees coming

**The trial is seven days.** A trial started on Day 54 charges on Day 61 and
does not count. The last day a new trial can become a paying customer inside
this block is **Day 53, 26 October**. The acquisition window is Day 8 to Day
53 — 46 days, not 60. Everything after Day 53 is conversion work on trials
already running.

---

## 2 · The four engines

Nothing here is novel. All four are the documented playbook of the apps in this
category, sized down to one person with $40 a week.

| Engine | Cost | The case |
|---|---|---|
| **Faceless short-form** | $0 | Three TikTok accounts mirrored to Reels and Shorts. Rizz App ran 15+ accounts to 550M views on B-roll with fabricated text pasted over it, averaging ~450k views a video. **The unfair advantage here is that ours is a recording** — real audio, a real outcome, a warmth meter moving on screen. Theirs was fiction. Nobody else in this category can screen-record an actual rep |
| **Whop affiliates** | $0 cash | 40% recurring, 50% for members. Creators post, we pay only when it sells. The only engine not capped by available hours. Rizz App paid $2M to creators against $15M revenue; one creator earned $100k in a year posting faceless content. We cannot afford per-view rates, we can afford a permanent cut |
| **Reddit & forums** | $0 | Lowest volume, highest conversion by an order of magnitude. In r/socialskills and r/dating_advice people describe this exact problem in their own words, daily. Reddit *ads* are $2.50 CPC at 1–2% CVR — $125–250 CPA, unusable. Organic is the only viable form |
| **Paid micro-creators** | **$340** | Not ads. Creators. Blake Anderson paid two unknown TikTok creators **$50 each** to post RizzGPT: 5–10M combined views, 45,000 downloads day one. Target 5k–50k followers, US, **no brand deals in their last twenty posts** — that filter is the whole game, because unmonetized creators accept $20 and monetized ones quote $500 |

---

## 3 · Baseline, as measured on 4 September 2026

Pulled from the live Whop account, the Supabase project and `whop:verify`. Not
estimates.

| | Value | Source |
|---|---|---|
| Whop product | `prod_DlhZq3oMd4QHd` "Nerve", **`visibility: hidden`** | `products_list` |
| Gallery / logo / OG image | **all empty or null** | `products_list`, `accounts_list` |
| Published reviews | **0** | `published_reviews_count` |
| Affiliates | **none configured**, `whop_affiliate_link: false` | `store_page_config` |
| Plans | Pro `plan_pyrhOCBHYRnFW` $19, Elite `plan_m0JD4mhTqeZnk` $49 — **both hidden**, both 7-day trial, both `initial_price: 0` | `plans_list` |
| Whop member count | **1** | product and Pro plan |
| Our subscriptions | **2** — one `trialing` (period ends 9 Sep), one `active` (ends 8 Sep) | `subscriptions` |
| Entitlement mix | `free/0 reps` ×15, `pro/3 reps` ×2, `pro/10 reps` ×1 | `entitlements` |
| Webhook | `hook_uBtOKRs6GhyR8` → `https://www.hellonerve.com/api/webhooks/whop`, all 9 events, 0 failures, last 4 delivered | `whop:verify` |
| Industry classification | `personal_development` / `communication_coaching` — correct per rule 10 | `accounts_list` |
| Supabase | project `ujhtzjcwwefqhwlpzhao`, 22 tables, RLS on every one | `list_tables` |

**Whop says 1 member and our database holds 2 subscriptions.** Reconcile that
before either number is used as a baseline — one of them is most likely a
self-test purchase.

---

## 4 · What is blocking Day 1

Six things in our own account are costing customers before a single video is
posted. Five are free to fix. Two of them break something if done carelessly.

### 4.1 · The Whop product is hidden — **and stays hidden. Decided 4 Sep.**

Whop Discover does roughly 13.5M visits a quarter, 33% from the United States,
60% male, core age 25–34. That is the exact buyer, on a marketplace we already
sell through, and the listing is invisible.

**We are not unhiding it.** §10's second-highest risk is that public
discoverability raises our visibility to processor review, and this account
watched Creem decline it on 1 September. A second merchant-of-record failure
costs the whole business; Discover costs one channel. The trade is not close.
Everything below in this section still stands — the warnings that follow are
kept because they apply the day this is ever revisited.

> ⚠ **`npm run whop:verify` asserts the current state as a pass**:
> `"it is not listed on Whop's public marketplace (hidden)"`. Flipping the
> product and both plans to visible turns a green money preflight red. The
> assertion in `scripts/verify-whop.ts` has to change in the same commit, or
> launch day opens with a failing preflight and no idea why.

> ⚠ **Saving Whop's Business settings form silently reverts
> `industry_type`.** It read `mental_health_app` for a day once, which
> contradicts terms clause 08 in the first place a compliance reviewer looks.
> Re-check it after touching that page (CLAUDE.md rule 10).

### 4.2 · Zero affiliates configured

The single largest free lever we own, and it costs nothing until it earns.
Whop's default is 30%; 30% does not get a faceless creator's attention.

### 4.3 · Checkout sends buyers off the domain

Both plans point at `whop.com/checkout/plan_…`. Every off-site hop costs
buyers, and it costs most with a young audience arriving from a video who has
never heard of Whop. Whop has an embedded checkout.

### 4.4 · The cheapest paid tier is $19

Free grants no voice reps (`repsPerDay: 0`, which is the paywall itself), so
the first paid step is $19 with a card. For an 18–24 US audience arriving from
TikTok that is above the impulse line.

A $9 Starter with one voice rep a day makes the ladder 1 / 3 / 6 reps at
$9 / $19 / $49. **The trade is real**: 100 customers at the current mix is
$1,900 MRR; at a 60/40 Starter/Pro split it is $1,300. Worth it at zero
customers, not at a thousand.

> The full blast radius of a fourth plan is in `PAYMENTS-NEW-INTEGRATION.md`
> and CLAUDE.md's docs table: the `Plan` union in `lib/data/types.ts`, **new**
> migrations for two CHECK constraints (applied ones are never edited),
> `DAILY_CAP_CENTS` in `lib/db/spend.ts`, `PLAN_ENV` in `lib/billing/plans.ts`
> plus an env var, a new Whop plan through `whop:setup`, **a new mark glyph in
> both `components/marks/` and `lib/marks/registry.ts`** (the plan family is a
> closed union with a test that walks it), `/pricing` going three columns to
> four, and `db:billing` + `db:spend` coverage. A day, not an afternoon.

### 4.5 · Nothing on the funnel is instrumented

Six events are needed to run this plan: landing view, signup, onboarding rep
completed, pricing view, checkout start, paid. Without them **Gate 2 on Day 21
is unanswerable** — there is no way to tell a traffic problem from a checkout
problem, and the following week goes into fixing the wrong one. Add `?ref`
capture in the same change so creator and affiliate links attribute.

This is `LAUNCH-GAP.md` B7 (PostHog and Sentry specified, not installed).

### 4.6 · Zero reviews on a store page strangers land on

Whop shows reviews prominently and buyers read them. The first ten customers
are worth more as ten reviews than as ten payments.

### 4.7 · Not on the original list, and more urgent than any of them

**`RESEND_API_KEY` is set on Vercel production** (added 2 September, and the
3 September deploy carries it), so the trial-ending email *does* send. It is
missing only from `.env.local`, which is why `whop:verify` warns when run from a
laptop — the check reads the local shell and the email is sent by the
deployment. Corrected 4 September after `vercel env ls production` said
otherwise; the warning's wording now says which environment it is talking about.
`whop:verify` warns about it; terms clause 07 and `TRIAL_NOTE` both promise it.
There is a live trial with `current_period_end: 2026-09-09` — **a real card is
charged within days and no warning goes out**. That is §14's
trial-ending-quietly failure, in production, on a real person. One variable on
Vercel plus a redeploy (and an env var added after a build starts is not in
that build). Related: `CRON_SECRET` on GitHub Actions, without which R6's
Sunday letter and streak-at-risk email are built and silent.

---

## 5 · Where the $340 goes

TikTok Ads is out of reach and it is worth knowing why before a week is wasted
on it: a **$500 campaign minimum** and a **$20/day ad-group floor**. At $5.71 a
day an ad group cannot be opened. Instagram boosting has no such minimum, which
makes it the only paid surface this budget can touch — and only in the last
three weeks, on a video that has already proven itself organically.

| Week | Dates | Spend | On |
|---|---|---|---|
| W1 | Sep 4–10 | $40 | Tooling, once: CapCut Pro, a scheduler that posts on the US clock, one stock B-roll source |
| W2 | Sep 11–17 | $40 | Creators #1 and #2 — $20 each, smallest viable test |
| W3 | Sep 18–24 | $40 | Creator #3 — $40, better creator, briefed on week 2's winning hook |
| W4 | Sep 25–Oct 1 | $40 | Creators #4 and #5 — $20 each |
| W5 | Oct 2–8 | $40 | Creator #6 — repeat deal with the best performer so far |
| W6 | Oct 9–15 | $40 | Creator #7 |
| W7 | Oct 16–22 | $40 | Instagram Reel boost, $6/day × 7, on the best organic video |
| W8 | Oct 23–29 | $40 | Creator #8, briefed on the founding-member offer |
| W9 | Oct 30–Nov 2 | $20 | Final boost on whatever is converting |
| | **Total** | **$340** | ≈ 8 creator videos + 10 days of boosting |

---

## 6 · The content system

Five formats, cut from ten screen-recorded reps. Ten reps is roughly forty
videos, which is the first two weeks. Record ten more every Sunday.

| | Format | Length | Note |
|---|---|---|---|
| **A** | **The rep** — screen capture with the warmth meter and clock in frame. Cut to the exact turn where it goes wrong, then straight to the outcome | 30–45s | Highest watch-through. The payoff is built into the product; just don't cut it off |
| **B** | **The meter drop** — one line gets said, the meter drops twenty points, caption names the mistake in four words. No setup, no outro | 12–18s | Highest completion. The volume format: eight a day from one rep |
| **C** | **Scorecard reveal** — the six dimensions, one line read out, then argue with it on camera | 20–30s | Highest comment rate. Works because the score contradicts the outcome — 92 on a conversation that ended in rejection is a hook by itself |
| **D** | **Score this opener** — take an opener from the comments, run it, show what the character does with it | 25–40s | Compounds. Every video generates the material for the next three |
| **E** | **B-roll and transcript** — the Rizz App format verbatim, cut on a cliffhanger | 45s–2min | Most scalable, and the easiest thing to hand an affiliate |
| **✗** | **Talking-head explainers** — "5 tips for confidence" | — | **Skip entirely.** Most crowded corner of the niche, indistinguishable from a thousand accounts, and the one thing the product gives no advantage in |

### Thirty hooks, first two seconds

The first two seconds decide roughly everything. Write ten more every week from
our own comment sections — the audience writes better hooks than we do.

1. "She lost interest at nine seconds and he never noticed." — meter drop, timestamp on screen
2. "I got rejected by an AI 100 times so you don't have to."
3. "This AI can hear that you're nervous."
4. "Three minutes to get her number. Watch me fail."
5. "She said no. I still scored 92." — **the outcome/score contradiction, the core differentiator**
6. "Rate my opener out of 100." — comment bait, generates Format D forever
7. "What 'so what do you do' actually does to a conversation." — meter visibly drops
8. "POV: no script, no restart, 180 seconds."
9. "The exact second she checked out."
10. "I asked her a closed question. Watch."
11. "Guys think confidence is talking. It's this."
12. "He talked for 40 seconds straight. Here's what happened."
13. "Reading her signals wrong, in real time."
14. "I let my friend try. He lasted 12 seconds."
15. "You have three minutes. Go."
16. "Everyone fails tier 4. Here's why."
17. "She was into it and he closed anyway."
18. "The pause that killed it."
19. "Scored 40 on composure. Here's the transcript."
20. "This is what filler words do to a conversation." — overlay the filler count climbing
21. "I ran the same opener on four different people."
22. "Ninety seconds in and he's out of things to say." — the most universal failure in the category
23. "She gave him the number. He didn't ask for it."
24. "What happens if you push after a no." — score goes down; say so, it is our safety position
25. "The opener that works on every tier."
26. "Rating openers from the comments. Part 1." — number the parts, series pull follows
27. "I did this every day for 30 days."
28. "My first rep vs my hundredth."
29. "She's polite and completely unreadable. Tier 4."
30. "Nobody teaches you how to leave a conversation."

### The US clock from Colombo

No VPN and no US SIM changes who sees the videos — TikTok weighs watch
behaviour far above IP, and both risk the accounts. What actually moves the
audience: US-specific content signals (dollars, US place names, US slang),
posting inside US windows, and 10–15 minutes a day watching and commenting on
US creators in the niche from each account.

| US window | Colombo | What to do |
|---|---|---|
| 8:00–10:00am ET | 5:30–7:30pm | Post live. Best window, lands in the evening — no scheduling needed |
| 12:00–2:00pm ET | 9:30–11:30pm | Post live. Second daily slot, still comfortably awake |
| 6:00–9:00pm ET | 3:30–6:30am | **Schedule this one.** Highest US engagement of the day and nobody will be awake for it |
| After 1 Nov | +1 hour, all slots | US clocks go back on Day 59. Reschedule the queue on Day 58 |

---

## 7 · The daily loop

**~90 minutes, every day from Day 8.** Not repeated in the day list below,
because it will be memorised by Day 12.

- Cut and post three videos per account — one at 5:30pm, two scheduled
- Fifteen minutes replying to every comment on yesterday's posts, every account
- Fifteen minutes watching and commenting on US creators in the niche
- Log six numbers: views, bio clicks, signups, trials started, paid, cancelled

---

## 8 · Day 1 to Day 60

Each day lists only what is *different* about it.

### Week 1 · Sep 4–10 · $40 tooling · target: machine built

- [x] ~~**Day 1 — Fri 4 Sep · Unhide the shop**~~ — **DECLINED 4 Sep.**
  Flipping the Whop product to visible is refused, and the plan's own risk
  table is the argument: **making the product publicly discoverable raises our
  visibility to processor review**, and Creem already declined this account
  once on 1 September. Whop Discover's 13.5M quarterly visits are not worth
  putting a second merchant-of-record relationship in front of a reviewer six
  weeks after the first one ended. `whop:verify`'s "it is not listed on Whop's
  public marketplace (hidden)" assertion **stays as it is** — it is now
  describing a decision rather than an accident.
  *What this costs:* the Whop Discover channel, and nothing else. Both plans
  are already `visibility: hidden` and have taken a real purchase through
  `whop.com/checkout/plan_…` — hidden means unlisted, not unbuyable, so
  affiliates, creator links and the embedded checkout are all unaffected.
- [x] **Day 1b — the half of Day 1 that survives · Ship the account's images** — **DONE 4 Sep.**
  Logo, banner and OpenGraph image are on the account; the banner is on the
  product too. Authored in `scripts/brand-assets.ts` and rendered from the Arena
  tokens with the mark from `app/icon.svg` — no new identity, no stock imagery
  (VISUAL-AUDIT §1). `npm run brand:assets` renders, `-- --apply` uploads.
  **Three things this cost, all now guarded:**
  - **An account PATCH reverts the industry classification.** A call carrying
    nothing but `opengraph_image` put the account back to
    `health_and_wellness / mental_health_app`, which contradicts terms clause 08.
    Restored, and `whop:verify` now asserts it. CLAUDE.md rule 10 is updated:
    this is not only the dashboard form.
  - **The API key cannot write the account** (404). Only the user-token MCP can.
  - **A file attachment binds to exactly one resource.** The banner had to be
    uploaded twice — once for the product, once for the account — because the
    second attach failed with "Attachment does not belong to this resource".
  **Still owed:** gallery images. `products_update` exposes no gallery field, so
  the four screenshots the store page wants are not settable through the API —
  see the note under Day 7.

- [ ] ~~Day 1b (original)~~ · superseded by the entry above
  Nothing here touches discoverability. `logo_url` and
  `opengraph_image_url` are both `null` on the account, so **every link shared
  anywhere — a TikTok bio, a Reddit comment, a creator DM, Product Hunt —
  renders as a blank card.** Upload a logo, a banner and an OG image, and write
  four gallery images for the checkout page a buyer actually lands on. Lead with
  **communication coaching**; do not use the word dating.
  ⚠ Saving Whop's Business settings form silently reverts `industry_type` —
  re-check it afterwards (CLAUDE.md rule 10).
- [x] **Day 2 — Sat 5 Sep · Turn on affiliates** — **DONE 4 Sep, a day early.**
  Global **40%**, member **50%**, both `enabled`, verified by reading the
  product back. The affiliate brief is written to the company record.
  **The rates live on the PRODUCT, not the account** — `global_affiliate_*` and
  `member_affiliate_*` on `/products/{id}`. There is no account-level rate,
  which is worth knowing because the dashboard presents it as a company
  setting. The brief is `affiliate_instructions` on `/companies/{id}`, which
  does not exist on `/accounts/{id}` — same id, different representation.
  Authored in `scripts/setup-whop.ts` and applied with `npm run whop:setup --
  --apply`, per rule 8: this is configuration of a payment account, so it is
  reviewed in a pull request rather than clicked once in a dashboard. Re-runnable
  and idempotent.
  **Two things still owed by hand:**
  - **Whether commission recurs on renewals is not on any payload the API
    returns.** 40% of one $19 payment and 40% of every $19 payment for two years
    are different offers, and the brief promises the second. Confirm it once in
    the dashboard.
  - **The raw-footage folder does not exist yet.** It is the single thing that
    decides whether an affiliate can post without talking to us first, and the
    brief currently cannot link it. It comes out of Day 7's ten recorded reps —
    put the URL in `AFFILIATE_INSTRUCTIONS` and re-run.
- [x] **Weekly Pro — shipped 4 Sep, in place of the $9 tier.**
  `$7/week, 3 reps a day, NO trial`, vendor plan `plan_5DcW5Dv9HKSyg`.
  The $9/1-rep idea is **dropped**: one rep a day contradicts Pro's own thesis
  ("fail one, change something, go again in a sitting"), so the cheaper thing
  sold is a shorter *commitment* rather than a worse *product*.
  **Why it costs almost nothing to run:** a billing period is not a plan.
  `Plan` stays `free | pro | elite`, so there is no new union value, no
  migration, no CHECK constraint and **no new mark glyph** — several vendor
  plans resolve to one entitlement through `OFFERS` in `lib/site/plans.ts`.
  **Margins go up, not down.** A weekly subscriber can burn 21 reps, not 90:
  71% at the dearest measured rate against monthly's 55%, and $27.28 net a
  month against $17.70 if they stay. **The risk is churn, not margin** — a
  weekly subscriber must last 8.4 weeks to beat a monthly one lasting 3 months.
  That is the number to watch, and it is the reason the toggle opens on monthly.
  **No trial on weekly, deliberately**: a 7-day trial in front of a 7-day period
  charges on day 7 and again on day 14. The week is the trial, and it is paid.
  Elite stays monthly-only; `startCheckout` refuses `elite + weekly` rather than
  quietly selling the monthly price.
  **Still owed:** kill the monthly trial once weekly has data behind it — that
  drags terms clause 07, `RefundDocument`, `legal:pdf` and the Whop re-upload
  with it, so it is its own change.

- [ ] ~~**Day 3 — Sun 6 Sep · Add the $9 tier**~~ — superseded by weekly Pro above.
  Kept only so the day numbering still lines up. Original text:
  Create **Nerve Starter** — $9/month, one voice rep a day, 7-day trial. Wire
  the entitlement and plan metadata the way Pro and Elite are wired. Update
  `/pricing` to Starter / Pro / Elite with Pro marked most popular. Add Pro
  annual at $190 — some of the first hundred will pay a year up front, and that
  is cash now rather than in twelve months. **Blast radius in §4.4.**
- [ ] **Day 4 — Mon 7 Sep · Kill the checkout hop**
  Replace the `whop.com/checkout` redirect with Whop's embedded checkout on
  hellonerve.com. Then buy the Starter plan with a real card, end to end.
  Confirm the entitlement lands, confirm cancel works in one tap as the copy
  promises, then refund. Do this before a stranger does.
- [ ] **Day 5 — Tue 8 Sep · Instrument the funnel**
  Six events: landing view, signup, onboarding rep completed, pricing view,
  checkout start, paid. Add **`?ref`** capture so creator and affiliate links
  attribute — a creator who cannot see their sales stops posting.
- [ ] **Day 6 — Wed 9 Sep · Build the accounts**
  Three TikTok, three Instagram, one YouTube. Name them for the niche, not the
  brand — @threeminuterep, @thecoldopen, @warmthmeter. Keep one brand account
  as @hellonerve. App language English (US). **No VPN and no US SIM.** Then 45
  minutes on each account consuming US content in the niche — watch to
  completion, comment three to five times. No posting today.
- [ ] **Day 7 — Thu 10 Sep · Record the source material** 💸
  Run ten real voice reps, screen-recorded at 9:16 with the meter and clock in
  frame. **Deliberately blow five of them** — the failures are better content
  than the wins. Second warm-up day: 45 minutes consuming per account, still no
  posting. **Spend the $40:** CapCut Pro, a scheduler that can post on the US
  clock while you sleep, one stock B-roll source.

### Week 2 · Sep 11–17 · $40 · creators #1–2 · target: 3 paying

- [ ] **Day 8 — Fri 11 Sep · First posts**
  Cut nine videos from yesterday's footage: three meter-drops, three reps,
  three B-roll-and-transcript. Post one per account at 8:30am ET (5:30pm local),
  live rather than scheduled. Third warm-up day complete — the daily loop starts
  tomorrow.
- [ ] **Day 9 — Sat 12 Sep · Read the retention graphs**
  One post per account. Open the retention graph on each of yesterday's three
  videos. Whichever held past three seconds best is the format for the next
  fortnight. Make three more of exactly that shape.
- [ ] **Day 10 — Sun 13 Sep · Build the creator list**
  Two posts per account. List fifty US TikTok creators: 5k–50k followers,
  dating / self-improvement / POV comedy, and **no brand deals in their last
  twenty posts**. That last filter is the whole game.
- [ ] **Day 11 — Mon 14 Sep · First 25 DMs**
  Two posts per account. The offer, verbatim: *$20 for one video, you keep the
  video, plus 40% of everything it ever sells.* The commission is the real
  hook — that structure is what turned Rizz App's creators into full-time
  earners, and it is why they kept posting after the first cheque.
- [ ] **Day 12 — Tue 15 Sep · Second 25 DMs, and Reddit begins**
  Two posts per account. Post to r/SideProject: build in public, real numbers,
  no pitch. Season a Reddit account with five genuine comments in r/socialskills
  — no link, no mention of Nerve, not this week and not next.
- [ ] **Day 13 — Wed 16 Sep · Sign creators #1 and #2** 💸
  Three posts per account. $20 each. Send raw footage and three hooks, then let
  them shoot it their way. A creator's own voice outperforms our brief every
  time — we are buying their audience's trust, not their production.
- [ ] **Day 14 — Thu 17 Sep · 🚪 GATE 1 — is the format working?**
  **The question is the best single video's view count, not the total.**
  **Over 20k:** make ten more of exactly that.
  **Under 5k across everything:** the format is wrong, not the volume — switch
  the primary format to the meter drop and re-test. Do not answer a format
  problem with more posting.
  → *Best video views: ______*

### Week 3 · Sep 18–24 · $40 · creator #3 · target: 8 paying

- [ ] **Day 15 — Fri 18 Sep · Creator videos go live**
  Sit in the comments for the first hour. The comments on a creator's post are
  the next twenty hooks, written by the audience in their own words — the most
  valuable hour of the week.
- [ ] **Day 16 — Sat 19 Sep · Farm the creator posts**
  Reply from the brand account to every comment on the creator videos. Free
  distribution on someone else's reach, for an hour.
- [ ] **Day 17 — Sun 20 Sep · First Reddit link**
  Only in a thread where someone is describing exactly this problem. Answer
  completely, so the comment stands alone and is worth reading without the
  link. Then mention Nerve once, at the end. **If the comment would be
  worthless without the link, do not post it.**
- [ ] **Day 18 — Mon 21 Sep · Sign creator #3** 💸
  $40 this time. Pick on audience match, not follower count — the creator whose
  comment section looks like the buyer, even at a third of the following.
- [ ] **Day 19 — Tue 22 Sep · Ship something from the comments**
  Pick the most-requested thing people said in the comment sections and ship it.
  Then post the change. At this size, shipping speed is a marketing channel and
  nobody else in the category can match it.
- [ ] **Day 20 — Wed 23 Sep · Talk to the affiliates**
  Message every affiliate who has signed up. Personally, one by one. Ask what
  they need. Most will say footage — give them the folder and ask again in a week.
- [ ] **Day 21 — Thu 24 Sep · 🚪 GATE 2 — traffic problem or checkout problem?**
  Count **charged** customers. Target 8.
  **Under 3 with more than 100k total views:** the leak is checkout or price,
  not traffic. Watch five session recordings before changing a single thing
  upstream. Adding traffic to a broken checkout is the most expensive mistake
  available this month.
  → *Paying customers: ______*

### Week 4 · Sep 25–Oct 1 · $40 · creators #4–5 · target: 15 paying

- [ ] **Day 22 — Fri 25 Sep · Recruit affiliates where they already are**
  Post the affiliate offer in three creator Discords where Whop affiliates
  gather. 40% recurring on a $19 product reads as a strong offer to people who
  already know what those numbers mean.
- [ ] **Day 23 — Sat 26 Sep · Prepare Product Hunt**
  Gallery, first comment, and a 30-second demo of one rep from the opening line
  to the number. Write the first comment as the story of why it was built, not
  a feature list.
- [ ] **Day 24 — Sun 27 Sep · Sign creators #4 and #5** 💸
  $20 each, both briefed on whichever hook won in week 3. No longer testing
  formats — buying repeats of a known winner.
- [ ] **Day 25 — Mon 28 Sep · Launch on Product Hunt**
  12:01am PT, which is 12:31pm local. Reply to every comment all day. Expect
  signups and few customers — it is for the reviews, the backlink and the
  founder credibility, not the revenue.
- [ ] **Day 26 — Tue 29 Sep · Show HN and the honest numbers**
  Post the real Product Hunt result, **including if it was bad**. Honest numbers
  travel much further than wins in these communities, and they bring the kind of
  person who becomes an affiliate.
- [ ] **Day 27 — Wed 30 Sep · First review push**
  Ask the first ten customers for a one-line review on the Whop listing. Ask
  personally, the day they convert, and say why it matters. Zero reviews is the
  biggest trust gap on the checkout path.
- [ ] **Day 28 — Thu 1 Oct · Month one review**
  Cost per paying customer so far. Best format, best hook, best creator, best
  posting slot. Cut everything below the median and put the hours into what is
  above it. **You will be tempted to keep the account that is not working — do
  not.**

### Week 5 · Oct 2–8 · $40 · creator #6 · target: 25 paying

- [ ] **Day 29 — Fri 2 Oct · Open the second axis: Shorts**
  Treat YouTube Shorts as a first-class channel rather than a dumping ground
  for TikTok exports. Shorts surfaces content for weeks; TikTok decides in 48
  hours. Same videos, no watermark, written titles.
- [ ] **Day 30 — Sat 3 Oct · Halfway — write the honest number**
  **Under 15 paying:** cut from three accounts to one and put every hour into
  the single format that is working. Three mediocre accounts lose to one good
  one, and there is now enough data to know which is which.
- [ ] **Day 31 — Sun 4 Oct · Sign creator #6** 💸
  $40 to the best performer from #1–5, on a repeat. A creator's second video
  almost always beats their first — they understand the product now.
- [ ] **Day 32 — Mon 5 Oct · Promote the best affiliates**
  Move the top three affiliates to 50%. It costs nothing that is not already
  being earned and it buys their next ten posts. Tell them why they got it.
- [ ] **Day 33 — Tue 6 Oct · Close the share loop**
  The scorecard already generates share cards. Make sharing one tap, watermark
  the card, put a ref link on it. A product that markets itself is the only
  thing that scales past our own hours. *(Share cards run through
  `assertPublishable` — CLAUDE.md rule 7.)*
- [ ] **Day 34 — Wed 7 Oct · Second Reddit push**
  Different subreddit, different account, same rule: the comment must stand
  alone. Never the same account twice in a week, never two links in one thread.
- [ ] **Day 35 — Thu 8 Oct · 🚪 GATE 3 — is the curve bending?**
  Target 25. **The number that matters more than the total: are views
  *compounding* week over week, or merely accumulating?** Compounding means the
  algorithm has found the audience. Accumulating means we are still paying full
  price for every view and 100 is out of reach — say so now and re-plan around 50.
  → *Paying customers: ______*

### Week 6 · Oct 9–15 · $40 · creator #7 · target: 40 paying

- [ ] **Day 36 — Fri 9 Oct · Re-hook the winners**
  Take the five best-performing videos, cut new first-two-seconds onto them,
  repost. A proven body with a new hook is the cheapest video there is and it
  routinely outperforms the original.
- [ ] **Day 37 — Sat 10 Oct · Sign creator #7** 💸
  By now this should be paying for a repeat, not a test. **If creators are
  still being tested in week 6, the brief is the problem, not the creators.**
- [ ] **Day 38 — Sun 11 Oct · Write the founding-member offer**
  **The first 100 keep their price for life.** Real scarcity we can actually
  honour — `CHECKOUT_NOTE` already promises exactly this. It converts the people
  who have been watching for six weeks without buying. **Do not launch it yet —
  it goes live on Day 50.**
- [ ] **Day 39 — Mon 12 Oct · Email the warm list**
  Everyone who completed the onboarding voice rep and never started a trial.
  They have heard the product. They are the warmest list and they have been sent
  nothing.
- [ ] **Day 40 — Tue 13 Oct · Ship the second request**
  The second-most-requested thing from the comments. Post it the day it ships,
  and tag the people who asked.
- [ ] **Day 41 — Wed 14 Oct · Audit churn**
  Everyone who cancelled during the trial gets one email with one question:
  what made you cancel? Not a survey. One question, and reply to every answer.
- [ ] **Day 42 — Thu 15 Oct · Pick next week's paid creative**
  The single best organic video of the last six weeks. It becomes the boosted
  ad on Day 43. **Never boost something that has not already earned its views.**

### Week 7 · Oct 16–22 · $40 · IG boost · target: 60 paying

- [ ] **Day 43 — Fri 16 Oct · Start the boost** 💸
  Instagram Reel ad, **$6/day for seven days**. US, 18–30, male, interests in
  self-improvement and public speaking. Not TikTok Ads — its $500 campaign
  minimum and $20/day ad-group floor make it unreachable on this budget.
- [ ] **Day 44 — Sat 17 Oct · Keep the creative on the safe side of the line**
  Meta restricts dating ads and requires written permission. The creative must
  read as conversation training and social confidence, matching the Whop
  classification. **Anything framed as getting her number gets classified as a
  dating ad no matter what the product actually is.**
- [ ] **Day 45 — Sun 18 Oct · First boost decision**
  Check cost per landing-page view. **Over $1.50, kill it** and move the
  remaining money to creator #8. Do not let a losing boost run out of politeness
  to your own decision.
- [ ] **Day 46 — Mon 19 Oct · Third Reddit push, plus a teardown**
  Post a real teardown of our own numbers in r/microsaas or r/indiehackers.
  Founders read those, founders become affiliates, and the post outlives the week.
- [ ] **Day 47 — Tue 20 Oct · Turn the best users into affiliates**
  Ask the ten most engaged free users to take an affiliate link. Members convert
  best — that is exactly why the member rate is 50%.
- [ ] **Day 48 — Wed 21 Oct · Rewrite the fold in their words**
  Rewrite the top of the landing page using the actual phrases from the comment
  section of the best video. **The buyers have already written the headline.**
- [ ] **Day 49 — Thu 22 Oct · 🚪 GATE 4 — the window is closing**
  Target 60. **Day 53 is the last day a new trial can convert inside this
  block.** A 7-day trial started on 27 October charges in November. From here it
  is a four-day selling window, and after that every hour goes into converting
  trials already running.
  → *Paying customers: ______*

### Week 8 · Oct 23–29 · $40 · creator #8 · target: 80 paying

- [ ] **Day 50 — Fri 23 Oct · Launch the founding-member offer**
  Every account, every channel, the same day. First 100 keep their price for
  life, with a real deadline. Scarcity converts the watchers where a feature
  list never will.
- [ ] **Day 51 — Sat 24 Oct · Creator #8 on the offer** 💸
  $40, briefed entirely on the founding-member angle rather than the product.
  Deadlines are easier for a creator to sell than features.
- [ ] **Day 52 — Sun 25 Oct · Email the whole list**
  Every free signup, every abandoned checkout, every cancelled trial. One email,
  the founding offer, the real deadline. The biggest single-day conversion event
  available.
- [ ] **Day 53 — Mon 26 Oct · Last trial-start day that counts**
  Everything today points at one action: start the trial. Every post, every
  reply, every email. A trial started tomorrow does not become a customer inside
  this block — **push hardest here.**
- [ ] **Day 54 — Tue 27 Oct · Switch to conversion**
  Acquisition is over. Every trial started between 20 and 26 October decides the
  final number. Keep posting to feed November, but the work is now inside the
  product.
- [ ] **Day 55 — Wed 28 Oct · Message every live trial**
  Personally, one by one. One question: what would make you keep this? Then
  answer them individually. At this volume it is still possible, and it is worth
  more than any post written instead.
- [ ] **Day 56 — Thu 29 Oct · Fix the thing three people named**
  Whatever three or more trial users independently said. Ship it and tell them
  it shipped. **People who see their own feedback land almost never cancel.**

### Week 9 · Oct 30–Nov 2 · $20 final push · target: 100 paying

- [ ] **Day 57 — Fri 30 Oct · Watch the charge failures** 💸
  Trials from 23 October convert today. A failed card is a customer already won
  and recoverable with one email — set an alert on failed payments and answer
  each one the same day.
- [ ] **Day 58 — Sat 31 Oct · Reschedule for the clock change**
  US clocks go back tomorrow. Every posting slot shifts an hour: 8am ET becomes
  6:30pm Colombo. Fix the queue today or lose a day of reach to a timezone.
- [ ] **Day 59 — Sun 1 Nov · Recover everything recoverable**
  Every failed payment, retried. Every trial that cancelled without ever being
  charged, asked once, personally, why. **This day is worth more than a week of
  posting was in September.**
- [ ] **Day 60 — Mon 2 Nov · 🚪 GATE 5 — count, and decide what month three is**
  Write the honest number, the real cost per customer, the format that worked
  and the one that did not. Then the real decision: more of this, or the
  interview track. On the evidence available by then — cheaper traffic, higher
  intent, no ad-platform restrictions, no category risk with processors, and
  searchable demand rather than scrolled demand — **interviews is the cheaper
  market. Dating was the right thing to build first. It may not be the right
  thing to sell second.**
  → *Paying customers: ______*

---

## 9 · Progress log

Update weekly. `Paying` is **charged accounts only** — never trials.

| Week | Ends | Target | Paying | Views | Signups | Trials | Spent | Note |
|---|---|---|---|---|---|---|---|---|
| W1 | 10 Sep | machine built | — | — | — | — | | |
| W2 | 17 Sep | 3 | | | | | | |
| W3 | 24 Sep | 8 | | | | | | |
| W4 | 1 Oct | 15 | | | | | | |
| W5 | 8 Oct | 25 | | | | | | |
| W6 | 15 Oct | 40 | | | | | | |
| W7 | 22 Oct | 60 | | | | | | |
| W8 | 29 Oct | 80 | | | | | | |
| W9 | 2 Nov | **100** | | | | | | |

### Gate answers

| Gate | Day | Date | Question | Target | Actual | Decision taken |
|---|---|---|---|---|---|---|
| 1 | 14 | 17 Sep | Best single video views | 20k | | |
| 2 | 21 | 24 Sep | Paying customers | 8 | | |
| 3 | 35 | 8 Oct | Paying + are views compounding? | 25 | | |
| 4 | 49 | 22 Oct | Paying customers | 60 | | |
| 5 | 60 | 2 Nov | Final count, and month three | 100 | | |

### Creator ledger

| # | Day | Handle | Followers | Paid | Views | Signups attributed | Repeat? |
|---|---|---|---|---|---|---|---|
| 1 | 13 | | | $20 | | | |
| 2 | 13 | | | $20 | | | |
| 3 | 18 | | | $40 | | | |
| 4 | 24 | | | $20 | | | |
| 5 | 24 | | | $20 | | | |
| 6 | 31 | | | $40 | | | |
| 7 | 37 | | | $40 | | | |
| 8 | 51 | | | $40 | | | |

---

## 10 · What kills this

| Severity | Risk | What to do about it |
|---|---|---|
| **Highest** | **One person is the entire content engine.** Nine posts a day, every day, for eight weeks, alone, alongside university. One week of illness or exams and the whole plan stops | This is the actual reason affiliates matter more than our own posting: **they are the only part of this machine that keeps running when we do not.** Treat affiliate recruitment as the priority task, not the optional one |
| **Highest** | **Payment-processor risk has already bitten twice.** Creem declined on 1 September; Gumroad's prohibited list names dating services in almost the same words. Whop's does not, which is why we are there — but **making the product publicly discoverable raises visibility to review** | Lead every public listing with **communication coaching**, which is the actual Whop industry classification, and never with **dating**. Have a fallback processor short-listed **before Day 30**, not after a rejection email. See `PAYMENTS-APPROVAL.md` |
| **High** | **Meta restricts dating ads and will restrict ours.** Creative built around "get her number" gets classified as a dating ad regardless of what the product is | Boosting only starts Week 7, so keep every boosted creative on conversation training and social confidence. **The product already refuses to train persuasion past a refusal** — that is both the safest ad position and a real differentiator from every rizz app in the category. Lead with it |
| **High** | **The product is web-only in an app-store audience.** A TikTok viewer expects an App Store button; we ask for a bio-link tap, a mobile browser, an account, a microphone permission and a card | An iOS app is not shippable in 60 days, but **the PWA install prompt is scoped and not built** — the single highest-leverage product change after the $9 tier |
| **High** | **Counting trials as customers.** Very easy to convince yourself otherwise in week six | Count only **charged** accounts at every gate. Track trial starts separately and apply a 45% discount to it in your head |
| **Watch** | **Mass reporting.** Content about approaching women attracts organised reporting on TikTok, and a new account with no history has no buffer | Keep it about the skill and never about the target — no scripts framed as manipulation, nothing that reads as a technique for overcoming a no. Three accounts instead of one is partly insurance against exactly this |

---

## 11 · Source

Drafted 4 September 2026 as an artifact:
<https://claude.ai/code/artifact/9ac04141-d8cc-4b07-8ad9-1e1fb858fd87>

The artifact carries its own interactive progress state. **This file is the one
that counts** — it is in the repo, agents can read and write it, and it does not
depend on a browser session. If the two disagree, this file wins.
