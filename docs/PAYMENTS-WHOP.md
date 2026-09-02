# Payments — replacing Creem with Whop

The implementation plan. What survives from the Creem build, what changes, the
manual setup in the order it has to happen, the code file by file, and what has
to be true before checkout opens.

`PAYMENTS-APPROVAL.md` §8 is why we are moving providers at all.
`PAYMENTS-NEW-INTEGRATION.md` §11 and §12 stay the record of the Creem build and
are not rewritten. `PAYMENTS-GUMROAD.md` is now the **second** choice, kept
because a fallback that has been thought through is worth having.

**Status: the code shipped 1 September 2026. The live Whop account was
configured on 2 September. Nothing is deployed yet — that is one push.**

Everything in §6 is built, typechecked, linted, tested and driven through the
real database by `npm run db:billing`, and the whole trial lifecycle — activate,
warn, charge — has been driven over HTTP through the running route.

§7 ran on 2 September. What exists on `biz_G4B33AGA0sWgzq` ("Hellonerve"):

| | |
|---|---|
| product | `prod_DlhZq3oMd4QHd` — "Nerve", hidden, `WHOP*NERVE` on the statement |
| Pro | `plan_pyrhOCBHYRnFW` — $19, 30-day, 7-day trial, `initial_price` 0, hidden |
| Elite | `plan_m0JD4mhTqeZnk` — $49, 30-day, 7-day trial, `initial_price` 0, hidden |
| webhook | `hook_uBtOKRs6GhyR8` → `https://hellonerve.com/api/webhooks/whop`, all nine events, pinned `2026-08-31` |

`npm run whop:verify` is clean: 0 failed, 0 warnings. All seven variables are in
Vercel production.

The account's industry was corrected to `personal_development /
communication_coaching` on 2 September — **not with an API key, which gets a 404
on its own account, but with a user token** (the Whop MCP). That is the only
route to it short of the dashboard.

**One thing is still owed: the policy documents.** Whop wants them as uploaded
**PDFs**, not as URLs — `terms_of_service`, `privacy_policy` and `return_policy`
are file fields, which is why they are absent from the account update schema.
`npm run legal:pdf` renders them from the running app, so the uploaded document
cannot drift from the published page. There was no discrete return policy to
render, so `RefundDocument` and `/legal/refunds` were added; every commitment on
it already existed in clause 07, and the two must change together.

**Deployed to production on 2 September.** `elevenlabs-pipeline` is git-linked
to production, so the push built and released it. `whop:probe` passes against
`https://www.hellonerve.com` and `whop:verify` is clean. The buy button is live.

**The canonical host is `www.hellonerve.com`, not the apex** — see §13.10. Three
things were registered against the apex before anybody checked which way that
redirect ran, and one of them was the webhook.

**Read §2.1 and §13 before doing §7.** Five of §2's six open questions were
answered from Whop's own OpenAPI specification while building this, and three of
them contradict what §5 and §6 assumed. The code follows the specification, not
the plan; §13 lists every place they differ and why.

---

## 1. Why this is the cheap migration

The §14 abstraction was built for a provider swap and this is the case it was
built for. Whop signs its webhooks with the **same Standard Webhooks spec Creem
used**, mints checkouts through an API that takes **arbitrary metadata**, and
ships a **sandbox**. Every one of those is a thing Gumroad does not have, and
each one is a module we keep instead of delete.

| | Creem (built) | Gumroad (planned) | **Whop** |
|---|---|---|---|
| Webhook signing | Standard Webhooks | none | **Standard Webhooks** |
| `lib/billing/signature.ts` | — | deleted | **kept, one branch edited** |
| Checkout | `POST /v1/checkouts` | a URL string | **`POST /checkout_configurations`** |
| User-id binding | `metadata.user_id` | `url_params`, lost client-side | **`metadata`, copied to payments *and* memberships** |
| Sandbox | yes | none | **yes, separate host** |
| Retry window | ~6h | 1h14m then dropped | **~71h, 12 retries** |
| Cancel path | hosted portal | magic-link email | **`POST /memberships/{id}/cancel`, in our own UI** |
| Fee on $19 | $1.14 | $2.40 | **~$1.40–1.86** |

The cancel endpoint is the one that changes the product rather than the code.
Creem gave us a hosted portal; Gumroad would have forced an email round trip and
made `TRIAL_NOTE`'s "no email, no form" a lie. Whop lets us cancel from our own
Subscription screen in one tap, which is what the copy already promises and what
§14 wants for account survival.

**Nothing has been sold yet.** Production has never had a live key, so there are
no real subscribers to migrate. Confirm before starting:

```sql
select user_id, provider, plan, status from public.subscriptions;
```

Anything there is from the 1 September rehearsal and can be deleted.

---

## 2. Verified, and what the sandbox still has to settle

Everything in §3–§6 comes from Whop's own API reference and developer guides,
read as raw Markdown (`docs.whop.com/<path>.md`). Facts worth stating up front:

- **Base URL** `https://api.whop.com/api/v1`; sandbox `https://sandbox-api.whop.com/api/v1`.
- **Auth** `Authorization: Bearer <key>`. Version pinned with the
  `Api-Version-Date` header. `Idempotency-Key` supported on POSTs.
- **Objects** `account biz_` → `product prod_` → `plan plan_`; `user user_` +
  `plan` → `membership mem_`; `checkout configuration ch_`; `payment pay_`.
- **Membership status enum** — `trialing`, `active`, `past_due`, `completed`,
  `canceled`, `expired`, `unresolved`. Ours is `trialing | active | past_due |
  canceled | incomplete`. Near-identical, which is why §5 is short.
- **Membership carries** `cancel_at_period_end`, `current_period_end`,
  `metadata`, `plan_id`, `product_id`, `user_id`, `license_key`. Every column
  the `subscriptions` mirror has, under almost the same name.
