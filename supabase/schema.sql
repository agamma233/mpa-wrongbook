-- Optional, inactive by default. Apply to a new Supabase project with the SQL editor.
begin;
create schema if not exists wrongbook_private;
revoke all on schema wrongbook_private from public, anon;
grant usage on schema wrongbook_private to authenticated;
create table if not exists public.wrongbook_sync_heads (
 user_id uuid primary key references auth.users(id) on delete cascade,
 last_seq bigint not null default 0 check(last_seq between 0 and 9007199254740991)
);
create table if not exists public.wrongbook_operations (
 user_id uuid not null references auth.users(id) on delete cascade,
 op_id text not null check(length(op_id) between 1 and 200),
 commit_seq bigint not null check(commit_seq between 1 and 9007199254740991),
 operation jsonb not null check(jsonb_typeof(operation)='object'),
 primary key(user_id,op_id),unique(user_id,commit_seq)
);
alter table public.wrongbook_operations enable row level security;
alter table public.wrongbook_sync_heads enable row level security;
revoke all on public.wrongbook_operations,public.wrongbook_sync_heads from public,anon,authenticated;
grant select on public.wrongbook_operations,public.wrongbook_sync_heads to authenticated;
create policy own_operations on public.wrongbook_operations for select to authenticated using ((select auth.uid())=user_id);
create policy own_head on public.wrongbook_sync_heads for select to authenticated using ((select auth.uid())=user_id);
-- The small private definer is necessary to keep table writes inaccessible to the API.
-- Public RPCs are invokers; identity is always derived from auth.uid(), never an argument.
create function wrongbook_private.append_ops(batch jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); head bigint; item jsonb; existing jsonb; ack jsonb:='[]'; field text; val jsonb;
begin
 if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if jsonb_typeof(batch)<>'array' or jsonb_array_length(batch)>100 or octet_length(batch::text)>2000000 then raise exception 'invalid batch'; end if;
 insert into public.wrongbook_sync_heads(user_id) values(uid) on conflict do nothing;
 select last_seq into head from public.wrongbook_sync_heads where user_id=uid for update;
 for item in select value from jsonb_array_elements(batch) loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['id','question','clock','field','value','parents']) or (select count(*) from jsonb_object_keys(item))<>6
   or jsonb_typeof(item->'id')<>'string' or jsonb_typeof(item->'question')<>'string'
   or (item->>'id') !~ '^[A-Za-z0-9_:.-]{1,200}$' or (item->>'question') !~ '^[0-9]{4}(周测)?-(数学|逻辑)-[0-9]{2,3}$'
   or jsonb_typeof(item->'clock')<>'object' or not((item->'clock') ?& array['wallMs','counter','actorId'])
   or (select count(*) from jsonb_object_keys(item->'clock'))<>3
   or jsonb_typeof(item#>'{clock,wallMs}')<>'number' or jsonb_typeof(item#>'{clock,counter}')<>'number' or jsonb_typeof(item#>'{clock,actorId}')<>'string'
   or (item#>>'{clock,wallMs}') !~ '^[0-9]+$' or (item#>>'{clock,counter}') !~ '^[0-9]+$'
   or (item#>>'{clock,wallMs}')::numeric>9007199254740991 or (item#>>'{clock,counter}')::numeric>9007199254740991
   or (item#>>'{clock,actorId}') !~ '^[A-Za-z0-9_:.-]{1,200}$' or jsonb_typeof(item->'parents')<>'array'
  then raise exception 'invalid operation'; end if;
  field:=item->>'field';val:=item->'value';
  if field in ('note','cause') then
   if jsonb_typeof(val)<>'string' or length(item->>'value')>200000 then raise exception 'invalid text';end if;
  elsif field='favorite' then
   if jsonb_typeof(val)<>'boolean' then raise exception 'invalid favorite';end if;
  elsif field='mastery' then
   if jsonb_typeof(val)<>'object' or not(val ?& array['status','nextReview']) or (select count(*) from jsonb_object_keys(val))<>2
    or jsonb_typeof(val->'status')<>'string' or val->>'status' not in ('未掌握','复习中','已掌握') or jsonb_typeof(val->'nextReview')<>'number' or (val->>'nextReview')::numeric not between 0 and 9007199254740991 then raise exception 'invalid mastery';end if;
  elsif field='attempt' then
   if jsonb_typeof(val)<>'object' or not(val ?& array['id','at','choice','correct']) or (select count(*) from jsonb_object_keys(val))<>4
    or jsonb_typeof(val->'id')<>'string' or length(val->>'id') not between 1 and 200 or val->>'choice' not in ('A','B','C','D','E')
    or jsonb_typeof(val->'choice')<>'string' or jsonb_typeof(val->'at')<>'number' or (val->>'at')::numeric not between 0 and 9007199254740991 or val->'correct' not in ('true'::jsonb,'false'::jsonb,'null'::jsonb) then raise exception 'invalid attempt';end if;
   if exists(select 1 from public.wrongbook_operations o where o.user_id=uid and o.operation->>'question'=item->>'question' and o.operation->>'field'='attempt' and o.operation#>>'{value,id}'=val->>'id' and o.operation->'value'<>val) then raise exception 'answer ID collision';end if;
  else raise exception 'unknown field';end if;
  if (field<>'note' and jsonb_array_length(item->'parents')<>0) or exists(select 1 from jsonb_array_elements(item->'parents') p where jsonb_typeof(p)<>'string' or p#>>'{}' !~ '^[A-Za-z0-9_:.-]{1,200}$') then raise exception 'invalid parents';end if;
  if (select count(*) from jsonb_array_elements(item->'parents'))<>(select count(distinct p) from jsonb_array_elements(item->'parents') p) then raise exception 'duplicate parents';end if;
  if exists(select 1 from jsonb_array_elements_text(item->'parents') pid where not exists(
   select 1 from public.wrongbook_operations o where o.user_id=uid and o.op_id=pid and o.operation->>'question'=item->>'question' and o.operation->>'field'='note'
    and ((o.operation#>>'{clock,wallMs}')::numeric,(o.operation#>>'{clock,counter}')::numeric,(o.operation#>>'{clock,actorId}') collate "C")
      <((item#>>'{clock,wallMs}')::numeric,(item#>>'{clock,counter}')::numeric,(item#>>'{clock,actorId}') collate "C")
  )) then raise exception 'invalid note ancestry';end if;
  select operation into existing from public.wrongbook_operations where user_id=uid and op_id=item->>'id';
  if found then
   if existing<>item then raise exception 'opId collision';end if;
  else
   head:=head+1;
   insert into public.wrongbook_operations(user_id,op_id,commit_seq,operation) values(uid,item->>'id',head,item);
  end if;
  ack:=ack||jsonb_build_array(item->>'id');
 end loop;
 update public.wrongbook_sync_heads set last_seq=head where user_id=uid;
 return ack;
end $$;
revoke all on function wrongbook_private.append_ops(jsonb) from public,anon;
grant execute on function wrongbook_private.append_ops(jsonb) to authenticated;
create function public.append_wrongbook_ops(batch jsonb) returns jsonb
language sql security invoker set search_path='' as $$select wrongbook_private.append_ops(batch);$$;
create function public.pull_wrongbook_ops(after_seq bigint default 0,page_size integer default 100)
returns table(commit_seq bigint,operation jsonb)
language sql stable security invoker set search_path='' as $$
 select o.commit_seq,o.operation from public.wrongbook_operations o
 where o.user_id=(select auth.uid()) and o.commit_seq>greatest(after_seq,0)
 order by o.commit_seq limit least(greatest(page_size,1),100);
$$;
revoke all on function public.append_wrongbook_ops(jsonb),public.pull_wrongbook_ops(bigint,integer) from public,anon;
grant execute on function public.append_wrongbook_ops(jsonb),public.pull_wrongbook_ops(bigint,integer) to authenticated;
commit;
