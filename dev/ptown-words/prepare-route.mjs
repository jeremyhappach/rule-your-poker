import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
for(const name of ['route.tsx','route-client.ts','route.html','build-route.mjs','route-server.mjs']){
 let s=read('dev/quintzee/'+name,'utf8').replaceAll('quintzee','ptown_words').replaceAll('Quintzee','Ptown Words').replaceAll('dev/ptown_words','dev/ptown-words').replaceAll('qualification.local/ptown_words','qualification.local/ptown-words').replaceAll("'ptown_words','fullscreen'","'ptown-words','fullscreen'").replaceAll('15301','15307');
 if(name==='route-server.mjs'){
  s=s.replace("import {connect,context,preserveTimestamps}","import {connect,context}").replace('preserveTimestamps();','');
  s=s.replace("Object.values(q.args??{})","Object.entries(q.args??{}).map(([k,v])=>k==='p_items'&&v!==null?JSON.stringify(v):v)");
 }
 write('dev/ptown-words/'+name,s);
}
mkdirSync('qualification.local/ptown-words/release',{recursive:true});
