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
  before they meet anything else, which is the order they would want it in.

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
| An age statement | Terms clause 02, every footer, and `/signup` | **Enforced** 28 Aug. A date of birth on the sign-up form, checked on the server before the account is created; Google sign-ups and older accounts are asked at `/onboarding/age` before anything else opens |
| A way for a user to report a problem | Every rep's result, scorecard and transcript screen | **Built** 28 Aug (B3). Goes to `safety_events` with the session attached |
| A working support address | `support@nerve.training` | **Unverified.** The address is in the footer of every page. Whether that mailbox receives mail has not been confirmed, and B5 records that we have no sending domain configured at all |
| A company to pay | — | **Open.** We trade as "Nerve". The entity that signs and the bank account that receives payout have not been recorded anywhere in this repo |

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

### 5.2 A mailbox that answers · overlaps `LAUNCH-GAP.md` B5

Onboarding is conducted by email, and a provider that cannot reach you does not
approve you. `support@nerve.training` is printed on every public page. Confirm
the domain is held and that mail sent to that address arrives somewhere a person
reads. B5 records that there is no custom sending domain, no SPF or DKIM, and no
transactional provider — that is about mail we *send*, but it is the same domain.

### 5.3 An entity and a payout account

Creem pays out by local bank transfer, which needs a name to pay and an account
to pay into. Neither is recorded. This is a founder task, not an engineering one,
and with moderation done it is now the longest pole on the page.

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