- **Signature** HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}`,
  base64, header `webhook-signature: v1,<sig>`, 5-minute replay window. Headers
  `webhook-id`, `webhook-timestamp`, `webhook-signature`, `content-type` are
  contractually frozen across API versions.
- **Delivery** 2xx within 5 seconds; at-least-once; order not guaranteed;
  retries at 30s, 2m, 8m, 30m, 1h, 3h, 6h then 12-hourly, 12 attempts, ~71h.
  Disabled after 72h of failure with 10+ failures. **A timeout counts as a
  failed attempt and is retried** — unlike Gumroad, where it was dropped.
- **Plans** carry `plan_type: renewal|one_time`, `billing_period` (days),
  `initial_price`, `renewal_price`, `trial_period_days`, `currency`,
  `visibility: visible|hidden|archived|quick_link`, `tax_type`.

Six things the sandbox had to answer. **Five are now answered** — from
`docs.whop.com/openapi/api-v1-stable.json` and `…/api-v1-native.json`, which are
the generated specifications behind the API reference and are more precise than
the prose. Each answer is asserted in a test rather than left in this table:

1. **How the `ws_` secret becomes key bytes. ANSWERED: the whole ASCII string,
   prefix included.** The "Verify without an SDK" section of the webhooks guide
   is unambiguous where the quickstart is not — "Whop signs the string
   `{webhook-id}.{webhook-timestamp}.{raw body}` with HMAC-SHA256. **The key is
   your `ws_...` secret.**" No decoding, no stripping. Note that this is the
   opposite of the Standard Webhooks convention Creem followed, which is why it
   is now asserted in `signature.test.ts` rather than left to a comment.
   `keyBytes()` still reads a `whsec_` secret as base64 — but selected by the
   secret's own prefix, never tried as a fallback, so exactly one derivation is
   attempted per secret. T1 still confirms it against a real delivery.
2. **Price units. ANSWERED: major units.** The specification is explicit —
   `initial_price` is "the initial amount charged in the plan's currency, e.g.
   10.43 for $10.43". So Pro is `renewal_price: 19`, not `1900`.
   `whop:verify` asserts the plan's price equals `PUBLIC_PLANS` in these units,
   so creating one at 1900× fails the preflight rather than the first customer.
3. **Whether `membership.activated` fires at trial start** (it should, with
   `status: "trialing"`), and whether `payment.succeeded` fires for a $0 trial.
4. **Trial eligibility scope. ANSWERED, and Whop handles it.** Their own
   documentation: "Whop automatically catches when the same person tries to
   sign up for multiple free trials. If someone cancels and then tries to
   rejoin with another trial, the system will charge them full price instead of
   giving them another free period." So the scope is per person, across plans,
   and D2's guard is belt-and-braces rather than the only defence. Keep it —
   ours is per Nerve account and theirs is per Whop identity, and the two catch
   different people. T7 now measures the overlap rather than testing for a hole.
5. **Whether checkout forces the buyer to create a Whop account**, and whether
   the email can be prefilled. Still open, and now known to be un-prefillable
   from our side: `POST /checkout_configurations` takes a plan, metadata, an
   affiliate code, styling and a redirect URL, and **no customer or email
   field at all**. `createCheckout` therefore no longer passes one. This is a
   conversion question, not a correctness one, but it is the one thing about
   Whop most likely to annoy a buyer — measure it before spending on acquisition.
6. **The customer-facing management URL. ANSWERED: `manage_url`, on the
   membership.** Every `membership.*` payload carries it. `applyBillingEvent`
   stores it on the mirror's `last_event` blob and `/profile/subscription` draws
   it as a "Card and invoices" link beside the cancel button — validated as an
   `https://` URL before it reaches an `href`, because it is a vendor string
   ending up in a link.

---

## 3. Design decisions

### D1 · One product, two plans

A Whop product carries several plans, and a membership names its `plan_id`. So:
one product **Nerve**, two plans, **Pro** and **Elite**.

This is the direct analogue of `CREEM_PRODUCT_PRO` / `CREEM_PRODUCT_ELITE` —
`WHOP_PLAN_PRO` / `WHOP_PLAN_ELITE`, mapped on a clean opaque id that appears on
the membership and in every webhook. `lib/billing/plans.ts` keeps its shape and
its fail-closed doctrine: **an unrecognised plan grants nothing**, records the
money, and says so in the log.

Set both plans to `visibility: hidden` (or `quick_link`). We sell from our own
pricing page through a checkout configuration; the plans have no business on
Whop's public storefront, for the same reason Gumroad Discover was to be off.

### D2 · We enforce one trial per account ourselves

Gumroad's trial rule was per product + email, which is why that plan needed one
product. Whop's scope is one of §2's open questions — but it does not matter
much, because **we mint the checkout server-side**. `startCheckout` can read the
`subscriptions` mirror and refuse to create a trialling checkout for an account
that has already had one. That is a guard Gumroad's URL-based checkout could not
have had, and it is four lines.

Belt and braces: still confirm Whop's own behaviour in the sandbox (T7), because
our guard is per Nerve account and a second Nerve account is a second email.

### D3 · One variable decides sandbox versus live

Creem's key prefix picked the host, deliberately, so that two variables could
not disagree and point a live key at the sandbox. Whop has no such prefix — the
sandbox is a different host with its own keys.

So the host itself is the single variable. `WHOP_API_BASE` defaults to
`https://api.whop.com/api/v1`, and **"is this live?" is derived from it** — live
iff the host is `api.whop.com`. There is nothing for a second variable to
disagree with. `billingEnvironmentRefusal()` keeps its job: production refuses
to apply any event unless the configured base is the live one.

`WHOP_TEST_MODE_IN_PRODUCTION` replaces `CREEM_TEST_MODE_IN_PRODUCTION` with the
same semantics and the same three guardrails — one variable, absent by default,
the subscription screen says so on the page while it is set, and
`whop:verify` refuses to call the deployment ready.

### D4 · The route stays inline; no new table

The Gumroad plan needed a `billing_events` table and `after()`, because a
timeout there meant the event was gone forever. Whop retries a timeout and keeps
trying for three days, so the existing shape is correct: verify, map, apply,
and **500 on a transient failure so Whop redelivers**. `applyBillingEvent` is
already idempotent and `shouldApply` already drops out-of-order retries by
timestamp.

If p95 on that route ever approaches five seconds, move the apply into `after()`
from `next/server` and acknowledge first. Do not do it pre-emptively.

### D5 · Cancel is ours, card management is theirs

`POST /memberships/{id}/cancel` with `cancel_at_period_end: true` stops renewal
and keeps access to the end of the period — exactly §14's rule. So the
Subscription screen gets a real cancel button, and `createBillingPortal` is
deleted rather than replaced.

The action calls Whop and returns; it writes nothing. The
`membership.cancel_at_period_end_changed` webhook comes back and updates the
mirror. Rule 9 holds — a user still cannot write their own plan.

Card updates and invoices still live on Whop, so keep a secondary "manage on
Whop" link once §2.6 tells us the URL.

---

## 4. Environment

| Variable | What it is |
|---|---|
| `WHOP_API_KEY` | Account API key, `Authorization: Bearer`. Server-side only |
| `WHOP_API_BASE` | `https://api.whop.com/api/v1`, or the sandbox host. **This is what says live or not** |
| `WHOP_API_VERSION_DATE` | The dated pin sent as `Api-Version-Date`, e.g. `2026-08-31` |
| `WHOP_WEBHOOK_SECRET` | The `ws_...` signing secret. Shown once at creation |
| `WHOP_ACCOUNT_ID` | `biz_...`. Every event's `account_id` must match |
| `WHOP_PLAN_PRO` | `plan_...` |
| `WHOP_PLAN_ELITE` | `plan_...` |
| `WHOP_TEST_MODE_IN_PRODUCTION` | Unset except during the production rehearsal |

