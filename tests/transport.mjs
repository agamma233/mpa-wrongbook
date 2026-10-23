import assert from 'node:assert/strict';import {harness} from './harness.mjs';
const h=await harness();try{
 const page=await h.context.newPage(),other=await h.context.newPage();await Promise.all([page.goto(h.base),other.goto(h.base)]);await Promise.all([page.waitForSelector('article'),other.waitForSelector('article')]);
 // UI notification re-reads IDB and keeps the focused field and caret.
 await page.locator('article textarea').first().fill('active local draft');await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('已保存本机'));
 await page.locator('article textarea').first().evaluate(n=>{n.focus();n.setSelectionRange(3,3);});
 await other.locator('article input').first().fill('different field from other tab');await other.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('已保存本机'));
 await page.waitForFunction(()=>document.querySelector('article input').value==='different field from other tab');assert.equal(await page.locator('article textarea').first().inputValue(),'active local draft');assert.equal(await page.locator('article textarea').first().evaluate(n=>n.selectionStart),3);
 // Suppress broadcast to prove the foreground 5s fallback rather than a synthetic notification.
 await other.evaluate(async()=>{const {RecordStore}=await import('./store.js');const s=await RecordStore.open();s.channel?.close();s.channel=null;await s.edit('2016-数学-05',{cause:'missed broadcast'});});
 await page.waitForFunction(()=>document.querySelector('article input').value==='missed broadcast',null,{timeout:12000});console.log('PASS: commit hints, IDB refresh, draft/caret protection, missed broadcast 5s fallback');
 const result=await page.evaluate(async()=>{
  const {RecordStore}=await import('./store.js'),{OutboxSender,SimulatedTransport}=await import('./transport.js');const check=(c,m)=>{if(!c)throw Error(m);};const s=await RecordStore.open('test-send');await s.initialize({getItem:()=>null});await s.edit('2016-数学-05',{cause:'first'});
  const server=new SimulatedTransport();let release,started;const ready=new Promise(r=>started=r);const states=[];
  const sender=new OutboxSender(s,{send:async batch=>{started();await new Promise(r=>release=r);return server.send(batch);}},{onState:state=>states.push(state)});
  const running=sender.flush();await ready;await s.edit('2016-数学-05',{favorite:true});release();await running;sender.stop();check((await s.batch()).length===1,'inflight edit was cleared');
  const last=await s.batch();const ack=await server.send(last);await server.send([...last].reverse());await s.acknowledge(ack);await s.acknowledge(ack);check(!(await s.batch()).length,'duplicate ack');
  await s.edit('2016-数学-05',{cause:'retry'});const fixed=(await s.batch())[0].id;
  const timeout=new OutboxSender(s,{send:()=>new Promise(()=>{})},{timeout:10,onState:x=>states.push(x)});await timeout.flush();timeout.stop();check((await s.batch())[0].id===fixed,'timeout changed id');check(states.includes('failed'),'timeout not failed');
  let tries=0;const flaky={send:async batch=>{tries++;if(tries===1){await server.send(batch);throw Error('response lost');}return server.send(batch);}};
  const retry=new OutboxSender(s,flaky,{random:()=>0});await retry.flush();check((await s.batch()).length===1,'lost ack cleared pending');await retry.retry();retry.stop();check(!(await s.batch()).length,'retry did not clear acknowledged');
  await s.edit('2016-数学-05',{cause:'multi sender'});const s2=await RecordStore.open('test-send');const a=new OutboxSender(s,server),b=new OutboxSender(s2,server);await Promise.all([a.flush(),b.flush()]);a.stop();b.stop();check(!(await s.batch()).length,'multi sender failed');
  await s.edit('2016-数学-05',{cause:'bad ack'});const bad=new OutboxSender(s,{send:async()=>['unknown']});await bad.flush();bad.stop();check((await s.batch()).length===1,'bad ack deleted item');
  await s.edit('2016-数学-05',{favorite:false});const partial=new OutboxSender(s,{send:async batch=>{await server.send([...batch].reverse());return [batch[1].id];}});await partial.flush();partial.stop();check((await s.batch()).length===1,'partial out of order ack wrong');
  window.senderStore=s;return 'PASS: inflight edits, fixed IDs, duplicate sends/acks, timeout, lost response/retry, multiple senders, invalid/partial/reordered acknowledgements';
 });console.log(result);
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('article');h.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('article');assert.equal(await page.evaluate(async()=>{const {RecordStore}=await import('./store.js');return (await(await RecordStore.open('test-send')).batch()).length;}),1);h.setOffline(false);
 assert.equal(await page.evaluate(async()=>{const {RecordStore}=await import('./store.js'),{OutboxSender,SimulatedTransport}=await import('./transport.js');const s=await RecordStore.open('test-send'),sender=new OutboxSender(s,new SimulatedTransport());await sender.retry();sender.stop();return (await s.batch()).length;}),0);console.log('PASS: offline reload retains outbox and reconnect/manual retry sends it');
}finally{await h.close();}
