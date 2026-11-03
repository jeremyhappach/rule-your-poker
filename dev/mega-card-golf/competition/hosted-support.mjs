import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
export const dir='qualification.local/mega-competition/',origin='https://holm357.com';
export const fixture=()=>JSON.parse(read(dir+'hosted-fixtures.json','utf8'));
export const save=f=>write(dir+'hosted-fixtures.json',JSON.stringify(f,null,2));
export const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
export async function login(){
 const f=fixture(),html=await fetch(origin).then(r=>r.text());const path=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)][0]?.[1];assert(path);
 const bundle=await fetch(new URL(path,origin)).then(r=>r.text());
 const key=(bundle.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]).find(k=>{if(k.startsWith('sb_publishable_'))return true;try{const p=JSON.parse(Buffer.from(k.split('.')[1],'base64url'));return p.role==='anon'&&p.ref==='xvhmbuppghwmwpwrkzao';}catch{return false;}});assert(key);
 const clients=[];
 for(const u of f.users){const client=createClient('https://xvhmbuppghwmwpwrkzao.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const r=await client.auth.signInWithPassword({email:u.email,password:u.password});assert(!r.error,r.error?.message);assert.equal(r.data.user.id,u.id);clients.push({client,id:u.id,session:r.data.session,token:r.data.session.access_token});}
 return {f,clients,byUser:Object.fromEntries(clients.map(c=>[c.id,c])),close:()=>Promise.all(clients.map(c=>c.client.auth.signOut({scope:'local'})))};
}
export async function rpc(c,name,args){const r=await c.client.rpc(name,args);if(r.error)throw Error(name+': '+r.error.message);return r.data;}
export async function api(c,route,body){const r=await fetch(origin+'/api/'+route,{method:'POST',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:JSON.stringify(body)});const text=await r.text();let v;try{v=JSON.parse(text);}catch{throw Error(route+' non-JSON HTTP '+r.status);}if(!r.ok)throw Error(route+' HTTP '+r.status+': '+v.error);return v;}
if(process.argv.includes('--login')){const a=await login();console.log(JSON.stringify({authenticated:a.clients.length,syntheticOnly:true}));await a.close();}
