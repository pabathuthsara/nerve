-- Server-owned voice envelopes. Additive: existing sessions and ledger readers
-- remain valid, and existing clients never receive write access to these tables.
-- Never infer invoice precision from an estimated reservation.

alter table public.usage_ledger
  add column usage_key text,
  add column usage_source text,
  add column usage_details jsonb;
alter table public.sessions add column pipeline_telemetry jsonb;
create unique index usage_ledger_user_usage_key_idx
  on public.usage_ledger(user_id, usage_key);
-- Include the new receipt fields in the ledger's append-only invariant.
create or replace function public.forbid_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.session_id is null and old.session_id is not null
    and (to_jsonb(new)-'session_id')=(to_jsonb(old)-'session_id') then return new; end if;
  raise exception 'usage_ledger is append-only; only detaching a deleted session is permitted';
end; $$;

create table public.voice_sessions (
  id uuid primary key,
  -- A user's history deletion cannot erase outstanding spending commitments.
  session_id uuid unique references public.sessions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  persona_slug text not null,
  provider text not null,
  model text not null,
  context jsonb not null default '{}'::jsonb,
  state text not null default 'active' check (state in ('active','closed','aborted')),
  budget_usd numeric not null check (budget_usd > 0 and budget_usd <= 1),
  grade_reserve_usd numeric not null check (grade_reserve_usd >= 0),
  spent_usd numeric not null default 0 check (spent_usd >= 0),
  reserved_usd numeric not null default 0 check (reserved_usd >= 0),
  resource_limits jsonb not null,
  resources jsonb not null default '{}'::jsonb,
  quota_kind text not null check (quota_kind in ('plan','signup')),
  quota_day date not null,
  quota_stamp timestamptz not null default now(),
  refunded_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  grade_expires_at timestamptz not null,
  closed_at timestamptz
);
create index voice_sessions_user_created_idx on public.voice_sessions(user_id, created_at desc);
create index voice_sessions_user_active_idx on public.voice_sessions(user_id, expires_at)
  where state = 'active';

create table public.voice_operations (
  session_id uuid not null references public.voice_sessions(id) on delete cascade,
  operation_id text not null check (length(operation_id) between 1 and 120),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('turn','llm','tts','stt','warmth','grade')),
  model text not null,
  max_cost_usd numeric not null check (max_cost_usd > 0 and max_cost_usd <= 1),
  cost_usd numeric check (cost_usd >= 0),
  resources jsonb not null default '{}'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  state text not null default 'reserved'
    check (state in ('reserved','completed','failed','aborted','unknown')),
  estimated boolean not null default true,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  primary key (session_id, operation_id)
);
create index voice_operations_user_created_idx on public.voice_operations(user_id, created_at desc);

alter table public.voice_sessions enable row level security;
alter table public.voice_operations enable row level security;
revoke all on public.voice_sessions, public.voice_operations from public, anon, authenticated;
grant all on public.voice_sessions, public.voice_operations to service_role;

-- The daily ledger plus money already promised to current/in-flight work. An
-- expired process still holds unfinished reservations: a crash is not free TTS.
create function public.voice_spend_committed_cents(p_user_id uuid)
returns numeric language plpgsql security invoker set search_path = '' as $$
declare v_zone text; v_start timestamptz; v_spent numeric; v_held numeric;
begin
  select coalesce(p.timezone,'UTC') into v_zone from public.profiles p where p.id=p_user_id;
  v_zone := coalesce(v_zone,'UTC');
  if not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_zone) then v_zone:='UTC'; end if;
  v_start := date_trunc('day', now() at time zone v_zone) at time zone v_zone;
  select coalesce(sum(l.cost_cents),0) into v_spent from public.usage_ledger l
    where l.user_id=p_user_id and l.created_at>=v_start;
  select coalesce(sum(case
    when s.state='active' and s.expires_at>now()
      then greatest(0,s.budget_usd-s.spent_usd)
    else coalesce((select sum(o.max_cost_usd) from public.voice_operations o
      where o.session_id=s.id and o.state='reserved' and o.created_at>=v_start),0) + case
      when s.state<>'aborted' and s.grade_expires_at>now() and not exists(
        select 1 from public.voice_operations o where o.session_id=s.id and o.kind='grade'
      ) then s.grade_reserve_usd else 0 end
    end),0)*100 into v_held from public.voice_sessions s where s.user_id=p_user_id;
  return v_spent+v_held;
