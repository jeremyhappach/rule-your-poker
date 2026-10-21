// Reuse the existing actual-SQL browser harness with a dedicated database and bot seat.
// Generated entry lives beside its original relative imports, and is removed on exit.
import {readFileSync as read,writeFileSync as write,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const replace=(s,from,to)=>{assert(s.includes(from),from);return s.replace(from,to);};
let source=read('dev/eleven-up/serve.mjs','utf8');
source=replace(source,"from './database.mjs'","from './bots-database.mjs'");
source=source.replaceAll('qualification.local/eleven-up/','qualification.local/eleven-up-bots/');
source=source.replaceAll('port:5186','port:5196').replaceAll('127.0.0.1:5186','127.0.0.1:5196');
source=replace(source,'VALUES($1,$2,$3,$4,100,false)','VALUES($1,$2,$3,$4,100,$5)');
source=replace(source,'[players[i],session,users[i],2-i]','[players[i],session,users[i],2-i,i===1]');
source=replace(source,"value={id:v.dealer_game.id,user:users[1],other:users[0],session,mode:'multi'};","await transaction(users[0],c=>query(c,'SELECT public.advance_ante_phase($1,$2) v',[session,v.dealer_game.id]));\n   value={id:v.dealer_game.id,user:users[0],session,mode:'multi'};");
const entry='dev/eleven-up/bots-preview.generated.mjs';write(entry,source);
const child=spawn(process.execPath,[entry],{stdio:'inherit'});
const cleanup=()=>{try{unlinkSync(entry);}catch{}};
child.on('exit',code=>{cleanup();process.exit(code??0);});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('exit',cleanup);
