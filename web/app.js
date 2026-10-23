import {due,schedule} from './review.js';
import {RecordStore} from './store.js';
import {createCloudWorkspace} from './cloud.js';
import {authStorage} from './auth-storage.js';
import {cloudConfig} from './cloud-config.js';
import {canonical} from './model.js';
const $=id=>document.getElementById(id);let data=[],saved=Object.create(null),view='all';
function msg(s){$('message').textContent=s;}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
let store,anonymous,workspace,snapshot,queue=Promise.resolve(),switching=false,sessionUser=null;const drafts=new Map(),noteParents=new Map();
function saveStatus(text){$('save-status').textContent=text;}
function update(id,patch){
 if(switching)return Promise.reject(Error('正在切换账号'));
 const target=store;
 const previous=drafts.get(id)||{};drafts.set(id,{...previous,...patch});
 const session=noteParents.get(id)||{parents:saved[id]?.noteHeads||[]};noteParents.set(id,session);saveStatus('正在保存…');
 const task=queue.then(async()=>{
  if(!target)throw Error('数据库未就绪');
  snapshot=await target.edit(id,patch,session.parents);saved=snapshot.rows;
  const draft=drafts.get(id);for(const [key,value]of Object.entries(patch))if(draft?.[key]===value)delete draft[key];if(draft&&!Object.keys(draft).length)drafts.delete(id);
  if('note'in patch)session.parents=snapshot.created;
  refreshControls();saveStatus(drafts.size?'正在保存…':'已保存本机');workspace?.retry(false);
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
 const note=el('textarea');note.value=r.note||'';note.placeholder='个人复习笔记，不上传 GitHub 题库';note.setAttribute('aria-label',d.id+' 个人笔记');note.onfocus=()=>{if(!('note'in(drafts.get(d.id)||{}))){note.value=saved[d.id]?.note||'';noteParents.set(d.id,{parents:(saved[d.id]?.noteHeads||[]).slice(-1)});}};note.oninput=()=>update(d.id,{note:note.value}).catch(()=>{});a.append(note);const conflicts=el('pre');conflicts.dataset.conflicts='';conflicts.textContent=(r.noteConflicts||[]).length>1?'笔记存在并发版本（全部保留）：\n'+r.noteConflicts.map(v=>v.text||'（已清空）').join('\n——\n'):'';a.append(conflicts);a.append(button('以当前笔记解决冲突',()=>{noteParents.set(d.id,{parents:saved[d.id]?.noteHeads||[]});return update(d.id,{note:note.value}).then(refreshControls).catch(()=>{});}));return a;
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
$('import').onchange=async e=>{try{const file=e.target.files[0],target=store;if(!file)return;if(switching)throw Error('正在切换账号');if(file.size>20000000)throw Error('文件超过 20 MB');const task=queue.then(async()=>{snapshot=await target.import(await file.text());saved=snapshot.rows;refreshControls();saveStatus('已保存本机');workspace?.retry(false);});queue=task.catch(()=>{});await task;msg('已合并复习记录；不同笔记版本全部保留，重复答题已去重。');}catch(error){msg('导入失败，现有记录未改变：'+error.message);}finally{e.target.value='';}};
for(const id of ['search','year','subject','topic'])$(id).addEventListener(id==='search'?'input':'change',render);
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{view=b.dataset.view;render();};
try{store=anonymous=await RecordStore.open();snapshot=await store.initialize();saved=snapshot.rows;saveStatus('已保存本机');workspace?.retry(false);}catch(error){saveStatus('恢复模式 · 已禁止写入');msg('本机记录读取失败，原始数据未修改，请紧急导出：'+error.message);}
try{const response=await fetch('questions.json');if(!response.ok)throw Error(response.status);data=await response.json();for(const [id,values] of [['year',[...new Set(data.map(d=>d.year))]],['topic',[...new Set(data.map(d=>d.topic))]]])for(const value of values)$(id).append(el('option',value));render();}catch(error){msg('题库加载失败，请检查构建产物或网络：'+error.message);}

if('serviceWorker' in navigator){
 navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
  const waiting=()=>{if(reg.waiting){$('pwa-update').hidden=false;$('update-message').textContent='更新不会自动刷新页面；请先完成输入。';}};
  waiting();reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'){waiting();if(!navigator.serviceWorker.controller)$('offline-status').textContent='离线资源已准备完成';}if(worker.state==='redundant')$('offline-status').textContent='新版离线资源准备失败，保留旧版本，请联网重试';});});
  navigator.serviceWorker.ready.then(()=>$('offline-status').textContent='离线资源已准备完成');
  $('activate-update').onclick=async()=>{await queue;if(drafts.size){$('update-message').textContent='仍有未保存草稿，请先保存或紧急导出。';return;}await store?.idle();reg.waiting?.postMessage({type:'ACTIVATE_AFTER_LOCAL_COMMIT'});$('update-message').textContent='更新已请求。完成后可自行刷新，当前输入不会自动清除。';};
  navigator.serviceWorker.addEventListener('controllerchange',()=>{$('offline-status').textContent='离线版本已就绪；需要时手动刷新页面';});
 }).catch(()=>{$('offline-status').textContent='离线资源未就绪，请联网重试；个人记录仍保存在本机';});
}else $('offline-status').textContent='此浏览器不支持离线安装';

window.addEventListener('beforeunload',e=>{if(drafts.size){e.preventDefault();e.returnValue='';}});

// Broadcast payloads contain only a sequence hint. Re-read the authoritative DB.
let checking=false;
async function checkCommits(){if(!store||store.recovery||checking||switching)return;checking=true;const target=store;try{await queue;const latest=await target.read();if(target!==store)return;if(latest.meta.seq!==snapshot?.meta.seq){snapshot=latest;saved=latest.rows;refreshControls();}}catch(e){saveStatus('恢复模式 · 已禁止写入');msg('数据库检查失败，请紧急导出：'+e.message);}finally{checking=false;}}
if(store)store.onSequence=()=>checkCommits();
window.addEventListener('pageshow',checkCommits);window.addEventListener('online',checkCommits);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkCommits();});
setInterval(()=>{if(!document.hidden)checkCommits();},5000);

