# Nerve

Voice-AI conversation gym. Users do timed voice reps against AI characters who can
lose interest, get distracted and say no, then take graded rejection challenges into
the real world and log the outcome.

## Start every session here

1. **Read `docs/README.md`.** It is the index and it says which doc answers what.
2. **`docs/M2-PLAN.md` is what to do next.** Items are in dependency order with
   sizes and acceptance criteria; shipped ones are marked, so the first
   unmarked item is the job.
3. **`docs/LAUNCH-GAP.md` is what is blocking launch.** Ten numbered blockers,
   the product-promise gaps, and eight pieces of spec drift that need a
   decision rather than a ticket.
4. **`docs/NERVE-SPEC.md` is the specification.** Section numbers (§04, §07,
   §14…) are cited throughout the code and the docs; when a rule here says
   "§07", that is where it comes from. Read it before implementing anything
   substantial.

**Then finish the loop: build it, verify it, and update the docs.** A change
that ships with stale docs is not finished — the table at the bottom of
`docs/README.md` says which doc to touch for which kind of change. Mark plan
items shipped with what actually landed *and* what is still owed by hand;
future sessions read those markers to decide what to do.

## Verify before saying it is done

```bash
npm run typecheck     # tsc --noEmit
npm run lint
npm test              # vitest, ~410 assertions
npm run build:check   # production build into .next-check, never .next
npm run db:verify     # RLS from a second real account, 51 checks
npm run db:rep        # the whole rep lifecycle, without a microphone
npm run db:field      # the field loop: assign, accept, log, streak
```

`db:*` scripts run against the real project and clean up after themselves.
Never run `next build` into `.next` while a dev server is up — see the note in
`next.config.ts`.

## Stack

- Next.js 15 (App Router) on Vercel — RSC for read paths, client components only around the live session
- Supabase — Postgres + Auth (email OTP, password, Google) + Storage; **RLS on every table, no exceptions**
- OpenAI Realtime `gpt-realtime-mini` over WebRTC, behind a `VoiceProvider` interface, with an ElevenLabs adapter (§04)
- Merchant of record for billing (Creem primary) — **not Stripe**; Stripe does not operate in Sri Lanka (§14)
- PostHog analytics and Sentry errors are specified and **not yet installed** — see `LAUNCH-GAP.md` B7

## Rules that are not negotiable

1. **Nothing in the app layer imports a provider SDK.** All voice access goes through
   `lib/voice/provider.ts`. Both adapters emit identical normalised transcript turns
   `{ speaker, text, t_start, t_end }` — scoring depends on this and a provider switch
   must not break score comparability. (§04)
2. **Outcome is never scored.** A clean rep that ends in rejection can score 92.
   Score process, never result. (§07)
3. **The rep format is product law.** Three minutes. Warmth 65 *arms* the rep
   silently; thirty seconds from the end she is told either to leave or to
   offer her number; she keeps it if she is still at 55 or above. She never
   speaks digits. The rules live in `lib/data/rep-rules.ts` as pure functions
   with tests — change them there, not in the hook.
4. **No spinners.** Skeletons that match the shape of the arriving content. (§02)
5. **Never announce a downward difficulty adjustment.** Silent. (§08, §12)
6. **No coaching during a live rep.** Timer, waveform, mission. Nothing else. (§05)
7. **Content is authored in the repo and seeded, never generated at runtime.**
   Personas, field challenges and library cards live in `lib/`, are reviewed in
   a pull request, and reach the database through `npm run db:seed` and
   `npm run db:content`. For field challenges this is a safety rule, not a
   preference: the worst realistic outcome of any challenge is a polite no. (§09, §16)
8. **Anything a user could pay to change has no user write path.** Plan, quota,
   streak, unlocks and subscriptions are read-only to their owner and written
   by the service role. The ledger is append-only and the field log cannot be
   rewritten by anybody, including the person who wrote it. (§14, §09)
9. **No clinical claims anywhere.** "Confidence training", never "treatment". (§16)
10. **PG-13, enforced by moderation on both streams.** Payment-processor survival. (§16)
    Moderation is specified and **not yet built** — `LAUNCH-GAP.md` B3.

## Design system — Arena

Dark only, no light mode. Athletic performance aesthetic: data is the hero.

- Ground `#0B0C0A` · Surface `#131511` · Surface-2 `#191C16` · Line `#242820`
- Volt `#C4F82A` — the ONLY accent. Live state, primary action, composite score, current
  position. If volt appears twice on a screen, one of them is wrong.
- Cool `#5AA9FF` — second data series only, never an action colour
- Amber `#FFB020` / Red `#FF4D3D` — semantic only, never branding
- Ink `#EDEFE8` · Ink-2 `#9DA396` · Ink-3 `#6A7062`
- Type: Barlow Condensed 700 (display, uppercase) / IBM Plex Sans (body) / IBM Plex Mono (data)
- **Border radius max 2px.** Hairlines, never shadows. `tabular-nums` on all digits.

## Conventions

- TypeScript strict. No `any` in `lib/voice/`.
- Server Actions for mutations; optimistic UI on every write (§02). Actions
  return `{ ok, message }` rather than throwing — a thrown Server Action error
  reaches the client as an opaque digest.
- Persistence is best-effort around a live rep: a failed write must never end
  the conversation.
- Every user-facing string is hand-authored — empty states included. No placeholder copy.
- `prefers-reduced-motion` respected everywhere, score reveal included.
- Provider, model and rate stamped on every `usage_ledger` and `scores` row.
- Schema changes go through the Supabase MCP, one migration per change, and the
  matching file is committed to `supabase/migrations/`. **Applied migrations are
  a record — never edit one after it has run**, the same way `docs/M0.md` is
  never rewritten.
