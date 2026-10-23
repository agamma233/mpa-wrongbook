import {KEY,validateRecords} from './review.js';
import {canonical,clockValid,compare,tick,union,project,legacyOps,decodeBackup,compatibility} from './model.js';
export const DB_NAME='mpa-wrongbook-v3';
const stores=['meta','records','operations','outbox','migrations','checkpoints'];
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export class RecordStore{
 constructor(db,userId=null){this.userId=userId;this.db=db;this.recovery=false;this.pending=new Set();this.channel=typeof BroadcastChannel==='function'?new BroadcastChannel(db.name+':commits'):null;this.channel?.addEventListener('message',e=>{if(Number.isSafeInteger(e.data?.seq))this.onSequence?.(e.data.seq);});}
 static async open(name=DB_NAME,userId=null){const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{for(const s of stores)r.result.createObjectStore(s);};const db=await request(r);db.onversionchange=()=>db.close();return new RecordStore(db,userId);}
 async transaction(write,fn){
  if(write&&this.recovery)throw Error('恢复模式：禁止覆盖，请先导出并修复原始数据');
  const tx=this.db.transaction(stores,write?'readwrite':'readonly');
  const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('事务已中止'));tx.onerror=()=>{};});
  const access=Object.fromEntries(stores.map(s=>[s,tx.objectStore(s)]));
  const run=(async()=>{try{const result=await fn(access,tx);await done;if(write&&result?.meta)this.channel?.postMessage({seq:result.meta.seq});return result;}catch(e){try{tx.abort();}catch{}await done.catch(()=>{});throw e;}})();
  this.pending.add(run);try{return await run;}finally{this.pending.delete(run);}
 }
 async idle(){await Promise.all([...this.pending]);}
 async inspect(s){
  const [meta,operations,records,outbox]=await Promise.all([request(s.meta.get('state')),request(s.operations.getAll()),request(s.records.get('all')),request(s.outbox.getAll())]);
  const merged=union(operations),rows=project(merged),ids=new Set(merged.map(op=>op.id));
  if(meta){if((meta.owner||null)!==this.userId||!clockValid(meta.clock)||!Number.isSafeInteger(meta.seq)||meta.seq<0||canonical(rows)!==canonical(records)||outbox.some(v=>!ids.has(v.opId)))throw Error('数据库一致性检查失败');}
  else if(merged.length||records||outbox.length)throw Error('数据库元数据缺失');
  return {meta,operations:merged,rows};
 }
 async read(){try{return await this.transaction(false,s=>this.inspect(s));}catch(e){this.recovery=true;throw e;}}
 async commit(s,current,incoming,{checkpoint,marker,raw,remote=false}={}){
  const operations=union(current.operations,incoming);const actorId=current.meta?.clock.actorId||crypto.randomUUID();
  let clock=current.meta?.clock||{wallMs:0,counter:0,actorId};for(const op of incoming)clock=tick(clock,actorId,Date.now(),op.clock);
  const known=new Set(current.operations.map(op=>op.id));const fresh=operations.filter(op=>!known.has(op.id));
  if(checkpoint)s.checkpoints.put({version:3,operations:current.operations,recovery:{}},crypto.randomUUID());
  for(const op of fresh){s.operations.add(op,op.id);if(!remote)s.outbox.add({opId:op.id,userId:this.userId},op.id);}
  const meta={clock,owner:this.userId,seq:(current.meta?.seq||0)+1};s.records.put(project(operations),'all');s.meta.put(meta,'state');
  if(marker)s.migrations.put({marker,raw,completed:true},marker);
  return {meta,operations,rows:project(operations)};
 }
 async initialize(storage=localStorage){
  try{
   // Read every legacy key first; one malformed source must not result in an empty migration.
   const raw=Object.fromEntries([KEY,'mpa_wrongbook_review_v1'].map(k=>[k,storage.getItem(k)]));
   const prepared={};for(const [key,value]of Object.entries(raw))if(value!==null)prepared[key]=key===KEY?await decodeBackup(value):await legacyOps(validateRecords(JSON.parse(value)));
   return await this.transaction(true,async s=>{let current=await this.inspect(s);
    for(const [key,ops]of Object.entries(prepared))if(!await request(s.migrations.get(key)))current=await this.commit(s,current,ops,{marker:key,raw:raw[key]});
    if(!current.meta)current=await this.commit(s,current,[]);return current;
   });
  }catch(e){this.recovery=true;throw e;}
 }
 async edit(question,patch,parents=[]){return this.transaction(true,async s=>{
  const current=await this.inspect(s),actor=current.meta.clock.actorId;let clock=current.meta.clock;const ops=[];
  if('status'in patch||'nextReview'in patch){if(!('status'in patch&&'nextReview'in patch))throw Error('复习计划必须成组');patch={...patch,mastery:{status:patch.status,nextReview:patch.nextReview}};delete patch.status;delete patch.nextReview;}
  for(const [field,value]of Object.entries(patch)){
   if(field==='attempts')throw Error('请追加单个答题事件');clock=tick(clock,actor);ops.push({id:crypto.randomUUID(),question,clock,field,value,parents:field==='note'?[...parents]:[]});
  }
  return {...await this.commit(s,current,ops),created:ops.map(op=>op.id)};
 });}
 async import(raw){const ops=await decodeBackup(raw);return this.transaction(true,async s=>this.commit(s,await this.inspect(s),ops,{checkpoint:true}));}
 async backup(){return this.transaction(false,async s=>({version:3,operations:await request(s.operations.getAll()),recovery:{migrations:await request(s.migrations.getAll()),checkpoints:await request(s.checkpoints.getAll()),meta:await request(s.meta.getAll()),outbox:await request(s.outbox.getAll())}}));}
 async batch(userId=this.userId,limit=100){return this.transaction(false,async s=>{
  const queued=await request(s.outbox.getAll());const entries=queued.filter(x=>x.userId===userId);const ops=await Promise.all(entries.map(x=>request(s.operations.get(x.opId))));return ops.sort((a,b)=>compare(a.clock,b.clock)||(a.id<b.id?-1:1)).slice(0,limit);
 });}
 async acknowledge(ids,userId=this.userId){return this.transaction(true,async s=>{for(const id of ids){const item=await request(s.outbox.get(id));if(item?.userId===userId)s.outbox.delete(id);}});}
 close(){this.channel?.close();this.db.close();}
 async cursor(){return this.transaction(false,async s=>await request(s.meta.get('remote-cursor'))||0);}
 async applyRemote(page){return this.transaction(true,async s=>{
  let cursor=await request(s.meta.get('remote-cursor'))||0,previous=0;const current=await this.inspect(s),ops=[];
  for(const row of page){
   if(!Number.isSafeInteger(row.commit_seq)||row.commit_seq<=previous)throw Error('拉取提交序号无效');previous=row.commit_seq;
   if(row.commit_seq<=cursor){const old=current.operations.find(op=>op.id===row.operation.id);if(!old||canonical(old)!==canonical(row.operation))throw Error('已应用序号内容不一致');continue;}
   cursor=row.commit_seq;ops.push(row.operation);
  }
  const result=ops.length?await this.commit(s,current,ops,{remote:true}):current;s.meta.put(cursor,'remote-cursor');return result;
 });}
 async exportV2(){const {rows}=await this.read();return {version:2,limitations:'兼容导出不含操作版本、笔记冲突、清空历史、待发送项；完整恢复请使用 v3。',review:compatibility(rows)};}
}
