# The data spine

M1. Seven tables, RLS on all of them, and the first thing in this project that
outlives a page refresh. M2 added an eighth for entitlements and bound the
Arena frontend to all of it. M3 added the ten §13 tables that were still
missing — the field, the library, safety, billing and progression — so that
every table the specification names now exists. Eighteen tables, RLS on all of
them, 51 checks proving it.

Until now a rep produced a JSON file you downloaded. That was correct for M0 —
the spike had no user and nothing to progress — but it makes the M1 gate
unanswerable. "You run ten reps on yourself and genuinely want an eleventh" is
a retention question, and ten reps that leave no trace cannot produce a
eleventh anything.

## What is stored

| Table | One row per | Notes |
|---|---|---|
| `profiles` | user | Created by trigger on sign-up. Holds `vad_offset_ms`, the per-user turn-taking calibration |
| `personas` | character | Content, not code. Seeded from the TypeScript registry |
| `sessions` | rep | Provider and model stamped, so a provider switch keeps history comparable |
| `transcripts` | rep | The normalised turns both adapters emit |
| `scores` | graded rep | Six sub-scores plus the deterministic audit trail |
| `persona_memory` | user × character | The one-line callback on return |
| `usage_ledger` | charge | Append-only. The source of truth for metering |
| `entitlements` | user | Plan and daily quota. **Read policy and nothing else** |
| `streaks` | user | Days trained in a row. A rep counts; so does a logged ask |
| `field_challenges` | challenge | Content. Hand-written, reviewed, never generated (§09) |
| `field_assignments` | user × day | The one challenge a day, and the anxiety predicted before it |
| `field_logs` | ask | The log. **No UPDATE policy, for anyone** |
| `techniques` | library card | Techniques, openers, ladders, recoveries, exits |
| `unlocks` | user × unlock | When we first told them. What is unlocked stays derived |
| `subscriptions` | user | Mirror of the merchant of record. Webhooks write it |
| `weekly_reviews` | user × week | Generated Sunday, stored because it is about that week |
| `safety_events` | incident | Boundary hits, distress flags, moderation, user reports |
| `interview_setups` | user | Role, JD, CV pointer, custom questions (M4) |

Every table §13 names now exists. The two that differ from the spec's list do so
on purpose: `streaks` counts training days rather than only asks, and there is
no separate `unlocks` source of truth — see below.

## Personas are seeded, not read

§13 says a character is a database row. The registry in `lib/personas/` is what
is actually tuned and tested, so it stays authoritative and `npm run db:seed`
pushes it downstream. The table exists today so `sessions.persona_id` is a real
foreign key; flipping the read is a one-line change once the rows have been
compared against the registry for a few reps.

`dials` holds the **four-layer** schema from `PERSONA.md` — `trajectory`,
`personality`, `gated`, `room` — not §05's flat record. The flat shape was
replaced because a separate friendliness dial and the warmth band argued over
the same behaviour, and the spec table has not caught up.

## The rules the schema enforces

**Nothing is saved at the cost of a rep.** Every persistence call in
`app/rep/actions.ts` returns a result rather than throwing, and the client
surfaces failures as notices. A live voice session must not end because
Postgres was slow. The session row is written when the transport connects, so a
rep that crashes still leaves evidence it happened.

**A user cannot write their own meter.** `usage_ledger` has a read policy and
nothing else — inserts go through the service role. A user who can append to
their own ledger can bill themselves nothing (§14).

**The ledger cannot be rewritten, by anyone.** A trigger blocks `UPDATE`
outright, service role included. The single exception is the `ON DELETE SET
NULL` that fires when a user deletes a rep: the charge still happened, so the
row survives its session detached, with every money column intact.

That exception exists because the first version of the trigger did not have it,
and blocking every update also blocked the foreign key action — which made
deleting a rep fail silently and left the transcript behind. `npm run db:verify`
is what caught it.

**Outcome is stored on both the session and the score, and is worth zero
points** (§07). It is recorded because a rep that ended in rejection is a
different memory from one that did not, not because it grades.

## Auth

Email OTP. `/auth` takes an address, sends the email, and takes the code back on
the same screen so nobody retypes anything.

