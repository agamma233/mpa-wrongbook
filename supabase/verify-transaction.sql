-- Hosted PostgreSQL verification with two synthetic identities, NOT two OAuth accounts.
-- All fixture users/operations roll back. No existing personal records are read.
begin;
insert into auth.users(id) values('a3eb763a-95ca-48f8-ae83-dfdac88bf001'),('a3eb763a-95ca-48f8-ae83-dfdac88bf002');
set local role anon;
do $$ begin
 begin perform * from public.wrongbook_operations;raise exception 'anon read allowed';exception when insufficient_privilege then null;end;
 begin perform public.append_wrongbook_ops('[]');raise exception 'anon RPC allowed';exception when insufficient_privilege then null;end;
 begin perform * from public.pull_wrongbook_ops(0,100);raise exception 'anon pull allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local request.jwt.claim.sub='a3eb763a-95ca-48f8-ae83-dfdac88bf001';
set local role authenticated;
do $$ declare b jsonb:='[{"id":"hosted-fixture-note","question":"2016-数学-05","field":"note","value":"synthetic acceptance fixture","parents":[],"clock":{"wallMs":1,"counter":0,"actorId":"hosted-test"}}]';begin
 if public.append_wrongbook_ops(b)<>'["hosted-fixture-note"]'::jsonb then raise exception 'ack mismatch';end if;
 perform public.append_wrongbook_ops(b);
 if (select count(*) from public.pull_wrongbook_ops(0,100))<>1 then raise exception 'duplicate not idempotent';end if;
 begin perform public.append_wrongbook_ops(jsonb_set(b,'{0,value}','"collision"'));raise exception 'collision accepted';exception when raise_exception then if sqlerrm='collision accepted' then raise;end if;end;
 begin delete from public.wrongbook_operations;raise exception 'direct delete allowed';exception when insufficient_privilege then null;end;
 begin update public.wrongbook_sync_heads set last_seq=99;raise exception 'direct update allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local request.jwt.claim.sub='a3eb763a-95ca-48f8-ae83-dfdac88bf002';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.wrongbook_operations) or exists(select 1 from public.wrongbook_sync_heads) or exists(select 1 from public.pull_wrongbook_ops(0,100)) then raise exception 'cross-user leak';end if;
 perform public.append_wrongbook_ops('[{"id":"hosted-fixture-note","question":"2016-数学-05","field":"note","value":"separate B fixture","parents":[],"clock":{"wallMs":1,"counter":0,"actorId":"hosted-test"}}]');
 if (select count(*) from public.pull_wrongbook_ops(0,100))<>1 then raise exception 'user B count';end if;
end $$;
reset role;
set local request.jwt.claim.sub='a3eb763a-95ca-48f8-ae83-dfdac88bf001';
set local role authenticated;
do $$ begin
 if (select operation->>'value' from public.pull_wrongbook_ops(0,100))<>'synthetic acceptance fixture' then raise exception 'user A changed';end if;
end $$;
reset role;
rollback;
select 'PASS: hosted PostgreSQL anon denial, two synthetic roles isolated, RPC idempotency, collision refusal, immutable grants; fixtures rolled back' as result,
 not exists(select 1 from auth.users where id in ('a3eb763a-95ca-48f8-ae83-dfdac88bf001','a3eb763a-95ca-48f8-ae83-dfdac88bf002')) as fixtures_removed,
 exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wrongbook_sync_heads') as realtime_enabled;
