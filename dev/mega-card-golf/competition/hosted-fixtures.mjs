// Generates operator-reviewed, exact synthetic IDs. Secrets stay in ignored files.
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFileSync as write,existsSync} from 'node:fs';
const dir='qualification.local/mega-competition/',path=dir+'hosted-fixtures.json';
if(existsSync(path))throw Error('Refusing to replace an existing hosted fixture manifest');
const users=Array.from({length:4},(_,i)=>({id:randomUUID(),password:randomBytes(32).toString('base64url'),name:'Mega Synthetic '+(i+1)}));
for(const u of users)u.email='mega-'+u.id+'@example.invalid';
const live=Array.from({length:13},(_,i)=>({id:randomUUID(),course:Math.floor(i/4)%3,holes:[3,6,9,18][i%4],players:users.slice(0,i===0?3:2).map(u=>({id:randomUUID(),user:u.id})),phase:i===12?'A':'closed'}));
const async=Array.from({length:4},(_,i)=>({request:randomUUID(),course:i%3,holes:i===3?[3]:[3,6,9,18],phase:i===3?'B':'closed'}));
const deadline=new Date(Date.now()+30*60000).toISOString(),expires=new Date(Date.now()+60*60000).toISOString();
const literal=x=>"'"+String(x).replaceAll("'","''")+"'";
let sql="BEGIN; SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='15s';\nDO $$BEGIN IF NOT EXISTS(SELECT FROM private.mega_competition_release WHERE NOT live_enabled AND NOT async_enabled) THEN RAISE EXCEPTION 'expected closed flags';END IF;END $$;\n";
for(const u of users){sql+=`INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change) VALUES('${u.id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${u.email}',extensions.crypt('${u.password}',extensions.gen_salt('bf')),clock_timestamp(),'{"provider":"email","providers":["email"],"mega_synthetic":true}',${literal(JSON.stringify({username:u.name}))},clock_timestamp(),clock_timestamp(),'','','','');
INSERT INTO auth.identities(user_id,provider_id,identity_data,provider,created_at,updated_at) VALUES('${u.id}','${u.id}',${literal(JSON.stringify({sub:u.id,email:u.email,email_verified:true}))},'email',clock_timestamp(),clock_timestamp());
INSERT INTO public.profiles(id,username,is_active) VALUES('${u.id}','${u.name}',true) ON CONFLICT(id) DO UPDATE SET is_active=true,username=EXCLUDED.username;
INSERT INTO private.mega_test_accounts(user_id,expires_at) VALUES('${u.id}','${expires}');\n`;}
for(const g of live){for(const p of g.players)sql+=`INSERT INTO private.mega_test_live(game_id,user_id,expires_at) VALUES('${g.id}','${p.user}','${expires}');\n`;
sql+=`INSERT INTO public.games(id,status,real_money,name,dealer_position,current_host,config_deadline,pot,is_paused,pending_session_end) VALUES('${g.id}','game_selection',false,'Mega isolated qualification',4,'${users[0].id}','${deadline}',0,false,false);\n`;
for(const [i,p] of g.players.entries())sql+=`INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES('${p.id}','${g.id}','${p.user}',${4-i},100,false);\n`;}
for(const a of async)sql+=`INSERT INTO private.mega_test_async(actor,request_id,opponent,expires_at) VALUES('${users[0].id}','${a.request}','${users[1].id}','${expires}');\n`;
sql+="SET CONSTRAINTS ALL IMMEDIATE; COMMIT; SELECT jsonb_build_object('synthetic_accounts',(SELECT count(*) FROM private.mega_test_accounts),'live_scopes',(SELECT count(DISTINCT game_id) FROM private.mega_test_live),'async_scopes',(SELECT count(*) FROM private.mega_test_async),'flags',(SELECT to_jsonb(r) FROM private.mega_competition_release r)) evidence;";
write(path,JSON.stringify({users,live,async,deadline,expires},null,2));write(dir+'hosted-fixtures.sql',sql);console.log(JSON.stringify({users:users.map(u=>u.id),liveSessions:live.length,asyncInvitations:async.length,expires}));
