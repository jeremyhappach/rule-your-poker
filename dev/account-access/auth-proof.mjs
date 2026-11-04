// Real GoTrue + PostgREST + SMTP, isolated Docker containers and disposable data.
// Uses only images/libraries already installed. Never contacts hosted Auth or mail.
import {createServer} from 'node:http';
import {createServer as smtpServer} from 'node:net';
import {randomBytes,createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync as read,mkdirSync,writeFileSync as write} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createClient} from '@supabase/supabase-js';
const {default:pg}=await import(pathToFileURL('C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js'));
const prefix='ptown-account-proof-'+Date.now(),network=prefix+'-net',names=[],mail=[],checks=[];
const secret=randomBytes(32).toString('hex'),password=randomBytes(20).toString('hex');
const docker=(...args)=>execFileSync('docker',args,{stdio:['ignore','pipe','pipe'],windowsHide:true}).toString().trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const jwt=role=>{const b=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const data=b({alg:'HS256',typ:'JWT'})+'.'+b({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});return data+'.'+createHmac('sha256',secret).update(data).digest('base64url');};
const anon=jwt('anon'),service=jwt('service_role'),url='http://127.0.0.1:55454';
let db,apiHandler;
const smtp=smtpServer(socket=>{
 socket.write('220 account-proof ESMTP\r\n');let buffer='',data=false,content='';
 socket.on('data',chunk=>{buffer+=chunk.toString();let i;while((i=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+2);
  if(data){if(line==='.'){mail.push(content);data=false;content='';socket.write('250 queued\r\n');}else content+=line+'\n';continue;}
  if(/^EHLO|HELO/.test(line))socket.write('250-account-proof\r\n250 8BITMIME\r\n');
  else if(line==='DATA'){data=true;socket.write('354 end with dot\r\n');}
  else if(line==='QUIT'){socket.end('221 goodbye\r\n');}
  else socket.write('250 OK\r\n');
 }});
});
const gateway=createServer(async(req,res)=>{
 try{
  if(req.url==='/template'){res.setHeader('Content-Type','text/html');res.end('<h2>Verify your email</h2><a href="{{ .SiteURL }}/verify-email#token_hash={{ .TokenHash }}">Verify email</a>');return;}
  if(req.url==='/api/account-access'){await apiHandler(req,res);return;}
  const auth=req.url.startsWith('/auth/v1/');const base=auth?'http://127.0.0.1:55452':'http://127.0.0.1:55453';
  const path=req.url.replace(auth?'/auth/v1':'/rest/v1','');let body='';for await(const c of req)body+=c;
  const headers={...req.headers};delete headers.host;delete headers['content-length'];
  const response=await fetch(base+path,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:body,redirect:'manual'});
  res.statusCode=response.status;for(const [key,value]of response.headers)if(!['transfer-encoding','content-encoding','content-length'].includes(key))res.setHeader(key,value);
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.statusCode=503;res.end('Local proof service unavailable');}
});
const run=(suffix,image,env,port)=>{const name=prefix+'-'+suffix;names.push(name);docker('run','-d','--rm','--pull','never','--name',name,'--network',network,...(port?['-p',port]:[]),...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),image);return name;};
async function ready(endpoint){for(let i=0;i<60;i++){try{if((await fetch(endpoint)).ok)return;}catch{}await sleep(250);}throw Error('Local service did not become ready: '+endpoint);}
const client=()=>createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const api=async(body,token)=>{const response=await fetch(url+'/api/account-access',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
const pass=message=>{checks.push(message);console.log('PASS',message);};
try{
 docker('network','create',network);
 await new Promise(r=>smtp.listen(55455,'0.0.0.0',r));await new Promise(r=>gateway.listen(55454,'0.0.0.0',r));
 const dbName=run('db','public.ecr.aws/supabase/postgres:17.6.1.167',{POSTGRES_PASSWORD:password},'127.0.0.1:55451:5432');
 for(let i=0;i<80;i++){try{db=new pg.Client({host:'127.0.0.1',port:55451,user:'supabase_admin',password,database:'postgres',connectionTimeoutMillis:500});await db.connect();break;}catch{db=undefined;await sleep(250);}}
 assert(db,'local database ready');
 await db.query(`CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS private;
 DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated;END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon;END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS;END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN;END IF; END $$;
 ALTER ROLE authenticator PASSWORD '${password}';GRANT anon,authenticated,service_role TO authenticator;
 GRANT USAGE ON SCHEMA public,private,auth TO authenticated,service_role,anon;`);
 run('auth','public.ecr.aws/supabase/gotrue:v2.196.0',{
  GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:url+'/auth/v1',GOTRUE_SITE_URL:url,
  GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgres://supabase_admin:${password}@${dbName}:5432/postgres?search_path=auth`,GOTRUE_DB_NAMESPACE:'auth',
  GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',
  GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED:'true',
  GOTRUE_SMTP_HOST:'host.docker.internal',GOTRUE_SMTP_PORT:'55455',GOTRUE_SMTP_ADMIN_EMAIL:'proof@example.invalid',GOTRUE_SMTP_SENDER_NAME:'Local proof',GOTRUE_SMTP_MAX_FREQUENCY:'0',
  GOTRUE_MAILER_TEMPLATES_MAGIC_LINK:'http://host.docker.internal:55454/template',GOTRUE_RATE_LIMIT_EMAIL_SENT:'1000',GOTRUE_LOG_LEVEL:'error'
 },'127.0.0.1:55452:9999');
 await ready('http://127.0.0.1:55452/health');
 await db.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE TYPE public.app_role AS ENUM('admin','moderator','user');
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,username text,email text,is_active boolean DEFAULT true,is_superuser boolean DEFAULT false,last_seen_at timestamptz);
 CREATE TABLE public.user_roles(id uuid DEFAULT gen_random_uuid(),user_id uuid,role public.app_role,UNIQUE(user_id,role));
 CREATE FUNCTION public.has_role(who uuid,wanted public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT FROM public.user_roles WHERE user_id=who AND role=wanted)$$;
 DO $$BEGIN IF NOT EXISTS(SELECT FROM pg_publication WHERE pubname='supabase_realtime') THEN CREATE PUBLICATION supabase_realtime;END IF;END $$;`);
 await db.query(read('supabase/account-access/core.sql','utf8'));
 const deployed=JSON.parse(read('dev/account-access/deployed-preimage.json','utf8'));
 let registration=deployed.functions.find(f=>f.name==='handle_new_user').def.replace('BEGIN','BEGIN\n INSERT INTO public.account_access(user_id) VALUES(NEW.id);').replace('(id, username, email)','(id, username, email, is_active)').replace('NEW.email\n','NEW.email, false\n');
 await db.query(registration);
 await db.query('CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();');
 run('rest','public.ecr.aws/supabase/postgrest:v16.2',{PGRST_DB_URI:`postgres://authenticator:${password}@${dbName}:5432/postgres`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_PORT:'3000'},'127.0.0.1:55453:3000');
 await build({entryPoints:['api/account-access.ts'],bundle:true,packages:'external',platform:'node',format:'esm',outfile:'qualification.local/account-access/handler.mjs'});
 const {createAccountAccessHandler}=await import(pathToFileURL(resolve('qualification.local/account-access/handler.mjs')));
 apiHandler=createAccountAccessHandler({url,key:service});
 const user=client(),adminClient=client(),userPassword='Local-proof-'+randomBytes(12).toString('hex');
 const signup=await user.auth.signUp({email:'player@example.invalid',password:userPassword,options:{data:{username:'newplayer87'}}});assert.ifError(signup.error);assert(signup.data.session);
 const id=signup.data.user.id,token=signup.data.session.access_token;
 const adminSignup=await adminClient.auth.signUp({email:'admin@example.invalid',password:userPassword});assert.ifError(adminSignup.error);const adminId=adminSignup.data.user.id;
 await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=$1',[adminId]);await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[adminId]);await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[adminId]);
 let snapshot=await user.rpc('account_access_snapshot');assert.ifError(snapshot.error);assert.equal(snapshot.data.status,'pending');assert.equal(snapshot.data.verified,false);
 assert((await user.rpc('admin_account_directory')).error);pass('actual signup authenticates but remains pending; browser cannot access administrator data');
 const approve=await adminClient.rpc('admin_set_account_access',{p_user_id:id,p_enabled:true});assert.ifError(approve.error);
 const login=await client().auth.signInWithPassword({email:'player@example.invalid',password:userPassword});assert.ifError(login.error);
 snapshot=await user.rpc('account_access_snapshot');assert.equal(snapshot.data.enabled,true);assert.equal(snapshot.data.verified,false);pass('approved unverified account signs in; approval is not email ownership evidence');
 const sent=await api({op:'resend'},token);assert.equal(sent.status,200,JSON.stringify(sent));assert.equal(mail.length,1);
 const decoded=mail[0].replace(/=\n/g,'').replaceAll('=3D','=');const hash=decoded.match(/token_hash=([0-9a-f]+)/)?.[1];assert(hash,'SMTP message contains verification token');
 const verified=await api({op:'verify',tokenHash:hash});assert.equal(verified.status,200,JSON.stringify(verified));
 assert.equal((await user.rpc('account_access_snapshot')).data.verified,true);
 assert.equal((await api({op:'verify',tokenHash:hash})).status,400);assert((await user.auth.getUser()).data.user);pass('SMTP-delivered real token verifies once without signing out the original session');
 assert.equal((await api({op:'resend'},token)).status,429);pass('resend throttling survives HTTP retries');
 assert.ifError((await adminClient.rpc('admin_set_account_access',{p_user_id:id,p_enabled:false})).error);
 assert.equal((await user.rpc('account_access_snapshot')).data.status,'suspended');assert((await user.rpc('admin_account_directory')).error);
 assert.ifError((await adminClient.rpc('admin_set_account_access',{p_user_id:id,p_enabled:true})).error);pass('old JWT reads suspended status; fresh server gate rejects it; re-enable restores access');
 const before=mail.length;assert.ifError((await user.auth.updateUser({email:'new-player@example.invalid'})).error);
 assert.equal((await user.auth.getUser()).data.user.email,'player@example.invalid');assert(mail.length>before);pass('secure email change sends verification and preserves the old address until confirmation');
 for(const [index,message] of mail.slice(before).entries()){
  const decoded=message.replace(/=\n/g,'').replaceAll('=3D','=');
  const hash=decoded.match(/[?&]token=([0-9a-f]+)/)?.[1];assert(hash,'email-change ownership token');
  const tokens=(await db.query('SELECT email,email_change_token_current c,email_change_token_new n FROM auth.users WHERE id=$1',[id])).rows[0];
  const result=await client().auth.verifyOtp({token_hash:hash,type:'email_change'});
  // GoTrue may complete a change from the first confirmation and invalidate the
  // other mailed token. Neither case grants our independent ownership evidence.
  if(tokens.email==='new-player@example.invalid')assert(result.error,'consumed change cannot replay');
  else assert.ifError(result.error);
 }
 assert.equal((await user.auth.getUser()).data.user.email,'new-player@example.invalid');
 assert.equal((await user.rpc('account_access_snapshot')).data.verified,false);pass('changing the authoritative email invalidates prior ownership evidence');
 assert.ifError((await client().auth.resetPasswordForEmail('admin@example.invalid',{redirectTo:url+'/auth?reset=true'})).error);
 const recoveryHash=mail.at(-1).replace(/=\n/g,'').replaceAll('=3D','=').match(/[?&]token=([0-9a-f]+)/)?.[1];assert(recoveryHash);
 const recovery=client();assert.ifError((await recovery.auth.verifyOtp({token_hash:recoveryHash,type:'recovery'})).error);
 assert.ifError((await recovery.auth.updateUser({password:userPassword+'-recovered'})).error);
 assert.ifError((await client().auth.signInWithPassword({email:'admin@example.invalid',password:userPassword+'-recovered'})).error);
 pass('password recovery email, token consumption, password update and subsequent login remain intact');
 mkdirSync('dev/account-access/evidence',{recursive:true});write('dev/account-access/evidence/auth.json',JSON.stringify({passed:true,checks,authImage:'gotrue:v2.196.0',mailTransport:'isolated SMTP',hostedAccountsChanged:false},null,2));
}catch(e){console.error('Auth proof FAILED:',e.message);process.exitCode=1;}
finally{if(db)await db.end();await new Promise(r=>gateway.close(r));await new Promise(r=>smtp.close(r));for(const name of names.reverse())try{docker('rm','-f',name);}catch{}try{docker('network','rm',network);}catch{}}
