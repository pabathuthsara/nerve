-- A voice envelope big enough for an interview, and a daily ceiling that knows
-- about credits (INTERVIEW-PLAN A1, A5).
--
-- Three problems, all of them the same shape: the server-owned voice accounting
-- was sized against a three-minute dating rep and an interview is up to
-- twenty-five minutes on a paid item.
--
--  1. `voice_session_open` refuses any `p_live_seconds` outside 180-300, and
--     spends `entitlements.reps_used_today` — the DATING quota. An interview
--     must spend a credit and must not touch that counter at all.
--  2. `voice_session_close` and `voice_session_refund_empty` hand a rep back to
--     `reps_used_today` unconditionally, so an aborted interview would credit a
--     dating rep nobody took.
--  3. `DAILY_CAP_CENTS` is five times a plan's honest day of three-minute reps
--     and halts a free account after roughly 1.7 twenty-minute interviews.
--
-- RULE 19 SHAPES THE FIX. `voice_session_open` is left alone apart from one
-- line, and the interview gets its OWN open function beside it rather than a
-- parameter added to the one the dating rep calls. The two guards below are
-- edits to shared functions and are provable no-ops for dating: a dating
-- session's `quota_kind` is 'plan' or 'signup' and never 'interview', and an
-- account with no interview credits gets a numerically identical cap.

-- 'interview' is a third way of paying for a rep: not the daily rate, not the
-- one-off sign-up rep, but a credit held against `interview_credit_holds`.
alter table public.voice_sessions drop constraint voice_sessions_quota_kind_check;
alter table public.voice_sessions add constraint voice_sessions_quota_kind_check
  check (quota_kind in ('plan', 'signup', 'interview'));

-- The ceiling on one account's day, in cents.
--
-- The plan's number, plus headroom for the credits it is holding. A5's rule is
-- that the extra room is keyed to something the SERVER owns — a credit balance
-- — and never to a figure the browser reports (rule 18).
--
-- **An account with no interview credits gets exactly the number it got
-- before**: 100 / 300 / 600. That is what makes replacing the two call sites a
-- provable no-op rather than an argument.
create function public.voice_daily_cap_cents(p_user_id uuid)
returns numeric language sql stable security invoker set search_path = '' as $$
  select
    (case (select e.plan from public.entitlements e where e.user_id = p_user_id)
       when 'elite' then 600 when 'pro' then 300 else 100 end)
    + 90 * greatest(0, coalesce((
        select sum(c.remaining) from public.interview_credit_balance(p_user_id) c
      ), 0));
$$;

revoke all on function public.voice_daily_cap_cents(uuid) from public, anon, authenticated;
grant execute on function public.voice_daily_cap_cents(uuid) to service_role;

