import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
const pg=require(process.env.ELEVEN_UP_PG_MODULE ?? 'C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg');
const contextPath='qualification.local/eleven-up-bots/context.json';
export async function connect(database){
 if(database!=='postgres'&&!/^eleven_up_bots_\d+$/.test(database))throw Error('Dedicated bot qualification database required');
 const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;
}
export const context=()=>JSON.parse(readFileSync(contextPath,'utf8'));
if(process.argv[2]==='prepare'){
 if(existsSync(contextPath))throw Error('Existing context: inspect before rerunning preparation');
 const database='eleven_up_bots_'+Date.now(),c=await connect('postgres');
 await c.query(`CREATE DATABASE "${database}" TEMPLATE "boxdrop_1792512073576"`);await c.end();
 mkdirSync('qualification.local/eleven-up-bots',{recursive:true});writeFileSync(contextPath,JSON.stringify({database,source:'boxdrop_1792512073576'}));
 const d=await connect(database);
 const definitions=(await d.query("SELECT n.nspname,p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='public' AND p.proname IN ('eleven_up_configure','advance_ante_phase','submit_ante_decision')) OR (n.nspname='private' AND p.proname IN ('megatouch_begin','eleven_up_settle','eleven_up_recover','advance_ante_phase_exact'))")).rows;
 writeFileSync('qualification.local/eleven-up-bots/baseline.json',JSON.stringify(definitions,null,2));
 console.log({database,functions:definitions.map(x=>x.proname)});
 console.log((await d.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='private' AND tablename IN ('eleven_up_matches','eleven_up_requests')")).rows);
 await d.end();
}
