-- Startup attempts share one quota; one failed attempt must not close another.
-- The previous migration is applied history and stays unchanged.

create or replace function public.voice_operation_reserve(
  p_user_id uuid,p_session_id uuid,p_persona_slug text,p_operation_id text,p_kind text,
  p_model text,p_max_cost_usd numeric,p_resources jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_ent public.entitlements%rowtype; v_session public.voice_sessions%rowtype;
  v_cap numeric; v_grade_committed numeric; v_protected numeric; v_count integer;
  v_key text; v_value jsonb; v_total numeric; v_resources jsonb; v_additional_commitment numeric:=0;
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
  -- Live sessions already hold their entire envelope. A closed/expired rep
  -- holds only its protected grade amount, so a larger grade reservation must
  -- reserve the difference against the daily cap before it can run.
  if p_kind='grade' and not (v_session.state='active' and v_session.expires_at>now()) then
    v_additional_commitment:=greatest(0,p_max_cost_usd-v_session.grade_reserve_usd);
  end if;
  if public.voice_spend_committed_cents(p_user_id)+v_additional_commitment>v_cap
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

create function public.voice_session_abort_attempt(
  p_user_id uuid,p_session_id uuid,p_operation_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_session public.voice_sessions%rowtype;
begin
  perform 1 from public.entitlements where user_id=p_user_id for update;
  select * into v_session from public.voice_sessions
    where id=p_session_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','missing'); end if;
  if v_session.state<>'active' or v_session.activated_at is not null
    then return jsonb_build_object('ok',true,'refunded',false); end if;
  if p_operation_id is null then
    -- Admission itself failed: there is no attempt owned by this request.
    -- Do not close a rep that another concurrent mint has already reserved.
    if exists(select 1 from public.voice_operations where session_id=p_session_id)
      then return jsonb_build_object('ok',true,'refunded',false); end if;
  else
    if not exists(select 1 from public.voice_operations where session_id=p_session_id
      and operation_id=p_operation_id and kind='stt')
      then return jsonb_build_object('ok',false,'reason','missing'); end if;
    if exists(select 1 from public.voice_operations where session_id=p_session_id
      and operation_id<>p_operation_id
      and (kind<>'stt' or state='reserved' or cost_usd is null or cost_usd>0))
      then return jsonb_build_object('ok',true,'refunded',false); end if;
  end if;
  return public.voice_session_close(p_user_id,p_session_id,true);
end; $$;

revoke execute on function public.voice_session_abort_attempt(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.voice_session_abort_attempt(uuid,uuid,text) to service_role;