Replaces the five `CREEM_*` variables. The whole block in `.env.example`
(lines 209–253) is rewritten, comments included — those comments are
load-bearing and the new ones have to earn their place the same way.

---

## 5. Event mapping

`lib/billing/events.ts` keeps `BillingEvent`, `BillingIntent`, `shouldApply` and
`resolvedPlan` unchanged. Only the `INTENTS` table and `toBillingEvent`'s field
reads move. The product decisions carried over verbatim: **`past_due` keeps
access** because the provider is still retrying, and **a dispute revokes
immediately** because a chargeback is money already gone.

| Whop event | intent | status | note |
|---|---|---|---|
| `membership.activated` | grant | from `data.status` | The primary grant. Carries `trialing` or `active` — read it, never assume |
| `payment.succeeded` | grant | `active` | Renewals, and the trial's first real charge |
| `membership.trial_ending_soon` | record | `trialing` | One of §8's three trial mitigations, handed to us |
| `membership.cancel_at_period_end_changed` | **record** | unchanged | Sets `cancel_at_period_end` from the payload. Access continues |
| `membership.deactivated` | revoke | `canceled` | The actual end |
| `payment.failed` | record | `past_due` | Dunning; access continues |
| `invoice.past_due` | record | `past_due` | Same |
| `refund.created` | revoke | `canceled` | |
| `dispute.created` | revoke | `canceled` | §14 — immediate, no grace |
| anything else | — | — | 200 and ignored, as today |

Two notes that matter more than they look:

- **`membership.activated` is much easier to parse than Creem's checkout.**
  `data` *is* the membership: `status`, `metadata`, `plan_id`,
  `current_period_end`, `cancel_at_period_end`, `user_id` are all top-level. The
  nested `asRecord(data['subscription']) ?? data` digging in `toBillingEvent`
  collapses to direct reads.
- **The trial bug from 1 September must not recur.** `PAYMENTS-NEW-INTEGRATION.md`
  §12 records a trialling checkout mapping to `active`, so every trialling
  account was told its plan renews. Here the payload states `trialing`
  outright — so the mapping is easier *and* the test is mandatory (T4).

---

## 6. The code, file by file

**All of §6 shipped on 1 September 2026.** What each item actually landed as is
marked below; where it differs from what was planned, §13 says why.

### 6.1 · Migration — 15 min

New file in `supabase/migrations/`, applied through the Supabase MCP. **The
existing `20260823040428_m3_subscriptions.sql` is not edited** — applied
migrations are a record.

```sql
alter table public.subscriptions drop constraint subscriptions_provider_check;
alter table public.subscriptions add constraint subscriptions_provider_check
  check (provider in ('creem', 'whop', 'polar', 'dodo', 'manual'));
```

`creem` stays. It is history, but a row written under it is still a row.

### 6.2 · `lib/billing/signature.ts` — 45 min

Kept. The standard-webhooks branch already reads `webhook-id`,
`webhook-timestamp` and `webhook-signature`, checks the 5-minute window in both
directions, and walks space-separated `v1,<sig>` candidates for rotation. All of
that is correct for Whop unchanged.

Two edits:

- **Key derivation.** Creem's secret was `whsec_`-prefixed base64 and the code
  strips and decodes it. Whop's is a `ws_` string passed as-is. Implement the
  UTF-8-bytes-of-the-whole-string branch, keep the base64 branch behind the
  prefix test, and let T1 in the sandbox confirm which Whop actually uses.
- **Delete the legacy `creem-signature` branch** and its tests. Whop has no
  second scheme; an accepted fallback is an accepted weakness.

Rename the export to `verifyWhopSignature`, and update the module comment — it
currently explains itself in terms of Creem's two schemes.

### 6.3 · `lib/billing/plans.ts` — 1 h

Same file, same doctrine, new nouns.

- `PRODUCT_ENV` → `PLAN_ENV`: `{ pro: 'WHOP_PLAN_PRO', elite: 'WHOP_PLAN_ELITE' }`.
- `planForProduct` → `planForWhopPlan`, keyed on the membership's `plan_id`.
- `checkoutConfigured()` — drop the `creem_live_` prefix test; require
  `WHOP_API_KEY`, `WHOP_ACCOUNT_ID` and both plan ids, and require the live base
  in production unless rehearsing.
- `apiBase()` moves here from `checkout.ts` as a read of `WHOP_API_BASE` with the
  production default, plus `isLiveBase()`.
- `billingEnvironmentRefusal()` — refuse in production when the base is not
  `api.whop.com`, unless `rehearsing()`.
- `takingRealPayments()` — `isLiveBase()`.

**Keep every comment that explains *why* a guard exists**, rewritten for the new
mechanism. The reasoning in that file — a test key in production sells nothing
and grants everything — is the same hazard with a different discriminator.

### 6.4 · `lib/billing/events.ts` — 1.5 h

`INTENTS` becomes §5's table. `toBillingEvent` simplifies:

```
eventId                 root.id                     (msg_…)
type                    root.type
occurredAt              Date.parse(root.timestamp)   ISO 8601, not epoch
userId                  data.metadata.user_id
providerCustomerId      data.user_id                 (user_…)
providerSubscriptionId  data.id                      (mem_…)
productId → planId      data.plan_id                 (plan_…)
currentPeriodEnd        data.current_period_end
cancelAtPeriodEnd       data.cancel_at_period_end
status                  data.status, narrowed by the intent
```

Two things to carry over rather than reinvent:

- `readUserId` keeps its shape but only needs `data.metadata.user_id` — Whop
  copies checkout metadata onto both the payment and the membership, so one
  lookup covers every event. Keep it as a function anyway; it is where a second
  location would go.
- The seconds-vs-milliseconds coercion is gone. Whop sends ISO 8601.

Add an `account_id` check — an event whose `account_id` is not
`WHOP_ACCOUNT_ID` is refused before anything else. Cheap, and it stops a
correctly-signed event for somebody else's account.

### 6.5 · `lib/billing/checkout.ts` — 2 h

`createCheckout` becomes:

```
POST {WHOP_API_BASE}/checkout_configurations
Authorization: Bearer {WHOP_API_KEY}
Api-Version-Date: {WHOP_API_VERSION_DATE}
Idempotency-Key: {userId}:{plan}
{
  "plan_id":      planIdFor(plan),
  "metadata":     { "user_id": userId },
  "redirect_url": `${origin}/profile/subscription?bought=1`
}
→ 200 { "purchase_url": "https://whop.com/checkout/ch_…/" }
```

Read `purchase_url` defensively the way the portal reader does today — one field,
but the same failure mode. `Idempotency-Key` replaces Creem's `request_id`, so a
double-clicked buy button still returns one session.

