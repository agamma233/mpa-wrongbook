export const KEY='mpa_wrongbook_review_v2';
const statuses=['未掌握','复习中','已掌握'];
const dangerous=k=>['__proto__','constructor','prototype'].includes(k);
export function parseBackup(value){
 const data=typeof value==='string'?JSON.parse(value):value;
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('记录必须是 JSON 对象');
 let source;if(data.version===2)source=data.review;else if(data.version==='2026-10-22-questions')source=data.review;else throw Error('不支持的备份版本');
 return validateRecords(source);
}
export function validateRecords(source){
 if(!source||typeof source!=='object'||Array.isArray(source))throw Error('缺少 review 对象');
 const result=Object.create(null);
 for(const [id,v] of Object.entries(source)){
  if(dangerous(id)||!/^\d{4}(周测)?-(数学|逻辑)-\d{2,3}$/.test(id)||!v||typeof v!=='object'||Array.isArray(v))throw Error('记录 ID 或内容无效');
  const row={};
  for(const [key,value] of Object.entries(v)){
   if(dangerous(key)||!['status','cause','note','favorite','attempts','updatedAt','nextReview'].includes(key))throw Error('未知记录字段');
   if(['cause','note'].includes(key)){if(typeof value!=='string'||value.length>200000)throw Error('笔记格式无效');row[key]=value;}
   else if(key==='status'){const state={'待复习':'未掌握','重做中':'复习中'}[value]||value;if(!statuses.includes(state))throw Error('掌握状态无效');row[key]=state;}
   else if(key==='favorite'){if(typeof value!=='boolean')throw Error('收藏格式无效');row[key]=value;}
   else if(['updatedAt','nextReview'].includes(key)){if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('日期无效');row[key]=value;}
   else{
    if(!Array.isArray(value)||value.length>100000)throw Error('答题历史无效');
    row.attempts=value.map(a=>{if(!a||typeof a.id!=='string'||a.id.length>200||!Number.isFinite(a.at)||a.at<0||!['A','B','C','D','E'].includes(a.choice)||![true,false,null].includes(a.correct))throw Error('答题记录无效');return {id:a.id,at:a.at,choice:a.choice,correct:a.correct};});
   }
  }result[id]=row;
 }return result;
}
export function mergeRecords(current,incoming){
 const output=validateRecords(current), next=validateRecords(incoming);let conflicts=0;
 for(const [id,b] of Object.entries(next)){
  const a=output[id];if(!a){output[id]=b;continue;}
  const newer=(b.updatedAt||0)>(a.updatedAt||0);const merged={...b,...a,...(newer?b:{})};
  const notes=[a.note,b.note].filter(Boolean).flatMap(n=>n.split('\n\n—— 导入的另一份笔记 ——\n\n'));merged.note=[...new Set(notes)].join('\n\n—— 导入的另一份笔记 ——\n\n');
  if(a.note&&b.note&&a.note!==b.note)conflicts++;
  merged.attempts=[...new Map([...(a.attempts||[]),...(b.attempts||[])].map(x=>[x.id,x])).values()].sort((x,y)=>x.at-y.at);
  output[id]=merged;
 }return {records:output,conflicts};
}
export function due(row,now=Date.now()){return !row?.nextReview||row.nextReview<=now;}
export function schedule(status,now=Date.now()){return now+({'未掌握':1,'复习中':3,'已掌握':7}[status]||1)*86400000;}
