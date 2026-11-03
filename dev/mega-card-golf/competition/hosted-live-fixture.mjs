// One bounded replacement for the live browser retest, using existing synthetic accounts.
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';
const dir='qualification.local/mega-competition/',path=dir+'hosted-fixtures.json',f=JSON.parse(read(path));
if(f.live.length!==13||f.live[12].completed)throw Error('Expected one unused phase-A reservation');
f.live[12].phase='ui';
const g={id:randomUUID(),course:0,holes:3,players:f.users.slice(0,2).map(u=>({id:randomUUID(),user:u.id})),phase:'A'};
f.live.push(g);
let sql="BEGIN; SET LOCAL lock_timeout='100ms'; DO $$BEGIN IF NOT EXISTS(SELECT FROM private.mega_competition_release WHERE NOT live_enabled AND NOT async_enabled) THEN RAISE EXCEPTION 'expected closed flags';END IF;END $$;\n";
for(const p of g.players)sql+=`INSERT INTO private.mega_test_live(game_id,user_id,expires_at) VALUES('${g.id}','${p.user}','${f.expires}');\n`;
sql+=`INSERT INTO public.games(id,status,real_money,name,dealer_position,current_host,config_deadline,pot,is_paused,pending_session_end) VALUES('${g.id}','game_selection',false,'Mega isolated qualification',4,'${f.users[0].id}','${f.deadline}',0,false,false);\n`;
for(const [i,p] of g.players.entries())sql+=`INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES('${p.id}','${g.id}','${p.user}',${4-i},100,false);\n`;
sql+='SET CONSTRAINTS ALL IMMEDIATE; COMMIT;';
write(path,JSON.stringify(f,null,2));write(dir+'hosted-live-extension.sql',sql);console.log(JSON.stringify({ui:f.live[12].id,phaseA:g.id}));