`createBillingPortal` is **deleted** and replaced by:

```
POST {WHOP_API_BASE}/memberships/{membershipId}/cancel
{ "cancel_at_period_end": true }
```

The comment block above `createBillingPortal` explains why a working cancel has
to ship with the trial rather than after it. That reasoning survives the change
of mechanism — carry it across, and add the new fact: cancelling is now one
button in our own UI, which is what `TRIAL_NOTE` has claimed all along.

### 6.6 · `app/api/webhooks/whop/route.ts` — 1 h

Move `app/api/webhooks/creem/route.ts`. Same sequence, four changes:

1. `WHOP_WEBHOOK_SECRET` unset → **503**. Still correct: Whop holds the event for
   ~71 hours, so a missing variable costs a delay, not the sale.
2. `verifyWhopSignature`; bad signature → 401. Whop is not deterred by a 4xx the
   way Gumroad was — it simply stops retrying, which is right for a request that
   will never verify.
3. New: `account_id !== WHOP_ACCOUNT_ID` → log, 200, ignored.
4. Everything after — the environment refusal, `toBillingEvent`, the 200-and-shrug
   for unknown types, `applyBillingEvent`, the 500 for transient failure — is
   unchanged. The comments at the top of that file are the best explanation of
   the design in the codebase; keep them and update the provider name.

### 6.7 · `lib/billing/apply.ts` — 20 min

`provider: 'creem'` → `'whop'`. The unmapped-product error message names
`CREEM_PRODUCT_*`; it becomes `WHOP_PLAN_*`. `resolveUserId`'s fallbacks by
`provider_subscription_id` (now `mem_…`) and `provider_customer_id` (now
`user_…`) work as written. Nothing else moves.

### 6.8 · `app/profile/subscription/actions.ts` + screens — 2 h

- `startCheckout` keeps its shape and its plan validation. Add D2's guard: refuse
  a trialling checkout for an account whose mirror shows it has already had one.
- `openBillingPortal` → `cancelSubscription`. Reads `provider_subscription_id`
  off the mirror for the signed-in user — **never from the form**, the rule that
  file already follows — and calls the cancel endpoint. Returns
  `{ ok, message }`; writes nothing.
- Optimistic UI on the cancel, per §02, and a confirm step, because it is
  destructive from the user's side.
- `components/screens/profile-screens.tsx` names the provider in visible copy.
  Rewrite, and re-read `TRIAL_NOTE` in `lib/site/plans.ts` against what the
  button now does — for the first time the sentence is exactly true, so this is
  a chance to make it plainer, not to weaken it.

### 6.9 · `scripts/verify-whop.ts` → `npm run whop:verify` — 2 h

Replaces `scripts/verify-creem.ts`, keeping its structure: a preflight that
refuses to call the deployment ready.

- every variable set; `checkoutConfigured()` true
- `GET /accounts/me` succeeds and its id equals `WHOP_ACCOUNT_ID`
- the configured base is live, or a loud WARN naming the sandbox
- `GET /plans/{id}` for both plans: exists, `plan_type: renewal`,
  `billing_period: 30`, `currency: usd`, `trial_period_days: 7`,
  **price equals `PUBLIC_PLANS`** (in whichever unit T2 establishes),
  `visibility` not `visible`
- both plans belong to the same product
- `GET /webhooks` — exactly one enabled webhook, pointing at the production URL,
  subscribed to all nine events in §5, with a version pin
- `GET /webhooks/{id}/deliveries` — no recent failures
- `WHOP_TEST_MODE_IN_PRODUCTION` unset, else hard WARN and "not ready"
- `--checkout` opens a real configuration against the sandbox only, and refuses
  on a live base, exactly as `creem:verify` does today

### 6.10 · Tests — 3 h

- `signature.test.ts` — kept. Drop the legacy-scheme cases, keep every
  standard-webhooks case, add a real captured Whop delivery as a fixture once T1
  has produced one.
- `events.test.ts` — rewrite against §5's table, case for case. **Must include:**
  a trial activation reading as `trialing` and not `active` (the 1 September
  bug); `cancel_at_period_end_changed` recording rather than revoking; a dispute
  refusing to be talked out of revoking by an `active` status in the payload; a
  redelivery with the same `webhook-id`; an event for the wrong `account_id`.
- `plans.test.ts` — rewrite for plan-id mapping and the base-URL discriminator,
  including production-with-a-sandbox-base refusing.
- `scripts/verify-billing.ts` (`npm run db:billing`) — **ported, not renamed.**
  It drives grant, upgrade, dunning, expiry, dispute and replay against the real
  project with synthetic events; every one of those payloads changes shape.

### 6.12 · `scripts/setup-whop.ts` → `npm run whop:setup` — shipped 2 Sep

Not in the original plan, and it replaces most of §7.

§7 is a list of things to click, and four of the values on it are ones a person
can get wrong in a way nothing later catches: a missing `trial_period_days`
charges the card on day zero against a product that promises seven free days on
four surfaces; a `renewal_price` in the wrong unit sells Pro for $1,900; a plan
left `visible` lists us on Whop's public marketplace; a webhook missing one of
the nine events is a silent gap in the billing loop.

So the setup is a script instead. It reads the prices, the trial length and the
plan names from `PUBLIC_PLANS` — the same authored record `/pricing` and the
subscription screen read, so there is no second copy of a price to drift — and
it creates the product, both plans and the webhook in one pass.

- **Dry run by default.** `npm run whop:setup` says what it would do and writes
  nothing. `-- --apply` does it.
- **Idempotent.** It finds what it is about to create and updates rather than
  duplicates. It never deletes. A second run is a no-op that prints the ids.
- It prints the webhook signing secret **once**, because that is the only time
  Whop returns it, and then prints the exact environment block to paste.

Two things it deliberately does not do. It cannot mint the API key — no API
creates one, so that stays a dashboard step and is the only one. And it cannot
set the terms, privacy or refund URLs: those are absent from the account update
schema entirely, so they are dashboard-only and the script says so in its output
rather than failing quietly.

### 6.13 · The email before the first charge — shipped 2 Sep

`lib/email/trial.ts`, `lib/email/send.ts`, `lib/billing/notify.ts`, fired from
the webhook route on `membership.trial_ending_soon`.

Terms clause 07 and `TRIAL_NOTE` have both said "we will email you before that
first charge" since 31 August, and nothing sent it — the promise was made on
three surfaces and kept on none. It is the third of §8's three mitigations and
the other two already shipped.

- The content is a **pure function with thirteen tests**, for the same reason
  the rep rules are: what this email says is a promise about somebody's money.
  The tests assert it names the amount and the date, says nothing has been
  charged yet, says the cancel takes one tap and no conversation, reads the
  date in UTC rather than the server's timezone, **never guesses a date it was
  not given**, makes no clinical claim, and does not ask anybody to stay.