-- Open an interview rep: a longer envelope, a bigger budget, and a credit
-- rather than a rep off the daily rate.
--
-- Deliberately a SEPARATE function and not a parameter on `voice_session_open`.
-- Duplicating forty lines of plpgsql is the trade §0 asks for: the alternative
-- is opening the one function every dating rep in production goes through.
--
-- The credit itself is held by `lib/db/credits.ts` before this is called, and
-- the hold is keyed on the session id — which is why this one does not need to
-- decrement anything. Nothing here writes `entitlements`.
create function public.voice_session_open_interview(
  p_user_id uuid, p_persona_slug text, p_provider text, p_model text,
  p_context jsonb, p_budget_usd numeric, p_grade_reserve_usd numeric,
  p_live_seconds integer, p_grade_seconds integer, p_resource_limits jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_ent public.entitlements%rowtype; v_session public.voice_sessions%rowtype;
  v_zone text; v_day date; v_id uuid; v_persona uuid; v_cap numeric;
begin
  -- The live window runs from five minutes (the screener) to thirty (a
  -- twenty-five minute round plus its connection and wind-down grace).
  if p_budget_usd<=0 or p_budget_usd>1 or p_grade_reserve_usd<0 or p_grade_reserve_usd>p_budget_usd
    or p_live_seconds not between 300 and 1800 or p_grade_seconds not between 60 and 900
    or length(p_persona_slug) not between 1 and 80 or jsonb_typeof(p_context)<>'object'
    or jsonb_typeof(p_resource_limits)<>'object' then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  select * into v_ent from public.entitlements where user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','unavailable'); end if;
  if v_ent.spend_halted_at is not null then return jsonb_build_object('ok',false,'reason','halted'); end if;
  -- One live rep at a time, on either track. The dating function's own check
  -- would refuse an interview that started while a dating rep was open and
  -- vice versa, which is correct: a microphone is a microphone.
  select * into v_session from public.voice_sessions s
    where s.user_id=p_user_id and s.state='active' and s.expires_at>now()
    order by s.created_at desc limit 1 for update;
  if found then
    if v_session.persona_slug<>p_persona_slug or v_session.provider<>p_provider or v_session.model<>p_model
      or v_session.session_id is null then return jsonb_build_object('ok',false,'reason','busy'); end if;
    return jsonb_build_object('ok',true,'session_id',v_session.id,'expires_at',v_session.expires_at,
      'context',v_session.context,'resumed',true,'budget_usd',v_session.budget_usd);
  end if;
  v_cap:=public.voice_daily_cap_cents(p_user_id);
  if public.voice_spend_committed_cents(p_user_id)+p_budget_usd*100>v_cap
    then return jsonb_build_object('ok',false,'reason','cap'); end if;
  select coalesce(p.timezone,'UTC') into v_zone from public.profiles p where p.id=p_user_id;
  v_zone:=coalesce(v_zone,'UTC');
  if not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_zone) then v_zone:='UTC'; end if;
  v_day:=(now() at time zone v_zone)::date;
  select p.id into v_persona from public.personas p where p.slug=p_persona_slug;
  v_id:=gen_random_uuid();
  insert into public.sessions(id,user_id,persona_id,persona_slug,provider,model)
    values(v_id,p_user_id,v_persona,p_persona_slug,p_provider,p_model);
  insert into public.voice_sessions(id,session_id,user_id,persona_slug,provider,model,context,
    budget_usd,grade_reserve_usd,resource_limits,quota_kind,quota_day,expires_at,grade_expires_at)
    values(v_id,v_id,p_user_id,p_persona_slug,p_provider,p_model,p_context,p_budget_usd,p_grade_reserve_usd,
      p_resource_limits,'interview',v_day,
      now()+make_interval(secs=>p_live_seconds),now()+make_interval(secs=>p_live_seconds+p_grade_seconds))
    returning * into v_session;
  return jsonb_build_object('ok',true,'session_id',v_id,'expires_at',v_session.expires_at,
    'context',v_session.context,'resumed',false,'budget_usd',v_session.budget_usd);
end; $$;

