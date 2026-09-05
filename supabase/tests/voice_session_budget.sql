-- Run on an isolated database with the repository migrations, never a live
-- customer's database. Every fixture is rolled back. No vendor calls occur.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$ begin
  if value is distinct from true then raise exception 'Assertion failed: %',message; end if;
end; $$;

insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000003'),
 ('10000000-0000-4000-8000-000000000004'),
 ('10000000-0000-4000-8000-000000000005'),
 ('10000000-0000-4000-8000-000000000006');

set local role service_role;
do $$
declare
  a uuid:='10000000-0000-4000-8000-000000000001';
  b uuid:='10000000-0000-4000-8000-000000000002';
  c uuid:='10000000-0000-4000-8000-000000000003';
  d uuid:='10000000-0000-4000-8000-000000000004';
  e uuid:='10000000-0000-4000-8000-000000000005';
  f uuid:='10000000-0000-4000-8000-000000000006';
  s uuid; t uuid; u uuid; v uuid; r jsonb; opened jsonb; n numeric;
  limits jsonb:='{"ttsCharacters":3200,"llmInputTokens":240000,"llmOutputTokens":6000,"warmthInputTokens":120000,"warmthOutputTokens":6000,"gradeInputTokens":24000,"gradeOutputTokens":2400,"sttAudioMs":480000}';
