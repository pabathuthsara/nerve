# Nerve

Voice-AI conversation gym. Users do timed voice reps against AI characters who can
lose interest, get distracted and say no, then take graded rejection challenges into
the real world and log the outcome.

**The full specification is in `NERVE-SPEC.md`. Read it before implementing anything.**
Section numbers below refer to that file.

## Stack

- Next.js 15 (App Router) on Vercel — RSC for read paths, client components only around the live session
- Supabase — Postgres + Auth (email OTP + Google) + Storage; **RLS on every table, no exceptions**
- OpenAI Realtime `gpt-realtime-mini` over WebRTC, behind a `VoiceProvider` interface (§04)
- Merchant of record for billing (Creem primary) — **not Stripe**; Stripe does not operate in Sri Lanka (§14)
- PostHog analytics, Sentry errors (session replay off on the live-session route)

## Rules that are not negotiable

1. **Nothing in the app layer imports a provider SDK.** All voice access goes through
   `lib/voice/provider.ts`. Both adapters emit identical normalised transcript turns
   `{ speaker, text, t_start, t_end }` — scoring depends on this and a provider switch
   must not break score comparability. (§04)
2. **Outcome is never scored.** A clean rep that ends in rejection can score 92.
   Score process, never result. (§07)
3. **No spinners.** Skeletons that match the shape of the arriving content. (§02)
4. **Never announce a downward difficulty adjustment.** Silent. (§08, §12)
5. **No coaching during a live rep.** Timer, waveform, mission. Nothing else. (§05)
6. **Field challenges are hand-written and human-reviewed.** Never model-generated at
   runtime. Worst realistic outcome must be a polite no. (§09)
7. **No clinical claims anywhere.** "Confidence training", never "treatment". (§16)
8. **PG-13, enforced by moderation on both streams.** Payment-processor survival. (§16)

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

## Build order

Work milestone by milestone from §17. **Do not skip M0.** Its gate — sub-900ms round
trip from Sri Lanka and fewer than 0.5 character breaks per 5-minute session — decides
whether the rest of the plan is viable at all.

## Conventions

- TypeScript strict. No `any` in `lib/voice/`.
- Server Actions for mutations; optimistic UI on every write.
- Every user-facing string is hand-authored — empty states included. No placeholder copy.
- `prefers-reduced-motion` respected everywhere, score reveal included.
- Provider, model and rate stamped on every `usage_ledger` and `scores` row.
