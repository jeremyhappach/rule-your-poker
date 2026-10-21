import {connect,context} from './bots-database.mjs';
import {readFileSync as read} from 'node:fs';
const c=await connect(context().database);
try{
 const rows=(await c.query("select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in('create_session_bot','allocate_bot_alias_number')")).rows;
 console.log(rows);
 if(process.argv.includes('--restore-source-functions')){
  if(rows.length)throw Error('Expected both canonical functions absent; do not overwrite baseline owners');
  // The local qualification template omitted these owners. Restore exact checked-in
  // definitions only; do not run migration backfills or synthesize replacement RPCs.
  const definitions=[
   ['supabase/migrations/20260801001032_5d3bce26-50f5-4087-bbcb-d6c7d78d1a7e.sql','allocate_bot_alias_number'],
   ['supabase/migrations/20260914214838_gin_replay_waiting_lifecycle.sql','create_session_bot']
  ].map(([path,name])=>{const s=read(path,'utf8'),a=s.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'('),body=s.indexOf('$function$',a)+10,end=/\$function\$\s*;/.exec(s.slice(body));if(a<0||body<10||!end)throw Error('Missing function '+name);return s.slice(a,body+end.index+end[0].length);});
  await c.query('begin');for(const sql of definitions)await c.query(sql);
  await c.query('REVOKE ALL ON FUNCTION public.allocate_bot_alias_number(uuid) FROM PUBLIC,anon,authenticated; REVOKE ALL ON FUNCTION public.create_session_bot(uuid,uuid,text,integer,boolean,boolean,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.create_session_bot(uuid,uuid,text,integer,boolean,boolean,uuid) TO authenticated');
  await c.query('commit');console.log('Restored two exact source functions in dedicated synthetic database');
 }
}catch(e){await c.query('rollback').catch(()=>{});throw e;}finally{await c.end();}
