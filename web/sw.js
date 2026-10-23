// Build replaces this manifest with public paths and SHA-256 hashes.
const MANIFEST=__PRECACHE__;
const CACHE='mpa-public-'+MANIFEST.version;
const scope=self.registration.scope;
const required=new Map(MANIFEST.required.map(item=>[new URL(item.path,scope).href,item.sha256]));
const optional=new Set(MANIFEST.optional.map(path=>new URL(path,scope).href));
async function verified(url,hash){const response=await fetch(new Request(url,{cache:'reload',credentials:'omit'}));if(!response.ok||response.type==='opaque')throw Error('HTTP '+response.status);const bytes=await response.clone().arrayBuffer();const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(actual!==hash)throw Error('资源摘要不匹配');return response;}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 try{for(const [url,hash]of required)await cache.put(url,await verified(url,hash));await cache.put(new URL('./',scope).href,await cache.match(new URL('index.html',scope).href));}
 catch(e){await caches.delete(CACHE);throw e;}
 // Optional scans load on demand; a failed image cannot invalidate the complete shell.
})()));
// No automatic skipWaiting and no cache garbage collection: preserve complete old versions.
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_AFTER_LOCAL_COMMIT')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==new URL(scope).origin||url.search||request.headers.has('authorization'))return;
 const root=new URL('./',scope).href,key=url.href===root?new URL('index.html',scope).href:url.href;
 if(!required.has(key)&&!optional.has(key))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),cached=await cache.match(key);if(cached)return cached;
  try{const response=required.has(key)?await verified(key,required.get(key)):await fetch(new Request(request,{credentials:'omit'}));if(!response.ok)throw Error('HTTP '+response.status);await cache.put(key,response.clone());return response;}
  catch{return new Response('离线资源不可用，请联网重试。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
 })());
});