begin
  perform pg_temp.assert_true(not has_table_privilege('authenticated','public.voice_sessions','SELECT'),'budget tables are not client-readable');
  perform pg_temp.assert_true(not has_table_privilege('authenticated','public.voice_operations','INSERT'),'operation tables are not client-writable');
  perform pg_temp.assert_true(not has_function_privilege('anon','public.voice_session_open(uuid,text,text,text,jsonb,numeric,numeric,integer,integer,jsonb)','EXECUTE'),'anon cannot create paid sessions');
  perform pg_temp.assert_true(not has_function_privilege('authenticated','public.voice_operation_settle(uuid,uuid,text,numeric,jsonb,jsonb,jsonb,text)','EXECUTE'),'clients cannot settle their own spend');
  perform pg_temp.assert_true((select bool_and(relrowsecurity) from pg_class where oid in ('public.voice_sessions'::regclass,'public.voice_operations'::regclass)),'RLS enabled on new tables');

  opened:=public.voice_session_open(a,'tess','elevenlabs','eleven_v3_conversational','{"userName":"Alex"}',.20,.03,240,600,limits);
  perform pg_temp.assert_true((opened->>'ok')::boolean,'first signup rep opens');
  s:=(opened->>'session_id')::uuid;
  perform pg_temp.assert_true((select reps_used_today=1 and onboarding_rep_used_at is not null from public.entitlements where user_id=a),'signup quota consumed once');
  r:=public.voice_session_open(a,'tess','elevenlabs','eleven_v3_conversational','{"userName":"Changed"}',.20,.03,240,600,limits);
  perform pg_temp.assert_true(r->>'session_id'=s::text and (r->>'resumed')::boolean,'retry resumes same rep');
  perform pg_temp.assert_true(r->'context'->>'userName'='Alex' and r->>'expires_at'=opened->>'expires_at','resume does not replace trusted context or extend deadline');
  perform pg_temp.assert_true((select reps_used_today=1 from public.entitlements where user_id=a),'resume does not double-charge quota');
  r:=public.voice_session_open(a,'maya','elevenlabs','eleven_v3_conversational','{}',.20,.03,240,600,limits);
  perform pg_temp.assert_true(r->>'reason'='busy','second persona cannot create parallel active rep');
  perform pg_temp.assert_true(public.voice_spend_committed_cents(a)=20,'daily cap includes complete open envelope');
  perform pg_temp.assert_true((select not allowed and reason='cap' from public.spend_allowance(a,'text',30,60,19)),'legacy routes see reservations');

  r:=public.voice_operation_reserve(b,s,'tess','wrong-user','turn','gpt-4.1-mini',.02,'{}');
  perform pg_temp.assert_true(r->>'reason'='missing','cross-user paid request refused');
  r:=public.voice_operation_reserve(a,s,'maya','wrong-persona','turn','gpt-4.1-mini',.02,'{}');
  perform pg_temp.assert_true(r->>'reason'='missing','persona is bound on server');
  r:=public.voice_operation_reserve(a,s,'tess','turn-1','turn','gpt-4.1-mini',.02,'{"llmInputTokens":1000,"ttsCharacters":200}');
  perform pg_temp.assert_true((r->>'ok')::boolean and r->'context'->>'userName'='Alex','reservation returns cached context');
  r:=public.voice_operation_reserve(a,s,'tess','turn-1','turn','gpt-4.1-mini',.02,'{}');
  perform pg_temp.assert_true(r->>'reason'='duplicate','same operation cannot buy duplicate generation');
  perform pg_temp.assert_true((public.voice_operation_reserve(a,s,'tess','turn-2','turn','gpt-4.1-mini',.02,'{}')->>'ok')::boolean,'barge-in may begin while cancellation settles');
  perform pg_temp.assert_true((public.voice_operation_reserve(a,s,'tess','turn-3','turn','gpt-4.1-mini',.02,'{}')->>'ok')::boolean,'bounded third in-flight operation');
  r:=public.voice_operation_reserve(a,s,'tess','turn-4','turn','gpt-4.1-mini',.02,'{}');
  perform pg_temp.assert_true(r->>'reason'='busy','runaway concurrent generations are bounded');
  perform pg_temp.assert_true((public.voice_operation_settle(a,s,'turn-1',.01,'{"llmInputTokens":10,"ttsCharacters":100}','{"input_tokens":10}','{}','completed')->>'ok')::boolean,'observed usage settles');
  perform pg_temp.assert_true((select resources->>'llmInputTokens'='10' from public.voice_sessions where id=s),'unused input reservation released against resource limit');
  r:=public.voice_operation_settle(a,s,'turn-1',0,'{}','{}','{}','completed');
  perform pg_temp.assert_true((r->>'duplicate')::boolean and (r->>'cost_usd')::numeric=.01,'settlement replay cannot lower paid usage');
  perform pg_temp.assert_true((select count(*)=1 from public.usage_ledger where session_id=s),'settlement is idempotent in append-only ledger');
  perform public.voice_operation_settle(a,s,'turn-2',null,null,'{}','{}','aborted');
  perform pg_temp.assert_true((select cost_usd=.02 and estimated from public.voice_operations where session_id=s and operation_id='turn-2'),'unknown abort conservatively charges reservation');
  perform public.voice_operation_settle(a,s,'turn-3',0,'{}','{}','{"vendorRejected":true}','failed');
  perform pg_temp.assert_true((select spent_usd=.03 and reserved_usd=0 from public.voice_sessions where id=s),'observed failure can settle zero without losing other spend');
  perform pg_temp.assert_true((public.voice_session_activate(a,s)->>'ok')::boolean,'activation succeeds');
  r:=public.voice_session_close(a,s,true);
  perform pg_temp.assert_true(not (r->>'refunded')::boolean,'client cannot refund an active paid rep');

  -- Grade allocation survives live budget exhaustion and normal session close.
  r:=public.voice_session_open(b,'nadia','elevenlabs','eleven_v3_conversational','{}',.08,.02,240,600,limits);
  t:=(r->>'session_id')::uuid;
  r:=public.voice_operation_reserve(b,t,'nadia','too-much','turn','gpt-4.1-mini',.061,'{}');
  perform pg_temp.assert_true(r->>'reason'='budget','live reply cannot spend protected grade budget');
  perform public.voice_operation_reserve(b,t,'nadia','last-turn','turn','gpt-4.1-mini',.06,'{}');
  perform public.voice_operation_settle(b,t,'last-turn',.06,'{}','{}','{}','completed');
  perform public.voice_session_close(b,t,false);
  r:=public.voice_operation_reserve(b,t,'nadia','late-turn','turn','gpt-4.1-mini',.001,'{}');
  perform pg_temp.assert_true(r->>'reason'='closed','closed rep cannot synthesize again');
  perform pg_temp.assert_true(public.voice_spend_committed_cents(b)=8,'closed rep still holds protected grade');
  r:=public.voice_operation_reserve(b,t,'nadia','grade','grade','gpt-4.1',.02,'{"gradeInputTokens":2000,"gradeOutputTokens":1200}');
  perform pg_temp.assert_true((r->>'ok')::boolean,'grade can run after close');
  perform public.voice_operation_settle(b,t,'grade',.01,'{"gradeInputTokens":1000,"gradeOutputTokens":500}','{}','{}','completed');
  r:=public.voice_operation_reserve(b,t,'nadia','grade-again','grade','gpt-4.1',.001,'{}');
  perform pg_temp.assert_true(r->>'reason'='resources','changing request ID cannot generate grade twice');
  perform pg_temp.assert_true(public.voice_spend_committed_cents(b)=7,'settled grade releases unused reserve');

  -- Setup failure refunds once, without erasing conservative STT spend.
  r:=public.voice_session_open(c,'maya','elevenlabs','eleven_v3_conversational','{}',.20,.03,240,600,limits);
  u:=(r->>'session_id')::uuid;
  perform public.voice_operation_reserve(c,u,'maya','stt:0','stt','gpt-4o-mini-transcribe',.012,'{"sttAudioMs":240000}');
  perform public.voice_operation_settle(c,u,'stt:0',null,null,'{}','{}','unknown');
  r:=public.voice_session_close(c,u,true);
  perform pg_temp.assert_true((r->>'refunded')::boolean,'unconnected STT setup failure may refund rep quota');
  perform pg_temp.assert_true((select reps_used_today=0 and onboarding_rep_used_at is null from public.entitlements where user_id=c),'signup grant restored exactly');
  perform pg_temp.assert_true(public.voice_spend_committed_cents(c)=1.2,'setup refund does not erase provider spending');
  r:=public.voice_session_close(c,u,true);
  perform pg_temp.assert_true(not (r->>'refunded')::boolean,'abort replay cannot refund twice');
  r:=public.voice_session_open(c,'maya','elevenlabs','eleven_v3_conversational','{}',.20,.03,240,600,limits);
  u:=(r->>'session_id')::uuid;
  perform public.voice_session_activate(c,u);
  perform public.voice_session_close(c,u,false);
  r:=public.voice_session_refund_empty(c,u);
  perform pg_temp.assert_true((r->>'refunded')::boolean,'activated but empty rep refunds after normal close');
  r:=public.voice_session_refund_empty(c,u);
  perform pg_temp.assert_true(not (r->>'refunded')::boolean,'empty rep replay cannot refund twice');

  -- A process crash and history deletion cannot release in-flight spending.
  r:=public.voice_session_open(d,'robin','elevenlabs','eleven_v3_conversational','{}',.20,.03,240,600,limits);
  v:=(r->>'session_id')::uuid;
  perform public.voice_operation_reserve(d,v,'robin','crashed','turn','gpt-4.1-mini',.04,'{}');
  update public.voice_sessions set expires_at=now()-interval '1 second',grade_expires_at=now()-interval '1 second' where id=v;
  perform pg_temp.assert_true(public.voice_spend_committed_cents(d)=4,'expired unreported work remains committed');
  r:=public.voice_operation_reserve(d,v,'robin','too-late','turn','gpt-4.1-mini',.01,'{}');
  perform pg_temp.assert_true(r->>'reason'='expired','server deadline cannot be reset by client');
  delete from public.sessions where id=v;
  perform pg_temp.assert_true(public.voice_spend_committed_cents(d)=4,'history deletion cannot erase outstanding reservation');
  -- After midnight, unresolved old work remains auditable but must not hold
  -- today's daily allowance forever. Late settlement belongs to its start day.
  update public.voice_operations set created_at=now()-interval '2 days' where session_id=v and operation_id='crashed';
  perform pg_temp.assert_true(public.voice_spend_committed_cents(d)=0,'prior-day abandoned work does not permanently consume new daily caps');
  perform pg_temp.assert_true((public.voice_operation_settle(d,v,'crashed',null,null,'{}','{}','unknown')->>'ok')::boolean,'late settlement survives deleted history');
  perform pg_temp.assert_true((select session_id is null and cost_cents=4 and created_at<now()-interval '1 day' from public.usage_ledger where user_id=d),'detached late receipt retains spend on the operation initiation day');
  perform pg_temp.assert_true(public.voice_spend_committed_cents(d)=0,'reconciliation of old work does not charge a new local day');

  -- Daily caps, kill switches, resource bounds, and plan-upgrade semantics.
  insert into public.usage_ledger(user_id,seconds,provider,model,rate,cost_cents) values(e,0,'openai','test',0,90);
  r:=public.voice_session_open(e,'tess','elevenlabs','eleven_v3_conversational','{}',.20,.03,240,600,limits);
  perform pg_temp.assert_true(r->>'reason'='cap','daily cap rejects whole new commitment');
  update public.entitlements set spend_halted_at=now() where user_id=f;
  r:=public.voice_session_open(f,'tess','elevenlabs','eleven_v3_conversational','{}',.20,.03,240,600,limits);
  perform pg_temp.assert_true(r->>'reason'='halted','halt refuses new quota consumption');
  update public.entitlements set spend_halted_at=null where user_id=f;
  r:=public.voice_session_open(f,'tess','elevenlabs','eleven_v3_conversational','{}',.20,.03,240,600,limits);
  s:=(r->>'session_id')::uuid;
  r:=public.voice_operation_reserve(f,s,'tess','oversized','tts','eleven_v3_conversational',.01,'{"ttsCharacters":3201}');
  perform pg_temp.assert_true(r->>'reason'='resources','cumulative character limit enforced');
  r:=public.voice_operation_reserve(f,s,'tess','negative','tts','eleven_v3_conversational',.01,'{"ttsCharacters":-1}');
  perform pg_temp.assert_true(r->>'reason'='invalid','negative resources cannot replenish quota');
  update public.entitlements set spend_halted_at=now() where user_id=f;
  r:=public.voice_operation_reserve(f,s,'tess','halted','tts','eleven_v3_conversational',.01,'{}');
  perform pg_temp.assert_true(r->>'reason'='halted','account halt applies during an active rep');
  update public.entitlements set spend_halted_at=null,plan='pro',reps_per_day=3 where user_id=f;
  perform public.voice_session_close(f,s,false);
  r:=public.voice_session_open(f,'maya','elevenlabs','eleven_v3_conversational','{}',.20,.03,240,600,limits);
  perform pg_temp.assert_true((r->>'ok')::boolean,'upgrade retains all plan reps beside prior signup grant');
  perform pg_temp.assert_true((select reps_used_today=2 and onboarding_rep_used_at is not null from public.entitlements where user_id=f),'plan quota and signup stamp stay separate');
  s:=(r->>'session_id')::uuid;
  perform public.voice_operation_reserve(f,s,'maya','stt:0','stt','gpt-4o-mini-transcribe',.012,'{"sttAudioMs":240000}');
  perform public.voice_operation_settle(f,s,'stt:0',null,null,'{}','{}','unknown');
  r:=public.voice_operation_reserve(f,s,'maya','stt:1','stt','gpt-4o-mini-transcribe',.012,'{"sttAudioMs":240000}');
  perform pg_temp.assert_true((r->>'ok')::boolean,'one reconnect receives its own paid STT envelope');
  perform public.voice_operation_settle(f,s,'stt:1',null,null,'{}','{}','unknown');
  r:=public.voice_operation_reserve(f,s,'maya','stt:2','stt','gpt-4o-mini-transcribe',.012,'{}');
  perform pg_temp.assert_true(r->>'reason'='resources','third credential mint cannot bypass STT envelope');

  select count(*) into n from public.usage_ledger;
  raise notice 'Voice budget SQL integration checks passed; % authoritative fixture receipts.',n;
end; $$;
rollback;
