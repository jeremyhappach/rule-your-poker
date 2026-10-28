import assert from 'node:assert/strict';
import {readFileSync as read} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
export const origin='https://holm357.com';
export const users=['d7dc1928-3727-4351-b0ff-0e80c81c2953','fb835d1f-db2f-4de4-84e2-ce0074512e46'];
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function login(){
 const env=Object.fromEntries(read('C:/Users/jerem/source/repos/rule-your-poker/.env.e2e.local','utf8').split(/\r?\n/).filter(l=>/^[A-Za-z_][A-Za-z0-9_]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2')]}));
 const html=await fetch(origin).then(r=>r.text());const path=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)][0]?.[1];assert(path);
 const script=new URL(path,origin);assert.equal(script.origin,origin);const bundle=await fetch(script).then(r=>r.text());
 const key=(bundle.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]).find(k=>{if(k.startsWith('sb_publishable_'))return true;try{const p=JSON.parse(Buffer.from(k.split('.')[1],'base64url'));return p.role==='anon'&&p.ref==='xvhmbuppghwmwpwrkzao'}catch{return false}});assert(key);
 const clients=[];
 for(let i=0;i<2;i++){const c=createClient('https://xvhmbuppghwmwpwrkzao.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const r=await c.auth.signInWithPassword({email:env['PTOWN_E2E_PLAYER'+(i+1)+'_EMAIL'],password:env['PTOWN_E2E_PLAYER'+(i+1)+'_PASSWORD']});assert(!r.error,'Fixture login failed');assert(users.includes(r.data.user.id));clients.push({client:c,user:r.data.user.id,session:r.data.session,token:r.data.session.access_token});}
 for(const k of Object.keys(env))delete env[k];
 return {clients,byUser:Object.fromEntries(clients.map(c=>[c.user,c])),close:()=>Promise.all(clients.map(async c=>{await c.client.removeAllChannels();await c.client.auth.signOut({scope:'local'});} ))};
}
export async function rpc(c,name,args){const r=await c.client.rpc(name,args);assert(!r.error,name+': '+r.error?.message?.slice(0,100));return r.data;}
export async function api(c,match,operation,command){const r=await fetch(`${origin}/__canasta/${match}/${operation}`,{method:operation==='state'?'GET':'POST',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},...(command?{body:JSON.stringify(command)}:{})});const type=r.headers.get('content-type');assert(type?.includes('application/json'),'API did not return JSON: '+r.status);return{status:r.status,body:await r.json()};}
