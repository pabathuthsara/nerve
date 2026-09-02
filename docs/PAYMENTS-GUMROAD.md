# Payments — Gumroad

> **SECOND CHOICE, not the plan.** Whop was chosen over Gumroad on 1 September
> and shipped the same day — see `PAYMENTS-WHOP.md`. This document is kept
> because a fallback that has been thought through is worth having, and because
> §0.1's finding about the category applies to any provider we apply to next.
> Nothing here is built.

How Nerve gets paid after Creem's final rejection (1 September 2026): what
Gumroad actually is, the five facts about it that decide every design choice
below, the manual setup in order, and the code that has to change.

This is the *how*. `PAYMENTS-APPROVAL.md` is the *whether* — §8 of that page is
the fork this document assumes has been taken, and §0 below is why that is not
optional. `PAYMENTS-NEW-INTEGRATION.md` §11 stays the record of what was built
against Creem and does not get rewritten; it is the thing being ported.

> **Superseded 1 September 2026 by [`PAYMENTS-WHOP.md`](PAYMENTS-WHOP.md). This
> is the fallback now, not the plan.**
>
> Whop was assessed the same day and wins on all four axes this document had to
> work around: it signs its webhooks with the same Standard Webhooks spec Creem
> used (so `lib/billing/signature.ts` survives instead of being deleted), it has
> a checkout API that carries our `user_id` through to the membership (so §2.3's
> lost-`url_params` problem does not exist), it has a real sandbox (§2.4), and it
> exposes a server-side cancel (so §2.5's magic-link round trip, and the copy
> change it forced, are not needed). Its fee is roughly $1.40–1.86 on Pro against
> Gumroad's $2.40, and its prohibited list — unlike Gumroad's — does not name our
> category at all.
>
> **Keep this document.** §0.1's reading of reactive enforcement applies to Whop
> word for word, the event-mapping decisions in §4 were carried across intact,
> and if Whop's payout or category review goes wrong this is a plan that has
> already been thought through rather than one that has to be written under
> pressure.

**Status: nothing here is built, and nothing here should be built unless Whop
fails. The Gumroad account exists and the payout method is attached (confirmed
1 Sep). Everything else in Part A and all of Part B is outstanding.**

---

## 0. Read this before anything else

Two things, and the first one is not a technical problem.

### 0.1 Gumroad bans the same category Creem rejected us for

From `gumroad.com/prohibited`, verbatim:

> companion or escort services, dating services, mail-order brides, massage
> parlors and prostitution

and separately, the adult-content items covering "membership to adult websites
or content" and anything sexual involving characters who are or appear to be
minors.

That is the same prohibition, in almost the same words, that Creem declined us
under. `PAYMENTS-APPROVAL.md` §2 called Gumroad's rules "looser"; on the
category that matters they are not looser, they are differently *enforced*.
**That difference is the whole reason this is worth doing, and it is also the
new risk:**

| | Creem | Gumroad |
|---|---|---|
| When a human looks | Before you can sell anything | After sales start, or on a report, or at payout review |
| What a rejection costs | An application, disclosable on the next one | **An account with your customers' subscriptions and your unpaid balance in it** |
| Appeal | Was refused | Support ticket, no published process |

So Gumroad does not fail Nerve at the door. It fails it — if it fails it — with
live subscribers and a held balance. That is worse, not better, and it means
**§8.A of `PAYMENTS-APPROVAL.md` (change what a reviewer sees) is a prerequisite
here, not a parallel track.** Doing Part A below on the current landing page is
taking the same bet that just lost, with a longer fuse and a bigger stake.

Two concrete mitigations that cost nothing and belong in Part A:

- **Turn Gumroad Discover OFF for the product** (A3.6). Discover is a public
  marketplace with its own browse surface and its own moderation attention, and
  a Discover sale is charged 30% instead of 10% anyway. There is no upside.
- **Write the product description as the training product, not the wedge.** The
  Gumroad product page is a public page that a Gumroad reviewer reads first,
  before yours. It is an application document in exactly the sense §3 of
  `PAYMENTS-APPROVAL.md` means.

### 0.2 Gumroad's webhooks are unsigned

Not "signed with a scheme we have to implement" — unsigned. There is no HMAC, no
timestamp, no shared secret, no signature header of any kind. The only headers on
the delivery are `Content-Type`. This is confirmed in Gumroad's own source
(`app/sidekiq/post_to_individual_ping_endpoint_worker.rb` sets exactly one
header) and stated on the Ping documentation page itself:

> Because the payload is unsigned and deliveries can be dropped once the retries
> run out, treat a ping as a trigger rather than as data: take `sale_id`, read
> the sale back through the API, and reconcile periodically against your own
> records.

`lib/billing/signature.ts` therefore has nothing to verify and its 182 lines do
not port. What replaces it is §3.1 and §B2 — and it must be built before the
webhook URL is ever registered, because until then the endpoint that grants paid
plans is an open POST.

---

## 1. What changes, and what does not

The §14 abstraction was built for exactly this and it holds. What survives
untouched:

- **`lib/billing/events.ts`'s `BillingEvent`** — the normalised vocabulary of
  what happened to *access*. Gumroad gets a new adapter that produces one; the
  intent mapping, `shouldApply`, `resolvedPlan` and the whole product decision
  about `past_due` and disputes are unchanged.
- **`lib/billing/apply.ts`** — the only thing that moves an account onto a plan.
  One string changes (`provider: 'creem'` → `'gumroad'`) and one env-var name in
  an error message. Nothing else.
- **`public.subscriptions`** — the mirror. One migration to widen the `provider`
  check constraint. The columns were deliberately named `provider_customer_id`
  and `provider_subscription_id` for this day.
