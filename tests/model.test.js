import test from 'node:test';import assert from 'node:assert/strict';
import {union,project,tick,compare,legacyOps,decodeBackup,canonical} from '../web/model.js';
const question='2016-数学-05';
const op=(id,field,value,wallMs=1,actorId=id,parents=[])=>({id,question,field,value,clock:{wallMs,counter:0,actorId},parents});
test('HLC equal times, rollback, receiving ahead and monotonic persisted continuation',()=>{
 let c=tick(null,'a',100);for(const now of [100,1,0,200,4]){const next=tick(c,'a',now);assert.ok(compare(next,c)>0);c=next;}
 const remote={wallMs:1000,counter:9,actorId:'z'};const received=tick(c,'a',1,remote);assert.ok(compare(received,remote)>0);assert.ok(compare(tick(JSON.parse(JSON.stringify(received)),'a',1),received)>0);
});
test('operation union and projection are commutative, associative and idempotent across permutations',()=>{
 const a=[op('a','cause','甲'),op('n1','note','甲')],b=[op('b','favorite',true),op('n2','note','乙')],c=[op('c','cause','乙',1,'z')];
 const ab=union(a,b);assert.equal(canonical(union(a,b)),canonical(union(b,a)));assert.equal(canonical(union(ab,c)),canonical(union(a,union(b,c))));assert.deepEqual(union(ab,ab),ab);
 for(const set of [union(a,b,c),union(c,b,a),union(b,a,c)]){assert.deepEqual(project(set),project(union(a,b,c)));assert.equal(project(set)[question].noteConflicts.length,2);}
});
test('field LWW, atomic mastery, note parents, empty tombstone and undo retain all versions',()=>{
 const a=op('a','mastery',{status:'已掌握',nextReview:10}),b=op('b','mastery',{status:'未掌握',nextReview:20},1,'z');
 const n=op('n','note','one'),clear=op('clear','note','',2,'a',['n']),undo=op('undo','note','one',3,'a',['clear']);
 const row=project([a,b,n,clear])[question];assert.equal(row.status,'未掌握');assert.equal(row.nextReview,20);assert.equal(row.note,'');assert.equal(row.noteHeads.length,1);assert.equal(project([n,clear,undo])[question].note,'one');assert.equal(union(n?[n,clear,undo]:[]).length,3);
 assert.throws(()=>union([op('bad','mastery',{status:'已掌握'})]));assert.throws(()=>union([op('bad','note','a',1,'a',['absent'])]));
});
test('same ID different operations or answer content are rejected; events form a set',()=>{
 const event={id:'answer',at:2,choice:'A',correct:false};const a=op('a','attempt',event),b=op('b','attempt',event,2);
 assert.equal(project([a,b,a])[question].attempts.length,1);assert.throws(()=>union([a,{...a,value:{...event,choice:'B'}}]));assert.throws(()=>union([a,{...b,value:{...event,choice:'B'}}]));
});
test('legacy stable identifiers, historical backup, v3 roundtrip and hostile schemas',async()=>{
 const rows={[question]:{note:'原笔记',status:'重做中',favorite:true,updatedAt:10}};const ops=await legacyOps(rows);assert.deepEqual(await legacyOps(rows),ops);
 assert.deepEqual(await decodeBackup(JSON.stringify({version:3,operations:ops,recovery:{outbox:['untrusted']}})),ops);
 assert.equal(project(await decodeBackup({version:'2026-10-22-questions',review:rows}))[question].status,'复习中');
 await assert.rejects(()=>decodeBackup({version:3,operations:[{...ops[0],extra:1}],recovery:{}}));
});
