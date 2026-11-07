import {readFileSync as read,mkdirSync,writeFileSync as write} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {connect} from '../async-words/local.mjs';

// Uses the already-installed loopback PostgreSQL and browser/tool dependencies.
// No hosted endpoint, external credentials, production writes or dependency installs.
const database='arcade_ordering_'+Date.now();
const admin='10000000-0000-0000-0000-000000000001',player='10000000-0000-0000-0000-000000000002';
const migration=read('supabase/migrations/20261107220812_arcade_lobby_ordering.sql','utf8');
const evidence={database:[],browser:[],productionWrites:0};
const out='qualification.local/arcade-ordering';
mkdirSync(out,{recursive:true});
const root=await connect('postgres');
let db,server,browser;
await root.query('CREATE DATABASE '+database+' TEMPLATE template0');
async function asUser(id,sql,params=[],role='authenticated'){
  const c=await connect(database);
  try{
    await c.query('BEGIN');
    await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id??'']);
    await c.query('SET LOCAL ROLE '+role);
    const result=await c.query(sql,params);
    await c.query('COMMIT');
    return result;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
}
const get=id=>asUser(id,'SELECT layout,revision FROM public.arcade_lobby_layout WHERE id=true');
const save=(id,layout,revision)=>asUser(id,'UPDATE public.arcade_lobby_layout SET layout=$1 WHERE id=true AND revision=$2 RETURNING layout,revision',[JSON.stringify(layout),revision]);
try{
  db=await connect(database);
  await db.query(read('dev/arcade-ordering/fixture.sql','utf8'));
  await db.query('BEGIN');await db.query(migration);await db.query('ROLLBACK');
  assert.equal((await db.query("SELECT to_regclass('public.arcade_lobby_layout') name")).rows[0].name,null);
  await db.query(migration);
  const seed=(await get(player)).rows[0];
  assert.deepEqual(seed.layout.originals,['horses-blitz','357-drop','crib-lab','chucky-showdown']);
  assert.equal(seed.layout.other.length,9);
  evidence.database.push('migration rollback and initial seed','separate active player can read');
  const changed={originals:[...seed.layout.originals,'run21'],other:seed.layout.other.filter(id=>id!=='run21')};
  assert.equal((await save(player,changed,0)).rowCount,0);
  await assert.rejects(()=>asUser(null,'SELECT * FROM public.arcade_lobby_layout',[],'anon'),/permission denied/);
  await assert.rejects(()=>asUser(player,'UPDATE public.arcade_lobby_layout SET revision=99'),/permission denied/);
  await assert.rejects(()=>asUser(admin,'DELETE FROM public.arcade_lobby_layout'),/permission denied/);
  await assert.rejects(()=>asUser(admin,"INSERT INTO public.arcade_lobby_layout(layout) VALUES('{}')"),/permission denied/);
  evidence.database.push('regular player save denied','anonymous read denied','revision, insert and delete privileges denied');
  for(const invalid of [{originals:['run21'],other:['run21']},{originals:[],other:[5]},null,{originals:[],other:[],extra:[]},{originals:{},other:[]}]){
    await assert.rejects(()=>save(admin,invalid,0),/arcade:/);
    assert.equal((await get(player)).rows[0].revision,'0');
  }
  evidence.database.push('invalid and duplicate layouts rejected atomically');
  for(const sql of ["UPDATE public.account_access SET enabled=false WHERE user_id='"+admin+"'","UPDATE public.profiles SET is_active=false WHERE id='"+admin+"'"]){
    await db.query(sql);
    assert.equal((await save(admin,changed,0)).rowCount,0);
    await db.query("UPDATE public.account_access SET enabled=true; UPDATE public.profiles SET is_active=true");
  }
  await db.query("INSERT INTO public.system_settings VALUES('cutover_write_lock','{\"enabled\":true}')");
  assert.equal((await save(admin,changed,0)).rowCount,0);
  await db.query("DELETE FROM public.system_settings");
  evidence.database.push('disabled, inactive and cutover-locked admin saves denied');
  const races=await Promise.all([save(admin,changed,0),save(admin,{originals:[...changed.originals].reverse(),other:changed.other},0)]);
  assert.equal(races.reduce((n,r)=>n+r.rowCount,0),1);
  assert.equal((await save(admin,seed.layout,0)).rowCount,0);
  const committed=(await get(player)).rows[0];
  assert.equal(committed.revision,'1');
  await db.query(migration);
  assert.deepEqual((await get(player)).rows[0],committed);
  evidence.database.push('concurrent saves serialize; stale revision rejected','separate player observes complete committed layout','migration reapplication preserves saved order');
  await save(admin,seed.layout,1);

  // Narrow HTTP bridge exercises actual supabase-js payloads and database RLS.
  // This is not a hosted PostgREST or Supabase Auth deployment.
  const bridge={name:'arcade-ordering-sql',configureServer(vite){
    vite.middlewares.use(async(req,res,next)=>{
      if(!req.url?.startsWith('/rest/v1/'))return next();
      const url=new URL(req.url,'http://127.0.0.1'),table=url.pathname.split('/').pop();
      const id=req.headers.authorization==='Bearer fixture-admin'?admin:player;
      const respond=(code,value)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
      try{
        let rows=[];
        if(table==='arcade_lobby_layout'){
          if(req.method==='PATCH'){
            let body='';for await(const chunk of req)body+=chunk;
            const revision=url.searchParams.get('revision')?.replace(/^eq\./,'');
            assert.equal(url.searchParams.get('id'),'eq.true');
            rows=(await save(id,JSON.parse(body).layout,revision)).rows;
          }else rows=(await get(id)).rows;
          rows=rows.map(row=>({...row,revision:Number(row.revision)}));
        }else if(table==='user_roles')rows=(await asUser(id,"SELECT role FROM public.user_roles WHERE role='admin'")).rows;
        else if(table!=='arcade_game_artwork')return respond(404,{message:'Outside layout fixture: '+table});
        if(req.headers.accept?.includes('vnd.pgrst.object')){
          if(rows.length!==1)return respond(406,{code:'PGRST116',details:'The result contains 0 rows',message:'Cannot coerce the result to a single JSON object'});
          respond(200,rows[0]);
        }else respond(200,rows);
      }catch(e){respond(400,{message:e.message,code:e.code??'fixture_error'});}
    });
  }};
  server=await createServer({configFile:false,plugins:[react(),bridge],optimizeDeps:{entries:['dev/arcade-ordering/index.html']},
    resolve:{alias:[
      {find:'@/integrations/supabase/client',replacement:path.resolve('dev/arcade-ordering/client.ts')},
      {find:'@/components/delayed/NotificationBell',replacement:path.resolve('dev/arcade-ordering/chrome.tsx')},
      {find:'@/components/GameplaySoundButton',replacement:path.resolve('dev/arcade-ordering/chrome.tsx')},
      {find:'@',replacement:path.resolve('src')},
    ]},server:{host:'127.0.0.1',port:5196,strictPort:true},cacheDir:out+'/vite-cache'});
  await server.listen();
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const adminContext=await browser.newContext({viewport:{width:390,height:844}});
  const playerContext=await browser.newContext({viewport:{width:390,height:844}});
  const editor=await adminContext.newPage(),lobby=await playerContext.newPage();
  const errors=[];
  for(const page of [editor,lobby])page.on('pageerror',error=>errors.push(error.message));
  const base='http://127.0.0.1:5196/dev/arcade-ordering/index.html';
  await editor.goto(base+'?session=admin');
  await lobby.goto(base+'?session=player');
  const ids=async(page,label)=>page.getByRole('region',{name:label}).locator('.arcade-banner-link').evaluateAll(links=>links.map(link=>link.getAttribute('href').split('/').pop()));
  await lobby.getByRole('region',{name:'P-Town Originals'}).waitFor();
  assert.deepEqual(await ids(lobby,'P-Town Originals'),seed.layout.originals);
  assert.deepEqual(await ids(lobby,'Other Games'),seed.layout.other);
  assert.equal(await lobby.getByRole('button',{name:'Save Arcade order'}).count(),0);
  await lobby.screenshot({path:out+'/initial-390.png',fullPage:true});
  evidence.browser.push('initial seeded layout in separate player browser','player sees no admin save control');
  await editor.getByLabel('Run21 section',{exact:true}).selectOption('originals');
  assert.equal(await editor.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Run21 section');
  const up=editor.getByRole('button',{name:'Move Run21 up',exact:true});
  await up.focus();await editor.keyboard.press('Enter');
  // An actual browser native drag of Horses Blitz before Chucky Showdown.
  await editor.getByRole('button',{name:'Drag Horses Blitz',exact:true}).dragTo(editor.locator('[data-arcade-order-game="chucky-showdown"]'));
  const expected=['357-drop','crib-lab','run21','horses-blitz','chucky-showdown'];
  assert.deepEqual(await editor.getByRole('list',{name:'P-Town Originals'}).locator('li').evaluateAll(rows=>rows.map(row=>row.dataset.arcadeOrderGame)),expected);
  assert.deepEqual((await get(player)).rows[0].layout,seed.layout);
  await editor.screenshot({path:out+'/admin-draft-390.png',fullPage:true});
  await editor.getByRole('button',{name:'Save Arcade order'}).click();
  await editor.getByText('Arcade order saved.',{exact:true}).waitFor();
  await lobby.reload();
  await lobby.getByRole('region',{name:'P-Town Originals'}).waitFor();
  assert.deepEqual(await ids(lobby,'P-Town Originals'),expected);
  await editor.reload();
  await editor.getByLabel('Run21 section',{exact:true}).waitFor();
  assert.equal(await editor.getByLabel('Run21 section',{exact:true}).inputValue(),'originals');
  evidence.browser.push('section transfer and focus retention','keyboard Enter moves game','native drag reorders within section','draft not persisted before Save','one Save persists across admin reload and separate player reload');
  const denied=await lobby.evaluate(async()=>{const {saveLobbyLayout,loadLobbyLayout}=await import('/src/lib/arcade/lobbyLayoutClient.ts');const current=await loadLobbyLayout();try{await saveLobbyLayout({originals:[],other:[]},current.revision);return false;}catch{return true;}});
  assert.equal(denied,true);
  assert.deepEqual((await get(player)).rows[0].layout.originals,expected);
  evidence.browser.push('regular player forged save rejected through real client and SQL RLS');
  // Unknown and multiplayer-only saved IDs cannot grant tile visibility.
  const now=(await get(admin)).rows[0];
  await save(admin,{originals:[],other:[...now.layout.originals,...now.layout.other,'hidden-game','yahtzee']},now.revision);
  await lobby.reload();
  await lobby.getByRole('region',{name:'Other Games'}).waitFor();
  assert.equal(await lobby.getByRole('region',{name:'P-Town Originals'}).count(),0);
  assert.equal(await lobby.locator('.arcade-banner-link').count(),13);
  assert.equal(await lobby.locator('a[href="/arcade/hidden-game"],a[href="/arcade/yahtzee"]').count(),0);
  evidence.browser.push('empty section omitted','unknown and multiplayer-only games remain hidden');
  // Restore both sections for mobile/desktop geometry and artwork checks.
  const latest=(await get(admin)).rows[0];await save(admin,seed.layout,latest.revision);
  for(const width of [320,390,844,1280]){
    await lobby.setViewportSize({width,height:844});await lobby.reload();
    await lobby.getByRole('region',{name:'Other Games'}).waitFor();
    assert.equal(await lobby.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const grid=await lobby.locator('.arcade-tiles').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(grid,2);
    await lobby.locator('.arcade-banner-art').first().evaluate(img=>img.decode());
    assert.equal(await lobby.locator('.arcade-info-button').count(),13);
    await lobby.screenshot({path:out+'/lobby-'+width+'.png',fullPage:true});
  }
  assert.deepEqual(errors,[]);
  evidence.browser.push('320/390/844/1280 widths: two columns, no horizontal overflow, artwork and 13 rules controls retained');
  write(out+'/results.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence,null,2));
}finally{
  await browser?.close();await server?.close();await db?.end();
  await root.query('DROP DATABASE '+database+' WITH(FORCE)');await root.end();
}
