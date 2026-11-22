import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {readFileSync as read} from 'node:fs';
import {resolve} from 'node:path';
import pg from 'file:///C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const db=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database:'ptown_words_real_1793213634131',connectionTimeoutMillis:3000});
await db.connect();
await db.query('BEGIN');
await db.query(read('dev/six-item-polish/rules-before.sql','utf8'));
await db.query(read('supabase/ptown-words/placement-preview.sql','utf8'));
await db.query("SELECT set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true)");
const html='<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gameplay polish qualification</title></head><body><div id="root"></div><script type="module" src="/dev/six-item-polish/preview.tsx"></script></body></html>';
const server=await createServer({configFile:false,cacheDir:'qualification.local/six-item-vite',plugins:[react(),{name:'isolated-polish',configureServer(s){
 s.middlewares.use('/__preview',async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  try{const a=JSON.parse(body);const result=await db.query('SELECT public.ptown_words_preview($1,$2,$3,$4) value',[a.p_version,JSON.stringify(a.p_board),JSON.stringify(a.p_rack),JSON.stringify(a.p_items)]);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result.rows[0].value));}
  catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
 });
 s.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0].includes('.')||req.url?.startsWith('/@')||req.url?.startsWith('/node_modules'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html));});
}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/six-item-polish/client.ts')},{find:'@',replacement:resolve('src')}]},define:{__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"polish-fixture"',__APP_BUILD_SHA__:'"polish-fixture"',__BUILD_TIMESTAMP__:'"local"'},server:{host:'127.0.0.1',port:5189,strictPort:true,hmr:false}});
await server.listen();console.log('Isolated SQL-backed polish fixture: http://127.0.0.1:5189');
async function close(){await server.close();await db.query('ROLLBACK');await db.end();process.exit();}
process.on('SIGINT',close);process.on('SIGTERM',close);
