import {createClient} from '@supabase/supabase-js';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {CanastaAuthority} from './authority.js';
import {createStore} from './store.js';
import type {Command} from '../../src/lib/canasta/engine';

/** Authenticated adapter; credentials and database release gates are supplied separately. */
export function createCanastaHandler(url:string,serviceKey:string){
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}),authority=new CanastaAuthority(createStore(url,serviceKey));
  async function handler(req:IncomingMessage&{body?:unknown},res:ServerResponse){
    const send=(status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
    try{
      const route=/^\/__canasta\/([0-9a-f-]{36})\/(state|action|take-control)$/.exec(new URL(req.url??'/','http://authority.invalid').pathname);
      if(!route)return send(404,{error:'canasta:route'});
      if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'canasta:origin'});
      const token=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1];if(!token)return send(401,{error:'canasta:authentication'});
      const {data,error}=await db.auth.getUser(token);if(error||!data.user)return send(401,{error:'canasta:authentication'});
      const [,id,operation]=route;
      if(req.method!==(operation==='state'?'GET':'POST'))return send(405,{error:'canasta:method'});
      if(operation==='state')return send(200,await authority.read(id,data.user.id));
      if(operation==='take-control')return send(200,await authority.takeControl(id,data.user.id));
      let body='';
      if(req.body!==undefined)body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
      else for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384)return send(413,{error:'canasta:request_size'});}
      if(Buffer.byteLength(body)>16384)return send(413,{error:'canasta:request_size'});
      const command=JSON.parse(body) as Command;
      if(!command||typeof command!=='object'||!command.action||typeof command.playerId!=='string')return send(400,{error:'canasta:command'});
      return send(200,await authority.action(id,data.user.id,command));
    }catch(e){const message=e instanceof Error?e.message:'';send(message==='canasta:uncertain'?503:message.includes('unauthorized')?403:409,{error:message.startsWith('canasta:')?message:'canasta:request_rejected'});}
  }
  /** External canonical worker invokes this even with zero connected browsers. */
  async function recoverDue(){
    const {data,error}=await db.rpc('canasta_server_due');if(error)throw Error('canasta:recovery_unavailable');
    const failures:string[]=[];
    for(const id of data as string[])try{await authority.recover(id);}catch{failures.push(id);}
    if(failures.length)throw Error(`canasta:recovery_failed:${failures.length}`);
  }
  return {handler,recoverDue};
}