revoke all on function public.voice_session_open_interview(uuid,text,text,text,jsonb,numeric,numeric,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.voice_session_open_interview(uuid,text,text,text,jsonb,numeric,numeric,integer,integer,jsonb) to service_role;

-- ONE LINE MOVED, and it is the cap. Everything else in this function is the
-- text that shipped on 5 September, character for character. An account with no
-- interview credits computes the same number it computed before.
create or replace function public.voice_session_open(
  p_user_id uuid, p_persona_slug text, p_provider text, p_model text,
  p_context jsonb, p_budget_usd numeric, p_grade_reserve_usd numeric,
  p_live_seconds integer, p_grade_seconds integer, p_resource_limits jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_ent public.entitlements%rowtype; v_session public.voice_sessions%rowtype;
  v_zone text; v_day date; v_used integer; v_plan_used integer;
  v_signup_today boolean; v_signup boolean; v_id uuid; v_persona uuid; v_cap numeric;
begin
  if p_budget_usd<=0 or p_budget_usd>1 or p_grade_reserve_usd<0 or p_grade_reserve_usd>p_budget_usd
    or p_live_seconds not between 180 and 300 or p_grade_seconds not between 60 and 900
    or length(p_persona_slug) not between 1 and 80 or jsonb_typeof(p_context)<>'object'
    or jsonb_typeof(p_resource_limits)<>'object' then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  select * into v_ent from public.entitlements where user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','unavailable'); end if;
  if v_ent.spend_halted_at is not null then return jsonb_build_object('ok',false,'reason','halted'); end if;
  select * into v_session from public.voice_sessions s
    where s.user_id=p_user_id and s.state='active' and s.expires_at>now()
    order by s.created_at desc limit 1 for update;
  if found then
    if v_session.persona_slug<>p_persona_slug or v_session.provider<>p_provider or v_session.model<>p_model
      or v_session.session_id is null then return jsonb_build_object('ok',false,'reason','busy'); end if;
    return jsonb_build_object('ok',true,'session_id',v_session.id,'expires_at',v_session.expires_at,
      'context',v_session.context,'resumed',true,'budget_usd',v_session.budget_usd);
  end if;
  v_cap:=public.voice_daily_cap_cents(p_user_id);
  if public.voice_spend_committed_cents(p_user_id)+p_budget_usd*100>v_cap
    then return jsonb_build_object('ok',false,'reason','cap'); end if;
  select coalesce(p.timezone,'UTC') into v_zone from public.profiles p where p.id=p_user_id;
  v_zone:=coalesce(v_zone,'UTC');
  if not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_zone) then v_zone:='UTC'; end if;
  v_day:=(now() at time zone v_zone)::date;
  v_used:=case when v_ent.reps_day=v_day then v_ent.reps_used_today else 0 end;
  v_signup_today:=v_ent.onboarding_rep_used_at is not null and (v_ent.onboarding_rep_used_at at time zone v_zone)::date=v_day;
  v_plan_used:=greatest(0,v_used-case when v_signup_today then 1 else 0 end);
  if v_plan_used>=greatest(0,v_ent.reps_per_day) and v_ent.onboarding_rep_used_at is not null then
    return jsonb_build_object('ok',false,'reason',case when v_ent.reps_per_day=0 then 'upgrade' else 'daily' end);
  end if;
  v_signup:=v_ent.onboarding_rep_used_at is null and v_used>=greatest(0,v_ent.reps_per_day);
  update public.entitlements set reps_day=v_day,reps_used_today=v_used+1,
    onboarding_rep_used_at=case when v_signup then now() else onboarding_rep_used_at end where user_id=p_user_id;
  select p.id into v_persona from public.personas p where p.slug=p_persona_slug;
  v_id:=gen_random_uuid();
  insert into public.sessions(id,user_id,persona_id,persona_slug,provider,model)
    values(v_id,p_user_id,v_persona,p_persona_slug,p_provider,p_model);
  insert into public.voice_sessions(id,session_id,user_id,persona_slug,provider,model,context,
    budget_usd,grade_reserve_usd,resource_limits,quota_kind,quota_day,expires_at,grade_expires_at)
    values(v_id,v_id,p_user_id,p_persona_slug,p_provider,p_model,p_context,p_budget_usd,p_grade_reserve_usd,
      p_resource_limits,case when v_signup then 'signup' else 'plan' end,v_day,
      now()+make_interval(secs=>p_live_seconds),now()+make_interval(secs=>p_live_seconds+p_grade_seconds))
    returning * into v_session;
  return jsonb_build_object('ok',true,'session_id',v_id,'expires_at',v_session.expires_at,
    'context',v_session.context,'resumed',false,'budget_usd',v_session.budget_usd);
end; $$;

-- Same one line, same reason. Every other character is the 5 September text.
create or replace function public.voice_operation_reserve(
  p_user_id uuid,p_session_id uuid,p_persona_slug text,p_operation_id text,p_kind text,
  p_model text,p_max_cost_usd numeric,p_resources jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_ent public.entitlements%rowtype; v_session public.voice_sessions%rowtype;
  v_cap numeric; v_grade_committed numeric; v_protected numeric; v_count integer;
  v_key text; v_value jsonb; v_total numeric; v_resources jsonb;
begin
  if p_kind not in ('turn','llm','tts','stt','warmth','grade') or length(p_operation_id) not between 1 and 120
    or p_max_cost_usd<=0 or p_max_cost_usd>1 or jsonb_typeof(p_resources)<>'object'
    then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  select * into v_ent from public.entitlements where user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','unavailable'); end if;
  if v_ent.spend_halted_at is not null then return jsonb_build_object('ok',false,'reason','halted'); end if;
  select * into v_session from public.voice_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found or v_session.session_id is null or (p_persona_slug is not null and v_session.persona_slug<>p_persona_slug)
    then return jsonb_build_object('ok',false,'reason','missing'); end if;
  if v_session.state='aborted' or (p_kind<>'grade' and v_session.state<>'active')
    then return jsonb_build_object('ok',false,'reason','closed'); end if;
  if (p_kind='grade' and now()>=v_session.grade_expires_at) or (p_kind<>'grade' and now()>=v_session.expires_at)
    then return jsonb_build_object('ok',false,'reason','expired'); end if;
  if exists(select 1 from public.voice_operations where session_id=p_session_id and operation_id=p_operation_id)
    then return jsonb_build_object('ok',false,'reason','duplicate'); end if;
  if p_kind in ('turn','llm') and (select count(*) from public.voice_operations
    where session_id=p_session_id and kind in ('turn','llm') and state='reserved')>=3
    then return jsonb_build_object('ok',false,'reason','busy'); end if;
  -- The per-kind operation ceiling scales with the envelope, because a
  -- twenty-five minute interview is ~22 exchanges against a dating rep's ~14
  -- and the flat 40/80 was sized for the second. An interview session is the
  -- only thing that gets the wider count; a dating session is unchanged.
  select count(*) into v_count from public.voice_operations where session_id=p_session_id and kind=p_kind;
  if v_count >= (case
      when v_session.quota_kind='interview' then (case p_kind when 'grade' then 1 when 'stt' then 4 when 'tts' then 240 else 120 end)
      else (case p_kind when 'grade' then 1 when 'stt' then 2 when 'tts' then 80 else 40 end) end)
    then return jsonb_build_object('ok',false,'reason','resources'); end if;
  v_cap:=public.voice_daily_cap_cents(p_user_id);
  if public.voice_spend_committed_cents(p_user_id)>v_cap
    then return jsonb_build_object('ok',false,'reason','cap'); end if;
  select coalesce(sum(case when state='reserved' then max_cost_usd else cost_usd end),0)
    into v_grade_committed from public.voice_operations where session_id=p_session_id and kind='grade';
  v_protected:=case when p_kind='grade' then 0 else greatest(0,v_session.grade_reserve_usd-v_grade_committed) end;
  if v_session.spent_usd+v_session.reserved_usd+p_max_cost_usd+v_protected>v_session.budget_usd
    then return jsonb_build_object('ok',false,'reason','budget'); end if;
  v_resources:=v_session.resources;
  for v_key,v_value in select * from jsonb_each(p_resources) loop
    if not (v_session.resource_limits ? v_key) or jsonb_typeof(v_value)<>'number'
      then return jsonb_build_object('ok',false,'reason','invalid'); end if;
    if (v_value::text)::numeric<0 or trunc((v_value::text)::numeric)<>(v_value::text)::numeric
      then return jsonb_build_object('ok',false,'reason','invalid'); end if;
    v_total:=coalesce((v_resources->>v_key)::numeric,0)+(v_value::text)::numeric;
    if v_total>(v_session.resource_limits->>v_key)::numeric
      then return jsonb_build_object('ok',false,'reason','resources'); end if;
    v_resources:=jsonb_set(v_resources,array[v_key],to_jsonb(v_total));
  end loop;
  insert into public.voice_operations(session_id,operation_id,user_id,kind,model,max_cost_usd,resources)
    values(p_session_id,p_operation_id,p_user_id,p_kind,p_model,p_max_cost_usd,p_resources);
  update public.voice_sessions set reserved_usd=reserved_usd+p_max_cost_usd,resources=v_resources where id=p_session_id;
  return jsonb_build_object('ok',true,'context',v_session.context,
    'expires_at',case when p_kind='grade' then v_session.grade_expires_at else v_session.expires_at end);
end; $$;

-- AN ABORTED INTERVIEW MUST NOT HAND BACK A DATING REP.
--
-- Both of these refund `entitlements.reps_used_today`, which an interview never
-- spent. The guard is `quota_kind='interview'`, which no dating session has ever
-- carried — so the dating branch is the branch it was, and the credit is given
-- back by `releaseInterviewCredit` instead.
create or replace function public.voice_session_close(p_user_id uuid,p_session_id uuid,p_abort boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_ent public.entitlements%rowtype; v_session public.voice_sessions%rowtype; v_refund boolean:=false;
begin
  select * into v_ent from public.entitlements where user_id=p_user_id for update;
  select * into v_session from public.voice_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','missing'); end if;
  if v_session.state<>'active' then return jsonb_build_object('ok',true,'refunded',false); end if;
  if p_abort and v_session.activated_at is null and not exists(select 1 from public.voice_operations
    where session_id=p_session_id and kind<>'stt') and v_session.refunded_at is null then
    if v_session.quota_kind<>'interview' then
      update public.entitlements set
        reps_used_today=case when reps_day=v_session.quota_day then greatest(0,reps_used_today-1) else reps_used_today end,
        onboarding_rep_used_at=case when v_session.quota_kind='signup' and onboarding_rep_used_at=v_session.quota_stamp
          then null else onboarding_rep_used_at end where user_id=p_user_id;
    end if;
    v_refund:=true;
  end if;
  update public.voice_sessions set state=case when p_abort then 'aborted' else 'closed' end,
    closed_at=now(),grade_expires_at=least(grade_expires_at,now()+interval '10 minutes'),
    refunded_at=case when v_refund then now() else refunded_at end where id=p_session_id;
  if p_abort then update public.sessions set ended_at=coalesce(ended_at,now()),ended_by='error',
    duration_s=coalesce(duration_s,0) where id=v_session.session_id; end if;
  return jsonb_build_object('ok',true,'refunded',v_refund);
end; $$;

create or replace function public.voice_session_refund_empty(p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_session public.voice_sessions%rowtype;
begin
  perform 1 from public.entitlements where user_id=p_user_id for update;
  select * into v_session from public.voice_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','missing'); end if;
  if v_session.refunded_at is not null or exists(select 1 from public.voice_operations
    where session_id=p_session_id and kind<>'stt')
    then return jsonb_build_object('ok',true,'refunded',false); end if;
  if v_session.quota_kind<>'interview' then
    update public.entitlements set
      reps_used_today=case when reps_day=v_session.quota_day then greatest(0,reps_used_today-1) else reps_used_today end,
      onboarding_rep_used_at=case when v_session.quota_kind='signup' and onboarding_rep_used_at=v_session.quota_stamp
        then null else onboarding_rep_used_at end where user_id=p_user_id;
  end if;
  update public.voice_sessions set state='aborted',refunded_at=now(),closed_at=coalesce(closed_at,now()) where id=p_session_id;
  return jsonb_build_object('ok',true,'refunded',true);
end; $$;