- **No `RESEND_API_KEY` means no mail, and that is a supported configuration.**
  Every send becomes a logged no-op. That default is load-bearing: this runs
  inside a billing webhook, and an email provider having a bad afternoon must
  never turn a recorded event into a 500 and twelve redeliveries — twelve more
  chances to send the same person the same mail.
- **Leave it unset until Whop is asked whether it already sends one.**
  `send_customer_emails` is on for the account and Whop's docs do not say
  either way. Two emails about the same charge is worse than one.

### 6.11 · Cleanup — 30 min

`package.json` (`creem:verify` → `whop:verify`), `.env.example`, and delete
`app/api/webhooks/creem/`, `scripts/verify-creem.ts`, `lib/billing/checkout.ts`'s
Creem hosts. Then:

```bash
grep -ri creem lib/ app/ components/ scripts/ package.json
```

**Amended — see §13.8.** No Creem code path, endpoint, environment variable or
npm script remains, and that is what the sweep is for. What it still returns is
prose in comments explaining why a guard exists, plus one test asserting that a
`creem-signature` header is now *refused*. Those stay: the rule is to keep the
why. Matches in `docs/` and the one migration are correct and stay too.

---

## 7. Manual setup — what you do

### A · Sandbox first, before any code is deployed

1. Create the sandbox account at **`sandbox.whop.com`**. It is a separate account
   from production with its own keys.
2. Create an API key. Note the base: `https://sandbox-api.whop.com/api/v1`.
3. Create a product **Nerve**, then two plans:

   | | Pro | Elite |
   |---|---|---|
   | `plan_type` | renewal | renewal |
   | `billing_period` | 30 days | 30 days |
   | price | $19 | $49 |
   | `trial_period_days` | 7 | 7 |
   | `currency` | usd | usd |
   | `visibility` | hidden | hidden |

4. Create a webhook pointing at your tunnel (`ngrok`/Cloudflare — Whop rejects
   `localhost` and private addresses), subscribed to the nine events in §5, with
   an `api_version_date` pin. **Copy the `ws_` secret immediately; it is shown
   once.**
5. Send a test event from the dashboard menu before writing any handler, and
   look at it in `GET /webhooks/{id}/deliveries` — request, response code,
   response body, timing, kept 30 days. That is the debugging surface.

### B · Production account

6. Complete **identity verification (KYC)**. Whop requires it before payouts, and
   an unverified account with a sudden run of subscriptions is the shape that
   triggers a review.
7. Attach a payout method. **ANSWERED, 2 September, and it is good news:
   Sri Lanka gets local bank transfer, not crypto.** Queried against the live
   account through `payouts/supported-methods`:

   - Every major Sri Lankan bank is a supported destination — Commercial Bank
     of Ceylon, Hatton National, Bank of Ceylon, DFCC, Sampath, Amana, Cargills,
     plus the international branches.
   - **Delivery in LKR or in USD**, depending on the bank. Commercial Bank,
     HNB, BOC, Amana and Indian Bank all offer USD delivery, which avoids a
     forced conversion at their rate.
   - **A flat $3.70 per withdrawal.** On a $500 payout that is 0.74%, and it
     does not scale with the amount — so batch withdrawals rather than taking
     them weekly. Compare Creem's €7 or 1%.
   - Standard delivery in **1–2 business days**. Minimum $10, maximum ~$15,400
     per payout (~$25,000 at some banks).

   No exchange-control question to put to an accountant, because nothing has to
   touch crypto. `withdrawal_schedule` is currently `manual`, which is the right
   default — nothing leaves until you ask for it.
8. Confirm **whether the 3% platform fee applies to a plain checkout link**, or
   only to Discord/Telegram-gated sales. It is the difference between ~5.7% and
   ~2.7% + $0.30, and it changes D2 in `LAUNCH-GAP.md`.
9. Create the product and the two plans again, on the live account, identically.
10. Create the live webhook at `https://hellonerve.com/api/webhooks/whop`.
11. **Storefront copy.** Whop has a public marketplace — keep the product
    unlisted, and write the description as the training product, not the wedge.
    It is a public page a reviewer reads before yours. State the bounded
    three-minute scored rep, process-not-outcome, 18+, PG-13, and
    "training, not therapy or clinical care". Refund terms matching Terms
    clause 07.

### C · Deploy and rehearse

12. All eight variables into Vercel (production scope), then **redeploy** —
    Vercel does not apply new variables to an existing deployment.
13. Set `WHOP_TEST_MODE_IN_PRODUCTION`, run §8's tests against the real domain,
    then **unset it and redeploy in the same edit**.

---

## 8. Test plan

Run T1–T6 in the sandbox, T7–T10 against production during the rehearsal.

| | Test | Passes when |
|---|---|---|
| T1 | Signature verification against a real delivery | The `ws_` key branch is settled and a tampered body is refused |
| T2 | Create both plans via API, read them back | Prices match `PUBLIC_PLANS`; units established |
| T3 | Checkout → membership | `metadata.user_id` arrives on `membership.activated` |
| T4 | **Trial activation** | `subscriptions.status = 'trialing'`, and `/profile/subscription` says the card is charged on day 7 — not "renews" |
| T5 | Entitlement | `reps_per_day` is 3 on Pro, and a voice rep actually opens |
| T6 | Cancel from our own UI | `cancel_at_period_end` true, **access continues**, webhook updates the mirror |
| T7 | Second trial on the same account | Refused by D2's guard; note separately what Whop itself does |
| T8 | Redelivery and out-of-order | Same `webhook-id` twice changes nothing; a stale event does not reinstate a revoked plan |
| T9 | Dispute | Access revoked immediately, whatever `status` the payload carries |
| T10 | Wrong `account_id` | Logged, 200, nothing applied |

**T1, T8 and T10 no longer need a Whop account.** `npm run whop:probe` signs its
own deliveries and fires them at a running route — the correct signature, a
tampered body, a wrong secret, a stale timestamp, a foreign `account_id`, an
event type we ignore, and a malformed body — asserting the status code each one
comes back with. The payloads carry a `user_id` belonging to nobody, so nothing
it sends can grant a plan and it is safe to point at production. It does not
replace T1 against a real delivery; it means a broken route is caught before one.

Then the standing gates: `npm run typecheck && npm run lint && npm test &&
npm run build:check`, `npm run db:billing`, `npm run db:verify`,
`npm run whop:probe` against the deployment, and `npm run whop:verify` clean
against production.

---

## 9. Go-live checklist

