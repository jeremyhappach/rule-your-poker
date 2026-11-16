// Test transport only: real Auth/PostgREST and a secret-protected isolated RPC broker.
// This file is substituted only for server-side SDK imports in hosted.server.mjs.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const sdk=require('@supabase/supabase-js');
const config=JSON.parse(readFileSync(new URL('../../qualification.local/five-alive/hosted/browser.public.json',import.meta.url),'utf8'));
const broker=JSON.parse(readFileSync(new URL('../../qualification.local/five-alive/hosted/broker.private.json',import.meta.url),'utf8'));
export const isAuthError=sdk.isAuthError;
export const isAuthSessionMissingError=sdk.isAuthSessionMissingError;
export function createClient(url:string,key:string){
 if(url!=='https://xvhmbuppghwmwpwrkzao.supabase.co'||key!=='isolated-test-transport')throw Error('qualification:unexpected_binding');
 if(config.url!=='https://tyuxxkalhqbqkbvvkcfx.supabase.co')throw Error('qualification:wrong_project');
 const db=sdk.createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
 const getUser=db.auth.getUser.bind(db.auth);let token='';
 db.auth.getUser=async(value:string)=>{token=value;return getUser(value);};
 db.rpc=async(name:string,args:Record<string,unknown>)=>{
  const response=await fetch(config.url+'/functions/v1/five-alive-qualification',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'x-qualification-secret':broker.brokerSecret},body:JSON.stringify({name,args})});
  const value=await response.json();return {data:response.ok?value:null,error:response.ok?null:value,status:response.status};
 };
 return db;
}
