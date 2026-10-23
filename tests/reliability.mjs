import assert from 'node:assert/strict';import {harness} from './harness.mjs';
const h=await harness();
try{
 const page=await h.context.newPage(),other=await h.context.newPage();await Promise.all([page.goto(h.base),other.goto(h.base)]);await Promise.all([page.waitForSelector('article'),other.waitForSelector('article')]);
 const result=await page.evaluate(async()=>{
  const {RecordStore}=await import('./store.js'),{canonical}=await import('./model.js');const id='2016-数学-05';const check=(c,m)=>{if(!c)throw Error(m);};const empty={getItem:()=>null};
  const s=await RecordStore.open('test-atomic');await s.initialize(empty);await s.edit(id,{note:'first',favorite:true});const before=await s.read();
  try{await s.transaction(true,async x=>{x.meta.put({broken:true},'state');x.outbox.clear();throw new DOMException('injected quota','QuotaExceededError');});throw Error('not aborted');}catch(e){check(e.name==='QuotaExceededError','quota error preserved');}
  check(canonical((await s.read()).operations)===canonical(before.operations),'failed transaction changed operations');
  const backup=await s.backup();const restored=await RecordStore.open('test-restored');await restored.initialize(empty);await restored.import(JSON.stringify(backup));check(canonical((await restored.read()).rows)===canonical(before.rows),'v3 roundtrip');
  const count=(await restored.read()).operations.length;await restored.import(backup);check((await restored.read()).operations.length===count,'duplicate import');
  const altered=structuredClone(backup);altered.operations[0].value=altered.operations[0].field==='note'?'different':false;
  const cpBefore=await restored.transaction(false,x=>new Promise(r=>{const q=x.checkpoints.count();q.onsuccess=()=>r(q.result);}));
  try{await restored.import(altered);throw Error('accepted collision');}catch(e){check(e.message.includes('opId'),'collision not rejected');}
  const cpAfter=await restored.transaction(false,x=>new Promise(r=>{const q=x.checkpoints.count();q.onsuccess=()=>r(q.result);}));check(cpBefore===cpAfter,'failed import wrote checkpoint');
  const legacy=JSON.stringify({[id]:{note:'old',status:'重做中'}}),storage={getItem:k=>k.endsWith('v1')?legacy:null};const m=await RecordStore.open('test-migration');
  const commit=m.commit.bind(m);m.commit=async(...args)=>{await commit(...args);throw Error('interrupted');};try{await m.initialize(storage);}catch{}
  const retry=await RecordStore.open('test-migration');await Promise.all([retry.initialize(storage),(await RecordStore.open('test-migration')).initialize(storage)]);
  const migrated=await retry.read();check(migrated.operations.length===2,'migration not exactly once');check(migrated.rows[id].note==='old','migration failed');
  const raw=await retry.transaction(false,x=>new Promise(r=>{const q=x.migrations.getAll();q.onsuccess=()=>r(q.result);}));check(raw[0].raw===legacy,'migration original missing');
  const invalid=await RecordStore.open('test-invalid');try{await invalid.initialize({getItem:()=>'{broken'});}catch{}check(invalid.recovery,'corrupt legacy not recovery');try{await invalid.edit(id,{note:'overwrite'});throw Error('allowed overwrite');}catch(e){check(e.message.includes('恢复模式'),'empty overwrite permitted');}
  await s.transaction(true,x=>{x.records.put({},'all');});try{await s.read();}catch{}check(s.recovery,'corrupt DB not recovery');check((await s.backup()).operations.length===before.operations.length,'recovery export lost history');
  const v2=await restored.exportV2();check(v2.limitations.includes('冲突'),'compatibility warning missing');
  return 'PASS: IDB rollback/quota injection, atomic import/checkpoint, v3/v2, migration abort/retry/two connections, corruption recovery';
 });console.log(result);
 await Promise.all([page.evaluate(async()=>{const {RecordStore}=await import('./store.js');window.s=await RecordStore.open('test-tabs');await window.s.initialize({getItem:()=>null});}),other.evaluate(async()=>{const {RecordStore}=await import('./store.js');window.s=await RecordStore.open('test-tabs');await window.s.initialize({getItem:()=>null});})]);
 await Promise.all([page.evaluate(()=>window.s.edit('2016-数学-05',{cause:'tab A',note:'A'})),other.evaluate(()=>window.s.edit('2016-数学-05',{favorite:true,note:'B'}))]);
 const rows=await page.evaluate(async()=>(await window.s.read()).rows);assert.equal(rows['2016-数学-05'].cause,'tab A');assert.equal(rows['2016-数学-05'].favorite,true);assert.equal(rows['2016-数学-05'].noteConflicts.length,2);
 await Promise.all([page.evaluate(()=>window.s.edit('2016-数学-05',{cause:'one'})),other.evaluate(()=>window.s.edit('2016-数学-05',{cause:'two'}))]);assert.deepEqual(await page.evaluate(async()=>(await window.s.read()).rows),await other.evaluate(async()=>(await window.s.read()).rows));
 await other.close();await page.reload();await page.waitForSelector('article');assert.equal(await page.evaluate(async()=>{const {RecordStore}=await import('./store.js');return (await(await RecordStore.open('test-tabs')).read()).rows['2016-数学-05'].noteConflicts.length;}),2);console.log('PASS: same context real tabs, same/different fields, note branches, close/reload persistence');
 // Failed UI write keeps draft and emergency export; no successful-save claim.
 await page.evaluate(async()=>{const {RecordStore}=await import('./store.js');RecordStore.prototype.edit=async()=>{throw new DOMException('quota injection','QuotaExceededError');};});
 await page.locator('article textarea').first().fill('unsaved emergency draft');await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('保存失败'));assert.equal(await page.locator('article textarea').first().inputValue(),'unsaved emergency draft');const download=page.waitForEvent('download');await page.locator('#emergency').click();assert.match((await download).suggestedFilename(),/emergency/);console.log('PASS: failed UI save retains draft and provides emergency download');
}finally{await h.close();}
