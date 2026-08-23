-- M3 — the technique library (§10 D).
--
-- Seven MVP features share one table: the technique cards, the technique of
-- the session tied to the weakest sub-score, the opener bank by setting, the
-- follow-up ladders, the recovery lines and the exit scripts. They are the
-- same shape — a short idea, why it works, and examples — so they are one
-- table with a `kind`, not six tables that would all need the same reader.
--
-- Content, like personas and challenges: authored in the repo, seeded
-- downstream, never generated at runtime. The scorecard links the two weakest
-- sub-scores here, which is the only reason `targets` exists.

create table public.techniques (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  kind        text not null default 'technique'
              check (kind in ('technique', 'opener', 'ladder', 'recovery', 'exit')),
  title       text not null,
  -- One line, shown in the list.
  summary     text not null,
  -- The idea and why it works. Markdown, a few short paragraphs.
  body        text not null,
  -- Sub-scores this improves, so a scorecard can link to it by name.
  targets     text[] not null default '{}',
  -- Gym, cafe, party, transit, work. Only meaningful for openers.
  setting     text,
  -- Three concrete lines. Examples, never scripts to memorise.
  examples    jsonb not null default '[]'::jsonb,
  -- Which drill to run next, if any. A technique with a rep attached is a
  -- technique somebody might actually practise.
  drill       text,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index techniques_kind_idx on public.techniques (kind) where published;

create trigger techniques_touch
  before update on public.techniques
  for each row execute function public.touch_updated_at();

alter table public.techniques enable row level security;

create policy "techniques: read published" on public.techniques
  for select to authenticated
  using (published);