// Account switches serialize behind local saves. Failed drafts prevent switching.
let sessionQueue=Promise.resolve(),backupProof=null,backupOwner=null;
function cloudState(state,error){
 const labels={paused:'云同步已暂停 · 继续保存在当前账号本机数据库',sending:'正在同步',waiting:'等待同步',checking:'正在核对云端',synced:'已与云端核对一致',failed:'云同步失败 · 本机保存不受影响；未发送项保留'};
 if(sessionUser)$('sync-status').textContent=(labels[state]||'等待同步')+(error?'：'+error.message:'');
}
function sessionChanged(session){sessionQueue=sessionQueue.then(async()=>{
 const id=session?.user?.id||null;if(id===sessionUser)return;
 switching=true;document.querySelector('main').inert=true;workspace?.stop();
 try{await queue;if(drafts.size)throw Error('仍有未保存草稿，请紧急导出后重试账号切换');await store?.idle();
  const next=id?await workspace.selectUser(id):anonymous;
  const latest=await next.read();store=next;snapshot=latest;saved=latest.rows;sessionUser=id;noteParents.clear();backupProof=null;$('cloud-consent').hidden=true;
  store.onSequence=()=>{checkCommits();workspace?.retry(false);};render();
  $('account-status').textContent=id?'当前 GitHub 账号：'+(session.user.user_metadata?.user_name||id)+' · '+id:'当前：匿名本机记录';
  $('github-login').hidden=!!id;$('logout').hidden=!id;$('enable-cloud').hidden=!id||!cloudConfig.enabled;$('pause-cloud').hidden=!id||!cloudConfig.enabled;
  $('sync-status').textContent=id?'已登录 · 仅保存本机，尚未允许上传':'仅本地 · 未登录；匿名记录不会上传';saveStatus('已保存本机');
  if(id&&cloudConfig.enabled&&await store.consent(cloudConfig.url)){$('sync-status').textContent='已允许云同步 · 等待连接；本机可继续编辑';workspace.start().catch(e=>cloudState('failed',e));}
 }finally{switching=false;document.querySelector('main').inert=false;}
 }).catch(e=>{msg('账号切换未完成：'+e.message);$('sync-status').textContent='同步已停止 · 请先保全草稿后重试';});return sessionQueue;}
