import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID} from 'node:crypto';
export const sql=text=>execFileSync('docker',['exec','-i','supabase_db_run21-reconciled','psql','-X','-U','supabase_admin','-d','run21_latency','-Atq','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024}).trim();
const cli='C:/Users/jerem/AppData/Local/npm-cache/_npx/66b4952730d9cac8/node_modules/@supabase/cli-windows-x64/bin/supabase.exe';
const status=JSON.parse(execFileSync(cli,['--workdir','C:/Users/jerem/Desktop/poker/run21-app-test-reconciled/qualification.local/local-stack','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
export const key=status.SERVICE_ROLE_KEY;
if(!key)throw Error('Missing existing local-only service key');
export const url='http://127.0.0.1:65421';
export const gateway=createServer(async(req,res)=>{
 const auth=req.url.startsWith('/auth/v1');const path=req.url.replace(auth?'/auth/v1':'/rest/v1','');
 let body='';for await(const b of req)body+=b;
 try{const r=await fetch(`http://127.0.0.1:${auth?65439:65431}${path}`,{method:req.method,headers:{...req.headers,host:undefined},...(body?{body}:{})});
 res.writeHead(r.status,{'content-type':r.headers.get('content-type')??'application/json'});res.end(await r.text());}catch{res.writeHead(502);res.end('{}');}
});
export const opts={auth:{persistSession:false,autoRefreshToken:false}};
export async function fixture(){
 await new Promise(resolve=>gateway.listen(65421,'127.0.0.1',resolve));
 const admin=createClient(url,key,opts),client=createClient(url,key,opts);
 const email=`run21-latency-${randomUUID()}@local.test`,password=randomBytes(20).toString('hex');
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:'Latency '+randomUUID().slice(0,8)}});
 if(created.error)throw Error('createUser: '+created.error.message);const user=created.data.user.id;
 // Same local fixture bootstrap owned by .codex/scripts/run21-local-start.mjs.
 sql(`INSERT INTO public.user_roles(user_id,role) VALUES('${user}','admin'); INSERT INTO private.run21_release_allowlist(user_id) VALUES('${user}'); UPDATE public.profiles SET is_active=true WHERE id='${user}'; UPDATE private.run21_app_test_release SET enabled=true,qualified=true,project_ref='local';`);
 const login=await client.auth.signInWithPassword({email,password});if(login.error)throw Error(login.error.message);
 const checked=async(name,args)=>{const r=await client.rpc(name,args);if(r.error)throw Error(name+': '+r.error.message);return r.data;};
 const made=await checked('create_session',{p_request_id:randomUUID(),p_name:'Run21 isolated latency',p_real_money:false,p_position:1});
 await checked('create_session_bot',{_game_id:made.game_id,_bot_id:randomUUID(),_aggression_level:'normal',_position:4,_sitting_out:false,_waiting:false});
 await checked('begin_session_dealer_selection',{p_game_id:made.game_id});
 sql(`SELECT private.prepare_session_dealer_selection(id,timer_generation) FROM public.games WHERE id='${made.game_id}';`);
 await new Promise(resolve=>setTimeout(resolve,3200));
 await checked('advance_session_dealer_selection',{p_game_id:made.game_id});
 const g=await client.from('games').select('config_deadline,dealer_position').eq('id',made.game_id).single();
 if(!g.data.config_deadline)throw Error('Canonical dealer selection did not resolve');
 await checked('run21_configure_local',{p_game_id:made.game_id,p_dealer_player_id:made.player_id,p_expected_dealer_position:g.data.dealer_position,p_expected_config_deadline:g.data.config_deadline,p_game_type:'run21',p_config:{ante_amount:1}});
 const rows=await admin.rpc('run21_server_load',{p_game_id:made.game_id});if(rows.error)throw Error(rows.error.message);
 return {admin,client,user,token:login.data.session.access_token,session:login.data.session,row:rows.data.at(-1),checked,
 async cleanup(){await checked('admin_blast_fake_money_game',{p_game_id:made.game_id});const r=await admin.from('games').select('id').eq('id',made.game_id);if(r.data?.length)throw Error('Cleanup failed');await admin.auth.admin.deleteUser(user);gateway.close();}};
}