- **Rule 9.** Plans are still written only by the service role, from a webhook.
  There is still no user write path and no second gate in the app layer.
- **`entitlements.reps_per_day = 0` on free.** The voice paywall is unaffected.

What does not survive:

| Creem thing | Fate under Gumroad |
|---|---|
| `lib/billing/signature.ts` | **Deleted.** Nothing to verify. Replaced by a secret path segment + API read-back |
| `createCheckout()`'s POST to `/v1/checkouts` | **Deleted.** Gumroad has no checkout API; a checkout is a URL you build |
| `createBillingPortal()`'s POST to `/v1/customers/billing` | **Deleted.** No portal API; see §B4, and note it changes user-facing copy |
| `apiBase()` / `creem_test_` vs `creem_live_` | **Deleted.** Gumroad has no test mode at all (§3.4) |
| `CREEM_TEST_MODE_IN_PRODUCTION` / `rehearsing()` | Replaced by `GUMROAD_ALLOW_TEST_PURCHASES`, which means something different (§3.4) |
| `scripts/verify-creem.ts`, `npm run creem:verify` | Rewritten as `scripts/verify-gumroad.ts`, `npm run gumroad:verify` |

---

## 2. The five facts that shape everything below

Each of these is verified against Gumroad's published API documentation and, where
the documentation is silent, against its source (the platform is open at
`github.com/antiwork/gumroad`). Where I could not verify something it is marked.

### 2.1 Pings are unsigned, so authenticity has to come from somewhere else

Three layers, all of them cheap, none of them sufficient alone:

1. **A secret path segment.** The webhook lives at
   `/api/webhooks/gumroad/<GUMROAD_WEBHOOK_TOKEN>` rather than at a guessable
   path. Compared in constant time; a miss is a 404, not a 401, so the path does
   not confirm itself to a scanner. This is a bearer token in a URL, which is
   weak on its own — it appears in Gumroad's settings UI and in any log that
   records full URLs — but it stops the entire class of "somebody found the
   route and POSTed a form".
2. **`seller_id` must equal `GUMROAD_SELLER_ID`.** One string compare. Stops a
   ping legitimately fired at us for somebody else's product.
3. **Read-back.** Anything that would *grant* a plan is confirmed against the
   API before it is applied: `GET /v2/sales/:sale_id` for a sale,
   `GET /v2/subscribers/:subscription_id` for a subscription event. The API
   answer is the truth; the ping is only the notification that there is
   something to read. This is what makes a forged body worthless — an attacker
   who guesses the path still has to name a `sale_id` that exists on our seller
   account and is for our product, and even then the API tells us what was
   really bought.

Revocations (`refund`, `dispute`, `subscription_ended`) are applied on layers 1
and 2 alone, without waiting for a read-back. A forged revocation costs somebody
their plan until the next reconcile, which is recoverable; a forged grant is
free Elite, which is the failure §14 cares about. Fail toward less access.

### 2.2 Delivery is at-least-once, unordered, and gives up

From the Ping page, and matching `PostToIndividualPingEndpointWorker`:

- The same ping can arrive more than once. **Deduplicate on `sale_id` *and*
  `resource_name`** — a refund carries the same `sale_id` as the sale it
  reverses.
- Ordering is not guaranteed. A refund can land before the sale it refers to.
- A failed delivery retries at **1 minute, 3 minutes, 10 minutes, 1 hour**, then
  stops. `retry_count` (1, 2 or 3) is present on retried deliveries.
- **Only 499, 500, 502, 503 and 504 are retried.** Any other non-2xx is dropped
  permanently — *and so is a timeout or a connection error*.
- **The endpoint has 5 seconds to respond.**

Three consequences the code has to obey, and the first two are the opposite of
what the Creem route does:

- **Never return 4xx.** Today `/api/webhooks/creem` returns 401 on a bad
  signature and 400 on a malformed body. Under Gumroad a 401 or 400 means the
  event is gone forever. A ping we reject must still be acknowledged — log it,
  return 200.
- **Never return 503 for "not configured".** Creem holds a 503'd event for six
  hours; Gumroad drops it after 1h14m of retries. An unconfigured deployment
  loses the sale.
- **Acknowledge inside 5 seconds.** A read-back plus two Supabase writes will
  usually fit, but "usually" against a hard drop is not good enough — a cold
  start plus a slow API call blows it and the event is not retried. So: persist
  the raw ping, return 200, and do the work in `after()` (§B2).

`shouldApply()` in `lib/billing/events.ts` already handles out-of-order arrival
by timestamp and needs no change.

### 2.3 There is no checkout API

Nothing mints a session. A Gumroad checkout is a URL:

```
https://<subdomain>.gumroad.com/l/<permalink>?wanted=true&option=<tier_id>&nerve_uid=<supabase_user_id>&email=<user_email>
```

- `wanted=true` skips the product page and opens checkout.
- `option=<variant_id>` preselects the tier. `option` is consumed by Gumroad.
- `email=` prefills, and the buyer can still change it.
- **Any query parameter Gumroad does not consume itself is captured and returned
  in the ping's `url_params` dictionary.** The reserved names are `product`,
  `option`, `recurrence`, `quantity`, `price`, `recommended_by`, `affiliate_id`,
  `referrer`, `rent`, `recommender_model_name`, `call_start_time`,
  `pay_in_installments`, `force_new_subscription`. Everything else passes
  through. `nerve_uid` is safe and deliberately not called `user_id` — the
  subscription pings have a `user_id` field of their own meaning the *buyer's
  Gumroad account*, and one name for two things is how a webhook grants the
  wrong person a plan.

