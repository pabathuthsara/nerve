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
| `persona_memory` | user × character | The one-line callback on return, filtered before it is stored |
| `usage_ledger` | charge | Append-only. The source of truth for metering |
| `entitlements` | user | Plan, daily quota and the one-off sign-up rep. **Read policy and nothing else** |
| `streaks` | user | Days trained in a row. A rep counts; so does a logged ask |
| `field_challenges` | challenge | Content. Hand-written, reviewed, never generated (§09) |
| `field_assignments` | user × day | The one challenge a day, and the anxiety predicted before it |
| `field_logs` | ask | The log. **No UPDATE policy, for anyone** |
| `techniques` | library card | Techniques, openers, ladders, recoveries, exits |
| `unlocks` | user × unlock | When we first told them. What is unlocked stays derived. Kinds: level, tier, persona, technique, milestone |
| `difficulty_offsets` | user × level | Per-user difficulty adjustment. Read-only to its owner; the downward direction is never announced (§08, §12) |
| `share_cards` | user × card | Shareable artefacts. One owner-read policy and **no anonymous policy** — the public page resolves the token with the service role |
| `subscriptions` | user | Mirror of the merchant of record. `/api/webhooks/creem` writes it, service role only; `npm run db:billing` |
| `weekly_reviews` | user × week | Generated Sunday, stored because it is about that week |
| `safety_events` | incident | Boundary hits, distress flags, moderation, user reports |
| `interview_setups` | user | Role, JD, CV pointer, custom questions (M4) |
| `rate_limits` | user × bucket | The spend ceiling's counter. **No policies at all** — see below |
| `text_threads` | user × character | Text mode's one rolling conversation. Owner-writable, unmetered, and never reaches `sessions` — see below |

`profiles.rank` is a mirror, not an authority: `lib/data/rank.ts` derives the
rank from the same qualifying counts that drive the unlocks, and `syncLevel`
writes it so cohorts are queryable. A stored copy of a derived fact can disagree
with the history it summarises, so the function wins every time they differ.
`npm run db:rep` asserts the two agree.

Every table §13 names now exists. The two that differ from the spec's list do so
on purpose: `streaks` counts training days rather than only asks, and there is
no separate `unlocks` source of truth — see below.

### `entitlements.reps_per_day = 0` is the voice lock (31 Aug)

This is a semantics change rather than a schema one, and it is worth stating
plainly because the column now carries a product decision rather than a number.

**Free grants zero voice reps a day.** Not one, zero. `consumeRep` and
`mayOpenSession` have always refused at zero, so no gate was added anywhere in
the application layer — the lock is this column and only this column, which is
also why it cannot be bypassed by a screen that forgot to check. The default on
the column moved to 0 with it, so the sign-up trigger creates voice-less
accounts.

**`onboarding_rep_used_at` is the one exception, and it is once per account.**
Free is not voice-*less* on day one: every account gets a single voice rep
during sign-up, against the character authored to be won, so that nobody is
asked to decide about a voice product they have never heard. It is a timestamp
rather than a boolean because "when" is worth having when an account shows one
more rep in the ledger than its plan allows.

It replaces the day-one grant of three reps, which keyed off
`entitlements.created_at` and the account's local day. A once-ever grant cannot
be a date comparison: somebody who abandons onboarding on Tuesday and resumes on
Thursday must get the rep they never spent, and somebody who spent it must not
get another by restarting the run. The stamp answers both. It sits on
`entitlements` for the same reason everything else here does — read policy, no
write policy, service role only — so a user cannot clear their own mark.

The grant is **additive and spent last**: the allowance is the plan's number
plus one while the stamp is null, and anything at or past the plan's number is
coming out of the grant. That ordering is what lets `refundRep` decide from the
counter alone whether the rep it is handing back was the one-off one — which it
must, because a free account's only voice rep must not be lost to a muted
microphone. `lib/data/allowance.ts` is the whole rule, pure and tested, and
`npm run db:rep` drives it against the real table.

The refusal carries a `kind`. "You are out of reps for today" is true for a Pro
account at three of three and a lie to a free account whose reps never reset,
so `consumeRep`, `mayOpenSession` and `/api/voice/token` all pass `daily` or
`upgrade` through to the sheet rather than one string the UI has to interpret.

