import {canonical} from './model.js';
// Only an injected transport can send. The application defaults to local-only.
export class OutboxSender{
 constructor(store,transport,{userId=null,timeout=15000,random=Math.random,onState=()=>{}}={}){Object.assign(this,{store,transport,userId,timeout,random,onState});this.running=false;this.stopped=false;this.failures=0;this.timer=null;}
 retry({force=true}={}){if(!force&&this.timer)return;clearTimeout(this.timer);this.timer=null;if(!this.running&&!this.stopped)return this.flush();}
 stop(){this.stopped=true;clearTimeout(this.timer);this.controller?.abort();}
 async flush(){
  if(this.running||this.stopped)return;this.running=true;let retry=false;
  try{
   if(!this.transport){this.onState('local');return;}
   const batch=await this.store.batch(this.userId);if(!batch.length){this.onState('idle');this.failures=0;return;}
   this.onState('sending');this.controller=new AbortController();let timer;
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{this.controller.abort();reject(Error('发送超时'));},this.timeout);});
   let ack;try{ack=await Promise.race([this.transport.send(batch,{signal:this.controller.signal,userId:this.userId}),timeout]);}finally{clearTimeout(timer);}
   if(this.stopped)return;
   const sent=new Set(batch.map(op=>op.id));if(!Array.isArray(ack)||ack.some(id=>!sent.has(id))||new Set(ack).size!==ack.length)throw Error('确认包含未知或重复 opId');
   await this.store.acknowledge(ack,this.userId);this.failures=0;
   const pending=(await this.store.batch(this.userId)).length;this.onState(pending?'waiting':'idle');retry=pending>0;if(!ack.length)this.failures++;
  }catch(e){if(!this.stopped){this.failures++;this.onState('failed',e);retry=true;}}
  finally{this.running=false;if(retry&&!this.stopped){const delay=Math.min(60000,500*2**Math.min(this.failures,7))*(.5+this.random());this.timer=setTimeout(()=>{this.timer=null;this.flush();},delay);}}
 }
}
export class SimulatedTransport{
 constructor(){this.operations=new Map();}
 async send(batch){for(const op of batch){const old=this.operations.get(op.id);if(old&&canonical(old)!==canonical(op))throw Error('同 ID 异内容');this.operations.set(op.id,structuredClone(op));}return batch.map(op=>op.id);}
}
