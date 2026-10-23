// Immutable operations. The union is the merge; projections never discard history.
import {parseBackup,validateRecords} from './review.js';
export const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join()===keys.sort().join();
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const ident=v=>typeof v==='string'&&/^[\w:.-]{1,200}$/.test(v);
export function clockValid(c){return exact(c,['wallMs','counter','actorId'])&&integer(c.wallMs)&&integer(c.counter)&&ident(c.actorId);}
export function compare(a,b){return a.wallMs-b.wallMs||a.counter-b.counter||(a.actorId<b.actorId?-1:a.actorId>b.actorId?1:0);}
export function tick(previous,actorId,now=Date.now(),received){
 const p=previous||{wallMs:0,counter:0},r=received||{wallMs:0,counter:0};
 const wallMs=Math.max(now,p.wallMs,r.wallMs);const counter=wallMs===p.wallMs&&wallMs===r.wallMs?Math.max(p.counter,r.counter)+1:wallMs===p.wallMs?p.counter+1:wallMs===r.wallMs?r.counter+1:0;
 if(!integer(wallMs)||!integer(counter))throw Error('时钟超出范围');return {wallMs,counter,actorId};
}
export function validateOp(op){
 if(!exact(op,['id','question','clock','field','value','parents'])||!ident(op.id)||!clockValid(op.clock)||!/^\d{4}(周测)?-(数学|逻辑)-\d{2,3}$/.test(op.question)||!Array.isArray(op.parents)||op.parents.some(x=>!ident(x)||x===op.id)||new Set(op.parents).size!==op.parents.length)throw Error('操作格式无效');
 const {field,value}=op;
 if(field==='mastery'){if(!exact(value,['status','nextReview'])||!['未掌握','复习中','已掌握'].includes(value.status))throw Error('复习计划必须成组');validateRecords({[op.question]:value});}
 else if(field==='attempt'){if(!exact(value,['id','at','choice','correct'])||!value.id)throw Error('答题事件无效');validateRecords({[op.question]:{attempts:[value]}});}
 else if(['note','cause','favorite'].includes(field))validateRecords({[op.question]:{[field]:value}});
 else throw Error('未知操作字段');
 if(field!=='note'&&op.parents.length)throw Error('只有笔记可引用父版本');return op;
}
export function union(...sets){
 const byId=new Map(),events=new Map();
 for(const op of sets.flat()){
  validateOp(op);const text=canonical(op);if(byId.has(op.id)&&canonical(byId.get(op.id))!==text)throw Error('同一 opId 内容不同');
  if(op.field==='attempt'){const key=op.question+'\0'+op.value.id;if(events.has(key)&&events.get(key)!==canonical(op.value))throw Error('同一答题 ID 内容不同');events.set(key,canonical(op.value));}
  byId.set(op.id,op);
 }
 const result=[...byId.values()].sort((a,b)=>(a.id<b.id?-1:a.id>b.id?1:0));
 for(const op of result)for(const id of op.parents){const parent=byId.get(id);if(!parent||parent.field!=='note'||parent.question!==op.question||compare(parent.clock,op.clock)>=0)throw Error('笔记父版本缺失或顺序无效');}
 return result;
}
export function project(operations){
 const rows=Object.create(null),winners=new Map(),notes=new Map(),parents=new Set();
 for(const op of union(operations)){
  const row=rows[op.question]||=( {attempts:[]} );row.updatedAt=Math.max(row.updatedAt||0,op.clock.wallMs);
  if(op.field==='attempt'){if(!row.attempts.some(a=>a.id===op.value.id))row.attempts.push(op.value);}
  else if(op.field==='note'){if(!notes.has(op.question))notes.set(op.question,[]);notes.get(op.question).push(op);op.parents.forEach(p=>parents.add(p));}
  else{const key=op.question+':'+op.field,old=winners.get(key);if(!old||compare(op.clock,old.clock)>0||(compare(op.clock,old.clock)===0&&op.id>old.id)){winners.set(key,op);if(op.field==='mastery')Object.assign(row,op.value);else row[op.field]=op.value;}}
 }
 for(const [id,versions] of notes){const heads=versions.filter(v=>!parents.has(v.id)).sort((a,b)=>compare(a.clock,b.clock)||(a.id<b.id?-1:1));rows[id].note=heads.at(-1)?.value||'';rows[id].noteHeads=heads.map(v=>v.id);rows[id].noteConflicts=heads.map(v=>({id:v.id,text:v.value}));}
 for(const row of Object.values(rows))row.attempts.sort((a,b)=>a.at-b.at||(a.id<b.id?-1:a.id>b.id?1:0));return rows;
}
export async function digest(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function legacyOps(records){
 const ops=[];for(const [question,row] of Object.entries(validateRecords(records))){
  const fields={};for(const field of ['note','cause','favorite'])if(field in row)fields[field]=row[field];
  if('status'in row||'nextReview'in row)fields.mastery={status:row.status||'未掌握',nextReview:row.nextReview||0};
  for(const [field,value] of [...Object.entries(fields),...(row.attempts||[]).map(a=>['attempt',a])]){
   const hash=await digest(canonical({question,field,value,at:row.updatedAt||0}));ops.push({id:'legacy:'+hash,question,field,value,parents:[],clock:{wallMs:Math.floor(row.updatedAt||0),counter:0,actorId:'legacy:'+hash}});
  }
 }return union(ops);
}
export async function decodeBackup(raw){
 const data=typeof raw==='string'?JSON.parse(raw):raw;
 if(data?.version!==3)return legacyOps(parseBackup(data));
 if(!exact(data,['version','operations','recovery'])||!Array.isArray(data.operations)||data.operations.length>100000||!object(data.recovery))throw Error('v3 备份结构无效');
 // Recovery metadata is archival only. Never restore identity, ownership or delivery flags.
 return union(data.operations);
}
export function compatibility(rows){return Object.fromEntries(Object.entries(rows).map(([id,row])=>[id,Object.fromEntries(Object.entries(row).filter(([k])=>!['noteHeads','noteConflicts'].includes(k)))]));}