## The spend ceiling (B9, §14, §18)

`requireUser` answers "is this somebody?". Until 24 August nothing answered
"should we spend more on them?", so a signed-in user could post transcripts to
`/api/grade` in a loop and a leaked cookie could do it faster.

Five routes go through `maySpend` (`lib/db/spend.ts`): `/api/grade`,
`/api/warmth/score`, `/api/voice/llm`, `/api/voice/tts` and `/api/voice/token`.
`/api/voice/credits` deliberately does not — it reads the vendor's own balance
and buys nothing.

Text mode's `sendTextTurn` Server Action goes through the same gate on the
`text` bucket, via `spendVerdict` — the same decision before it is dressed as an
HTTP response, because a Server Action returns `{ ok, message }` rather than a
`Response`. **Free of quota is not free of cost**, and the bucket is its own so
a loop in the cheap unmetered thing cannot eat the allowance the expensive
metered one needs to keep talking.

**One round trip, not three.** `spend_allowance(user, bucket, limit, window,
cap)` checks the kill switch, then the daily cap, then the rate limit, and
returns one verdict. `/api/voice/tts` is on the critical path of every reply she
speaks, so three sequential checks would be three hops added to
`ttsFirstByteMs`.

**The order is the design.** Kill switch, then cap, then rate limit — so a
halted account never has its allowance consumed. Being switched off must not
also cost you the allowance you need when you are switched back on.

| Gate | Where | Reset |
|---|---|---|
| Project-wide halt | `NERVE_SPEND_HALT` env var | By hand |
| Account halt | `entitlements.spend_halted_at` | By hand, service role only |
| Daily cap | Summed off `usage_ledger` | Midnight in the user's own timezone |
| Rate limit | `rate_limits` | When the window rolls |

`rate_limits` has **RLS on and no policies whatsoever**. Not readable and not
writable by any user token: a rate limit somebody can read is one they can pace
themselves against, and one they can write is not a limit. `spend_allowance` is
`security definer` and revoked from `public`, `anon` and `authenticated` — a
user who could call it could burn their own allowance, or read another account's
spend by passing a different uuid.

**It fails open on an unreachable database, on purpose.** If the allowance
cannot be read, refusing every paid route turns a database blip into a total
outage and ends live reps mid-sentence. What is still standing in that case: the
session check, the rep quota at `/api/voice/token`, and the project-wide switch,
which needs no database at all and is checked first.

The per-bucket limits are several times what a real three-minute rep does. §05
says nothing may interrupt a live rep, so a limit a real session can reach is a
limit that will eventually cut somebody off mid-sentence.

`npm run db:spend` proves all of it against the real database.

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

### Retiring a character unpublishes her, and never deletes her

The roster went from eight characters to three on 24 August (`LAUNCH-GAP.md`
D10a). The five who left are **unpublished, not removed**, and `npm run db:seed`
is what performs it: anything in `RETIRED_PERSONAS` and still published gets
`published = false`.

Deleting the row was never an option. `sessions.persona_id` references this
table and `sessions.persona_slug` is denormalised beside it for exactly this
case, so a rep somebody ran against Priya a month ago stays a complete,
readable record with a name on it. The roster query already filtered on
`published`, so nothing else had to change — the retirement path was built into
the schema from M1 and this is the first time it has been used.

Two details worth knowing before running it:

- **It only fires on a full seed.** `npm run db:seed -- nadia` is a targeted
  re-seed and must not decide roster membership as a side effect.
- **It is reversible.** Put the character back in `PERSONAS`, re-seed, and the
  upsert republishes her. Nothing about retirement is destructive.

`field_challenges` has no equivalent: `npm run db:content` upserts by slug and
does **not** unpublish a challenge that disappears from the registry, so
removing one there leaves a live row behind. That is why the retired
`ask-alex` challenge kept its slug and had only its copy rewritten.

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

**Character memory is the user's, and that is why they can delete it.**
`persona_memory` grants its owner all four verbs, unlike almost everything else
on this page. The test is not "is it progression" but "would anybody pay to
change it": plan, quota, streak and the ladder position all fail that test and
are service-role write, and what Nadia remembers about a bookshop passes it.
The reset in Settings needs the DELETE, and nothing is lost by granting it.