- [ ] `WHOP_TEST_MODE_IN_PRODUCTION` removed and redeployed
- [ ] `WHOP_API_BASE` is `https://api.whop.com/api/v1`
- [ ] `npm run whop:verify` clean, no warnings
- [ ] Exactly one enabled webhook, all nine events, no recent failed deliveries
- [ ] Both plans hidden; product unlisted on the marketplace
- [ ] Prices identical on `/pricing`, in `PUBLIC_PLANS`, and on both Whop plans
- [ ] Refund policy on Whop matches Terms clause 07
- [ ] `grep -ri creem lib/ app/ components/ scripts/` returns only comments and the one refusal test (§13.8)
- [ ] Log entry in `PAYMENTS-APPROVAL.md` §7

**Rollback** is one variable: unset `WHOP_API_KEY` and `checkoutConfigured()`
goes false, the buy button hides, and the screen falls back to the notify-me
list. It does not require a deploy of code.

---

## 10. Documents to update, in the same commit

| Document | What moves |
|---|---|
| `CLAUDE.md` | "Merchant of record (Creem primary)" → Whop; `creem:verify` → `whop:verify` in the verify block |
| `docs/README.md` | The index row and the which-doc-for-which-change table |
| `docs/NERVE-SPEC.md` §14 | The provider table and the fee arithmetic |
| `docs/PAYMENTS-NEW-INTEGRATION.md` | §6 is Creem setup end to end. Mark it superseded, point here; do not rewrite §11 or §12 |
| `docs/PAYMENTS-APPROVAL.md` | §2's table, a §7 log entry, and §8 — Whop is a fourth path §8 does not have |
| `docs/PAYMENTS-GUMROAD.md` | Header note: second choice |
| `docs/LAUNCH-GAP.md` | B2, and D2's price maths against the new fee |
| `docs/DATA.md` | The widened `provider` constraint |
| `.env.example` | The Creem block replaced, comments and all |

---

## 11. Risks

- **The category, still.** Whop's prohibited list does not name dating,
  companionship or AI, and its guidelines age-gate "dating" as a supported
  category — the first provider on the list where that is true. But enforcement
  is reactive: no pre-approval gate means no rejection at the door, and also
  means suspension is possible later with live subscriptions and a balance.
  §8.A of `PAYMENTS-APPROVAL.md` is still worth doing on its own merits.
- **The `ws_` key derivation** is the one unknown that can block T1. Budget an
  hour and read a real delivery rather than guessing.
- **Whop's centre of gravity is Discord communities and courses.** Selling access
  to an external SaaS is fully supported — checkout configurations, webhooks,
  memberships, OAuth — but we are not the mainstream use case, so expect the odd
  rough edge in docs and dashboard.
- **Buyers may need a Whop account.** §2.5. A conversion cost, not a correctness
  one, but measure it before spending on acquisition.
- **Beta surface.** Several endpoints we depend on sit under `/api-reference/beta`.
  Pin `Api-Version-Date` on every request and on the webhook, which is exactly
  what the pin is for.

---

## 12. Log

| Date | Event |
|---|---|
| 1 Sep 2026 | Creem declined, final. Gumroad planned as the bridge (`PAYMENTS-GUMROAD.md`) |
| 1 Sep 2026 | Whop assessed and chosen over Gumroad: signed webhooks on the same spec Creem used, a checkout API with metadata, a sandbox, a server-side cancel, and roughly half the fee. This plan written. Account being created; nothing built |
| 1 Sep 2026 | **§6 built and verified.** Migration `20260901180000_whop_provider.sql` applied; `signature.ts` → `verifyWhopSignature` with the `ws_` derivation asserted; `plans.ts` keyed on `plan_` ids with the base URL as the sole environment discriminator; `events.ts` rewritten against §5's table and the real payload shapes; `checkout.ts` → checkout configurations and a server-side cancel; `app/api/webhooks/whop/route.ts` with the account check; `apply.ts` writing `provider: 'whop'`; the subscription screen's Manage button replaced by a confirmed in-app Cancel plus a "Card and invoices" link; `scripts/verify-whop.ts` / `npm run whop:verify`; all three test files rewritten; `verify-billing.ts` ported to Whop payload shapes. Gates: typecheck, lint, 1156 tests, `build:check`, `db:billing`, `db:verify` all pass. **§7 is not done — no product, no plans, no webhook, no keys, so nothing can be sold yet.** |
| 1 Sep 2026 | Five of §2's six open questions answered from the OpenAPI specification rather than from the sandbox; three of them contradicted §5/§6 and the code follows the specification. Recorded in §13. The sixth — whether checkout forces a Whop account — is still open and is now known to be un-prefillable: the checkout endpoint takes no email field |

---

