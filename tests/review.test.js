import test from 'node:test';import assert from 'node:assert/strict';
import {parseBackup,mergeRecords,validateRecords,schedule,due} from '../web/review.js';
const id='2016-数学-05';
test('legacy migration',()=>{const d=parseBackup({version:'2026-10-22-questions',review:{[id]:{status:'重做中',note:'原笔记',cause:'计算'}}});assert.equal(d[id].status,'复习中');assert.equal(d[id].note,'原笔记');});
test('backup round trip',()=>{const d={[id]:{status:'已掌握',note:'中文笔记',favorite:true,attempts:[{id:'a',at:1,choice:'B',correct:true}],nextReview:3,updatedAt:2}};assert.deepEqual(JSON.parse(JSON.stringify(parseBackup(JSON.stringify({version:2,review:d})))),d);});
test('bad import rejected',()=>{for(const d of [null,[],{version:3,review:{}},{version:2,review:{[id]:{status:'bad'}}},{version:2,review:{[id]:{attempts:[{}]}}}])assert.throws(()=>parseBackup(d));});
test('merge preserves both notes and de-duplicates attempts',()=>{const a={[id]:{note:'本机',updatedAt:2,status:'已掌握',attempts:[{id:'a',at:1,choice:'B',correct:true}]}};const b={[id]:{note:'备份',updatedAt:1,status:'未掌握',attempts:[{id:'a',at:1,choice:'B',correct:true}]}};const merged=mergeRecords(a,b).records;assert.equal(merged[id].attempts.length,1);assert.equal(merged[id].status,'已掌握');assert.match(merged[id].note,/本机/);assert.match(merged[id].note,/备份/);});
test('prototype fields rejected',()=>assert.throws(()=>validateRecords(JSON.parse('{"__proto__":{}}'))));
test('interval schedule',()=>{assert.equal(schedule('已掌握',0),7*86400000);assert.equal(due({nextReview:2},1),false);assert.equal(due({},1),true);});

test('repeated import is idempotent',()=>{const a={[id]:{note:'甲',updatedAt:2}},b={[id]:{note:'乙',updatedAt:1}};const once=mergeRecords(a,b).records;assert.deepEqual(mergeRecords(once,b).records,once);});
