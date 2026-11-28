import {writeFileSync,readFileSync} from 'node:fs';
import {transition,initial,type Child} from '../../server/delayed/adapter';
import {RUN21_RULES} from '../../src/lib/run21/rulesets';
import {competitionConfig} from '../../src/lib/megaCardGolf/competition';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',child='00000000-0000-4000-8000-000000000003';
const at=Date.now()-20000,templates:any[]=[],configs:any={};
for(const game of ['run21','mega-card-golf'] as const){
 const liveMega=JSON.parse(readFileSync('qualification.local/async-sealed/mega-config.json','utf8'));
 const config=game==='run21'?RUN21_RULES:competitionConfig(liveMega.course,3,liveMega.version);configs[game]=config;
 const states:any={};
 for(let round=1;round<=(game==='run21'?4:3);round++)for(const actor of [a,b]){
  const row:Child={id:child,match_id:'00000000-0000-4000-8000-000000000004',game_type:game,config,starter:a,actor,organizer:a,opponent:b,revision:1,segment:round,terminal:false,sealed:true,available_at:new Date(at).toISOString(),expires_at:new Date(at+72*3600e3).toISOString(),server_at:at+(round-1)*2600,state:null};
  row.state=states[actor]??initial(row);row.state.turn=actor===a?0:1;row.state.round=round;
  for(const intent of game==='run21'?[{type:'start'},{type:'collect'}]:[{type:'start'},{type:'open',indices:[0]},{type:'open',indices:[1]},{type:'stand-pat'}]){
   row.server_at+=game==='run21'?(intent.type==='start'?0:2500):10;const next=await transition(row,intent as any,async()=>{throw Error('Unexpected SQL rule');});row.state=next.state;
   templates.push({game,actor,round,intent,state:next.state,at:next.at,advanced:next.advanced});
  }
  states[actor]=row.state;
 }
}
const q=(v:any)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
writeFileSync('qualification.local/async-sealed/typescript-templates.sql',`CREATE TEMP TABLE sealed_ts_config AS SELECT key game,value config FROM jsonb_each(${q(configs)});\nCREATE TEMP TABLE sealed_ts_commands AS SELECT value data,ordinality seq FROM jsonb_array_elements(${q(templates)}) WITH ORDINALITY;\n`);
console.log('Generated actual shared-core commands:',templates.length);