| 2 Sep 2026 | **§7 automated.** `npm run whop:setup` creates the product, both plans and the webhook from `PUBLIC_PLANS`, dry-run by default and idempotent — see §6.12. Only two things stay manual and both are documented in its output: minting the API key (no API creates one) and the terms/privacy/refund URLs (absent from the account update schema entirely) |
| 2 Sep 2026 | **The email before the first charge shipped** (§6.13). Clause 07 and `TRIAL_NOTE` had promised it since 31 August with nothing behind it. Pure content function, thirteen tests, no key means no mail. Left unkeyed pending an answer from Whop on whether they send one already |
| 2 Sep 2026 | Two more of §2's open questions answered against the live account: **trial eligibility is per person and Whop enforces it themselves** (§2.4), and **Sri Lanka gets local bank transfer in LKR or USD at a flat $3.70, not crypto** (§7.7). The last open question is §2.5, whether checkout forces the buyer to make a Whop account — which only a real checkout answers |
| 2 Sep 2026 | The account's industry corrected from `health_and_wellness / mental_health_app` to `personal_development / communication_coaching`. The original contradicted terms clause 08 and rule 10 — a processor's own record of us should not say the opposite of our legal page |
| 2 Sep 2026 | **§7 ran against the live account.** Product `prod_DlhZq3oMd4QHd`, plans `plan_pyrhOCBHYRnFW` (Pro) and `plan_m0JD4mhTqeZnk` (Elite), webhook `hook_uBtOKRs6GhyR8`. `whop:verify` clean, 0 failed 0 warnings. All seven variables in Vercel production. A live hidden plan was confirmed to mint a real `purchase_url` — the one risk in D1 that could have made the whole approach unsellable. Four undocumented API facts recorded in §13.9. Committed on `whop-payments`; **not deployed** |
| 2 Sep 2026 | **The trial email was silently sending nothing.** The sender was `nerve@send.hellonerve.com`, from a stale line in `PAYMENTS-APPROVAL.md`'s log; the domain verified on the Resend account is the apex. Resend refuses an unverified sender, `sendEmail` swallows the failure by design, and the route answered 200 with no mail sent — the failure this mitigation exists to prevent, from inside the mitigation. Sender is now `nerve@hellonerve.com` with replies to support, and **`whop:verify` asks Resend which domains are verified and fails if the sender is not one of them**. Proven end to end: a real `membership.trial_ending_soon` against production produced a real Resend email with the right subject, amount, date and cancel link |
| 2 Sep 2026 | Related and worth remembering: a Vercel env var added *after* a deployment starts is not in that deployment. The Resend key was added a minute into a build, so the first two attempts sent nothing for that reason before the sender bug was even reachable |
| 2 Sep 2026 | **First real purchase — and it exposed the worst bug in the migration.** `membership.activated` sends FLAT ids (`plan_id`, `user_id`, `current_period_end`) where the OpenAPI spec documents nested objects; `payment.succeeded` nests them as documented. The membership event resolved no plan, failed closed and was dropped, and the account landed on Pro **with no charge date** — §14's trial-ending-quietly failure. Fixed to read both spellings, with the real captured payloads pinned as fixtures (§13.11) |
| 2 Sep 2026 | Repairing that surfaced a second, independent hole: both events are emitted in the same second, order is not guaranteed, and only the membership carries the period — so a payment landing first makes the membership event *stale* and `shouldApply` drops it. A stale event may now fill an unset field and change nothing else (§13.12). Would have recurred on some fraction of every future purchase |
| 2 Sep 2026 | The first subscription repaired by replaying the dropped delivery once both fixes were live. `entitlements.renews_at` and `subscriptions.current_period_end` both read `2026-09-09T14:56:27Z`; status `trialing`, plan `pro`, 3 reps a day |
| 2 Sep 2026 | **Deployed to production.** `elevenlabs-pipeline` merged fast-forward and pushed; Vercel is git-linked and released it. `whop:probe` and `whop:verify` both clean against `www.hellonerve.com`. Every public page 200s. **The buy button is live and real cards can be charged** |
| 2 Sep 2026 | **The apex redirects to `www`, and the webhook had been registered against the apex** — §13.10. Repointed, along with `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL` and `PRODUCTION_FALLBACK`. The `og:image` was answering 308, so every social share of a site about to be marketed would have risked a blank card |
| 2 Sep 2026 | Whop's `POST /webhooks/{id}/test` answers `success: true` with every field null and logs **no delivery**. So a Whop-sent delivery has still never been observed end to end — what is proven is that the route verifies signatures made with the production secret, which `whop:probe` does against the live domain. The gap closes on the first real purchase |
| 2 Sep 2026 | Saving Whop's Business settings form **reverted the industry** to `health_and_wellness / wellness_app`. Re-set through the user token. Worth knowing before touching that form again |
| 2 Sep 2026 | **The policy documents turned out to need PDFs, not URLs.** `npm run legal:pdf` renders the real pages through headless Chrome and re-wraps them in a print stylesheet — Arena is dark, and a black A4 page is unreadable printed and looks broken to a reviewer. Four documents: terms, privacy, return policy, acceptable use. Whop needs the first three. A discrete return policy did not exist, so `RefundDocument` and `/legal/refunds` were added, restating clause 07 rather than inventing anything — two documents describing the same refund are two chances to disagree, and the one a disputing customer quotes is whichever is more generous |
| 2 Sep 2026 | The account's industry corrected to `personal_development / communication_coaching` **through a user token**, after `PATCH /accounts/{id}` with an account API key answered 404 for its own `biz_`. Recorded in §13.9: an Account API key updates its *connected* accounts, never itself |
| 2 Sep 2026 | Two bugs fixed in `whop:verify` itself, both found by running it for the first time against a configured account: it called `GET /webhooks` without the required `account_id` and reported the webhook unreadable, and it printed `pass  this is the SANDBOX base` on a LIVE deployment — a check that reports backwards is worse than one that does not run |
| 2 Sep 2026 | `SITE_ORIGIN`'s production fallback moved from the generated Vercel domain to `hellonerve.com`. Unrelated to Whop and found on the way: canonical tags, sitemap entries and OpenGraph image URLs are all things other people see and cache |

---

## 13. What the specification said that this plan did not

Written while building §6, from `docs.whop.com/openapi/api-v1-stable.json` (the
webhook payloads) and `…/api-v1-native.json` (plans, products, accounts,
webhooks). **Where the two disagreed, the specification won and the code follows
it.** Each item below is a thing §5 or §6 got wrong from the prose alone, and
each one would have been a silent failure rather than a loud one.

### 13.1 · The membership does not have the flat fields §6.4 lists

§6.4's read table assumed `data.plan_id`, `data.product_id`, `data.user_id` and
`data.current_period_end`. None of those exist. The membership carries **`plan`,
`product` and `user` as nested objects** and the period is
**`renewal_period_end`**. The existing `idOf()` helper already reads both a bare
string and a `{ id }`, so the fix was one field name and no new machinery.

### 13.2 · `data` is not always the membership

This is the substantive one, and it is why `toBillingEvent` walks
`data.payment ?? data` rather than reading fields directly:

| event | `data` is | membership | plan | metadata |
|---|---|---|---|---|
| `membership.*` | the membership | `data.id` | `data.plan` | `data.metadata` |
| `payment.*` | the **payment** | `data.membership` | `data.plan` | `data.metadata` |
| `refund.created` | the refund | `data.payment.membership` | `data.payment.plan` | `data.payment.metadata` |
| `dispute.created` | the dispute | `data.payment.membership` | `data.plan` | **none** |
| `invoice.past_due` | the invoice | **none** | `data.current_plan` | **none** |

Two consequences that are product decisions rather than parsing details:

- **A payment's `status` is the PAYMENT's status.** `succeeded`, `failed` — not
  a membership status. Reading `data.status` on a payment event would have put
  nonsense in the mirror; the membership's own status is at
  `data.membership.status`. `membershipStatus()` exists for exactly this, and it
  is what stops the 1 September trial bug recurring through a second door: a
  `payment.succeeded` on a still-trialling membership reads `trialing`.
- **A dispute carries no metadata**, so it can only be attributed through
  `data.payment.membership` and `data.payment.user` falling back to the mirror
  in `resolveUserId`. Losing either id in the parse would mean a chargeback that
  never revokes — which §14 says is the pattern that closes the account.

### 13.3 · Only membership events carry the period and the cancel flag

`payment.succeeded`, `payment.failed`, `refund.created`, `dispute.created` and
`invoice.past_due` carry **neither** `renewal_period_end` nor
`cancel_at_period_end`. Writing their absence straight through would have:

- blanked the renewal date on `/profile/subscription` on **every renewal**, and
- silently un-cancelled a subscription the moment its card failed.

So `BillingEvent.currentPeriodEnd` and `.cancelAtPeriodEnd` are nullable and
null means *this event does not say*. `applyBillingEvent` keeps the stored value
in that case, and does the same for the two provider ids — `invoice.past_due`
names the user but not the membership, and losing the `mem_` would break the
cancel button for the account whose payment has just failed. `db:billing`
asserts all three.