So `createCheckout()` stops being a network call and becomes a pure function.
It cannot fail, cannot time out, and needs no API key — which also means
`startCheckout` can no longer return "could not reach the payment provider",
and that string comes out of the action.

**The catch, and it is real:** `url_params` is captured client-side into cart
state from the URL the buyer landed on. A buyer who bookmarks the bare product
page, buys from the Gumroad app, or arrives from an email loses it. That is
precisely why `resolveUserId` in `apply.ts` already falls back to provider ids —
and why §B2 adds a third fallback on email, and §B5 adds a reconcile.

### 2.4 There is no test mode

No sandbox, no test keys, no parallel host. The only "test" is Gumroad's own
`test: true` flag, set when the purchaser is the seller — you buying your own
product with your own Gumroad account.

This inverts `CREEM_TEST_MODE_IN_PRODUCTION`. That variable existed to let a
*sandbox* key run on the *production* domain. Here there is no sandbox, so the
danger runs the other way: a self-purchase on the live product emits a real
`sale` ping into production, and if production acts on it, the rehearsal grants a
real plan against a payment that may be refunded to yourself.

The rule: **production ignores any ping carrying `test: true` unless
`GUMROAD_ALLOW_TEST_PURCHASES` is set.** Same shape as the flag it replaces —
absent is the safe default, it is named for exactly what it does, the
subscription screen says so while it is on, and `gumroad:verify` refuses to call
the deployment ready while it is set.

Rehearsing costs money either way. Two options, both in A11: a 100%-off offer
code (free, but exercises a £0 charge path rather than a real one), or a real
purchase of a real tier which you then refund to yourself (Gumroad keeps its fee
on a refunded sale, so the rehearsal costs ~$2.40 — worth it, because it is the
only way to see a real charge, a real `sale` ping and a real `refund` ping in
sequence).

### 2.5 There is no billing-portal API

Gumroad's customer-facing manage page is
`https://app.gumroad.com/subscriptions/<subscription_id>/manage`. Reading its
controller, access is granted by any one of: an encrypted cookie Gumroad set on
that browser at purchase time (one week), being signed in to the Gumroad account
that bought it, or a `token` query parameter — and **there is no API to mint that
token.** Without one of those, the page redirects to a magic-link form where the
buyer types their email and Gumroad emails them a link.

So the "Manage subscription" button becomes a plain link to that URL. It works —
often immediately, in the same browser, within a week of buying — but in the
worst case it costs an email round trip.

**This breaks a promise that is currently in the product.** `TRIAL_NOTE` in
`lib/site/plans.ts` says, of cancelling: *"no email, no form"*. Under Gumroad
that can be false. §14's reasoning is that a cancel which requires contacting us
turns into a chargeback, and chargebacks are what close merchant accounts — the
promise exists for account survival, not politeness. The copy has to become true
again rather than quietly wrong: see §B4.

---

## 3. The product shape: one membership, two tiers

**Decision: one Gumroad membership product called Nerve, with two tiers, Pro and
Elite. Not two separate products.**

Two products would map onto today's `CREEM_PRODUCT_PRO` / `CREEM_PRODUCT_ELITE`
code with almost no change, which is the only argument for it. Three arguments
against, and the first is decisive:

