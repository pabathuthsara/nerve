-- Isolated database only. Exercises interleaved startup attempts and late grade
-- admission against actual Postgres locks/accounting, without vendor calls.
begin;
create function pg_temp.assert_true(value boolean,message text) returns void
language plpgsql as $$ begin
  if value is distinct from true then raise exception 'Assertion failed: %',message; end if;
end; $$;
insert into auth.users(id) values
 ('30000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002'),
 ('30000000-0000-4000-8000-000000000003'),
 ('30000000-0000-4000-8000-000000000004'),
 ('30000000-0000-4000-8000-000000000005');
set local role service_role;
do $$
declare
  a uuid:='30000000-0000-4000-8000-000000000001';
  b uuid:='30000000-0000-4000-8000-000000000002';
  c uuid:='30000000-0000-4000-8000-000000000003';
  d uuid:='30000000-0000-4000-8000-000000000004';
  e uuid:='30000000-0000-4000-8000-000000000005';
  s uuid; r jsonb;
  limits jsonb:='{"sttAudioMs":480000,"gradeInputTokens":24000,"gradeOutputTokens":2400}';
begin
  r:=public.voice_session_open(a,'tess','elevenlabs','test','{}',.20,.03,240,600,limits);
  s:=(r->>'session_id')::uuid;
  perform public.voice_operation_reserve(a,s,'tess','original','stt','test',.012,'{}');
  perform public.voice_operation_reserve(a,s,'tess','retry','stt','test',.012,'{}');
  perform public.voice_operation_settle(a,s,'original',0,'{}','{}','{}','failed');
  r:=public.voice_session_abort_attempt(a,s,'original');
  perform pg_temp.assert_true((r->>'ok')::boolean and not (r->>'refunded')::boolean,'original mint failure cannot abort a reserved retry');
  perform pg_temp.assert_true((select state='active' from public.voice_sessions where id=s),'reserved retry remains active');
  r:=public.voice_session_abort_attempt(a,s,null);
  perform pg_temp.assert_true(not (r->>'refunded')::boolean,'failed admission without operation cannot close another attempt');
  perform public.voice_operation_settle(a,s,'retry',null,null,'{}','{}','unknown');
  r:=public.voice_session_abort_attempt(a,s,'original');
  perform pg_temp.assert_true(not (r->>'refunded')::boolean,'issued retry remains protected after settlement');
  perform public.voice_session_activate(a,s);
  r:=public.voice_session_abort_attempt(a,s,'retry');
  perform pg_temp.assert_true(not (r->>'refunded')::boolean,'late setup error cannot close an activated rep');

  r:=public.voice_session_open(b,'maya','elevenlabs','test','{}',.20,.03,240,600,limits);
  s:=(r->>'session_id')::uuid;
  perform public.voice_operation_reserve(b,s,'maya','first','stt','test',.012,'{}');
  perform public.voice_operation_reserve(b,s,'maya','second','stt','test',.012,'{}');
  perform public.voice_operation_settle(b,s,'first',0,'{}','{}','{}','failed');
  perform pg_temp.assert_true(not (public.voice_session_abort_attempt(b,s,'first')->>'refunded')::boolean,'first failed attempt waits for unresolved second attempt');
  perform public.voice_operation_settle(b,s,'second',0,'{}','{}','{}','failed');
  r:=public.voice_session_abort_attempt(b,s,'second');
  perform pg_temp.assert_true((r->>'refunded')::boolean,'last failed attempt can refund the shared unconnected rep');
  perform pg_temp.assert_true((select reps_used_today=0 and onboarding_rep_used_at is null from public.entitlements where user_id=b),'failed startup restores exactly one signup grant');
  r:=public.voice_session_abort_attempt(b,s,'first');
  perform pg_temp.assert_true(not (r->>'refunded')::boolean,'late original cleanup cannot refund twice');
  r:=public.voice_session_open(b,'maya','elevenlabs','test','{}',.20,.03,240,600,limits);
  perform pg_temp.assert_true((r->>'ok')::boolean and not (r->>'resumed')::boolean,'a new startup works after all attempts failed');
  s:=(r->>'session_id')::uuid;
  r:=public.voice_session_abort_attempt(b,s,null);
  perform pg_temp.assert_true((r->>'refunded')::boolean,'failed reservation can refund when no attempt has been admitted');

  r:=public.voice_session_open(c,'nadia','elevenlabs','test','{}',.20,.03,240,600,limits);
  s:=(r->>'session_id')::uuid;
  perform public.voice_session_close(c,s,false);
  insert into public.usage_ledger(user_id,seconds,provider,model,rate,cost_cents)
    values(c,0,'openai','test',0,97);
  perform pg_temp.assert_true(public.voice_spend_committed_cents(c)=100,'closed grade hold fills the daily cap exactly');
  r:=public.voice_operation_reserve(c,s,'nadia','oversized-grade','grade','gpt-4.1',.04,'{}');
  perform pg_temp.assert_true(r->>'reason'='cap','a larger grade must reserve its incremental daily commitment');
  r:=public.voice_operation_reserve(c,s,'nadia','grade','grade','gpt-4.1',.03,'{}');
  perform pg_temp.assert_true((r->>'ok')::boolean,'the already protected grade is admitted at equality');
  perform pg_temp.assert_true(public.voice_spend_committed_cents(c)=100,'admission cannot raise daily commitments above cap');
  -- USD and cents must not be mixed: one extra cent cannot fit in half a cent.
  r:=public.voice_session_open(d,'tess','elevenlabs','test','{}',.20,.03,240,600,limits);
  s:=(r->>'session_id')::uuid;
  perform public.voice_session_close(d,s,false);
  insert into public.usage_ledger(user_id,seconds,provider,model,rate,cost_cents) values(d,0,'openai','test',0,96.5);
  perform pg_temp.assert_true(public.voice_spend_committed_cents(d)=99.5,'half a cent remains in daily cap');
  r:=public.voice_operation_reserve(d,s,'tess','grade','grade','gpt-4.1',.04,'{}');
  perform pg_temp.assert_true(r->>'reason'='cap','one-cent USD delta is refused with only half-cent daily headroom');
  r:=public.voice_session_open(e,'tess','elevenlabs','test','{}',.20,.03,240,600,limits);
  s:=(r->>'session_id')::uuid;
  perform public.voice_session_close(e,s,false);
  insert into public.usage_ledger(user_id,seconds,provider,model,rate,cost_cents) values(e,0,'openai','test',0,96);
  perform pg_temp.assert_true(public.voice_spend_committed_cents(e)=99,'one cent remains in daily cap');
  r:=public.voice_operation_reserve(e,s,'tess','grade','grade','gpt-4.1',.04,'{}');
  perform pg_temp.assert_true((r->>'ok')::boolean,'one-cent USD delta fits exactly one-cent daily headroom');
  perform pg_temp.assert_true(public.voice_spend_committed_cents(e)=100,'exact-fit expanded grade stops at the cap');
  perform pg_temp.assert_true(not has_function_privilege('authenticated','public.voice_session_abort_attempt(uuid,uuid,text)','EXECUTE'),'attempt cleanup remains service-only');
  raise notice 'Startup attempt and late-grade budget checks passed.';
end; $$;
rollback;
