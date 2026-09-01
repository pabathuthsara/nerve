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
>
> **Deployed and re-audited, 30 August (`f137faf`).** All three are now fixed on
> the live site. The reviewer walk below was run against `hellonerve.com` in a
> browser, not against the repo: **21 checks pass, 0 fail.** The site is ready
> to be looked at. What is left is not on the site — see §5.5.

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

From §14's table, with Gumroad added 1 September as the named fallback:

| Provider | Sri Lankan payout | Cost | Standing |
|---|---|---|---|
| **Creem** | Yes — local bank transfer | 3.9% + $0.40, payout fee €7 or 1% | **Primary.** Cheapest of the viable set and explicitly supports Sri Lanka. Onboarding asks for a tax ID — see §5.5 |
| **Gumroad** | Yes — PayPal (receiving now available in Sri Lanka; confirm withdrawal limits) or Payoneer | 10% flat + card processing, so roughly 2–3× Creem's cut | **Fallback, chosen 1 September.** If Creem declines — on the tax ID or on the category review — we launch on Gumroad rather than keep applying. It is a merchant of record, needs no company and no tax ID to start, and its content rules are looser. The price is margin: at Pro's worst-case burn the cut takes the tier from about half to a bit under half, so it is a bridge to launch, not a permanent home. Re-check D2's price math against it before committing |
| Polar | Yes — Stripe Connect Express | ≈ 4–5% + fixed | Its policy names "AI relationship services" as prohibited, and a reviewer could misread us as one |
| Dodo Payments | Yes — markets to emerging markets | Comparable | Newer and less proven |
| Paddle | Not clearly listed | ≈ 5% + $0.50 | Rejected. Bans "dating services/applications, or any other products/services intended for this industry" outright |
| Lemon Squeezy | Yes | ≈ 5% + $0.50 | Avoid. Being folded into Stripe Managed Payments, which reaches far fewer countries — a migration we do not need |

Apply to Creem first and wait. Applying to several at once is not a hedge: each
one runs a human review of the same site, and being declined somewhere is a
thing you may have to disclose later. **If Creem says no, the next move is
Gumroad, not a third application** — the AI-character question in §3 follows us
to every provider on this list, so a fourth review of the same site is unlikely
to land differently, and Gumroad clears the two hurdles Creem raised: the tax ID,
and probably the category. Its rules have tightened around AI and adult content
too, so §3's positioning discipline applies there in full.

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
| An age statement | Terms clause 02, every footer, and `/signup` | **Enforced** 28 Aug, and made the first step of sign-up 30 Aug. A date of birth before any other field, checked on the server before the account is created. **Strengthened 30 Aug:** Google sign-in is no longer offered — it was on both doors and the provider was never configured — so there is now exactly one way to create an account and it collects the date first. `/onboarding/age` stays for accounts that predate the gate, and still works if §04 reopens OAuth |
| A way for a user to report a problem | Every rep's result, scorecard and transcript screen | **Built** 28 Aug (B3). Goes to `safety_events` with the session attached |
| A working support address | `support@hellonerve.com` | **Fixed in the tree, 30 Aug; not yet deployed.** Was `support@nerve.training`, a domain with no DNS at all — no A record, no MX — so every message to the address in the footer, in Settings and in all three legal pages bounced. Now a real mailbox on the domain the product runs on, with a catch-all behind it. `SUPPORT_EMAIL` in `components/site/site-chrome.tsx` is the single record; `profile-screens.tsx` had spelled it out instead, which is how three of the four copies went stale together. **Ships with §5.3** |
| A domain that can send as well as receive | `hellonerve.com` | **Wired 30 Aug.** Resend verified on `send.hellonerve.com` (SPF and bounce MX on the subdomain, DKIM at `resend._domainkey`), so the root MX and root SPF that carry *receiving* are untouched — no second SPF record, which is the usual way this breaks. DMARC published at `p=none`. Supabase Auth sends through Resend rather than its own sender, which is the receiving half of `LAUNCH-GAP.md` B5. Both sending paths are signed: `resend._domainkey` for app mail and `privateemail._domainkey` for mail sent from the mailbox — including replies to a reviewer. Namecheap Private Email publishes under the `privateemail` selector, not `default`, which is worth knowing before concluding it is missing |
| A company to pay | — | **Open.** We trade as "Nerve". The entity that signs and the bank account that receives payout have not been recorded anywhere in this repo |
| The site actually serving all of this | `hellonerve.com` | **Live and public, 30 Aug.** Deployment protection is off, so a reviewer reaches it without a Vercel login; all six §11 routes return 200; `robots.txt` and `sitemap.xml` resolve against the real origin. **But it serves the last commit, not the working tree** — see the note at the top and §5.4 |
| A recorded demo that is not a mock | `/` | **Ready, 30 Aug.** The hero manifest is committed and deployed, and the stamp on the live page names the models that actually spoke |

## 5. Before we submit

Two things now, and neither is a build task. The third — moderation — was the
hard prerequisite and it shipped on 28 August. **A fourth surfaced on
1 September: Creem's onboarding wants a tax ID (§5.5), and if that turns into a
demand for a registered company we switch to Gumroad (§2).**

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

### 5.3 Ship what is already written · **done 30 Aug**

Everything below shipped in `f137faf` and was verified on `hellonerve.com`:

