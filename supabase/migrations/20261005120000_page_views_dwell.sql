-- START-FIRST-SCREEN-PLAN-2026-10-05 Part A: why 0 of 55 paid visitors
-- answered the first question of /start.
--
-- The table could only say that somebody arrived. These three columns say
-- whether they stayed, whether they touched anything, and which server
-- render a browser row belongs to.
--
--   dwell_s    A1. A heartbeat at 3, 10 or 30 seconds of VISIBLE time on the
--              first /start screen. A heartbeat that arrived proves the
--              visitor was still there; an exit beacon that never arrived
--              proves nothing, because in-app browsers drop pagehide.
--   touched    A1. The first pointerdown anywhere on that screen. Only ever
--              true; absence is the "no".
--   render_id  A2. 16 random hex characters minted by app/start/page.tsx per
--              render, written on the `served` row and carried by every beacon
--              from that render. The visitor digest (ip + user agent) joined
--              77 of 136 served visitors to their browser rows on 1-5 Oct;
--              this joins all of them. Not a cookie, never stored in the
--              browser, new on every load, so it cannot follow anybody.
--
-- Allow-listed here as well as in lib/analytics/pageview.ts, for the reason
-- `step` and `source` are: a column a browser can reach is a log of whatever
-- somebody posts. Additive and nullable: every existing writer keeps working.

alter table public.page_views
  add column dwell_s smallint,
  add column touched boolean,
  add column render_id text,
  add constraint page_views_dwell_s check (dwell_s is null or dwell_s in (3, 10, 30)),
  add constraint page_views_touched check (touched is null or touched),
  add constraint page_views_render_id check (render_id is null or render_id ~ '^[0-9a-f]{16}$');

create index page_views_render_id_idx on public.page_views (render_id)
  where render_id is not null;

comment on column public.page_views.dwell_s is
  'Seconds of visible time on the first /start screen (3, 10 or 30), one row per heartbeat. Null on every other row.';
comment on column public.page_views.touched is
  'True on the one row sent at the first touch on the first /start screen. Null otherwise.';
comment on column public.page_views.render_id is
  'Random per-render id of a /start server render, on its served row and every beacon from it. Not a cookie.';
