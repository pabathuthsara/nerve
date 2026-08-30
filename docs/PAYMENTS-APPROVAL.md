# Getting approved to take money

The merchant-of-record application: why it is the shape it is, what a reviewer
opens when they look at us, what is ready, and what still has to be true before
we submit.

This is a tracking document. `NERVE-SPEC.md` §14 is the decision and does not
change; `LAUNCH-GAP.md` B2 is the engineering that follows approval. **This page
is the bit in between** — the application itself, which is not code and which
nobody can start on our behalf.

**Status as of 28 August 2026: not submitted. Two things block submission, and
neither is a build task.** The third was moderation, and it shipped the same
day. See [Before we submit](#before-we-submit).

> **Revised 30 August 2026, after checking every claim on this page against the
> live site rather than against the repo.** Three of them were wrong, and the
> first two are the kind of wrong that fails an application:
>
> 1. **`support@nerve.training` does not exist.** Not "unverified" — the domain
>    has no DNS records at all, no A and no MX. Mail to it bounces. It is
>    printed on every public page and named in all three legal documents as the
>    route for support, for privacy requests and for account deletion.
>    `hellonerve.com` — the domain the product actually runs on — *does* have
>    working mail. §5.2 below is now the top of the list.
> 2. **Production is behind the working tree, and §3's headline claim is false
>    on the live site.** This page says the date of birth is step one of two on
>    its own screen. `hellonerve.com/signup` serves one form with the email
>    field first and a bare `yyyy-mm-dd` box. Everything from 28–30 August is
>    written and unpushed. Worse, the deployed route guard cannot show the
>    §16.4 gate to a Google account at all — see §5.4.
>
> **(1) is fixed in the working tree as of 30 Aug**, along with the mail path
> behind it: a `support@hellonerve.com` mailbox exists, Resend is verified on
> `send.hellonerve.com` with DKIM at the root, DMARC is published at `p=none`,
> and Supabase Auth now sends through Resend instead of its own rate-limited
> sender. `SUPPORT_EMAIL` is one constant again and every surface imports it.
> It reaches a reviewer when §5.3 does.
> 3. **The hero rep is recorded and live.** `public/hero/manifest.json` is
>    committed and the deployed landing page stamps *"recorded · her
>    gpt-realtime, unscripted"*. Notes elsewhere still say the content half of
>    B1 is owed. It is not.
>
> Everything in §4's table below was re-checked the same way. The rows that
> moved are marked.

---

## 1. Why a merchant of record at all

Stripe does not operate in Sri Lanka. A Sri Lankan founder reaches Stripe only
by incorporating abroad, which is a company formation, a foreign bank account
and an accountant before the first dollar arrives.

A merchant of record removes that. The MoR becomes the *seller* of record: it
takes the payment in its own name, and it registers for and remits VAT and
sales tax everywhere the customer happens to live — including Sri Lanka's 18%
on digital services. For one person selling into forty countries that is not a
convenience, it is the difference between compliant and not.

It costs roughly 4–5% plus a fixed fee per transaction, against about 2.9% for a
raw gateway. §14 puts the honest number on it: the $19 tier's margin falls from
about 75% to roughly 68%. That is the price of selling worldwide from Colombo
without a foreign entity, and at this stage it is worth paying.

## 2. Who we apply to, in what order

From §14's table, unchanged:

| Provider | Sri Lankan payout | Cost | Standing |
|---|---|---|---|
| **Creem** | Yes — local bank transfer | 3.9% + $0.40, payout fee €7 or 1% | **Primary.** Cheapest of the viable set and explicitly supports Sri Lanka |
| Polar | Yes — Stripe Connect Express | ≈ 4–5% + fixed | Backup. Its policy names "AI relationship services" as prohibited, and a reviewer could misread us as one |
| Dodo Payments | Yes — markets to emerging markets | Comparable | Third. Newer and less proven |
| Paddle | Not clearly listed | ≈ 5% + $0.50 | Rejected. Bans "dating services/applications, or any other products/services intended for this industry" outright |
| Lemon Squeezy | Yes | ≈ 5% + $0.50 | Avoid. Being folded into Stripe Managed Payments, which reaches far fewer countries — a migration we do not need |

Apply to Creem first and wait. Applying to several at once is not a hedge: each
one runs a human review of the same site, and being declined somewhere is a
thing you may have to disclose later.

The database was built for this. `subscriptions` keeps provider identifiers
deliberately abstract, so being declined by one provider costs a migration
rather than a rewrite (§14, and `DATA.md`).

## 3. The rule that governs everything else

> **Every merchant of record bans dating products.**

Paddle prohibits dating applications by name. Polar prohibits AI relationship
services by name. This is not a billing footnote. It independently validates the
positioning in §01 and makes it *a condition of getting paid at all*.

**A human opens the site during onboarding.** If the landing page leads with
getting her number, we are declined by every provider on this list. If it leads
with training for hard conversations — scored sessions, a bounded rep, no
companionship features — we are an ordinary communication-skills SaaS.

That is why three things already changed in the build:

- The sign-up and log-in screens are public pages, and their pitch block used to
  lead with `Goal — get her number`. It now states the format and the scoring
  law (B1, 27 Aug).
- The footer carries one permanent line on every public page: *18+ only.
  Training, not therapy or clinical care. Sessions are bounded at PG-13.*
- The sign-up form asks for a date of birth and refuses to create an account
  under 18 (B3, 28 Aug). A reviewer opening `/signup` now meets the age gate
  before they meet anything else, which is the order they would want it in —
  and since 30 Aug that is literal: the date of birth is step one of two, on
  its own screen, and no email field appears until it is answered. The picker
  opens on a blank row rather than a plausible date, so passing the gate still
  requires entering one.

Anything added to the public site from here is read by that reviewer. Treat the
site as an application document, not marketing.

## 4. What a reviewer opens today

| What they look for | Where it is | State |
|---|---|---|
| A real product, described plainly | `/` | **Ready.** Landing page with a recorded rep, the scoring law, the loop, the roster, text mode, and what the product is not |
| How it works, in detail | `/how-it-works` | **Ready.** The rep anatomy, the 60/40 split, the memory rule, the field tiers and the ranks |
| Public, unambiguous pricing | `/pricing` | **Ready**, but see D2 below — the page quotes the built plans, not §14's |
| Terms of service | `/legal/terms` | **Written** 27 Aug, clause 02 updated 28 Aug. Eleven clauses, Sri Lankan governing law. A solicitor's pass is still owed (B4) |
| Privacy policy | `/legal/privacy` | **Written** 27 Aug, updated 28 Aug. Nine clauses plus a summary grid; names Supabase and OpenAI as processors, including OpenAI's classifier and what the safety record does and does not hold |
| Acceptable use / safety | `/legal/safety` | **Written** 27 Aug, rewritten 28 Aug. Seven clauses. The PG-13 position stated in full, and every control on it now described in the present tense because it exists |
| Automated content moderation | Both conversation streams | **Built** 28 Aug (B3). Decline in frame, then the rep ends; content involving minors ends it on sight with no in-character answer. Every decision recorded to `safety_events` |
| Refund and cancellation terms | Terms clause 07 | **Ready.** Renews monthly, cancelling stops the next renewal, fourteen days to ask for a refund |
| An age statement | Terms clause 02, every footer, and `/signup` | **Enforced** 28 Aug, and made the first step of sign-up 30 Aug. A date of birth before any other field, checked on the server before the account is created; Google sign-ups and older accounts are asked at `/onboarding/age` before anything else opens |
| A way for a user to report a problem | Every rep's result, scorecard and transcript screen | **Built** 28 Aug (B3). Goes to `safety_events` with the session attached |
| A working support address | `support@hellonerve.com` | **Fixed in the tree, 30 Aug; not yet deployed.** Was `support@nerve.training`, a domain with no DNS at all — no A record, no MX — so every message to the address in the footer, in Settings and in all three legal pages bounced. Now a real mailbox on the domain the product runs on, with a catch-all behind it. `SUPPORT_EMAIL` in `components/site/site-chrome.tsx` is the single record; `profile-screens.tsx` had spelled it out instead, which is how three of the four copies went stale together. **Ships with §5.3** |
| A domain that can send as well as receive | `hellonerve.com` | **Wired 30 Aug.** Resend verified on `send.hellonerve.com` (SPF and bounce MX on the subdomain, DKIM at `resend._domainkey`), so the root MX and root SPF that carry *receiving* are untouched — no second SPF record, which is the usual way this breaks. DMARC published at `p=none`. Supabase Auth sends through Resend rather than its own sender, which is the receiving half of `LAUNCH-GAP.md` B5. **Still owed:** the Private Email DKIM record (`default._domainkey`) is enabled in the panel but not published, so replies sent from the mailbox are SPF-signed and not DKIM-signed |
| A company to pay | — | **Open.** We trade as "Nerve". The entity that signs and the bank account that receives payout have not been recorded anywhere in this repo |
| The site actually serving all of this | `hellonerve.com` | **Live and public, 30 Aug.** Deployment protection is off, so a reviewer reaches it without a Vercel login; all six §11 routes return 200; `robots.txt` and `sitemap.xml` resolve against the real origin. **But it serves the last commit, not the working tree** — see the note at the top and §5.4 |
| A recorded demo that is not a mock | `/` | **Ready, 30 Aug.** The hero manifest is committed and deployed, and the stamp on the live page names the models that actually spoke |

## 5. Before we submit

Two things now, and neither is a build task. The third — moderation — was the
hard prerequisite and it shipped on 28 August.

### 5.1 Moderation · **done 28 Aug** · `LAUNCH-GAP.md` B3

**This was the hard prerequisite.** Every MoR on the shortlist bans adult content
outright. We sell a voice product with an open microphone and a character who
talks back; an unmoderated one is an account waiting to be closed, and closure
after approval is far worse than a slower application, because the money stops
with no notice and the disclosure follows us to the next provider.

§16 specified it and it is now built: moderation on both streams, an in-frame
decline first, then the rep ends, logged to `safety_events`. Plus the age gate,
the distress path and a report control on every rep. **B3 in `LAUNCH-GAP.md` has
the detail.**

**What a reviewer can be told, in one paragraph.** Every turn on both sides of
every conversation is classified before it goes any further. A first breach is
declined by the character in frame and the session continues; a second ends it.
Sexual content involving minors ends a session on sight from either side, with
no in-character answer and no second chance. Distress signals end the session,
drop the training frame entirely and show a list of helplines that diagnoses
nothing. Every one of those decisions is written to an append-only table the
user cannot forge a row in — enforced by row-level security, asserted from a
second account by `npm run db:verify`. Text mode runs the same layer.

**One thing to say honestly if asked.** Moderation fails open: if the classifier
is unreachable, the turn passes and the session continues. Ending live
conversations because a vendor had a bad minute is not a trade this product
makes (§05), and the reasoning is recorded in `lib/safety/assess.ts` and asserted
in its tests rather than left as an assumption.

### 5.2 A mailbox that answers · **done 30 Aug** · overlaps `LAUNCH-GAP.md` B5

Onboarding is conducted by email, and a provider that cannot reach you does not
approve you. `support@nerve.training` is printed on every public page. Confirm
the domain is held and that mail sent to that address arrives somewhere a person
reads. B5 records that there is no custom sending domain, no SPF or DKIM, and no
transactional provider — that is about mail we *send*, but it is the same domain.

### 5.3 Ship what is already written

The two paragraphs above are founder tasks. This one is not, and it is the
cheapest item on the page: **everything this document cites as evidence from 28
to 30 August is uncommitted.** A reviewer opening `hellonerve.com` today does
not see the two-step age gate §3 describes, does not see the date wheel, and
still sees the duplicated landing pitch on both auth doors that `LAUNCH-GAP.md`
B1 records as removed.

Nothing needs to be built. It needs to be committed, pushed and verified on the
deployed URL — and this page needs to stop describing a build that is only on
one laptop. A git-linked deploy builds the pushed commit, not the working tree.

### 5.4 The age gate cannot be reached by a Google account

Found on 30 August and **live in production right now.** The route guard sends
an account with no date of birth to `/onboarding/age`, and then the rule below
it sends an unfinished run to its resume step — which is `/onboarding/track`,
which has no date either, which sends it back. An infinite redirect.

It only bites accounts that have no date *and* no finished onboarding, which is
exactly and only a new Google sign-up. The password form collects a date, so it
was never visible from the door that has one. The "Continue with Google" button
is live on `hellonerve.com/signup` today.

This matters here rather than only in `LAUNCH-GAP.md` because §16.4's gate is
the single control this application leans on hardest, and §3 of this page tells
a reviewer it is the first thing they will meet. The fix is written and tested
(`ONBOARDING-AUDIT.md` §7.1 N1) and is part of §5.3's unpushed work.

### 5.5 An entity and a payout account

Creem pays out by local bank transfer, which needs a name to pay and an account
to pay into. Neither is recorded. This is a founder task, not an engineering one,
and with moderation done it is now the longest pole on the page.

### 5.6 Three public claims the product does not currently keep

A merchant-of-record reviewer compares the pitch to the product. These are the
places where the two disagree today:

- **The Sunday review letter** is listed as a Free-tier feature on `/pricing`
  and described on `/how-it-works`. `app/api/cron/weekly-review` exists and
  **nothing schedules it** — `vercel.json` carries one cron, the audio purge.
  `LAUNCH-GAP.md` B12 records the deferral; the pricing page does not.
- **"Export my data"** is a disabled button in Settings. The RPC behind it
  (`export_my_data()`) works and is proven from a second account; only the
  download is unwired. The privacy policy describes the right as available.
- **Account deletion** is a disabled button whose copy says to email
  support — at the address that does not exist (§5.2). So the one §16.7
  promise a user can check on day one currently has no working route at all,
  and that is a consumer-rights answer a reviewer may ask for in writing.

None of these is large. `LAUNCH-GAP.md` B6 sizes the export and delete work at
about a day, and the cron is a line of JSON plus B12's decision.

### Running in parallel, not blocking

- **D2 — the pricing decision.** `/pricing` quotes the plans that are actually
  built: $24 and $39, priced in reps a day. §14 specifies $19 and $39 priced in
  minutes. A reviewer comparing the public page to what checkout charges must
  find the same number, so this has to be settled before checkout opens — but it
  does not block the application.
- **B4 — the solicitor's pass.** The three documents are written and internally
  consistent. A reviewer is not a lawyer and will not catch what a lawyer would;
  get the pass, but do not hold the application for it.

## 6. After approval

That is where `LAUNCH-GAP.md` B2 picks up, and none of it can start earlier:
checkout, the customer-portal handoff, the webhook that writes the
`subscriptions` mirror, plan switching, and the six money overlays in §12. Until
then plans are granted from a terminal by `npm run db:plan`.

§17's gate for that milestone is two-part, and the second half is not about
payments at all: **the MoR account approved, and metering reconciling to the cent
against the OpenAI dashboard across fifty test sessions.**

## 7. Log

Append here. Do not rewrite entries — this becomes the record of what we told a
provider and when.

| Date | Event |
|---|---|
| 27 Aug 2026 | Public site and three legal documents shipped (B1, B4). The application stopped being blocked by anything in this repo |
| 28 Aug 2026 | This document created. Not yet submitted to any provider |
| 28 Aug 2026 | Safety layer shipped (B3): moderation on both streams, the age gate at sign-up, the boundary sequence, the distress path, the report control. The three legal pages rewritten from future tense to present tense to match. **The last build-task blocker on submission is cleared; what remains is a mailbox and an entity** |
| 30 Aug 2026 | Mail fixed end to end: `support@hellonerve.com` created with a catch-all, Resend verified on `send.hellonerve.com`, DMARC published at `p=none`, Supabase Auth moved onto Resend, and `SUPPORT_EMAIL` pointed at the live domain in one place. §5.2 closed. Not deployed — it goes out with §5.3 |
| 30 Aug 2026 | Every claim on this page re-checked against `hellonerve.com` rather than against the repo. `support@nerve.training` found to have no DNS at all; production found to be running the last commit while 28–30 Aug's work sits uncommitted, so §3's two-step age gate is not what a reviewer sees; the Google sign-up path found to loop before it can reach the §16.4 gate. The hero rep, which notes elsewhere still called owed, found recorded and live. Still not submitted to any provider |
