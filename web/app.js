import {due,schedule} from './review.js';
import {RecordStore} from './store.js';
import {OutboxSender} from './transport.js';
const $=id=>document.getElementById(id);let data=[],saved=Object.create(null),view='all';
function msg(s){$('message').textContent=s;}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
let store,snapshot,queue=Promise.resolve();const drafts=new Map(),noteParents=new Map();
function saveStatus(text){$('save-status').textContent=text;}
function update(id,patch){
 const previous=drafts.get(id)||{};drafts.set(id,{...previous,...patch});
 const session=noteParents.get(id)||{parents:saved[id]?.noteHeads||[]};noteParents.set(id,session);saveStatus('正在保存…');
 const task=queue.then(async()=>{
  if(!store)throw Error('数据库未就绪');
  snapshot=await store.edit(id,patch,session.parents);saved=snapshot.rows;
  const draft=drafts.get(id);for(const [key,value]of Object.entries(patch))if(draft?.[key]===value)delete draft[key];if(draft&&!Object.keys(draft).length)drafts.delete(id);
  if('note'in patch)session.parents=snapshot.created;
  refreshControls();saveStatus(drafts.size?'正在保存…':'已保存本机 · 云同步未配置');
 });queue=task.catch(error=>{saveStatus('保存失败 · 草稿仍在，请紧急导出');msg('本机保存失败：'+error.message);});return task;
}
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function refreshControls(){for(const a of document.querySelectorAll('article')){
 const id=a.dataset.id,r=saved[id]||{},draft=drafts.get(id)||{};
 for(const [selector,key]of [['textarea','note'],['input','cause'],['select','status']]){const n=a.querySelector(selector);if(n&&document.activeElement!==n&&!(key in draft))n.value=r[key]||(key==='status'?'未掌握':'');}
 const fav=a.querySelector('[data-favorite]');if(fav)fav.textContent=r.favorite?'取消收藏':'收藏错题';
 const conflicts=a.querySelector('[data-conflicts]');if(conflicts)conflicts.textContent=(r.noteConflicts||[]).length>1?'笔记存在并发版本（全部保留）：\n'+r.noteConflicts.map(v=>v.text||'（已清空）').join('\n——\n'):'';
}stats();}