What protects this table is not a policy, it is `lib/grade/memory.ts`. The line
is generated by the grader and then checked before it is stored — second
person, affection and anticipation, and judgement about how he did are all
rejected, and a line that fails is simply dropped. That is a §14 constraint
rather than a style preference: a character who is pleased to see you is a
companion app, and every merchant of record on the shortlist bans those by name.

**The log cannot be rewritten, including by the person who wrote it.**
`field_logs` grants insert, select and delete — and no update, at any level.
Predicted-versus-actual is the one chart that carries the therapeutic claim
(§09), and a number you can revise after the fact is not evidence.

**What is unlocked stays derived; `unlocks` only records when we said so.** A
stored copy of a derived fact is a stored copy that can disagree with it, and
an unlock lost to a failed write is an unlock somebody earned and cannot see.
The table exists so the level-unlocked moment fires once rather than on every
visit to the scorecard, and so a cohort's time-to-Level-3 is answerable later.

Since `m4_milestone_unlocks` the `kind` check also accepts `'milestone'`, and
rejection milestones at 10 / 25 / 50 / 100 are the first thing that actually
writes this table (`ref` is `rejections:10`). They belong here rather than on
`profiles.ui_flags` for the reason the whole table exists: `unlocks` is
service-role write and read-only to its owner, so a user cannot re-fire or
suppress a moment they did not earn. The count behind it is read off
`field_logs`, which nobody can rewrite. `announced_at` is stamped when the sheet
is *dismissed* rather than when it renders, so closing the tab on the tenth ask
means the moment lands next time instead of being lost.

### The keys `profiles.ui_flags` carries

The column is `jsonb`, user-writable, and holds notes about what has been
*displayed* or *asked* — never anything earned. The names live in code, not
here: `lib/data/ui-flags.ts` for the ones any screen stamps, and
`lib/data/guards.ts` for the three the route guard reads.

| Key | Written by | Read by |
|---|---|---|
| `onboarding:track` | the track step | `onboardingResumePath`, and the step itself, to tell an answer from `active_track`'s database default |
| `onboarding:name` | the name step, answered **or skipped** | `onboardingResumePath` — an empty `display_name` is a legitimate answer |
| `onboarding:deferred` | *Look around first* on the mic step | `enforceFrontendGuard` and `app/page.tsx`, which let a deferred run move as freely as a finished one while leaving `onboarding_complete` false — that is what makes the step returnable, and what puts the *Finish setup* row on `/train` |
| `waitlist:track:interview` | the track step's interview option | nothing yet; it is the demand signal M4 is scheduled against |
| `waitlist:pro` · `waitlist:elite` | `/pricing` and `/profile/subscription` | nothing yet; the same argument, for plans that cannot be sold |
| `memory_intro` · `library:<slug>` | the first memory beat, a card being read | the screens that must not repeat themselves |

The boundary is the point. Clearing any of these costs the user an explainer
shown twice. Anything that records something *earned* — a level, a field tier,
a rejection milestone — goes to `unlocks`, which is service-role write.

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

## Two tables a user would genuinely benefit from writing

`entitlements` is the obvious one and it has no write path. Two more joined it:

**`difficulty_offsets`** is the strongest case in the product. Turning your own
difficulty down is precisely the thing that would make every score afterwards
meaningless, so it is service-role write and read-only to its owner — and the
clamps (±6 on start, ±0.25 on gain) are CHECK constraints as well as code. A bug
that wrote -40 would turn Level 6 into Level 2 permanently *and silently*, and
silence is exactly what §12 requires of the downward path, so the database
refuses the value rather than trusting the caller to.

**`text_threads`** is the exception that proves the rule, and it is genuinely
different. §14's test is "could a user pay to change this?", and nobody would
pay to change what they themselves typed: a text thread spends no quota, appends
nothing to `usage_ledger` at a per-minute rate, moves no streak, produces no
scorecard and reaches no unlock. So it gets all four verbs, like
`persona_memory` — including DELETE, because **start fresh** has to actually
clear the row or it is a lie. One thread per person per character, rolled
forward in place under a unique index: the continuity rule is that this is ONE
encounter a later hello does not restart, and a list of past chats would be a
different feature making a different promise.

