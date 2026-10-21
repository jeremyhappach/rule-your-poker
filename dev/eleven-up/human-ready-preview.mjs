// Reuse actual local SQL/browser transport; only this isolated clone is writable.
import {readFileSync as read,writeFileSync as write,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
let source=read('dev/eleven-up/serve.mjs','utf8');
const replace=(a,b)=>{assert(source.includes(a),a);source=source.replace(a,b);};
replace("from './database.mjs'","from './human-ready-local.mjs'");
source=source.replaceAll('qualification.local/eleven-up/','qualification.local/eleven-up-timeout/').replaceAll('5186','5198');
replace("value={id:v.dealer_game.id,user:users[1],other:users[0],session,mode:'multi'};","await transaction(users[1],c=>query(c,\"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v\",[session,v.dealer_game.id,players[1]]));\n   value={id:v.dealer_game.id,user:users[1],other:users[0],session,mode:'multi'};");
replace("const cmd=q.command;value=await transaction", "const cmd=q.command;if(cmd.intent.type==='reclaim')value=await transaction(q.user,c=>query(c,'SELECT public.eleven_up_reclaim($1,$2) v',[q.id,cmd.revision]));else value=await transaction");
const entry='dev/eleven-up/human-ready-preview.generated.mjs';write(entry,source);
const child=spawn(process.execPath,[entry],{stdio:'inherit'});
const cleanup=()=>{try{unlinkSync(entry);}catch{}};
child.on('exit',code=>{cleanup();process.exit(code??0);});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('exit',cleanup);
