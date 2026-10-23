import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const op=(id,value='note',wallMs=1,parents=[])=>({id,question:'2016-数学-05',field:'note',value,parents,clock:{wallMs,counter:0,actorId:'test'}});
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values('${a}'),('${b}');`);
 await db.exec(await readFile('supabase/schema.sql','utf8'));
 await db.exec('set role anon');for(const sql of ['select * from public.wrongbook_operations','select * from public.wrongbook_sync_heads',"select public.append_wrongbook_ops('[]')","select * from public.pull_wrongbook_ops(0,100)"]){await assert.rejects(()=>db.query(sql));}await db.exec('reset role');
 async function user(id){await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`);}
 const push=async batch=>(await db.query('select public.append_wrongbook_ops($1::jsonb) as ack',[JSON.stringify(batch)])).rows[0].ack;
 await user(a);assert.deepEqual(await push([op('a')]),['a']);assert.deepEqual(await push([op('a')]),['a']);assert.equal((await db.query('select last_seq from public.wrongbook_sync_heads')).rows[0].last_seq,1);
 await assert.rejects(()=>push([op('a','collision')]));assert.equal((await db.query('select last_seq from public.wrongbook_sync_heads')).rows[0].last_seq,1);
 await assert.rejects(()=>push([op('new'),{...op('invalid'),field:'unknown'}]));assert.equal((await db.query('select count(*) from public.wrongbook_operations')).rows[0].count,1);
 for(const sql of ["delete from public.wrongbook_operations","update public.wrongbook_operations set operation='{}'",'update public.wrongbook_sync_heads set last_seq=100',`insert into public.wrongbook_sync_heads(user_id)values('${b}')`])await assert.rejects(()=>db.query(sql));
 await assert.rejects(()=>push([op('bad-child','child',2,['missing'])]));
 await push([op('child','child',2,['a'])]);const p1=(await db.query('select * from public.pull_wrongbook_ops(0,1)')).rows;assert.equal(p1.length,1);assert.equal(p1[0].commit_seq,1);const p2=(await db.query('select * from public.pull_wrongbook_ops(1,100)')).rows;assert.equal(p2[0].commit_seq,2);
 const event={...op('answer'),field:'attempt',value:{id:'answer-id',at:1,choice:'B',correct:true}};await push([event]);await assert.rejects(()=>push([{...event,id:'different-op',value:{...event.value,choice:'C'}}]));
 await user(b);assert.equal((await db.query('select count(*) from public.wrongbook_operations')).rows[0].count,0);assert.equal((await db.query('select * from public.wrongbook_sync_heads')).rows.length,0);await push([op('a','B content')]);assert.equal((await db.query('select * from public.pull_wrongbook_ops(0,100)')).rows.length,1);
 await user(a);assert.equal((await db.query('select * from public.wrongbook_operations where user_id=$1',[b])).rows.length,0);assert.equal((await db.query('select * from public.wrongbook_operations')).rows.length,3);
 await db.exec('reset role');const policies=(await db.query("select relname,relrowsecurity from pg_class where relname in ('wrongbook_operations','wrongbook_sync_heads')")).rows;assert.ok(policies.every(x=>x.relrowsecurity));
 console.log('PASS: PostgreSQL WASM schema, anon denials, two-user RLS isolation, immutable grants, RPC idempotency/collisions, atomic failed batch, note parents, answer collision, paginated committed sequence');
}finally{await db.close();}
