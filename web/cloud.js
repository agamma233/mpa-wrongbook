import {RecordStore,DB_NAME} from './store.js';
import {OutboxSender} from './transport.js';
import {authStorage} from './auth-storage.js';
export function validatePublicConfig(url,key){
 const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw Error('仅接受 HTTPS 项目根地址');
 if(typeof key!=='string')throw Error('缺少公开 key');
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return;
 try{const body=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(key.split('.').length===3&&body.role==='anon')return;}catch{}
 throw Error('前端只接受 publishable 或 anon key；禁止 secret/service-role/密码');
}
export function createCloudWorkspace({createClient,url,key,anonymous,onState,onSession,onCommit}){
 validatePublicConfig(url,key);const storageKey='mpa-auth-'+new URL(url).hostname;
 return new CloudWorkspace(createClient(url,key,{auth:{flowType:'pkce',persistSession:true,storage:authStorage(storageKey),storageKey,autoRefreshToken:true,detectSessionInUrl:false}}),anonymous,{onState,onSession,onCommit,project:url});
}
export class CloudWorkspace{
 constructor(client,anonymous,{onState=()=>{},onSession=()=>{},onCommit=()=>{},project='test-project'}={}){this.client=client;this.anonymous=anonymous;this.project=project;this.onState=onState;this.onCommit=onCommit;this.epoch=0;this.enabled=false;this.pulling=false;
  this.authSubscription=client.auth.onAuthStateChange((event,session)=>{
   if(event==='INITIAL_SESSION'&&!session)return; // Offline refresh failure must not hide an existing local account.
   if(this.userId&&session?.user?.id!==this.userId)this.stop();
   // Do not call Supabase auth APIs inside its auth-state lock.
   setTimeout(()=>Promise.resolve(onSession(session)).catch(e=>onState('failed',e)),0);
  }).data.subscription;
 }
 async restore(){const url=new URL(location.href);if(url.searchParams.has('error')){const message=url.searchParams.get('error_description')||url.searchParams.get('error');for(const key of ['error','error_code','error_description'])url.searchParams.delete(key);history.replaceState(null,'',url);throw Error(message);}
  if(url.searchParams.has('code')){const {error}=await this.client.auth.exchangeCodeForSession(url.searchParams.get('code'));url.searchParams.delete('code');url.searchParams.delete('sb_flow_id');history.replaceState(null,'',url);if(error)throw error;}
  const {data,error}=await this.client.auth.getSession();if(error)throw error;return data.session;
 }
 async login(redirectTo){const {error}=await this.client.auth.signInWithOAuth({provider:'github',options:{redirectTo}});if(error)throw error;}
 async identity(){const {data,error}=await this.client.auth.getSession();if(error)throw error;const id=data.session?.user?.id;if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('请先登录');return id;}
 async token(userId,epoch){const {data,error}=await this.client.auth.getSession();if(error)throw error;const session=data.session;if(!this.enabled||epoch!==this.epoch||session?.user?.id!==userId||typeof session.access_token!=='string')throw Error('同步已停止或账号已变化');return session.access_token;}
 async selectUser(userId){
  this.stop();if(this.userId===userId&&this.store)return this.store;
  const epoch=this.epoch,next=await RecordStore.open(DB_NAME+':user:'+userId,userId);
  try{await next.initialize({getItem:()=>null});if(epoch!==this.epoch)throw Error('账号已变化');await this.store?.idle();this.store?.close();this.store=next;this.userId=userId;return next;}catch(e){next.close();throw e;}
 }
 async enable({confirmUpload,saveBackup}){
  const userId=await this.identity();if(this.userId!==userId||!this.store)await this.selectUser(userId);
  const epoch=this.epoch,backup=await this.store.backup();
  if(await saveBackup(backup)!==true)throw Error('必须先保存完整本机备份');
  if(await confirmUpload(userId)!==true)return false;
  if(epoch!==this.epoch||await this.identity()!==userId)throw Error('账号已变化');
  await this.store.consent(this.project,true);
  if(epoch!==this.epoch||await this.identity()!==userId){await this.store.consent(this.project,false);throw Error('账号已变化');}
  return this.start();
 }
 async start(){
  this.stop();const epoch=this.epoch,userId=this.userId,store=this.store;
  if(!store||await this.identity()!==userId||epoch!==this.epoch)throw Error('账号已变化');this.enabled=true;
  const current=async()=>{if(!await store.consent(this.project)){this.stop();this.onState('paused');throw Error('云同步许可已撤销');}return this.token(userId,epoch);};
  this.sender=new OutboxSender(store,{send:async(batch,{signal})=>{const token=await current();const bounded=[];for(const op of batch){if(new TextEncoder().encode(JSON.stringify([...bounded,op])).length>1500000)break;bounded.push(op);}if(!bounded.length)throw Error('单项操作超过上传限制');let query=this.client.rpc('append_wrongbook_ops',{batch:bounded}).setHeader('Authorization','Bearer '+token);if(query.abortSignal)query=query.abortSignal(signal);const {data,error}=await query;if(error)throw error;await current();return data;}},{userId,onState:(state,error)=>{this.lastState=state;this.onState(state==='idle'?'checking':state,error);}});
  store.onSequence=()=>{this.onCommit();this.retry(false);};
  this.channel=this.client.channel('wrongbook:'+userId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'wrongbook_sync_heads',filter:'user_id=eq.'+userId},()=>this.retry(false)).subscribe(status=>{if(status==='SUBSCRIBED')this.retry(false);});
  this.foreground=()=>{if(!document.hidden)this.retry(false);};this.online=()=>this.retry();
  window.addEventListener('pageshow',this.online);window.addEventListener('online',this.online);document.addEventListener('visibilitychange',this.foreground);
  this.timer=setInterval(this.foreground,5000);this.retry();return true;
 }
 async pull(){
  if(!this.enabled||this.pulling)return false;this.pulling=true;const epoch=this.epoch,store=this.store,userId=this.userId;
  const abort=new AbortController();this.pullAbort=abort;const timeout=setTimeout(()=>abort.abort(),15000);
  try{let page;do{
   if(!this.enabled||epoch!==this.epoch||await this.identity()!==userId)return false;
   if(!await store.consent(this.project)){this.stop();this.onState('paused');return false;}
   const cursor=await store.cursor(),token=await this.token(userId,epoch);let query=this.client.rpc('pull_wrongbook_ops',{after_seq:cursor,page_size:100}).setHeader('Authorization','Bearer '+token);if(query.abortSignal)query=query.abortSignal(abort.signal);const {data,error}=await query;if(error)throw error;
   if(!this.enabled||epoch!==this.epoch||await this.identity()!==userId)return false;page=data;if(!Array.isArray(page))throw Error('拉取格式无效');if(page.length){await store.applyRemote(page);this.onCommit();}
  }while(page.length===100);return true;
  }catch(e){if(epoch===this.epoch)this.onState('failed',e);return false;}finally{clearTimeout(timeout);if(this.pullAbort===abort)this.pullAbort=null;this.pulling=false;}
 }
 async retry(force=true){if(!this.enabled||this.round)return;const epoch=this.epoch;this.round=true;try{if(!await this.store.consent(this.project)){this.stop();this.onState('paused');return;}await this.sender.retry({force});if(await this.pull()&&epoch===this.epoch&&this.enabled&&!(await this.store.batch()).length)this.onState('synced');}catch(e){if(epoch===this.epoch)this.onState('failed',e);}finally{this.round=false;}}
 stop(){this.epoch++;this.enabled=false;this.sender?.stop();this.pullAbort?.abort();clearInterval(this.timer);if(this.channel){this.client.removeChannel(this.channel);this.channel=null;}if(this.online){window.removeEventListener('pageshow',this.online);window.removeEventListener('online',this.online);document.removeEventListener('visibilitychange',this.foreground);}}
 async logout(){this.stop();return this.client.auth.signOut({scope:'local'});}
 destroy(){this.stop();this.store?.close();this.authSubscription.unsubscribe();}
}