1. **Free-trial eligibility is per product *and* buyer email.** Gumroad refuses a
   free trial to an email that has already bought that product
   (`Purchase#free_trial_purchase_set_correctly` — *"You've already purchased
   this product and are ineligible for a free trial"*). Two products means one
   email gets **two** seven-day trials: seven days of three voice reps, then
   seven days of six. Against a realtime voice model that is real money, farmable
   by anyone who notices, and there is nothing in the app that can stop it —
   Gumroad owns trial eligibility, not us.
2. **Upgrades only work within one product.** Gumroad prorates a tier change and
   fires `subscription_updated` with `old_plan` / `new_plan`. Across two products
   Pro → Elite is a cancel and a re-subscribe, with a second trial attached to it.
3. One product is one description, one refund policy and one page for a reviewer
   to read (§0.1).

**The cost of the decision:** the tier has to be read out of `variants` on a sale
ping, which carries the tier's **name**, not its id — `{ "Tier": "Pro" }`, keyed
by the variant category's title. Ids only appear on `subscription_updated`
(`new_plan.tier.id`). So the mapping needs both, and `gumroad:verify` has to
assert that the names in the environment still match the names on the product,
because a tier renamed in the dashboard would otherwise silently stop granting.
That check is the whole safety of it, and it is nine lines.

> Verify on the first real ping: that the `variants` key for a tiered membership
> is literally `Tier`. The code must read the dictionary's single value rather
> than index by a hardcoded key.

---

# PART A — What you do by hand

In order. Nothing in Part B can be tested until A7 and A8 are done, and A8 must
not be done until B2 is deployed (§0.2).

### A1 · Account and payout — **done**

Payout method attached and accepted. Two things worth confirming on the Payouts
page while you are there, because both have moved recently and neither is worth
discovering on the first payout:

- The **minimum payout balance** (historically $10; reports in 2026 of a higher
  floor for accounts that have not completed identity verification).
- Whether **identity verification** is complete. If it is not, do it now — an
  unverified account is the one most likely to have a balance held at exactly
  the moment the category question gets asked.

Payouts run weekly on Fridays. PayPal receiving fees and FX spread land on top
of Gumroad's cut; budget for them in §9 rather than being surprised.

### A2 · Seller settings

`app.gumroad.com/settings`

1. **Profile / store name:** Nerve. The store URL becomes
   `https://<subdomain>.gumroad.com` — write the subdomain down, it goes in the
   environment.
2. **Settings → Payments:** confirm the payout account and the country.
3. **Settings → Advanced → Ping endpoint: LEAVE IT EMPTY.** This is the global
   ping, it fires only for `sale`, and it fires *in addition to* any resource
   subscription — setting both means every sale is delivered twice. All eight
   event types come from A8 instead.

### A3 · Create the membership product

`app.gumroad.com/products/new` → **Membership**.

1. **Name:** Nerve.
2. **URL / permalink:** something stable and short, e.g. `nerve`. It is in every
   checkout URL and renaming it breaks them. Write it down.
3. **Description:** the training product. Not the wedge. This page is read by a
   Gumroad reviewer before your site is (§0.1). State the format — a bounded
   three-minute scored rep, process scored and never outcome — the 18+ line, the
   PG-13 line, and "training, not therapy or clinical care", which is the same
   footer sentence every public page carries. Do not use the words the
   prohibited list uses.
4. **Recurrence:** Monthly. Uncheck every other interval; a buyer who picks
   yearly gets a `recurrence` we do not price or map, and `plans.ts` has one
   price per tier.
5. **Currency:** USD.
6. **Gumroad Discover: OFF.** 30% instead of 10%, and a marketplace listing we
   do not want (§0.1).
7. **Refund policy:** 14 days, matching Terms clause 07. A policy on Gumroad that
   disagrees with the one on `hellonerve.com` is the kind of mismatch a reviewer
   opens both tabs to find.

### A4 · The two tiers

In the product's **Tiers** section:

| Tier | Monthly price | Must match |
|---|---|---|
| Pro | $19 | `PUBLIC_PLANS` in `lib/site/plans.ts` |
| Elite | $49 | same |

Name them exactly `Pro` and `Elite` — those strings go into the environment and
are asserted by `gumroad:verify` (§3). Nothing else on the tier matters to the
code; the feature bullets are marketing and should say volume and nothing else,
for the same reason the in-app comparison does.

### A5 · The free trial

Product page → **Settings** at the bottom → **Offer a free trial** → **1 week**.

Gumroad offers 1 week or 1 month only, and 1 week is what `TRIAL_DAYS = 7`
already says on the pricing page and in `TRIAL_NOTE`. The card is collected and
verified but not charged; the first charge lands at day 7; Gumroad emails the
buyer 48 hours before it does. That email is one of the three mitigations §8 of
`PAYMENTS-NEW-INTEGRATION.md` requires for a card-backed trial and it is now
Gumroad's job rather than ours — which is fine, but check it actually arrives
during A11.

### A6 · After-purchase redirect

Product → **Content / Settings** → redirect after purchase:

```
https://hellonerve.com/profile/subscription?bought=1
```

This is static and cannot carry the sale id, which is fine — it drives the
confirmation banner that covers the seconds before the ping lands, nothing else.
Nothing is ever granted on this redirect; it is a browser navigation anyone can
type.

### A7 · The OAuth application and access token

`app.gumroad.com/settings/advanced` → **Applications** → **Create application**.

1. **Name:** Nerve (server). **Redirect URI:** `https://hellonerve.com/` — it is
   required by the form and never used, because we are not doing a three-legged
   OAuth flow; we want a token for our own account.
2. Save. You get an application id and secret. You need neither.
3. On the application's page, click **Generate access token**. **Copy it now** —
   this is `GUMROAD_ACCESS_TOKEN` and it is shown once.

The token needs the `view_sales` scope, which is what both the sales read-back
and — importantly — the resource subscriptions in A8 require. A resource
subscription stops being delivered if the application's token is revoked or the
application is deleted, so this token is not merely how we read, it is what
keeps the webhooks alive.

Then confirm it and capture your seller id:

```bash
curl -s "https://api.gumroad.com/v2/user?access_token=$GUMROAD_ACCESS_TOKEN" | jq .
```

The `user.user_id` / `user.id` is `GUMROAD_SELLER_ID`. Cross-check it against the
`seller_id` on the first real ping in A11 before trusting it — they should be the
same obfuscated id, and if they are not, the ping is the one that counts.

And capture the product and tier ids:

```bash
curl -s "https://api.gumroad.com/v2/products?access_token=$GUMROAD_ACCESS_TOKEN" | jq '.products[] | {id, name, short_url, variants}'
```

`id` is `GUMROAD_PRODUCT_ID`. Inside `variants` you will find the Tier category
and the two tier ids — those are `GUMROAD_TIER_PRO_ID` and
`GUMROAD_TIER_ELITE_ID`, used to preselect a tier at checkout.

### A8 · Register the webhooks — **only after B2 is deployed**

Eight `PUT`s. Do not run these against a route that does not yet verify the token
and read back the sale: between this command and that deploy, the endpoint that
grants paid plans is an open POST.

```bash
TOKEN=<GUMROAD_ACCESS_TOKEN>
HOOK="https://hellonerve.com/api/webhooks/gumroad/<GUMROAD_WEBHOOK_TOKEN>"

for r in sale refund dispute dispute_won cancellation \
         subscription_updated subscription_ended subscription_restarted; do
  curl -s -X PUT https://api.gumroad.com/v2/resource_subscriptions \
    -d "access_token=$TOKEN" -d "resource_name=$r" -d "post_url=$HOOK" | jq -c .
done
```

Then confirm — and confirm there is exactly one per resource, because a repeated
`PUT` creates a second subscription and doubles delivery:

```bash
for r in sale refund dispute dispute_won cancellation \
         subscription_updated subscription_ended subscription_restarted; do
  echo -n "$r: "
  curl -s -G https://api.gumroad.com/v2/resource_subscriptions \
    -d "access_token=$TOKEN" -d "resource_name=$r" | jq -c '.resource_subscriptions'
done
```

Delete a duplicate with
`curl -X DELETE https://api.gumroad.com/v2/resource_subscriptions/<id> -d "access_token=$TOKEN"`.

`npm run gumroad:verify` does all of this checking for you once B5 exists; the
curl above is what to run before it does.

**One constraint on the URL:** Gumroad resolves the hostname and refuses any
`post_url` that resolves to a private or reserved IP, at registration *and* at
every delivery. A public tunnel (ngrok, Cloudflare) works; `localhost` never
will.

### A9 · Collect the values

| Variable | Where it comes from |
|---|---|
| `GUMROAD_ACCESS_TOKEN` | A7, shown once |
| `GUMROAD_SELLER_ID` | A7's `/v2/user`, confirmed against a real ping |
| `GUMROAD_PRODUCT_ID` | A7's `/v2/products` |
| `GUMROAD_STORE_URL` | `https://<subdomain>.gumroad.com` (A2) |
| `GUMROAD_PRODUCT_PERMALINK` | A3.2 |
| `GUMROAD_TIER_PRO` / `GUMROAD_TIER_ELITE` | The tier **names**: `Pro`, `Elite` (A4) |
| `GUMROAD_TIER_PRO_ID` / `GUMROAD_TIER_ELITE_ID` | The tier **variant ids**, A7 |
| `GUMROAD_WEBHOOK_TOKEN` | You generate it: `openssl rand -hex 32` |
| `GUMROAD_ALLOW_TEST_PURCHASES` | Unset, except during A11 |

### A10 · Put them in Vercel

Production scope, all of them. Then redeploy — Vercel does not apply new
environment variables to an existing deployment, and a webhook route reading an
undefined token 404s every ping, which Gumroad does not retry.

### A11 · The rehearsal

With `GUMROAD_ALLOW_TEST_PURCHASES=1` set in production:

1. From a signed-in Nerve account, click **Start trial** on `/profile/subscription`
   and go all the way through Gumroad's checkout with a real card.
2. Confirm, in this order:
   - a `sale` ping arrives with `price: 0`, `test: true`, and
     `url_params[nerve_uid]` equal to that account's Supabase id;
   - `subscriptions` has a row: `provider: 'gumroad'`, `status: 'trialing'`,
     `provider_subscription_id` set;
   - `entitlements.reps_per_day` is 3, and a voice rep actually opens;
   - `/profile/subscription` shows the trial and its end date, not "renews".
3. Confirm the `variants` key really is `Tier` and the value really is `Pro`.
4. Open the manage link from the subscription screen and check what happens in a
   fresh browser profile — this is the §2.5 question, and the answer decides
   what §B4's copy has to say.
5. Cancel from Gumroad. Confirm a `cancellation` ping arrives, and that access
   *persists* until the period end (that is `intent: 'record'`, and it is
   correct — they keep what they paid for).
6. Repeat once at Elite, letting the trial convert if you can afford the week, so
   a real charge, a real `is_recurring_charge` and a real `refund` are all seen
   at least once.

**Then unset `GUMROAD_ALLOW_TEST_PURCHASES` and redeploy, in the same edit.**

### A12 · Go live

- [ ] `GUMROAD_ALLOW_TEST_PURCHASES` removed from Vercel and redeployed
- [ ] `npm run gumroad:verify` clean, no warnings
- [ ] Exactly one resource subscription per resource name, all pointing at the production URL
- [ ] Settings → Advanced → Ping endpoint still empty
- [ ] Discover still off
- [ ] Prices on `/pricing`, on the Gumroad product, and in `PUBLIC_PLANS` are the same three numbers
- [ ] Refund policy on Gumroad matches Terms clause 07
- [ ] A log entry in `PAYMENTS-APPROVAL.md` §7

---

# PART B — What the agent builds

Eight pieces. Order matters: B0 → B1 → B2 are the critical path, and A8 waits on
B2 being deployed.

### B0 · Migration — widen the provider constraint

One migration, committed to `supabase/migrations/`, applied through the Supabase
MCP. **The existing `20260823040428_m3_subscriptions.sql` is not edited** —
applied migrations are a record.

```sql
alter table public.subscriptions drop constraint subscriptions_provider_check;
alter table public.subscriptions add constraint subscriptions_provider_check
  check (provider in ('creem', 'gumroad', 'polar', 'dodo', 'manual'));
```

`creem` stays in the list. It is history now, but a row written under it is still
a row, and dropping the value would fail the migration on any deployment that has
one.

**Plus one new table**, which §2.2 forces and which `apply.ts` does not currently
need because Creem gave us an event id:

```sql
create table public.billing_events (
  id           bigint generated always as identity primary key,
  provider     text not null,
  resource     text not null,          -- the ping's resource_name
  external_id  text not null,          -- sale_id, or subscription_id where there is no sale
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  applied_at   timestamptz,
  detail       text,
  unique (provider, resource, external_id)
);
alter table public.billing_events enable row level security;
-- No policy at all. Service role only; not readable by any user.
```

Append-only, service-role only, no RLS policy — the same posture as the ledger.
It does three jobs at once: it is the deduplication key §2.2 requires, it is what
lets the route acknowledge in under five seconds, and it is the record that makes
reconciling a disputed charge six weeks later possible. The `unique` constraint
is the dedupe: a conflicting insert means we have already seen this one.

### B1 · The adapter

New directory `lib/billing/gumroad/`, so the provider's vocabulary stops at its
boundary exactly as `events.ts` says it must.

| File | Job |
|---|---|
| `parse.ts` | `application/x-www-form-urlencoded` → a typed record. Gumroad encodes nesting as `url_params[nerve_uid]` and `variants[Tier]`; this un-flattens it. Pure, tested |
| `verify.ts` | Constant-time compare of the path token; `seller_id` check; `test`-flag policy (§2.4). Pure, tested |
| `api.ts` | The only file that talks to Gumroad. `getSale(id)`, `getSubscriber(id)`, `getProduct(id)`, `listResourceSubscriptions()`. `fetch`, no SDK, `view_sales` token as a query param |
| `events.ts` | Ping → `BillingEvent`, using the mapping in §8 below. Pure over a parsed payload, tested — the same shape and for the same reason as `lib/billing/events.ts` |
| `checkout.ts` | The URL builder (§2.3). Pure, tested. Refuses to build a URL for a tier with no configured id, the same fail-closed rule `productForPlan` has |

And `lib/billing/plans.ts` is rewritten rather than replaced: `PRODUCT_ENV`
becomes a tier map keyed on both name and id, `checkoutConfigured()` loses its
key-prefix test and gains "the token, the seller id, the product and both tiers
are all set", and `billingEnvironmentRefusal()` becomes the §2.4 test-purchase
rule. **The fail-closed doctrine in that file's comments is the part to keep**:
an unrecognised tier grants nothing, records the money, and says so loudly.

### B2 · The webhook route

`app/api/webhooks/gumroad/[token]/route.ts`, Node runtime.

The sequence, and every step is load-bearing:

1. Constant-time compare `params.token` against `GUMROAD_WEBHOOK_TOKEN`. Miss →
   **404**, no body. Unset token → 404 as well; there is no useful 503 here,
   because Gumroad drops the event either way and a 503 only makes it look
   retryable when it is not.
2. `await request.text()`, then parse as form-encoded. Unparseable → log, **200**.
3. `seller_id` mismatch → log, **200**.
4. `test: true` and not `GUMROAD_ALLOW_TEST_PURCHASES` → log, **200**.
5. Insert into `billing_events` on `(provider, resource, external_id)`. Conflict
   → already seen → **200**, done.
6. **Return 200 here.** Everything after this runs in `after()` from
   `next/server`, which is what keeps step 7 out of the five-second budget.
7. In `after()`: if the intent is a grant, read the sale or subscriber back
   through `api.ts` and build the `BillingEvent` from *that*, not from the ping.
   If the read-back contradicts the ping, or fails, do not grant — write the
   reason to `billing_events.detail` and leave it for the reconcile.
8. `applyBillingEvent(event)`, then stamp `applied_at` and `detail`.

The three fallbacks for finding the account, in order — the first two already
exist in `resolveUserId` and only the third is new:

1. `url_params.nerve_uid` from the ping.
2. `provider_subscription_id` or `provider_customer_id` already on the mirror.
   **This is the one that carries every renewal, cancellation and dispute**, because
   subscription pings carry no `url_params` at all — only the first sale does.
3. **New:** exact match of the ping's buyer `email` against a confirmed
   `auth.users` email. Gated to grants for a product that is ours, and logged
   distinctly so the reconcile can tell an email-matched grant from a
   `nerve_uid` one. This exists because §2.3's client-side capture can lose the
   parameter, and the alternative is a real payment nobody can attribute.

Unattributable after all three → 200, and a log line loud enough to act on. It
is a real payment that needs a human, not a fourth delivery attempt.

### B3 · Checkout becomes a link

`lib/billing/checkout.ts`'s `createCheckout` is deleted; the URL builder in
`lib/billing/gumroad/checkout.ts` replaces it. `app/profile/subscription/actions.ts`
keeps its shape — `{ ok, url, message }`, still a Server Action, still validating
the plan against `PUBLIC_PLANS` rather than trusting the form — but it no longer
awaits a network call, so `'Could not reach the payment provider.'` and
`'Could not open checkout. Try again in a moment.'` are both removed. Every
user-facing string is hand-authored; a string for a failure that can no longer
happen is worse than none.

### B4 · The manage path, and the copy it breaks

`createBillingPortal` is deleted. `openBillingPortal` keeps its guard —
read `provider_subscription_id` off the mirror for the signed-in user, never from
the form — and returns
`https://app.gumroad.com/subscriptions/<id>/manage`.

Then the copy, which is the part that is not mechanical. `TRIAL_NOTE` in
`lib/site/plans.ts` currently promises *"Cancel any time from Subscription — no
email, no form"*. Under §2.5 that is sometimes false. Rewrite it to what is
actually true — cancelling happens on Gumroad's page, and if it does not
recognise the browser it emails a link first — and change it in the same edit as
the code, because `/pricing` and `/profile/subscription` both render it and a
public page that overstates a cancellation path is exactly the mismatch §14
warns about.

The same edit touches `components/screens/profile-screens.tsx`, which names the
provider in user-visible copy today.

### B5 · `scripts/verify-gumroad.ts` → `npm run gumroad:verify`

Replaces `scripts/verify-creem.ts` and keeps its structure — a preflight that
refuses to call the deployment ready rather than a test suite. Checks:

- every variable in A9 set; `checkoutConfigured()` true
- `GET /v2/user` succeeds and its id equals `GUMROAD_SELLER_ID`
- `GET /v2/products/:id` resolves, is published, is a membership, is monthly, USD
- **both tier names in the environment exist on the product**, and both tier ids
  resolve — the §3 check that stops a dashboard rename silently unselling a plan
- each tier's price equals `PUBLIC_PLANS`' price in cents
- the free trial is enabled and is one week
- Discover is off
- exactly one resource subscription per resource name, all eight present, all
  pointing at the current `post_url`, none stale
- the global ping endpoint is **not** also set
- `GUMROAD_ALLOW_TEST_PURCHASES` unset → otherwise a hard WARN and "not ready",
  the same refusal `creem:verify` made about the rehearsal flag

Plus a `--reconcile` mode, which §2.2 and §2.3 between them make necessary rather
than nice: page `GET /v2/products/:id/subscribers`, compare each live Gumroad
subscription against the `subscriptions` mirror, and print the disagreements —
subscribers with no mirror row (a lost ping or a lost `nerve_uid`), mirror rows
Gumroad no longer knows about, and status drift. Print, do not fix; a
reconciliation that writes silently is a second, unaudited path onto a paid plan.

### B6 · Tests

Mirroring what exists: `signature.test.ts` is deleted with the module it tests,
and its 230 lines are replaced by `verify.test.ts` covering the token compare,
the seller check and the test-flag policy. `parse.test.ts` covers the bracket
un-flattening — including `url_params` absent entirely, which is the common case
on every subscription ping. `gumroad/events.test.ts` mirrors
`lib/billing/events.test.ts` case for case, with the §8 table as its subject, and
must include: a trial sale reading as `trialing` and not `active` (the 1 September
bug, in a new provider's shape), a refund arriving before its sale, a duplicate
delivery, and `subscription_updated` moving a plan in both directions.

`scripts/verify-billing.ts` (`npm run db:billing`) exercises the whole lifecycle
against the real project and is where the end-to-end proof lives: grant,
upgrade, dunning, expiry, dispute, replay. It is written against Creem-shaped
events and has to be ported, not merely renamed.

### B7 · The documents this changes

Per the loop in `CLAUDE.md`, in the same commit as the code:

| Document | What moves |
|---|---|
| `CLAUDE.md` | "Merchant of record for billing (Creem primary)" → Gumroad; the `creem:verify` line in the verify block → `gumroad:verify` |
| `docs/README.md` | The index row and the which-doc-for-which-change table |
| `docs/NERVE-SPEC.md` §14 | The provider table and the fee arithmetic (§9 below) |
| `docs/PAYMENTS-NEW-INTEGRATION.md` | §6 is Creem setup end to end. Do not rewrite it — mark it superseded and point at this file, the way §11 is kept as a record |
| `docs/PAYMENTS-APPROVAL.md` | §2's table, and a §7 log entry. §8 is the decision this assumes |
| `docs/LAUNCH-GAP.md` | B2 |
| `docs/DATA.md` | `billing_events`, and the widened `provider` constraint |
| `.env.example` | The whole Creem block (lines 209–253) replaced, comments and all — those comments are load-bearing and the new ones have to earn their place the same way |

### B8 · Acceptance

The work is done when, and not before:

1. `npm run typecheck && npm run lint && npm test && npm run build:check` pass.
2. `npm run db:billing` passes against the real project, ported not renamed.
3. `npm run gumroad:verify` is clean against production.
4. A11's rehearsal has been run end to end and every step of it observed.
5. `grep -ri creem lib/ app/ components/ scripts/` returns nothing outside
   `docs/` and the one migration.

---

## 4. Event mapping

Gumroad's eight resources onto `BillingEvent`. The `intent` column is a product
decision carried over from `lib/billing/events.ts` unchanged, and the reasoning
there still applies: `past_due` keeps access because the provider is still
retrying; a dispute revokes immediately because a chargeback is money already
gone and an account that keeps its plan through one is what closes a merchant
account.

| Gumroad `resource_name` | Condition | intent | status |
|---|---|---|---|
| `sale` | `price == 0`, free trial | grant | `trialing` |
| `sale` | first paid charge | grant | `active` |
| `sale` | `is_recurring_charge: true` | grant | `active` |
| `refund` | | revoke | `canceled` |
| `dispute` | | revoke | `canceled` |
| `dispute_won` | | grant | `active` |
| `cancellation` | `cancelled_at` in the future | **record** | `active` |
| `cancellation` | `cancelled_due_to_payment_failures` | record | `past_due` |
| `subscription_updated` | `type: "upgrade"` | grant | `active` |
| `subscription_updated` | `type: "downgrade"` | **record** | `active` |
| `subscription_ended` | `ended_reason: "cancelled"` | revoke | `canceled` |
| `subscription_ended` | `ended_reason: "failed_payment"` | revoke | `canceled` |
| `subscription_ended` | `ended_reason: "fixed_subscription_period_ended"` | revoke | `canceled` |
| `subscription_restarted` | | grant | `active` |

Three of these are judgement calls rather than transcription, and each maps onto
one that already exists:

- **`cancellation` records, it does not revoke.** It fires when cancellation is
  *requested*; `subscription_ended` fires when it actually ends. This is exactly
  Creem's `subscription.scheduled_cancel` → `record`, and it is what makes
  `cancel_at_period_end` true while access continues. Getting this wrong takes a
  plan away from somebody on the day they cancel, weeks before they stop paying
  for it.
- **A downgrade records.** Gumroad applies a downgrade at the end of the billing
  period, and `effective_as_of` says when. Granting Pro immediately on a downgrade
  from Elite takes away three reps a day that are paid for until the period ends.
  The plan moves when the period does — which means the downgrade has to be
  *stored* and applied later. The cheapest honest version: record it, and let the
  `subscription_updated` that Gumroad fires at the effective date do the move —
  **confirm during A11 that it does fire then**; if it does not, this needs a
  scheduled sweep and that is a decision, not a detail.
- **A trial reads as `trialing`.** The 1 September Creem bug (§12 of
  `PAYMENTS-NEW-INTEGRATION.md`) was exactly this: a trialling checkout mapped to
  `active`, so every trialling account was told its plan renews. Here the signal
  is different and simpler — a free-trial sale has `price: 0` and the subscriber
  read-back carries `free_trial_ends_at` in the future — but the failure mode is
  identical and §14 is blunt that a trial ending quietly is what closes a
  merchant account. Test it explicitly.

---

## 5. What it costs

Gumroad's published fee for a direct sale is **10% + $0.50**, payment processing
included, no monthly charge. A Discover sale is 30% — hence A3.6.

Against Creem's quoted 3.9% + $0.40, on the prices in `PUBLIC_PLANS`:

| | Pro $19 | Elite $49 |
|---|---|---|
| Creem fee | $1.14 | $2.31 |
| Gumroad fee | **$2.40** | **$5.40** |
| Difference, per month, per subscriber | **−$1.26** | **−$3.09** |

Carried into the gross-margin figures `lib/site/plans.ts` and
`PAYMENTS-NEW-INTEGRATION.md` §2.1 argue from — worst-case voice burn, derived
from the $39-vs-$49 Elite arithmetic already in that file:

| Worst case | Creem | Gumroad |
|---|---|---|
| Pro $19 | ~50% | **~43%** |
| Elite $49 | ~62% | **~56%** |

Roughly six points off each tier. That is survivable and it is not free, and it
is the number D2 in `PAYMENTS-APPROVAL.md` has to be re-decided against — the
$19 founding-member price was chosen when the cut was 4%. **Re-run
`npm run cost:model` rather than trusting this table**; these are derived from
figures in the docs, not from the model.

Two costs on top that Creem's table did not have: PayPal's receiving fee on
international payouts, and FX spread on the conversion. Both land after Gumroad's
cut and neither is in the numbers above.

The framing in `PAYMENTS-APPROVAL.md` §2 stands: **Gumroad is a bridge to launch,
not a permanent home.** The whole point of keeping the provider abstract is that
leaving costs an adapter.

---

## 6. Risks, honestly

- **The category.** §0.1. The single largest risk in this document and the one
  least affected by anything in Part B. Gumroad's enforcement is reactive, which
  buys time and raises the stakes.
- **An unsigned webhook.** §2.1's three layers are good but they are not an HMAC.
  The read-back is what actually protects a grant; if `api.ts` is ever bypassed
  "just for this event", the endpoint becomes forgeable. Keep the grant path and
  the read-back in the same function.
- **Lost `url_params`.** §2.3. Mitigated by the email fallback and the reconcile,
  and neither is free — an email-matched grant is a slightly different security
  posture and is logged distinctly for that reason.
- **A dropped ping.** 1h14m of retries and then silence, and a timeout is not
  retried at all. `--reconcile` is the answer and it needs to be run on a
  schedule, which means it eventually wants the cron `vercel.json` does not have
  yet (`LAUNCH-GAP.md` B12 is the same missing hook).
- **No test mode.** Every rehearsal is a real charge on a real card and every
  regression test against the live account costs money. This is the strongest
  argument for the pure functions in B1 being genuinely pure.
- **Trial farming.** §3 closes the two-products hole. It does not close signing
  up with a second email, which no provider closes and which the one-off sign-up
  rep already lives with.
- **Payout hold.** A new account with an unverified identity and a sudden run of
  subscriptions is the shape that triggers a review. A1 is worth finishing.

---

## 7. Decisions that need you, not code

1. **§8.A of `PAYMENTS-APPROVAL.md` — the positioning.** Before A3's description
   is written, because the description is downstream of it. This is the blocking
   one.
2. **D2 — the prices**, re-decided against §5's six points.
3. **Rehearsal budget** (§2.4): the 100%-off code, or a real charge you refund.
4. **What `TRIAL_NOTE` says now** (§B4). The current sentence is a promise; it
   needs to become a true one, and only you can decide how much friction to
   admit to on a public pricing page.

---

## 8. Log

Append. Do not rewrite — this is the record of what was set up and when.

| Date | Event |
|---|---|
| 1 Sep 2026 | Creem declined, final, no appeal. Gumroad account already exists; payout method attached and accepted |
| 1 Sep 2026 | This document written. Gumroad's API, Ping semantics, trial rules, tier behaviour and fees checked against its published documentation and, where that is silent, against its source. **Nothing built, nothing configured beyond the payout account** |

---

## Sources

Gumroad's published documentation, and its open-source implementation where the
documentation is silent — the unsigned-webhook fact, the retry schedule, the
trial-eligibility rule, the `variants` dictionary shape and the manage-page
access rules all come from the source rather than the docs.

- [Gumroad API reference](https://gumroad.com/api)
- [Gumroad Ping](https://gumroad.com/ping)
- [Prohibited products](https://gumroad.com/prohibited)
- [Things you can't sell on Gumroad](https://help.gumroad.com/article/155-things-you-cant-sell-on-gumroad)
- [Membership products](https://gumroad.com/help/article/82-membership-products)
- [Pricing](https://gumroad.com/pricing)
- [antiwork/gumroad](https://github.com/antiwork/gumroad) — `post_to_individual_ping_endpoint_worker.rb`, `resource_subscription.rb`, `purchase/ping_notification.rb`, `subscription/ping_notification.rb`, `purchase.rb`, `subscriptions_controller.rb`, `initialCheckout.ts`, `pages/Public/Ping.tsx`