**`share_cards`** has one policy: its owner may read their own, in order to
revoke them. Creation is a Server Action, so a user cannot mint a card claiming
a number they never earned. There is deliberately **no anonymous policy** — the
public page resolves the 32-hex token with the service role, which keeps the
table un-enumerable. Revocation sets a timestamp rather than deleting the row,
because "I revoked that" is information the user is entitled to keep.

## `sessions.pipeline_incidents` — evidence that the transcript is evidence

A transcript is only worth grading if it is what the user actually heard. Until
24 Aug there was no way to tell a rep the user played badly from a rep where the
transport misbehaved — she was cut off on most replies, or real user turns were
deleted as echo — because every one of those incidents was emitted as an event
and listened to by nothing outside the M0 harness.

`sessions.pipeline_incidents` is a nullable jsonb counting the seven things that
can go wrong in a live rep: `overlaps`, `doubleTurns`, `unheard`, `truncated`,
`echoRejected`, `toolLeaks`, `providerErrors`. Service-role written like the
rest of the row, read-only to its owner under the existing policies.

Nullable **and** always written on a healthy rep, which is the point: an all-zero
record and a null mean different things, and "no incidents" has to stay
distinguishable from "not measured". Rows written before the counters existed
are null and stay null.

`incidentsAreAlarming` in `lib/voice/incidents.ts` reads it as rates rather than
counts — a handful of anything across three minutes is a conversation with some
barge-in in it, not a fault.

## A rule change that invalidated stored rows

`sessions.won` is decided by the meter — armed at `ARM_THRESHOLD`, still willing
at `KEEP_THRESHOLD` — and by nothing else. It briefly was not: `wonFromRep`
short-circuited on the grader's outcome, so a pleasant conversation whose meter
never armed could be stored as a win after the fact, contradicting the result
screen the user had already seen.

`npm run db:repair-wins` corrects rows written under the old rule. It is
idempotent, and it only undoes the half that is unambiguous: a peak below
`ARM_THRESHOLD` can never have been armed, whereas a final below
`KEEP_THRESHOLD` may be a legitimate win whose closing line drifted — `won` is
decided from the warmth at the *wind-down*, and no column stores that moment.
Rows with no meter at all are never touched.

## Commands

```bash
npm run db:seed          # mirror the persona registry; unpublish anyone retired
npm run db:seed -- nadia # just one
npm run db:content       # mirror the challenge and technique libraries
npm run db:verify        # prove RLS holds, with two real users
npm run db:rep           # drive a whole rep lifecycle, without a microphone
npm run db:field         # the field loop: assign, accept, log, streak, counters, milestones, the T4 gate
npm run db:spend         # the spend ceiling: rate limit, daily cap, both kill switches
npm run db:billing       # the billing loop: grant, upgrade, dunning, expiry, dispute, replay
npm run db:types         # regenerate lib/db/types.ts from the live schema
npm run db:plan -- you@example.com pro   # grant a plan (free 0/day, pro 3, elite 6)
npm run db:repair-wins -- --dry          # wins the old outcome rule invented; drop --dry to fix
npm run grade:collect                   # stored transcripts, in calibration-fixture shape
npm run grade:calibrate                 # the §17 gate: drift on the deployed /api/grade
```

`db:plan` exists because `entitlements` has no write path a user can reach, and
a fresh account is free — which since 31 August is **no** voice reps at all past
the sign-up one, so a dev account that needs a microphone needs this script. It
reads its rep counts from `lib/site/plans.ts` rather than keeping its own copy. It stays the manual override now that the webhook exists: an account
that has to be fixed by hand at 2am should not need a merchant of record to be
reachable.

`db:billing` drives `lib/billing/apply.ts` over the real tables — a purchase
grants the plan and writes the mirror, an upgrade moves both, `past_due` keeps
access while the provider retries, expiry and a dispute land back on free, a
redelivered event changes nothing, and a *late* retry cannot resurrect a plan a
later event revoked. It finishes by signing in as the user and proving they can
read their subscription and cannot write it (rule 9). It creates its own user
and deletes it, like the others. The one thing it cannot prove is a real
delivery from Creem: that needs a public URL and a registered endpoint.

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
- **The middle six have not been re-measured since the cap retune.** The
  three-minute format change brought `maxGainPerTurn` down on every rung; the
  ladder is asserted at three turn counts by a test, but only Nadia and Alex
  have been watched behaving under it.