end; $$;

-- All callers are verified server code using service_role. The entitlement row
-- serializes open/reserve operations across tabs and devices on one account.
create function public.voice_session_open(
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
  v_cap:=case v_ent.plan when 'elite' then 600 when 'pro' then 300 else 100 end;
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

create function public.voice_operation_reserve(
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
  -- Leave room for a barge-in while the cancelled request settles. The cost
  -- reservation still bounds all three; a duplicate operation never runs twice.
  if p_kind in ('turn','llm') and (select count(*) from public.voice_operations
    where session_id=p_session_id and kind in ('turn','llm') and state='reserved')>=3
    then return jsonb_build_object('ok',false,'reason','busy'); end if;
  select count(*) into v_count from public.voice_operations where session_id=p_session_id and kind=p_kind;
  if v_count >= (case p_kind when 'grade' then 1 when 'stt' then 2 when 'tts' then 80 else 40 end)
    then return jsonb_build_object('ok',false,'reason','resources'); end if;
  v_cap:=case v_ent.plan when 'elite' then 600 when 'pro' then 300 else 100 end;
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

create function public.voice_operation_settle(
  p_user_id uuid,p_session_id uuid,p_operation_id text,p_cost_usd numeric,p_resources jsonb,
  p_usage jsonb,p_metadata jsonb,p_status text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.voice_sessions%rowtype; v_op public.voice_operations%rowtype;
  v_cost numeric; v_resources jsonb; v_key text; v_value jsonb; v_total numeric;
begin
  if p_status not in ('completed','failed','aborted','unknown') or p_cost_usd<0
    or (p_resources is not null and jsonb_typeof(p_resources)<>'object')
    then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  select * into v_session from public.voice_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','missing'); end if;
  select * into v_op from public.voice_operations where session_id=p_session_id and operation_id=p_operation_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','missing'); end if;
  if v_op.state<>'reserved' then return jsonb_build_object('ok',true,'duplicate',true,'cost_usd',v_op.cost_usd); end if;
  -- Releasing an unknown reservation would let aborts/disconnects buy free work.
  v_cost:=coalesce(p_cost_usd,v_op.max_cost_usd);
  v_resources:=v_session.resources;
  if p_resources is not null then
    for v_key,v_value in select * from jsonb_each(p_resources) loop
      if not (v_session.resource_limits ? v_key) or jsonb_typeof(v_value)<>'number'
        or (v_value::text)::numeric<0 or trunc((v_value::text)::numeric)<>(v_value::text)::numeric
        then return jsonb_build_object('ok',false,'reason','invalid'); end if;
    end loop;
    for v_key in select key from jsonb_each(v_op.resources || p_resources) loop
      v_total:=greatest(0,coalesce((v_resources->>v_key)::numeric,0)
        -coalesce((v_op.resources->>v_key)::numeric,0)+coalesce((p_resources->>v_key)::numeric,0));
      v_resources:=jsonb_set(v_resources,array[v_key],to_jsonb(v_total));
    end loop;
  end if;
  update public.voice_operations set cost_usd=v_cost,state=p_status,estimated=p_cost_usd is null,
    resources=coalesce(p_resources,resources),usage=coalesce(p_usage,'{}'::jsonb),
    metadata=coalesce(p_metadata,'{}'::jsonb),settled_at=now()
    where session_id=p_session_id and operation_id=p_operation_id;
  update public.voice_sessions set spent_usd=spent_usd+v_cost,
    reserved_usd=greatest(0,reserved_usd-v_op.max_cost_usd),resources=v_resources where id=p_session_id;
  insert into public.usage_ledger(user_id,session_id,provider,model,seconds,rate,cost_cents,created_at,
    usage_key,usage_source,usage_details)
    values(p_user_id,v_session.session_id,case when v_op.kind='tts' then 'elevenlabs'
      when v_op.kind='turn' then v_session.provider else 'openai' end,v_op.model,0,0,v_cost*100,v_op.created_at,
      'voice:'||p_session_id::text||':'||p_operation_id,
      case when p_cost_usd is null then 'server_reservation' else 'server' end,
      jsonb_build_object('kind',v_op.kind,'status',p_status,'usage',coalesce(p_usage,'{}'::jsonb),
        'metadata',coalesce(p_metadata,'{}'::jsonb),'reserved_usd',v_op.max_cost_usd))
    on conflict(user_id,usage_key) do nothing;
  return jsonb_build_object('ok',true,'duplicate',false,'cost_usd',v_cost);
end; $$;

create function public.voice_session_activate(p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  update public.voice_sessions set activated_at=coalesce(activated_at,now())
    where id=p_session_id and user_id=p_user_id and state='active' and expires_at>now();
  return jsonb_build_object('ok',found);
end; $$;

create function public.voice_session_get(p_user_id uuid,p_session_id uuid,p_persona_slug text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_session public.voice_sessions%rowtype;
begin
  select * into v_session from public.voice_sessions s where s.user_id=p_user_id
    and (p_session_id is null or s.id=p_session_id)
    and (p_persona_slug is null or s.persona_slug=p_persona_slug)
    and (p_session_id is not null or (s.state='active' and s.expires_at>now()))
    order by s.created_at desc limit 1;
  if not found then return jsonb_build_object('ok',false,'reason','missing'); end if;
  return jsonb_build_object('ok',true,'session_id',v_session.id,'context',v_session.context,
    'expires_at',v_session.expires_at,'state',v_session.state,'persona_slug',v_session.persona_slug);
end; $$;

create function public.voice_session_close(p_user_id uuid,p_session_id uuid,p_abort boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_ent public.entitlements%rowtype; v_session public.voice_sessions%rowtype; v_refund boolean:=false;
begin
  select * into v_ent from public.entitlements where user_id=p_user_id for update;
  select * into v_session from public.voice_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','missing'); end if;
  if v_session.state<>'active' then return jsonb_build_object('ok',true,'refunded',false); end if;
  -- An unconnected mint can be refunded once; spend still remains in the ledger.
  -- Never trust a client-provided "no speech" flag to replenish paid work.
  if p_abort and v_session.activated_at is null and not exists(select 1 from public.voice_operations
    where session_id=p_session_id and kind<>'stt') and v_session.refunded_at is null then
    update public.entitlements set
      reps_used_today=case when reps_day=v_session.quota_day then greatest(0,reps_used_today-1) else reps_used_today end,
      onboarding_rep_used_at=case when v_session.quota_kind='signup' and onboarding_rep_used_at=v_session.quota_stamp
        then null else onboarding_rep_used_at end where user_id=p_user_id;
    v_refund:=true;
  end if;
  update public.voice_sessions set state=case when p_abort then 'aborted' else 'closed' end,
    closed_at=now(),grade_expires_at=least(grade_expires_at,now()+interval '10 minutes'),
    refunded_at=case when v_refund then now() else refunded_at end where id=p_session_id;
  if p_abort then update public.sessions set ended_at=coalesce(ended_at,now()),ended_by='error',
    duration_s=coalesce(duration_s,0) where id=v_session.session_id; end if;
  return jsonb_build_object('ok',true,'refunded',v_refund);
end; $$;

-- The microphone may have connected without any user turn reaching the server.
-- Refund from server evidence, once, even after the normal close call. A browser
-- saying it heard no speech is insufficient if any paid turn/scoring work exists.
create function public.voice_session_refund_empty(p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_session public.voice_sessions%rowtype;
begin
  perform 1 from public.entitlements where user_id=p_user_id for update;
  select * into v_session from public.voice_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','missing'); end if;
  if v_session.refunded_at is not null or exists(select 1 from public.voice_operations
    where session_id=p_session_id and kind<>'stt')
    then return jsonb_build_object('ok',true,'refunded',false); end if;
  update public.entitlements set
    reps_used_today=case when reps_day=v_session.quota_day then greatest(0,reps_used_today-1) else reps_used_today end,
    onboarding_rep_used_at=case when v_session.quota_kind='signup' and onboarding_rep_used_at=v_session.quota_stamp
      then null else onboarding_rep_used_at end where user_id=p_user_id;
  update public.voice_sessions set state='aborted',refunded_at=now(),closed_at=coalesce(closed_at,now()) where id=p_session_id;
  return jsonb_build_object('ok',true,'refunded',true);
end; $$;

-- New functions are service-only, with no SECURITY DEFINER bypass to inherit.
revoke execute on function public.voice_spend_committed_cents(uuid) from public,anon,authenticated;
revoke execute on function public.voice_session_open(uuid,text,text,text,jsonb,numeric,numeric,integer,integer,jsonb) from public,anon,authenticated;
revoke execute on function public.voice_operation_reserve(uuid,uuid,text,text,text,text,numeric,jsonb) from public,anon,authenticated;
revoke execute on function public.voice_operation_settle(uuid,uuid,text,numeric,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
revoke execute on function public.voice_session_activate(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.voice_session_get(uuid,uuid,text) from public,anon,authenticated;
revoke execute on function public.voice_session_close(uuid,uuid,boolean) from public,anon,authenticated;
revoke execute on function public.voice_session_refund_empty(uuid,uuid) from public,anon,authenticated;
grant execute on function public.voice_spend_committed_cents(uuid) to service_role;
grant execute on function public.voice_session_open(uuid,text,text,text,jsonb,numeric,numeric,integer,integer,jsonb) to service_role;
grant execute on function public.voice_operation_reserve(uuid,uuid,text,text,text,text,numeric,jsonb) to service_role;
grant execute on function public.voice_operation_settle(uuid,uuid,text,numeric,jsonb,jsonb,jsonb,text) to service_role;
grant execute on function public.voice_session_activate(uuid,uuid) to service_role;
grant execute on function public.voice_session_get(uuid,uuid,text) to service_role;
grant execute on function public.voice_session_close(uuid,uuid,boolean) to service_role;
grant execute on function public.voice_session_refund_empty(uuid,uuid) to service_role;

-- Existing non-voice routes must see outstanding voice commitments too. Keep
-- its signature and rate-limit behavior unchanged for old deployments.
create or replace function public.spend_allowance(
  p_user_id uuid,p_bucket text,p_limit integer,p_window_seconds integer,p_cap_cents numeric
) returns table(allowed boolean,reason text,spent_cents numeric,retry_after integer)
language plpgsql security definer set search_path = '' as $$
declare v_halted timestamptz; v_spent numeric; v_hits integer; v_window_start timestamptz;
begin
  select e.spend_halted_at into v_halted from public.entitlements e where e.user_id=p_user_id;
  if v_halted is not null then return query select false,'halted'::text,0::numeric,0; return; end if;
  v_spent:=public.voice_spend_committed_cents(p_user_id);
  if p_cap_cents is not null and v_spent>=p_cap_cents then
    return query select false,'cap'::text,v_spent,0; return;
  end if;
  insert into public.rate_limits as r(user_id,bucket,window_start,hits) values(p_user_id,p_bucket,now(),1)
    on conflict(user_id,bucket) do update set
      window_start=case when r.window_start<=now()-make_interval(secs=>p_window_seconds) then now() else r.window_start end,
      hits=case when r.window_start<=now()-make_interval(secs=>p_window_seconds) then 1 else r.hits+1 end
    returning r.hits,r.window_start into v_hits,v_window_start;
  if v_hits>p_limit then return query select false,'rate'::text,v_spent,
    greatest(1,ceil(extract(epoch from (v_window_start+make_interval(secs=>p_window_seconds))-now()))::integer); return; end if;
  return query select true,null::text,v_spent,0;
end; $$;
revoke execute on function public.spend_allowance(uuid,text,integer,integer,numeric) from public,anon,authenticated;
grant execute on function public.spend_allowance(uuid,text,integer,integer,numeric) to service_role;
