import {harness} from './harness.mjs';const h=await harness();try{
 const p=await h.context.newPage();await p.goto(h.base);await p.waitForSelector('article');
 console.log(await p.evaluate(async()=>{
  const {RecordStore}=await import('./store.js'),{CloudWorkspace,createCloudWorkspace,validatePublicConfig}=await import('./cloud.js');const {canonical}=await import('./model.js');const check=(c,m)=>{if(!c)throw Error(m);};
  for(const key of ['sb_secret_synthetic','database-password',btoa('header')+'.'+btoa(JSON.stringify({role:'service_role'}))+'.sig']){try{validatePublicConfig('https://example.supabase.co/',key);throw Error('accepted secret');}catch(e){check(e.message.includes('前端只接受'),'key validation');}}
  validatePublicConfig('https://example.supabase.co/','sb_publishable_synthetic');validatePublicConfig('https://example.supabase.co/',btoa('header')+'.'+btoa(JSON.stringify({role:'anon'}))+'.sig');
  const anonymous=await RecordStore.open('test-cloud-anon');await anonymous.initialize({getItem:()=>null});await anonymous.edit('2016-数学-05',{note:'synthetic anonymous'});
  const uid='11111111-1111-4111-8111-111111111111',uid2='22222222-2222-4222-8222-222222222222';let session={user:{id:uid}},authChange,pushes=0;const users=new Map();
  const client={auth:{onAuthStateChange:fn=>{authChange=fn;return {data:{subscription:{unsubscribe(){}}}};},getSession:async()=>({data:{session}}),signInWithOAuth:async opts=>{check(opts.provider==='github','not GitHub OAuth');return{};},signOut:async()=>{session=null;authChange('SIGNED_OUT',null);return{};}},rpc:async(name,args)=>{
   const owner=session.user.id;if(!users.has(owner))users.set(owner,[]);const rows=users.get(owner);
   if(name==='append_wrongbook_ops'){pushes++;for(const op of args.batch){const old=rows.find(r=>r.operation.id===op.id);if(old&&canonical(old.operation)!==canonical(op))throw Error('collision');if(!old)rows.push({commit_seq:rows.length+1,operation:op});}return {data:args.batch.map(op=>op.id)};}
   return {data:rows.filter(r=>r.commit_seq>args.after_seq).slice(0,args.page_size)};
  },channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel(){}};
  const w=createCloudWorkspace({createClient:(_url,_key,options)=>{check(options.auth.storage===sessionStorage,'auth used localStorage');return client;},url:'https://example.supabase.co/',key:'sb_publishable_synthetic',anonymous});await w.login(location.href);check(pushes===0,'login uploaded anonymously');
  check(await w.enable({saveBackup:async()=>true,confirmUpload:async()=>false})===false,'declined upload enabled');check(pushes===0,'declined upload sent');
  try{await w.enable({saveBackup:async()=>false,confirmUpload:async()=>true});throw Error('backup skipped');}catch(e){check(e.message.includes('必须先'),'backup not required');}
  await w.enable({saveBackup:async backup=>{check(backup.version===3,'not v3 backup');return true;},confirmUpload:async id=>id===uid});check(pushes===1,'consented upload missing');await w.pull();check(await w.store.cursor()===1,'cursor did not advance');check(!(await w.store.batch()).length,'confirmed outbox not cleared');check((await anonymous.batch()).length===1,'anonymous outbox modified');
  // Page data and cursor roll back together; two tabs may reapply the same page.
  const account=w.store,before=await account.cursor(),rows=users.get(uid);await account.applyRemote(rows);check(await account.cursor()===before,'duplicate page cursor changed');
  try{await account.applyRemote([{commit_seq:2,operation:{invalid:true}}]);throw Error('accepted corrupt pull');}catch{}check(await account.cursor()===before,'failed pull advanced cursor');
  await account.edit('2016-数学-05',{cause:'owned pending'});check((await account.batch(uid2)).length===0,'outbox cross user');
  session={user:{id:uid2}};authChange('SIGNED_IN',session);check(!w.enabled,'account change not stopped');const count=pushes;await w.retry();check(pushes===count,'stopped sender ran');
  const second=await RecordStore.open('mpa-wrongbook-v3:user:'+uid2,uid2);await second.initialize({getItem:()=>null});check(Object.keys((await second.read()).rows).length===0,'other account inherited records');
  // Restored ownership, clock and sent flags are ignored; operations become fresh pending data for B only after explicit import.
  const backup=await anonymous.backup();backup.recovery.meta=[{owner:uid,clock:{actorId:'spoof'}}];backup.recovery.outbox=[];await second.import(backup);check((await second.batch(uid2)).length===1,'restore trusted sent/owner flags');check(!(await second.batch(uid)).length,'restore attached to old user');
  const previous=w.userId;await w.logout();check(!w.enabled&&session===null,'logout failed');w.destroy();second.close();anonymous.close();
  return 'PASS: public-key guard, GitHub OAuth, no upload on login/refusal, required backup/consent, per-account DB/outbox, stop on signout/switch, atomic pull/cursor, duplicate pages, untrusted restore identity';
 }));
}finally{await h.close();}