**It works on an untouched Supabase project.** `/auth/confirm` accepts all
three shapes a sign-in link can arrive in:

| Arrives as | From | Handled |
|---|---|---|
| `?code=…` | an edited template, and OAuth | server, exchanged |
| `?token_hash=…&type=…` | an edited template | server, verified |
| `#access_token=…` | **the default template** | client — see below |

The third one is the trap. Supabase's default template points at its own
`/auth/v1/verify`, which verifies the token and then redirects with the session
in the URL **fragment**. A fragment is never sent to the server, so a route
handler looking for `code` or `token_hash` sees an empty query string and can
only conclude the link was bad. It reports "expired or already used" when
nothing has expired.

`hash-session.tsx` reads the fragment in the browser, calls `setSession`, and
strips the tokens out of the address bar before navigating — otherwise they sit
in history and in anything the user pastes. The Supabase docs only show the
`token_hash` pattern, which is why this is easy to get wrong: that pattern
requires editing the template, and editing templates requires SMTP.

The six-digit code needs `{{ .Token }}` in the Magic Link template. **A hosted
project will not let you edit templates until custom SMTP is configured**, so
the code is the nicer path rather than the only one, and the link works
meanwhile.

That gate matters for a second reason: Supabase's built-in sender is a testing
convenience with a hard hourly rate limit, and it does not put your domain on
the envelope. It will not carry a private beta. Wire a real sender before M5,
not during it.

### Signing in while building

The built-in sender's hourly limit is low enough that debugging the auth flow
exhausts it, and it cannot be raised without custom SMTP. So there is a door
that does not involve email:

```bash
npm run db:user -- you@example.com   # confirmed user, known password
```

Paste the two `DEV_LOGIN_` variables it prints into `.env.local`, restart, and
`/auth` grows a one-click sign-in.

It is gated on `NODE_ENV !== 'production'` plus both variables being set, and
**those checks live in the Server Action**, not only in the component that
draws the button. A control you did not render is not a control that cannot be
called. Neither variable is `NEXT_PUBLIC_`, so neither reaches the browser.

### One inherent constraint

The link has to be opened in the browser that requested it — the PKCE verifier
is a cookie set when the code was asked for. That is inherent to the flow, not
something a route can paper over.

Google is wired as far as code can take it: the button, `signInWithOAuth` and
the exchange at `/auth/callback`. What is left is OAuth credentials in the
Google console and the provider switched on in Supabase — configuration, not
code — and until that is done the button says so.

### The routes that spend money

RLS covers the tables. It does not cover a route handler, and six of them
shipped with no auth check at all:

| Route | What an anonymous caller got |
|---|---|
| `/api/voice/token` | A credential worth an eight-minute Realtime session on our account |
| `/api/voice/llm` | Our standing vendor key, proxied |
| `/api/voice/tts` | Same, for synthesis |
| `/api/voice/credits` | The vendor account balance |
| `/api/grade` | A `gpt-4.1` call on a transcript they supplied |
| `/api/warmth/score` | A `gpt-4.1-mini` call, same |

Every one is called from `/rep`, which already redirects an anonymous visitor to
`/auth` — so the protection was entirely that nobody had guessed the paths. They
now go through `requireUser` in `lib/db/api-auth.ts` before reading a key or
touching an upstream, and return a bare `unauthorised` so a 401 does not report
which half of the check failed.

`getUser()` rather than `getSession()`, at the cost of a round trip to the auth
server, for the reason `currentUser()` already records: `getSession()` reads the
cookie without contacting anyone and will return a user whose session has been
revoked. On a route whose entire job is deciding whether to spend money that is
the wrong trade. The middleware also calls `getUser()` on these paths, so there
are two round trips per request — the middleware refreshes the cookie and does
not gate, so neither is redundant.

`INTERNAL_API_SECRET` is a machine credential for harnesses with no browser
session — currently only the opt-in scorer calibration suite, which drives
`/api/warmth/score` over HTTP so it measures the deployed route rather than a
re-implementation. **Unset means the bypass does not exist**, which is why it is
unset by default and must stay unset in production.

