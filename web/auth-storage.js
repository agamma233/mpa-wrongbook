// SDK sessions and PKCE verifier survive Safari navigation and browser restarts.
// Separate from personal backups; never exported, restored or cached by the SW.
export function authStorage(name='mpa-wrongbook-auth'){
 const opened=new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('auth');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 async function run(mode,key,value){const db=await opened;return new Promise((resolve,reject)=>{const tx=db.transaction('auth',mode),s=tx.objectStore('auth');const r=mode==='readonly'?s.get(key):value===null?s.delete(key):s.put(value,key);tx.oncomplete=()=>resolve(r.result??null);tx.onabort=()=>reject(tx.error||Error('会话存储失败'));tx.onerror=()=>{};});}
 return {getItem:key=>run('readonly',key),setItem:(key,value)=>run('readwrite',key,value),removeItem:key=>run('readwrite',key,null)};
}
