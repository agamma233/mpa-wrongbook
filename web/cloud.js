// Optional integration module, intentionally not imported by the shipped local-only UI.
import {RecordStore,DB_NAME} from './store.js';
import {OutboxSender} from './transport.js';
export function validatePublicConfig(url,key){
 const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw Error('仅接受 HTTPS 项目根地址');
 if(typeof key!=='string')throw Error('缺少公开 key');
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return;
 try{const body=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(key.split('.').length===3&&body.role==='anon')return;}catch{}
 throw Error('前端只接受 publishable 或 anon key；禁止 secret/service-role/密码');
}
export function createCloudWorkspace({createClient,url,key,anonymous,onState}){
 validatePublicConfig(url,key);return new CloudWorkspace(createClient(url,key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}),anonymous,{onState});
}
export class CloudWorkspace{
 constructor(client,anonymous,{onState=()=>{}}={}){this.client=client;this.anonymous=anonymous;this.onState=onState;this.epoch=0;this.enabled=false;this.pulling=false;this.timer=null;
  this.authSubscription=client.auth.onAuthStateChange((_event,session)=>{if(this.userId&&session?.user?.id!==this.userId)this.stop();}).data.subscription;
 }
 async login(redirectTo){return this.client.auth.signInWithOAuth({provider:'github',options:{redirectTo}});}
 async identity(){const {data,error}=await this.client.auth.getSession();if(error)throw error;const id=data.session?.user?.id;if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('请先登录');return id;}
 async enable({confirmUpload,saveBackup}){
  this.stop();const epoch=this.epoch,userId=await this.identity();
  // Login alone never uploads. Back up before the separate explicit upload decision.
  const backup=await this.anonymous.backup();if(await saveBackup(backup)!==true)throw Error('必须先保存完整本机备份');
  if(await confirmUpload(userId)!==true)return false;
  if(epoch!==this.epoch||await this.identity()!==userId)throw Error('账号已变化');
  const store=await RecordStore.open(DB_NAME+':user:'+userId,userId);await store.initialize({getItem:()=>null});await store.import(backup);
  if(epoch!==this.epoch||await this.identity()!==userId){store.close();throw Error('账号已变化');}
  this.store=store;this.userId=userId;this.enabled=true;
  const current=async()=>{if(!this.enabled||epoch!==this.epoch||await this.identity()!==userId)throw Error('同步已停止或账号已变化');};
  this.sender=new OutboxSender(store,{send:async(batch,{signal})=>{await current();const bounded=[];for(const op of batch){if(new TextEncoder().encode(JSON.stringify([...bounded,op])).length>1500000)break;bounded.push(op);}if(!bounded.length)throw Error('单项操作超过上传限制');let query=this.client.rpc('append_wrongbook_ops',{batch:bounded});if(query.abortSignal)query=query.abortSignal(signal);const {data,error}=await query;if(error)throw error;await current();return data;}},{userId,onState:this.onState});
  this.store.onSequence=()=>this.retry();
  // Realtime contains no authoritative data: every hint triggers a normal paginated pull.
  this.channel=this.client.channel('wrongbook:'+userId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'wrongbook_sync_heads',filter:'user_id=eq.'+userId},()=>this.pull()).subscribe(status=>{if(status==='SUBSCRIBED')this.pull();});
  this.foreground=()=>{if(!document.hidden)this.retry();};this.online=()=>this.retry();
  window.addEventListener('pageshow',this.online);window.addEventListener('online',this.online);document.addEventListener('visibilitychange',this.foreground);
  this.timer=setInterval(this.foreground,5000);await this.retry();return true;
 }
 async pull(){
  if(!this.enabled||this.pulling)return;this.pulling=true;const epoch=this.epoch,store=this.store,userId=this.userId;
  try{let page;do{
   if(!this.enabled||epoch!==this.epoch||await this.identity()!==userId)return;
   const cursor=await store.cursor();const {data,error}=await this.client.rpc('pull_wrongbook_ops',{after_seq:cursor,page_size:100});if(error)throw error;
   if(!this.enabled||epoch!==this.epoch||await this.identity()!==userId)return;page=data;if(!Array.isArray(page))throw Error('拉取格式无效');if(page.length)await store.applyRemote(page);
  }while(page.length===100);
  }catch(e){if(epoch===this.epoch)this.onState('failed',e);}finally{this.pulling=false;}
 }
 async retry(){if(!this.enabled)return;await this.sender.retry();await this.pull();}
 stop(){this.epoch++;this.enabled=false;this.sender?.stop();clearInterval(this.timer);if(this.channel)this.client.removeChannel(this.channel);if(this.online){window.removeEventListener('pageshow',this.online);window.removeEventListener('online',this.online);document.removeEventListener('visibilitychange',this.foreground);}this.store?.close();this.store=null;this.userId=null;}
 async logout(){this.stop();return this.client.auth.signOut();}
 destroy(){this.stop();this.authSubscription.unsubscribe();}
}