`app/api/api-auth.test.ts` asserts all six against the handlers rather than
against the helper, because the failure mode is a handler forgetting to call the
helper. It also asserts that nothing upstream is called before the refusal — a
route that spent first and checked second would still return 401 and still cost
money on every probe.

## Audio

Recorded by tapping the two `AnalyserNode`s the provider already exposes. An
analyser is a pass-through, so branching one to a `MediaStreamDestination` adds
a recorder without touching the routing — and without the recorder ever learning
which provider it is capturing. The mix is her voice *as rendered*, room and
reverb included, plus the mic as the model heard it. Reviewing a rep should
sound like the rep.

Uploaded straight from the browser to a private bucket rather than through a
Server Action. A Server Action body is a serialised RPC payload, and pushing a
megabyte of audio through one from a Colombo home connection is not a thing to
be casual about.

Path is `<user_id>/<session_id>.webm`. The first segment is the RLS key, so a
path that is not yours is not writable by you.

**Purged at 30 days** by `/api/cron/purge-audio`, on a Vercel Cron. Storage
first, then the row — the other order orphans the object, because once
`audio_path` is null nothing knows the file exists and it sits in the bucket
holding a user's voice past the retention we promised. The route refuses to run
when `CRON_SECRET` is unset rather than running open.

The expiry is stored on the row, not computed at purge time, so changing the
window later cannot silently re-date audio a user was told would be gone.

## What the frontend reads (M2)

The Arena screens were built against `lib/data`, which returned fixtures. They
now read Supabase through the same hooks, in the browser, under RLS — a query
that returned somebody else's rep would have to get past a policy rather than
past a code review. What that needed:

**A second table for anything a user could pay to change.** `profiles` grants
its owner UPDATE, so plan, daily quota and streak cannot live there: a settings
screen that can raise your own limit is the ledger problem again (§14).
`entitlements` has a read policy and no write path at all, and every write goes
through the service role in a Server Action. Preferences — name, timezone,
track, focus, training wheels, ambience, devices — stay on `profiles`, where
the user owning them is the point.

**The daily reset is stored, not scheduled.** The quota row carries the local
day it belongs to, so a counter from yesterday is simply not today's counter.
Nothing has to run at midnight, and no cron can miss it. The day is local
because a Colombo user whose reps reset at 05:30 has been handed somebody
else's midnight — hence `profiles.timezone`, captured from the browser on the
way in.

**Presentation is seeded with the character.** `personas` grew the six fields
the roster and brief screens read. They are authored in `lib/personas/` beside
the contract and pushed by `npm run db:seed`, so the description a user is
given and the character they then meet cannot drift apart.

**The meter is now stored.** `sessions` carries start, final and peak warmth,
the closing band and whether the rep is told as a win; `transcripts.warmth`
carries the per-turn events. Without them a session row knew a rep happened and
nothing about how it went, and the gutter, the sparkline, the two moments and
the persona record all read exactly that.

**Unlocks are derived, not stored.** Which tier is open is a fact about the
reps you have already won, and a stored copy of a derived fact is a stored copy
that can disagree with it. The ladder position on `profiles.current_level` is
recomputed from history when a grade lands, and only ever moves up — a downward
adjustment is never announced (§08, §12).

**The scorecard adds up.** Six deterministic metrics at ten points each is the
60%, one judgement row at forty is the 40%, and the visible rows sum to the
stored composite. The judgement row absorbs the rounding, because the honest
place for it is the row whose inputs are already a model's opinion rather than
one with a measured value printed beside it.

The live rep loop is the one part still simulated: `lib/data/rep.ts` runs a
scripted session behind `NEXT_PUBLIC_MOCK_VOICE`. The real transport is at
`/rep` and has never been mocked.

## Auth, the second door

`/auth` is still email OTP and still works on an untouched project. The Arena
screens add password and Google on top of the same accounts:

| Screen | Action |
|---|---|
| `/signup` | `signUp`, then the inbox |
| `/login` | `signInWithPassword`, or Google via `/auth/callback` |
| `/forgot-password` | a reset link that lands on `/auth/confirm?next=/reset-password` |
| `/reset-password` | the link is already exchanged for a session, so a session **is** the token |

