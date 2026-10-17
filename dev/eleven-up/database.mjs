import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
// Reuse the installed qualification client; never download tools or touch production.
const pg=require(process.env.ELEVEN_UP_PG_MODULE ?? '../../qualification.local/tri-towers/tools/node_modules/pg');
export async function connect(database){const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;}
export const context=async()=>JSON.parse(await readFile('qualification.local/eleven-up/context.json','utf8'));
if(process.argv[2]==='clone'){
 const source=process.argv[3];if(!/^[a-z0-9_]+$/.test(source??''))throw Error('Pass an existing local qualification database');
 const database='eleven_up_'+Date.now(),c=await connect('postgres');
 await c.query(`CREATE DATABASE "${database}" TEMPLATE "${source}"`);await c.end();
 await mkdir('qualification.local/eleven-up',{recursive:true});await writeFile('qualification.local/eleven-up/context.json',JSON.stringify({database}));
 const d=await connect(database);
 const defs=(await d.query("SELECT p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('arcade_start','arcade_commit','arcade_leaderboard')")).rows;
 await writeFile('qualification.local/eleven-up/arcade-definitions.json',JSON.stringify(defs,null,2));await d.end();console.log(database);
}
