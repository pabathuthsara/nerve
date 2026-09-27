-- START-AUDIT-2026-09-27 §1.6: which post brought anybody.
--
-- 67 of 79 visitors in the audit window arrived "direct", because TikTok's
-- and Instagram's in-app browsers send no referrer — so nothing could say
-- which of three posts a day was worth making more of. The link's own tag
-- (`utm_source`, `utm_content`) is the one signal those browsers do not strip.
--
-- Two nullable columns, allow-listed here as well as in `normaliseTag`, for
-- the reason `step` is: a free-text column reachable from a browser is a log
-- of whatever somebody posts. Additive: every existing writer keeps working.

alter table public.page_views
  add column source text,
  add column content text,
  add constraint page_views_source_tag check (source is null or source ~ '^[a-z0-9._-]{1,40}$'),
  add constraint page_views_content_tag check (content is null or content ~ '^[a-z0-9._-]{1,40}$');

create index page_views_source_at_idx on public.page_views (source, at desc)
  where source is not null;

comment on column public.page_views.source is
  'utm_source off the link, first touch within the tab. Allow-listed; null when untagged.';
comment on column public.page_views.content is
  'utm_content off the link (which post). Allow-listed; null when untagged.';

-- Per tag: how many people it brought, how many reached the account screen,
-- and how many were later seen signed in on the same visitor digest that day.
-- First touch per visitor, so one person who reloads is one row.
create or replace function public.admin_top_sources(days integer default 7, lim integer default 12)
returns table (source text, content text, visitors bigint, reached_account bigint, signed_in bigint)
language sql
security definer
set search_path = ''
as $$
  with window_views as (
    select v.* from public.page_views v
    where v.at >= now() - make_interval(days => greatest(1, least(days, 180)))
  ),
  first_touch as (
    select distinct on (w.visitor) w.visitor, w.source, w.content
    from window_views w
    where w.source is not null
    order by w.visitor, w.at
  )
  select
    f.source,
    f.content,
    count(*)::bigint as visitors,
    count(*) filter (where exists (
      select 1 from window_views a where a.visitor = f.visitor and a.step = 'account'
    ))::bigint as reached_account,
    count(*) filter (where exists (
      select 1 from window_views u where u.visitor = f.visitor and u.user_id is not null
    ))::bigint as signed_in
  from first_touch f
  group by f.source, f.content
  order by visitors desc
  limit greatest(1, least(lim, 50))
$$;

revoke all on function public.admin_top_sources(integer, integer) from public, anon, authenticated;

comment on function public.admin_top_sources(integer, integer) is
  'Campaign tags with people, account-screen reach and signed-in count. Service role only, like every other admin_* function.';
