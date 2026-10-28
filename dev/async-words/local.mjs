import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {default:pg}=await import(pathToFileURL('C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js').href);
export async function connect(database){const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database,connectionTimeoutMillis:3000});await c.connect();return c;}
export const candidate=()=>['words-rules','authority','views','incidents','words','health'].map(n=>read('supabase/delayed/'+n+'.sql','utf8')).join('\n');
if(process.argv.includes('--setup')){
 const root=await connect('postgres');
 const databases=(await root.query("SELECT datname FROM pg_database d WHERE datname LIKE 'ptown_words_%' AND NOT EXISTS(SELECT FROM pg_stat_activity a WHERE a.datid=d.oid) ORDER BY oid DESC")).rows;
 let template;const expected=JSON.parse(read('dev/async-words/preimage.json','utf8')).functions;
 for(const {datname}of databases){const c=await connect(datname);try{const hashes=(await c.query("SELECT proname name,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND proname IN('ptown_words_rules_for','ptown_words_deal','ptown_words_reduce')")).rows;if(hashes.length===3&&hashes.every(f=>expected.some(e=>e.name===f.name&&e.hash===f.hash))){template=datname;break;}}finally{await c.end();}}
 const fixtureUpgrade=!template;
 if(!template)template=databases.find(d=>/^ptown_words_bots_\d+$/.test(d.datname))?.datname;
 if(!template)throw Error('No idle Words fixture');
 const database='async_words_'+Date.now();await root.query('CREATE DATABASE '+database+' TEMPLATE '+template);await root.end();
 const db=await connect(database);try{if(fixtureUpgrade)for(const name of ['ptown_words_rules_for','ptown_words_deal','ptown_words_reduce'])await db.query(expected.find(f=>f.name===name).definition);if(!(await db.query("SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime'")).rowCount)await db.query('CREATE PUBLICATION supabase_realtime');await db.query('BEGIN');await db.query(candidate());await db.query('ROLLBACK');await db.query(candidate());}finally{await db.end();}
 write('qualification.local/async-words/context.json',JSON.stringify({database,template}));console.log('Candidate installed in disposable clone',database,'from',template);
}