async function settled(){await queue;if(drafts.size)throw Error('仍有未保存草稿，请先紧急导出');await store.idle();}
$('github-login').onclick=async()=>{try{await settled();await workspace.login(new URL('./',location.href).href);}catch(e){msg('登录失败：'+e.message);}};
$('logout').onclick=async()=>{try{await settled();workspace.stop();await store.consent(cloudConfig.url,false);const {error}=await workspace.logout();if(error)throw error;await sessionChanged(null);}catch(e){msg('退出未完成：'+e.message);}};
$('pause-cloud').onclick=async()=>{try{await settled();workspace.stop();await store.consent(cloudConfig.url,false);$('sync-status').textContent='云同步已暂停 · 继续保存在当前账号本机数据库';}catch(e){msg('暂停失败：'+e.message);}};
$('enable-cloud').onclick=()=>{$('cloud-consent').hidden=false;backupProof=verifiedBackup=null;backupOwner=null;$('backup-status').textContent='';$('confirm-cloud').disabled=true;$('upload-consent').checked=false;};
$('cancel-cloud').onclick=()=>{$('cloud-consent').hidden=true;backupProof=null;};
$('cloud-backup').onclick=async()=>{verifiedBackup=null;consentReady();try{await settled();backupProof=await store.backup();backupOwner=store;download(backupProof,'MPA-v3-before-cloud.review.json');$('backup-status').textContent='请选择刚保存的 v3 文件验证，完成后再确认上传。';}catch(e){msg('备份失败：'+e.message);}};
let verifiedBackup=null;
function consentReady(){$('confirm-cloud').disabled=!(verifiedBackup&&backupProof&&$('upload-consent').checked);}
$('upload-consent').onchange=consentReady;
$('verify-cloud-backup').onchange=async e=>{verifiedBackup=null;try{const file=e.target.files[0];if(!file||file.size>20000000)throw Error('请选择本次下载的 v3 备份（不超过20 MB）');const value=JSON.parse(await file.text());if(!backupProof||canonical(value)!==canonical(backupProof)||backupOwner!==store)throw Error('文件与本次完整备份不同，请重新下载');verifiedBackup=value;$('backup-status').textContent='完整 v3 备份已保存并读取验证。';}catch(e){$('backup-status').textContent='备份未验证：'+e.message;}finally{e.target.value='';consentReady();}};
$('confirm-cloud').onclick=async()=>{switching=true;document.querySelector('main').inert=true;try{await settled();if(!cloudConfig.enabled)throw Error('云同步已停用');if(backupOwner!==store||!verifiedBackup||!$('upload-consent').checked)throw Error('请先验证备份并明确确认');
 // No edits may slip between the verified backup and the upload decision.
 if(canonical(await store.backup())!==canonical(backupProof))throw Error('备份后记录已变化，请重新下载并验证');
 switching=false;document.querySelector('main').inert=false;
 await workspace.enable({saveBackup:async value=>canonical(value)===canonical(verifiedBackup),confirmUpload:async id=>id===sessionUser&&$('upload-consent').checked});
 $('cloud-consent').hidden=true;backupProof=verifiedBackup=null;
 }catch(e){msg('启用失败：'+e.message);}finally{switching=false;document.querySelector('main').inert=false;}};
$('retry-sync').onclick=async()=>{if(workspace?.enabled)await workspace.retry();else if(workspace){const {data,error}=await workspace.client.auth.getSession();if(error)msg(error.message);else if(cloudConfig.enabled&&data.session?.user.id===sessionUser&&await store.consent(cloudConfig.url))await workspace.start();else await sessionChanged(data.session);}};
try{const cached=await authStorage('mpa-auth-'+new URL(cloudConfig.url).hostname).getItem('mpa-auth-'+new URL(cloudConfig.url).hostname);
 workspace=createCloudWorkspace({createClient:window.supabase.createClient,...cloudConfig,anonymous,onState:cloudState,onSession:sessionChanged,onCommit:checkCommits});if(cached){const prior=JSON.parse(cached);if(/^[0-9a-f-]{36}$/i.test(prior?.user?.id||''))await sessionChanged(prior);}await sessionChanged(await workspace.restore());}catch(e){$('sync-status').textContent='云服务暂不可用 · 本机记录仍可保存';msg('云服务初始化失败：'+e.message);}
