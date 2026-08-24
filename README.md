# nerve
A training gym for the conversations you avoid. Live voice reps against AI people who can lose interest, get distracted, and say no — paired with real-world rejection challenges and a scorecard that measures how you played, not whether you won.

## Working on it

Everything written down lives in [`docs/`](docs/README.md) — the
specification, the current plan, the launch-gap audit and the engineering
notes. `CLAUDE.md` is the standing brief for an agent picking the work up.

```bash
npm run dev           # the app
npm test              # unit tests
npm run db:verify     # prove RLS holds, from a second real account
npm run cost:model    # what a rep costs, projected off M0's measured runs
```

