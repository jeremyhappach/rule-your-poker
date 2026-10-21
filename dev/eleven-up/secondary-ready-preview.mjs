// Local phone/Resume check using the production view and canonical SQL owner.
import {readFileSync as read,writeFileSync as write,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
let source=read('dev/eleven-up/human-ready-preview.mjs','utf8');
source=source.replace("const entry='dev/eleven-up/human-ready-preview.generated.mjs';write(entry,source);",`
source=source.replace("else if(op==='state')", "else if(op==='resume'){const version=await query(admin,'SELECT pause_version v FROM public.games WHERE id=$1',[q.session]);value=await transaction(q.user,c=>query(c,'SELECT public.set_game_paused($1,false,$2,$3) v',[q.session,q.id,version]));}else if(op==='state')");
const entry='dev/eleven-up/secondary-ready-server.generated.mjs';write(entry,source);`);
const runner='dev/eleven-up/secondary-ready-runner.generated.mjs';write(runner,source);
let client=read('dev/eleven-up/live.tsx','utf8');
client=client.replace("import {ElevenUpGame} from '@/components/elevenUp/ElevenUpGame';",`
import {useElevenUp} from '@/hooks/useElevenUp';
import {ElevenUpView} from '@/components/elevenUp/ElevenUpView';
function ElevenUpGame(p:any){const g=useElevenUp(p.id,p.userId,p.transport);return g.snapshot?<ElevenUpView view={g.snapshot} userId={p.userId} now={g.now} pending={g.pending} error={g.error} epoch={g.epoch} onIntent={g.act} onReconnect={g.reconnect} onResume={async()=>{const f=Object.fromEntries(new URLSearchParams(location.search));const r=await request('resume',f);if(!['resumed','already_set'].includes(r.outcome))throw Error(r.outcome);g.reconnect();}}/>:null;}
`);
const clientPath='dev/eleven-up/secondary-ready-client.generated.tsx',htmlPath='dev/eleven-up/secondary-ready.generated.html';
write(clientPath,client);write(htmlPath,read('dev/eleven-up/live.html','utf8').replace('/dev/eleven-up/live.tsx','/dev/eleven-up/secondary-ready-client.generated.tsx'));
const child=spawn(process.execPath,[runner],{stdio:'inherit'});
const cleanup=()=>{for(const f of [runner,clientPath,htmlPath,'dev/eleven-up/secondary-ready-server.generated.mjs'])try{unlinkSync(f);}catch{}};
child.on('exit',code=>{cleanup();process.exit(code??0);});process.on('SIGINT',()=>child.kill('SIGINT'));process.on('exit',cleanup);