### 13.4 · Cancel takes `cancellation_mode`, not `cancel_at_period_end`

§6.5 has `POST /memberships/{id}/cancel` with `{ "cancel_at_period_end": true }`.
The endpoint takes **`cancellation_mode`**, an enum of `at_period_end` or
`immediate`, defaulting to `at_period_end`. We send it explicitly rather than
relying on the default, because the default is the one that keeps somebody's
access and a silent change to it would revoke on cancel.

### 13.5 · `purchase_url` may be a path

The specification describes it as "a URL you can send to customers… It looks
like `/checkout/ch_xxxx/`". It comes back absolute today. `absoluteCheckoutUrl()`
anchors a relative one to `https://whop.com` — two lines against the day a
leading slash sends a buyer to our own 404 instead of a payment page.

### 13.6 · Idempotency is a header

`Idempotency-Key`, and on a pinned version **the `idempotency_key` body field is
rejected**. Both `createCheckout` and `cancelMembership` send the header.

### 13.7 · The envelope may say `company_id`

A webhook pinned to `2026-08-14` or later sends `account_id`; one pinned earlier,
or with **no pin at all**, still sends `company_id`. `readAccountId` reads both.
Reading only the new name would have made the route's account check refuse every
event from an unpinned webhook — a total outage that looks like nothing.

### 13.11 · The specification is not the payload

**The most expensive finding in this document, and it took a real purchase to
make it.** §13.1 and §13.2 were written from `api-v1-stable.json` and are
correct about `payment.*` and wrong about `membership.*`.

What `membership.activated` actually sent on 2 September, pinned `2026-08-31`:

```
data.plan_id            plan_pyrhOCBHYRnFW      not data.plan.id
data.product_id         prod_DlhZq3oMd4QHd      not data.product.id
data.user_id            user_ZbQ2ZYU6qjfpE      not data.user.id
data.current_period_end 2026-09-09T14:56:27Z    not data.renewal_period_end
data.manage_url         — absent entirely —
```

Flat scalars, where the specification documents nested objects. `payment.*`
nests them exactly as documented, so the two families disagree with each other
and the spec describes only one.

The consequence, on the first paying customer: `membership.activated` resolved
no plan, failed closed and was dropped. `payment.succeeded` — which carries no
period — then created the row. **The account got Pro with no charge date on
it**, so `/profile/subscription` would have said "No card on file. Nothing
renews and nothing is charged" to somebody whose card is charged in seven days.
That is the §14 failure the whole trial design exists to prevent, reached
through a door nobody was watching.

Every id is now read in both spellings, and `events.test.ts` pins **the real
captured payloads of both events, verbatim**. They are the only fixtures in
that file Whop actually sent; every other one was written by a person, which is
precisely what let this through. §6.10 asked for a real delivery as a fixture
once T1 produced one — this is that, and the lesson is that it should have
blocked the first sale rather than followed it.

### 13.12 · Order is not guaranteed, and only one event knows the date

The same purchase, found while repairing it.

Both events are emitted **in the same second**, and Whop is explicit that
delivery order is not guaranteed. Only the membership event carries the period.
So when the payment lands first, the membership event that follows is *older by
timestamp*, and `shouldApply` — correctly — refuses to let it move the plan.

Refusing to let it move the plan is not the same as refusing to read it.
Dropping it whole reproduces §13.11's symptom from a completely different
cause, and it would have recurred on some fraction of every future purchase.

So `applyBillingEvent` now lets a stale event **fill a field that is unset, and
never change one that is not.** It still cannot touch the plan, the status or
the entitlement: a late `payment.succeeded` cannot resurrect a plan a dispute
revoked, which is the entire reason `shouldApply` exists. `db:billing` drives
all six of those assertions through the real tables.

### 13.10 · The apex redirects, and the webhook was pointed at it

Found on the first production deploy, and the most dangerous thing in this
document.

`hellonerve.com` **308-redirects to `www.hellonerve.com`**. The webhook was
registered against the apex, because that is the address written throughout
these docs and nobody had checked which way the redirect ran.

A browser follows a 308 without anybody noticing. **A webhook sender is a
different animal** — plenty treat any 3xx as a failed delivery, and Whop's own
retry schedule would then have burned twelve attempts over three days against a
redirect before disabling the endpoint. A billing webhook that fails every
delivery is a product where nobody who pays ever gets their plan: silent, total,
and invisible until somebody has already been charged.

Two more things were pointed at the apex for the same reason:

- `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL` in Vercel production, which
  put `https://hellonerve.com/og.png` in the `og:image` tag — a **308, not a
  200**. Some social scrapers follow that and some render a blank card, which is
  precisely the failure `lib/site/origin.ts` was written to prevent, arrived at
  from the other direction. On a site about to be marketed, every share would
  have been a blank preview.
- `PRODUCTION_FALLBACK` in that same file.

All three now name `www`. The rule worth keeping: **whatever goes in a webhook
URL, a canonical tag or an OG image has to be the host that answers 200 without
a hop, not the one that looks tidier.**

### 13.9 · Four things only the live account could teach

Found by running §7 against production on 2 September. None of them are in the
specification, and each cost one failed call to discover.

- **`GET /webhooks` requires `account_id`.** On `/products` and `/plans` it is a
  filter; here its absence is a 400, not an empty list. This was wrong in
  `whop:verify` too, where it reported the webhook as unreadable on a correctly
  configured account.
- **An Account API key cannot update its own account.** `PATCH /accounts/{id}`
  answers **404**, not 403, for the key's own `biz_` — the endpoint is for
  *connected* accounts. So the industry, description and target audience are
  dashboard-only in practice, whatever the schema says.
- **The `nerve` product slug was already taken**, globally rather than per
  account. The account had no products at all and creation still failed with
  "this whop link is already in use". It is `hellonerve` now.
- **A `hidden` plan still mints a checkout.** This was the real risk in D1 —
  hiding the plans from Whop's marketplace could have hidden them from
  `POST /checkout_configurations` as well, which would have made the whole
  approach unsellable. It does not: a live hidden plan returns an absolute
  `purchase_url` with our `metadata.user_id` intact. Verified against
  `plan_pyrhOCBHYRnFW` on 2 September.

### 13.8 · The grep in §6.11 does not come back empty, on purpose

`grep -ri creem lib/ app/ components/ scripts/ package.json` returns twenty
matches. Every one is either prose in a comment explaining why a guard exists
(rule: keep the *why*), or the one test that asserts a `creem-signature` header
is **refused** now that the legacy scheme is gone. No Creem code path, endpoint,
environment variable or npm script remains. The checklist item is amended to say
that rather than to demand the comments be stripped.