| Checked on the live site | Result |
|---|---|
| Hero plays a real recorded rep | ✅ stamp reads *recorded · her gpt-realtime, unscripted · his gpt-4o-mini-tts, read* |
| §07 scoring law stated above the fold | ✅ |
| No "get her number" / seduction framing anywhere on the landing | ✅ |
| States what the product is *not* | ✅ |
| Footer carries 18+, training-not-therapy, PG-13, live support address | ✅ all four |
| Date of birth is step one of sign-up, on its own screen | ✅ |
| No email field until the age is answered | ✅ |
| Duplicated landing pitch removed from the auth doors | ✅ |
| An under-18 date is refused at the door | ✅ *"Nerve is 18+. Come back when you are."* |
| All three legal pages, contacts all on the live domain | ✅ |
| Sri Lankan governing law and jurisdiction stated | ✅ |
| Prices public, checkout stated as not yet open | ✅ $24 / $39, "Opens soon" |
| No horizontal overflow on a 390px phone | ✅ |
| No JS errors or 4xx/5xx across the whole walk | ✅ |
| Deployment protection off — a reviewer needs no login | ✅ |
| **The §16.4 gate is reachable by a dateless account** | ✅ four navigations, no loop, gate renders (§5.4 closed) |
| Only one way in, and it asks for the date first | ✅ Google removed 30 Aug — no unconfigured provider button on a public door |
| Public GitHub repo carries no committed secrets, full history scanned | ✅ only `.env.example` placeholders |

### 5.3b The old §5.3, kept as the record

The two paragraphs above are founder tasks. This one is not, and it is the
cheapest item on the page: **everything this document cites as evidence from 28
to 30 August is uncommitted.** A reviewer opening `hellonerve.com` today does
not see the two-step age gate §3 describes, does not see the date wheel, and
still sees the duplicated landing pitch on both auth doors that `LAUNCH-GAP.md`
B1 records as removed.

Nothing needs to be built. It needs to be committed, pushed and verified on the
deployed URL — and this page needs to stop describing a build that is only on
one laptop. A git-linked deploy builds the pushed commit, not the working tree.

### 5.4 The age gate cannot be reached by a Google account · **fixed and verified 30 Aug**

Re-tested on `hellonerve.com` with an account created without a date of birth —
the exact shape a Google sign-up produces. Trail:
`/login → /login → / → /onboarding/age`, settled, gate rendered. Four
navigations and no loop.

**What it was.** Found on 30 August and live until `f137faf`. The route guard sends
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

### 5.5 An entity, a tax ID, and a payout account

Creem pays out by local bank transfer, which needs a name to pay and an account
to pay into. Neither is recorded. This is a founder task, not an engineering one,
and with moderation done it is now the longest pole on the page.

**Creem's onboarding also asks for a tax ID, discovered 1 September.** A tax ID
is not a company: Sri Lanka issues a personal Taxpayer Identification Number to
individuals through the Inland Revenue Department — free, online, no
incorporation, and close to mandatory since the 2024 rules anyway. A sole
proprietor's personal TIN is normally what these forms mean. Two moves before
assuming it blocks us: register for the TIN through IRD e-Services, and ask Creem
support whether a sole-proprietor TIN satisfies the field or is addable after
approval. If Creem turns out to need a registered company, that is the trigger
for the Gumroad fallback in §2 — Gumroad needs neither a company nor a tax ID to
start.

Get the TIN regardless. Every provider on the §2 list will want it eventually,
and it is the same number the entity and payout work above needs.

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
| 30 Aug 2026 | Google sign-in removed from both doors. The provider was never configured, so the button reached Supabase, was told the provider was disabled, and put an error under the control that looked like the fastest way in — on the page a merchant-of-record reviewer opens first. One account-creation path now, and it collects the date of birth before anything else. `/auth/callback` is left in place so §04 can reopen it as configuration rather than code; `/onboarding/age` stays for accounts that predate the gate. The privacy page no longer names Google as a sign-in method |
| 30 Aug 2026 | `f137faf` deployed. Live reviewer audit run against `hellonerve.com` in a browser: 21 checks pass, 0 fail — hero, scoring law, positioning, footer commitments, two-step age gate, under-18 refusal, three legal pages, pricing, mobile layout, console, and the Google-shaped account reaching the §16.4 gate without looping. Public repo history scanned for secrets, clean. §5.3 and §5.4 closed. **The site is ready to be reviewed; the remaining blocker is the entity and payout account** |
| 30 Aug 2026 | Mail fixed end to end: `support@hellonerve.com` created with a catch-all, Resend verified on `send.hellonerve.com`, DMARC published at `p=none`, Supabase Auth moved onto Resend, and `SUPPORT_EMAIL` pointed at the live domain in one place. §5.2 closed. Not deployed — it goes out with §5.3 |
| 30 Aug 2026 | Every claim on this page re-checked against `hellonerve.com` rather than against the repo. `support@nerve.training` found to have no DNS at all; production found to be running the last commit while 28–30 Aug's work sits uncommitted, so §3's two-step age gate is not what a reviewer sees; the Google sign-up path found to loop before it can reach the §16.4 gate. The hero rep, which notes elsewhere still called owed, found recorded and live. Still not submitted to any provider |
| 1 Sep 2026 | Creem onboarding reviewed field by field. Two new blockers. One: the prohibited-list item on "AI companion or relationship chatbots … romantic AI characters" is a reviewer judgement call we land on the right side of only if §3's framing holds. Two: onboarding requires a tax ID we do not have — recorded that a Sri Lankan personal TIN (IRD, no company) is the likely answer and worth getting regardless. **Fallback decided: if Creem declines on the tax ID or the category, we launch on Gumroad rather than run a third application** — MoR, no company or tax ID to start, looser content rules, at the cost of a ~10% + processing cut against Creem's ~4%. Noted that PayPal now supports receiving in Sri Lanka, which makes Gumroad's payout viable. Still not submitted to any provider |