A wrong address and a wrong password get the same sentence, and the reset
screen reports success whether or not the address has an account. Two different
messages are account enumeration with a helpful tone of voice.

Google needs credentials in the Google console and the provider switched on in
Supabase. The code path — button, `signInWithOAuth`, `/auth/callback` — is
wired, and an unconfigured provider says so on the screen rather than failing
at the redirect.

## The three rules the M3 tables follow

**Anything a user could pay to change has no user write path.** Plan, quota,
streak, unlocks, subscriptions and weekly reviews are read-only to their owner
and written by the service role. A user who can write their own streak has a
number that means nothing on the home screen; a user who can write their own
subscription has a free product.

**The log cannot be rewritten, including by the person who wrote it.**
`field_logs` grants insert, select and delete — and no update, at any level.
Predicted-versus-actual is the one chart that carries the therapeutic claim
(§09), and a number you can revise after the fact is not evidence.

**What is unlocked stays derived; `unlocks` only records when we said so.** A
stored copy of a derived fact is a stored copy that can disagree with it, and
an unlock lost to a failed write is an unlock somebody earned and cannot see.
The table exists so the level-unlocked moment fires once rather than on every
visit to the scorecard, and so a cohort's time-to-Level-3 is answerable later.

## Content is authored in the repo, seeded downstream

Three libraries now follow the persona pattern — `lib/personas/`,
`lib/field/challenges.ts`, `lib/techniques/library.ts`. The repo is where
content is written and reviewed in a pull request; the table is where it is
read. For challenges this is not a preference: §09 makes hand-written and
human-reviewed a hard rule, `field_challenges.reviewed_by` is `not null`, and
runtime generation is a door with no handle on this side.

## Two functions, both running as the caller

`export_my_data()` and `spend_today_cents()` are `security invoker`, so row
level security decides what they can see. That is the whole safety argument for
the export: it takes no user parameter to get wrong, because it cannot reach
anybody else's rows to begin with. Both are revoked from `anon` and granted to
`authenticated` — Postgres grants EXECUTE to PUBLIC on every new function, and
PUBLIC includes anon.

## Commands

```bash
npm run db:seed          # mirror the persona registry into the table
npm run db:seed -- nadia # just one
npm run db:content       # mirror the challenge and technique libraries
npm run db:verify        # prove RLS holds, with two real users
npm run db:rep           # drive a whole rep lifecycle, without a microphone
npm run db:field         # drive the field loop: assign, accept, log, streak
npm run db:types         # regenerate lib/db/types.ts from the live schema
npm run db:plan -- you@example.com pro   # grant a plan (free 1/day, pro 3, elite 6)
```

`db:plan` exists because `entitlements` has no write path a user can reach, and
a fresh account is free — which is one rep a day, and not enough to build
against. It is the same reason there is no UI for it and should not be one
until a merchant of record is wired (§14).

`db:types` needs `SUPABASE_PROJECT_REF` and a logged-in Supabase CLI. A stale
`lib/db/types.ts` compiles cleanly and lies at runtime, which is the worst
combination available — regenerate after every migration.

## Verifying it

`npm run db:verify` creates two throwaway users, has each try to reach the
other's rows across every table and both storage buckets, and deletes them
whatever happens. Fifty-one checks, covering the field, progression, money,
safety, the CV bucket and the export.

A policy that has never been tested from a second account has never been
tested. Run it after every migration that touches a policy.

Migrations are in `supabase/migrations/`, one file per applied change,
timestamped. They are the record of how the remote database got to where it is
and they are committed on purpose.

## What is not here yet

- **`profiles.rank` still moves nowhere.** `current_level` does now — it is
  recomputed from wins when a grade lands — but rank is decoration until
  something reads it.
- **The middle six characters are authored but not tuned.** Nadia and Alex have
  been through rounds of measurement; Priya, Maya, Jules, Erin, Sam and Robin
  were written against the §06 table and have not yet been run enough times to
  know whether their curves are right.
- **`persona_memory` has no writer.** The table is there; the one-line callback
  on return (§08) is not.
