// Official pinned SDK + simulated HTTP only. This is NOT hosted OAuth/device acceptance.
import {harness} from './harness.mjs';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
assert.deepEqual(await readFile('web/vendor/supabase/supabase.js'),await readFile('node_modules/@supabase/supabase-js/dist/umd/supabase.js'));
const h=await harness({serviceWorkers:'block'}),uid='33333333-3333-4333-8333-333333333333',uid2='44444444-4444-4444-8444-444444444444';
const project='https://yladshlpuspylvexuial.supabase.co';let pushes=0,offline=false,authorizedUrl,rows=[],activePage,network=[];
const session=id=>({access_token:[btoa('{}'),btoa(JSON.stringify({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})), 'synthetic'].join('.'),refresh_token:'synthetic-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',user_metadata:{user_name:id===uid?'fixture-A':'fixture-B'}}});
try{
 await h.context.route(project+'/**',async route=>{const r=route.request(),url=new URL(r.url());network.push(url.pathname);if(offline){await route.abort();return;}let data={};
  if(url.pathname.endsWith('/authorize')){authorizedUrl=url;await route.fulfill({contentType:'text/html',body:'<p>synthetic OAuth provider</p>'});return;}
  if(url.pathname.endsWith('/token'))data=session(uid);
  else if(url.pathname.endsWith('/user'))data=session(uid).user;
  else if(url.pathname.endsWith('/append_wrongbook_ops')){pushes++;const {batch}=r.postDataJSON();for(const op of batch)if(!rows.some(x=>x.operation.id===op.id))rows.push({commit_seq:rows.length+1,operation:op});data=batch.map(op=>op.id);}
  else if(url.pathname.endsWith('/pull_wrongbook_ops'))data=rows.filter(x=>x.commit_seq>r.postDataJSON().after_seq);
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const p=activePage=await h.context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(h.base);await p.waitForSelector('article');
 const note=p.locator('textarea').first();await note.fill('synthetic anonymous stays separate');await p.getByText('已保存本机',{exact:true}).waitFor();
 await p.locator('#github-login').click();await p.waitForURL(project+'/**');assert.equal(authorizedUrl.searchParams.get('provider'),'github');assert.equal(authorizedUrl.searchParams.get('redirect_to'),h.base);assert.ok(authorizedUrl.searchParams.get('code_challenge'));assert.equal(authorizedUrl.searchParams.get('code_challenge_method'),'s256');
 await p.goto(h.base+'?code=synthetic-code');await p.locator('#account-status').filter({hasText:'fixture-A'}).waitFor();assert.equal(new URL(p.url()).search,'');assert.equal(await note.inputValue(),'');assert.equal(pushes,0);
 await p.reload();await p.locator('#account-status').filter({hasText:'fixture-A'}).waitFor();assert.equal(pushes,0,'session restore uploaded without consent');
 await note.fill('synthetic account A');await p.getByText('已保存本机',{exact:true}).waitFor();await p.locator('#enable-cloud').click();await p.locator('#upload-consent').check();assert.equal(await p.locator('#confirm-cloud').isDisabled(),true);
 const download=p.waitForEvent('download');await p.locator('#cloud-backup').click();const d=await download,path=await d.path();await p.locator('#verify-cloud-backup').setInputFiles(path);await p.locator('#confirm-cloud').click();await p.locator('#sync-status').filter({hasText:'已与云端核对一致'}).waitFor();assert.equal(pushes,1);
 // Reopen after consent: only this user's database resumes; no duplicated event IDs.
 await p.reload();await p.locator('#sync-status').filter({hasText:'已与云端核对一致'}).waitFor();assert.equal(await note.inputValue(),'synthetic account A');assert.equal(pushes,1);
 const two=await h.context.newPage();await two.goto(h.base);await two.locator('#sync-status').filter({hasText:'已与云端核对一致'}).waitFor();
 offline=true;
 await p.evaluate(async()=>{const {authStorage}=await import('./auth-storage.js');const key='mpa-auth-yladshlpuspylvexuial.supabase.co',storage=authStorage(key),value=JSON.parse(await storage.getItem(key));value.expires_at=1;await storage.setItem(key,JSON.stringify(value));});
 await note.fill('synthetic offline edit');await p.getByText('已保存本机',{exact:true}).waitFor();await p.reload();await p.locator('#account-status').filter({hasText:'fixture-A'}).waitFor();assert.equal(await note.inputValue(),'synthetic offline edit');
 offline=false;await p.locator('#retry-sync').click();await p.locator('#sync-status').filter({hasText:'已与云端核对一致'}).waitFor();await two.waitForFunction(()=>document.querySelector('textarea').value==='synthetic offline edit');
 await p.locator('#pause-cloud').click();await two.locator('#sync-status').filter({hasText:'已暂停'}).waitFor();const pausedPushes=pushes;
 await note.fill('synthetic paused pending');await p.getByText('已保存本机',{exact:true}).waitFor();await p.reload();await p.locator('#account-status').filter({hasText:'fixture-A'}).waitFor();assert.equal(await note.inputValue(),'synthetic paused pending');assert.equal(pushes,pausedPushes);
 await p.locator('#logout').click();await p.locator('#account-status').filter({hasText:'匿名'}).waitFor();assert.equal(await note.inputValue(),'synthetic anonymous stays separate');
 // A new identity is restored into a distinct empty DB; no consent or records inherit.
 await p.evaluate(async({uid,session})=>{const {authStorage}=await import('./auth-storage.js');await authStorage('mpa-auth-yladshlpuspylvexuial.supabase.co').setItem('mpa-auth-yladshlpuspylvexuial.supabase.co',JSON.stringify(session));},{uid:uid2,session:session(uid2)});
 const before=pushes;await p.reload();await p.locator('#account-status').filter({hasText:'fixture-B'}).waitFor();assert.equal(await note.inputValue(),'');assert.equal(pushes,before);assert.match(await p.locator('#sync-status').innerText(),/尚未允许上传/);
 assert.deepEqual(errors,[]);
 console.log('PASS: pinned official SDK, persistent PKCE callback/session, login does not upload, verified v3 + explicit consent, user DB isolation, offline edit/reload/retry, same-context second tab, cross-tab pause preserves pending, logout anonymous restore, session isolation (HTTP simulated, SW disabled; public cache exclusions tested in pwa.mjs)');
}catch(e){console.error(network);console.error(await activePage?.locator('#cloud-controls').innerText(),await activePage?.locator('#message').innerText());await activePage?.screenshot({path:'test-results/cloud-ui-failure-'+(process.env.BROWSER_ENGINE||'chromium')+'.png'});throw e;}finally{await h.close();}
