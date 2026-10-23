import {KEY,parseBackup,validateRecords,mergeRecords,due,schedule} from './review.js';
const $=id=>document.getElementById(id);let data=[],saved=Object.create(null),view='all';
function msg(s){$('message').textContent=s;}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({version:2,review:saved}));}catch(e){msg('本机保存失败，请立即导出复习记录：'+e.message);}}
function update(id,patch){saved[id]={...saved[id],...patch,updatedAt:Date.now()};persist();stats();}
function stats(){const counts=[['错题总数',data.length],['数学',data.filter(d=>d.subject==='数学').length],['逻辑',data.filter(d=>d.subject==='逻辑').length],['已掌握',data.filter(d=>saved[d.id]?.status==='已掌握').length],['待复习',data.filter(d=>due(saved[d.id])).length],['今日已答',data.reduce((n,d)=>n+(saved[d.id]?.attempts||[]).filter(a=>new Date(a.at).toDateString()===new Date().toDateString()).length,0)]];$('stats').replaceChildren(...counts.map(([label,count])=>{const n=el('div',undefined,'stat');n.append(el('strong',count),el('span',label));return n;}));}
function field(label,text,parent){parent.append(el('h3',label),el('p',text,'text'));}
function card(d){
 const a=el('article');a.dataset.id=d.id;const r=saved[d.id]||{};
 a.append(el('div',`${d.id} · ${d.topic} · ${d.priority}`,'meta'),el('h2',d.title),el('p',d.question_text,'text'));
 if(!Object.keys(d.options).length)a.append(el('p','原题和 A—E 选项待补，当前仅保留历史题意摘要。','missing'));
 let choice='';const options=el('div',undefined,'options');
 for(const [key,text] of Object.entries(d.options)){
  const b=button(`${key}. ${text}`,()=>{choice=key;for(const child of options.children)child.setAttribute('aria-pressed',String(child===b));});b.setAttribute('aria-pressed','false');options.append(b);
 }a.append(options);
 if(d.question_image){const details=el('details',undefined,'scan');details.append(el('summary','查看原卷图片'));const link=el('a','新窗口放大原卷');link.href=d.question_image;link.target='_blank';link.rel='noopener';const img=el('img');img.src=d.question_image;img.alt=d.id+' 原卷题干与选项';img.loading='lazy';details.append(link,img);a.append(details);}
 else if(d.image_withheld)a.append(el('p','原卷已在本地保留，公开授权未确认，网站暂不展示。','meta'));
 const answer=el('details',undefined,'answer');answer.append(el('summary','查看历史答案'));const result=el('p');answer.append(result);
 field('历史作答与答案',`本人：${d.wrong||'未保留'}；答案：${d.correct||'待核实'}`,answer);
 field('原题核实状态',`${d.question_status}；可信度：${d.confidence}`,answer);
 const explain=el('details');explain.append(el('summary','展开解析与错因'));for(const [label,key] of [['思路摘要','brief'],['完整解析','explain'],['复习要点','lesson'],['记录来源','source']])field(label,d[key],explain);answer.append(explain);
 if(Object.keys(d.options).length)a.append(button('提交本次作答',()=>{
  if(!choice){msg('请先选择 A—E 选项');return;}
  const known=d.correct&&d.options[d.correct];const correct=known?choice===d.correct:null;const row=saved[d.id]||{};const attempts=[...(row.attempts||[]),{id:crypto.randomUUID(),at:Date.now(),choice,correct}];update(d.id,{attempts,status:correct?'复习中':'未掌握',nextReview:schedule(correct?'复习中':'未掌握')});result.textContent=`本次选择 ${choice}：${correct===null?'答案待核实':correct?'与历史答案一致':'与历史答案不同'}`;result.className=correct?'correct':'incorrect';answer.open=true;
 }));a.append(answer);
 const controls=el('div',undefined,'review');const status=el('select');status.setAttribute('aria-label',d.id+' 掌握状态');for(const s of ['未掌握','复习中','已掌握']){const o=el('option',s);o.selected=s===(r.status||'未掌握');status.append(o);}status.onchange=()=>update(d.id,{status:status.value,nextReview:schedule(status.value)});
 const favorite=button(r.favorite?'取消收藏':'收藏错题',()=>{update(d.id,{favorite:!saved[d.id]?.favorite});favorite.textContent=saved[d.id].favorite?'取消收藏':'收藏错题';});controls.append(status,favorite);
 const cause=el('input');cause.value=r.cause||'';cause.placeholder='本次错因';cause.setAttribute('aria-label',d.id+' 错因');cause.onchange=()=>update(d.id,{cause:cause.value});controls.append(cause);a.append(controls);
 const note=el('textarea');note.value=r.note||'';note.placeholder='个人复习笔记，仅保存本机，不上传题库';note.setAttribute('aria-label',d.id+' 个人笔记');note.oninput=()=>update(d.id,{note:note.value});a.append(note);return a;
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
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),review:saved},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download='MPA-'+new Date().toISOString().slice(0,10)+'.review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);};
$('import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>20000000)throw Error('文件超过 20 MB');const incoming=parseBackup(await file.text());const merged=mergeRecords(saved,incoming);saved=merged.records;persist();render();msg(`已合并 ${Object.keys(incoming).length} 道复习记录，${merged.conflicts} 处不同笔记均已保留；重复答题记录自动去重。`);}catch(error){msg('导入失败，现有记录未改变：'+error.message);}finally{e.target.value='';}};
for(const id of ['search','year','subject','topic'])$(id).addEventListener(id==='search'?'input':'change',render);
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{view=b.dataset.view;render();};
try{
 const raw=localStorage.getItem(KEY);if(raw)saved=parseBackup(raw);else{const old=localStorage.getItem('mpa_wrongbook_review_v1');if(old){saved=validateRecords(JSON.parse(old));persist();msg('已迁移旧版本机复习记录，旧数据仍保留。');}}
}catch(error){msg('本机记录读取失败，原始记录未修改：'+error.message);}
try{const response=await fetch('questions.json');if(!response.ok)throw Error(response.status);data=await response.json();for(const [id,values] of [['year',[...new Set(data.map(d=>d.year))]],['topic',[...new Set(data.map(d=>d.topic))]]])for(const value of values)$(id).append(el('option',value));render();}catch(error){msg('题库加载失败，请检查构建产物或网络：'+error.message);}

if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>msg('离线缓存未启用，个人记录仍保存在本机。'));