function stats(){const counts=[['错题总数',data.length],['数学',data.filter(d=>d.subject==='数学').length],['逻辑',data.filter(d=>d.subject==='逻辑').length],['已掌握',data.filter(d=>saved[d.id]?.status==='已掌握').length],['待复习',data.filter(d=>due(saved[d.id])).length],['今日已答',data.reduce((n,d)=>n+(saved[d.id]?.attempts||[]).filter(a=>new Date(a.at).toDateString()===new Date().toDateString()).length,0)]];$('stats').replaceChildren(...counts.map(([label,count])=>{const n=el('div',undefined,'stat');n.append(el('strong',count),el('span',label));return n;}));}
function field(label,text,parent){parent.append(el('h3',label),el('p',text,'text'));}
function card(d){
 const a=el('article');a.dataset.id=d.id;const r={...saved[d.id],...drafts.get(d.id)};
 a.append(el('div',`${d.id} · ${d.topic} · ${d.priority}`,'meta'),el('h2',d.title),el('p',d.question_text,'text'));
 if(!Object.keys(d.options).length)a.append(el('p','原题和 A—E 选项待补，当前仅保留历史题意摘要。','missing'));
 let choice='';const options=el('div',undefined,'options');
 for(const [key,text] of Object.entries(d.options)){
  const b=button(`${key}. ${text}`,()=>{choice=key;for(const child of options.children)child.setAttribute('aria-pressed',String(child===b));});b.setAttribute('aria-pressed','false');options.append(b);
 }a.append(options);
 if(d.question_image){const details=el('details',undefined,'scan');details.append(el('summary','查看原卷图片'));const link=el('a','下载原卷，供离线使用');link.download=d.id+'.jpg';link.href=d.question_image;link.target='_blank';link.rel='noopener';const img=el('img');img.src=d.question_image;img.alt=d.id+' 原卷题干与选项';img.loading='lazy';details.append(link,img);a.append(details);}
 else if(d.image_withheld)a.append(el('p','原卷已在本地保留，公开授权未确认，网站暂不展示。','meta'));
 const answer=el('details',undefined,'answer');answer.append(el('summary','查看历史答案'));const result=el('p');answer.append(result);
 field('历史作答与答案',`本人：${d.wrong||'未保留'}；答案：${d.correct||'待核实'}`,answer);
 field('原题核实状态',`${d.question_status}；可信度：${d.confidence}`,answer);
 const explain=el('details');explain.append(el('summary','展开解析与错因'));for(const [label,key] of [['思路摘要','brief'],['完整解析','explain'],['复习要点','lesson'],['记录来源','source']])field(label,d[key],explain);answer.append(explain);
 if(Object.keys(d.options).length)a.append(button('提交本次作答',()=>{
  if(!choice){msg('请先选择 A—E 选项');return;}
  const known=d.correct&&d.options[d.correct];const correct=known?choice===d.correct:null;const attempt={id:crypto.randomUUID(),at:Date.now(),choice,correct};update(d.id,{attempt,status:correct?'复习中':'未掌握',nextReview:schedule(correct?'复习中':'未掌握')}).catch(()=>{});result.textContent=`本次选择 ${choice}：${correct===null?'答案待核实':correct?'与历史答案一致':'与历史答案不同'}`;result.className=correct?'correct':'incorrect';answer.open=true;
 }));a.append(answer);
 const controls=el('div',undefined,'review');const status=el('select');status.setAttribute('aria-label',d.id+' 掌握状态');for(const s of ['未掌握','复习中','已掌握']){const o=el('option',s);o.selected=s===(r.status||'未掌握');status.append(o);}status.onblur=refreshControls;status.onchange=()=>update(d.id,{status:status.value,nextReview:schedule(status.value)}).catch(()=>{});
 const favorite=button(r.favorite?'取消收藏':'收藏错题',()=>{update(d.id,{favorite:!(drafts.get(d.id)?.favorite??saved[d.id]?.favorite)}).then(refreshControls).catch(()=>{});});favorite.dataset.favorite='';controls.append(status,favorite);
 const cause=el('input');cause.value=r.cause||'';cause.placeholder='本次错因';cause.setAttribute('aria-label',d.id+' 错因');cause.oninput=()=>update(d.id,{cause:cause.value}).catch(()=>{});cause.onblur=refreshControls;controls.append(cause);a.append(controls);
 const note=el('textarea');note.value=r.note||'';note.placeholder='个人复习笔记，仅保存本机，不上传题库';note.setAttribute('aria-label',d.id+' 个人笔记');note.onfocus=()=>{if(!('note'in(drafts.get(d.id)||{}))){note.value=saved[d.id]?.note||'';noteParents.set(d.id,{parents:(saved[d.id]?.noteHeads||[]).slice(-1)});}};note.oninput=()=>update(d.id,{note:note.value}).catch(()=>{});a.append(note);const conflicts=el('pre');conflicts.dataset.conflicts='';conflicts.textContent=(r.noteConflicts||[]).length>1?'笔记存在并发版本（全部保留）：\n'+r.noteConflicts.map(v=>v.text||'（已清空）').join('\n——\n'):'';a.append(conflicts);a.append(button('以当前笔记解决冲突',()=>{noteParents.set(d.id,{parents:saved[d.id]?.noteHeads||[]});return update(d.id,{note:note.value}).then(refreshControls).catch(()=>{});}));return a;
}
function render(){
 const term=$('search').value.trim().toLowerCase();let rows=data.filter(d=>(!$('year').value||d.year===$('year').value)&&(!$('subject').value||d.subject===$('subject').value)&&(!$('topic').value||d.topic===$('topic').value)&&(!term||JSON.stringify(d).toLowerCase().includes(term)));
 $('overview').replaceChildren();if(view==='due')rows=rows.filter(d=>due(saved[d.id]));if(view==='favorite')rows=rows.filter(d=>saved[d.id]?.favorite);
 if(view==='random'&&rows.length)rows=[rows[Math.floor(Math.random()*rows.length)]];
 if(view==='topics'){const topics=[...new Set(rows.map(d=>d.topic))];for(const topic of topics)$('overview').append(button(`${topic} · ${rows.filter(d=>d.topic===topic).length} 题`,()=>{$('topic').value=topic;view='all';render();}));}
 if(view==='statistics'){const attempts=rows.flatMap(d=>saved[d.id]?.attempts||[]);const judged=attempts.filter(a=>a.correct!==null);$('overview').append(el('h2','复习统计'),el('p',`累计答题 ${attempts.length} 次 · 已判定 ${judged.length} 次 · 与历史答案一致 ${judged.filter(a=>a.correct).length} 次`),el('p','间隔规则：未掌握 1 天、复习中 3 天、已掌握 7 天。状态变化时重新安排；每道题保留答题历史。'));}
 $('count').textContent=`显示 ${rows.length} / ${data.length} 道题`;$('questions').replaceChildren(...rows.map(card));stats();
 if(window.renderMathInElement)window.renderMathInElement($('questions'),{trust:false,throwOnError:false,maxExpand:1000,delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}]});
 for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
}
$('export').onclick=async()=>{try{await queue;download(await store.backup(),'MPA-v3.review.json');}catch(e){msg('导出失败：'+e.message);}};
$('export-v2').onclick=async()=>{try{await queue;download(await store.exportV2(),'MPA-v2-limited.review.json');}catch(e){msg('导出失败：'+e.message);}};
$('emergency').onclick=async()=>{
 let database,error;const legacy={};try{database=await store?.backup();}catch(e){error=e.message;}
 for(const key of ['mpa_wrongbook_review_v1','mpa_wrongbook_review_v2'])try{legacy[key]=localStorage.getItem(key);}catch(e){legacy[key]={readError:e.message};}
 const value={format:'mpa-emergency-drafts',drafts:Object.fromEntries(drafts),database,error,legacy};
 try{download(value,'MPA-emergency.review.json');}catch(e){download({...value,database:undefined,error:'原始数据库无法序列化：'+e.message},'MPA-emergency.review.json');}
};
$('import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>20000000)throw Error('文件超过 20 MB');const text=await file.text();await queue;snapshot=await store.import(text);saved=snapshot.rows;refreshControls();msg('已合并复习记录；不同笔记版本全部保留，重复答题已去重。');saveStatus('已保存本机 · 云同步未配置');}catch(error){msg('导入失败，现有记录未改变：'+error.message);}finally{e.target.value='';}};
for(const id of ['search','year','subject','topic'])$(id).addEventListener(id==='search'?'input':'change',render);
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{view=b.dataset.view;render();};
try{store=await RecordStore.open();snapshot=await store.initialize();saved=snapshot.rows;saveStatus('已保存本机 · 云同步未配置');}catch(error){saveStatus('恢复模式 · 已禁止写入');msg('本机记录读取失败，原始数据未修改，请紧急导出：'+error.message);}
try{const response=await fetch('questions.json');if(!response.ok)throw Error(response.status);data=await response.json();for(const [id,values] of [['year',[...new Set(data.map(d=>d.year))]],['topic',[...new Set(data.map(d=>d.topic))]]])for(const value of values)$(id).append(el('option',value));render();}catch(error){msg('题库加载失败，请检查构建产物或网络：'+error.message);}

if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>msg('离线缓存未启用，个人记录仍保存在本机。'));

window.addEventListener('beforeunload',e=>{if(drafts.size){e.preventDefault();e.returnValue='';}});

// Broadcast payloads contain only a sequence hint. Re-read the authoritative DB.
let checking=false;
async function checkCommits(){if(!store||store.recovery||checking)return;checking=true;try{await queue;const latest=await store.read();if(latest.meta.seq!==snapshot?.meta.seq){snapshot=latest;saved=latest.rows;refreshControls();}}catch(e){saveStatus('恢复模式 · 已禁止写入');msg('数据库检查失败，请紧急导出：'+e.message);}finally{checking=false;}}
if(store)store.onSequence=()=>checkCommits();
window.addEventListener('pageshow',checkCommits);window.addEventListener('online',checkCommits);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkCommits();});
setInterval(()=>{if(!document.hidden)checkCommits();},5000);

const sender=store?new OutboxSender(store,null,{onState:()=>{$('sync-status').textContent='仅本地 · 云同步未配置；待发送项保留本机';}}):null;
$('retry-sync').onclick=()=>sender?.retry();
window.addEventListener('online',()=>sender?.retry());
window.addEventListener('pageshow',()=>sender?.retry());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sender?.retry();});
sender?.retry();
