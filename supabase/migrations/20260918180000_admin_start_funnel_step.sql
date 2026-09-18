-- The one thing the traffic counter could not see: where inside `/start`
-- somebody stopped.
--
-- `page_views.path` is a route SHAPE, and `/start` is one route with eight
-- screens behind it — the run holds its position in React state and never
-- touches the URL. So the admin panel's "Where they landed" reported `/start`
-- as a single row, and D21's actual question — *the per-step drop is* — was
-- unanswerable from first-party data. It was only answerable from PostHog's
-- `start_step_viewed`, and PostHog has never been keyed.
--
-- `step` is nullable and only ever set for `/start`. It is not a second path
-- column: it carries the authored `StartStep` name and nothing else, checked
-- here as well as in the route, because a free-text column reachable from the
-- browser is how a traffic table becomes a log of whatever somebody posts.

alter table public.page_views
  add column step text,
  add constraint page_views_step_len check (step is null or char_length(step) <= 24);

create index page_views_step_at_idx on public.page_views (step, at desc)
  where step is not null;

comment on column public.page_views.step is
  'The /start screen, for the funnel. Null on every other path. An authored StartStep name, never free text.';

-- Views and distinct visitors per step, newest window first. The ORDER is the
-- caller's job: the run's own step list is the only place that knows it, and
-- duplicating it here would be a second copy to drift.
create or replace function public.admin_start_funnel(days integer default 7)
returns table (step text, views bigint, visitors bigint)
language sql
security definer
set search_path = ''
as $$
  select
    v.step,
    count(*)::bigint as views,
    count(distinct v.visitor)::bigint as visitors
  from public.page_views v
  where v.step is not null
    and v.at >= now() - make_interval(days => greatest(1, least(days, 180)))
  group by v.step
$$;

revoke all on function public.admin_start_funnel(integer) from public, anon, authenticated;

comment on function public.admin_start_funnel(integer) is
  'Per-screen counts for the /start run. Service role only, like every other admin_* function.';
