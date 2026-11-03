import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {MegaCompetitionBoard} from '@/components/megaCardGolf/MegaCompetitionBoard';
import {MegaCompetitionScorecard} from '@/components/megaCardGolf/MegaCompetitionScorecard';
import {MegaHoleReplay} from '@/components/megaCardGolf/MegaHoleReplay';
import {MegaCompetitionSettings} from '@/components/megaCardGolf/MegaCompetitionConfig';
import {ReviewGate} from '@/components/delayed/ResultReview';
import {supabase} from '@/integrations/supabase/client';
import {competitionConfig} from '@/lib/megaCardGolf/competition';
import {INITIAL_COURSES} from '@/lib/megaCardGolf/config';
import {createRun,applyIntent,projectRun,type Intent} from '@/lib/megaCardGolf/engine';
import '@/index.css';
import '@/lib/arcade/arcade.css';
import '@/lib/delayed/delayed.css';
const params=new URLSearchParams(location.search),holes=Number(params.get('holes')??18),players=[{id:'one',name:'A remarkably long player name'},{id:'two',name:'Jeremy'},{id:'three',name:'Casey'}],cfg=competitionConfig(INITIAL_COURSES[0],holes);
let board=createRun('proof:one','one',cfg.course,Array.from({length:holes},()=>Array.from({length:52},(_,i)=>i)),Date.now(),cfg.version);
const actions:unknown[]=[],saved=()=>{for(const intent of [{type:'open',indices:[0]},{type:'open',indices:[1]},{type:'stand-pat'}] as Intent[])board=applyIntent(board,intent,Date.now());return projectRun(board,Date.now());};
function App(){
 const [view,setView]=useState(()=>params.has('replay')||params.has('gate')?saved():projectRun(board,Date.now())),[config,setConfig]=useState(cfg),[elapsed,setElapsed]=useState(0);
 Object.assign(window,{megaCompetition:{actions,advance:(ms:number)=>setElapsed(ms),snapshot:()=>view,finish:()=>setView(saved())}});
 const results=[{actor:'two',hole:1,score:-2,at:0},{actor:'three',hole:1,score:0,at:0},...view.results.map(r=>({actor:'one',hole:r.hole,score:r.score,at:r.startedAt}))];
 if(params.has('gate')){
  const event={id:'saved-hole',kind:'attempt',actor:'one',actorName:players[0].name,round:1,score:view.score,board:view,receipt:{game:'mega-card-golf',rules:cfg},seen:sessionStorage.getItem('mega-proof-seen')==='yes'};
  supabase.rpc=async(name:string,args:any)=>{actions.push({name,args});if(name==='delayed_reviews')return {data:{events:[{...event,seen:sessionStorage.getItem('mega-proof-seen')==='yes'}],terminal:false,actor:'two',started:false,expiresAt:new Date(Date.now()+36*3600000).toISOString(),serverAt:Date.now()},error:null};if(name==='delayed_review_begin')return {data:{elapsed:100000,seen:event.seen},error:null};if(name==='delayed_review_ack'){sessionStorage.setItem('mega-proof-seen','yes');return {data:null,error:null};}throw Error('Unexpected fixture RPC '+name);};
  const home={id:'match',realMoney:false,players:players.slice(0,2),lineup:[{id:'child',game:'mega-card-golf',pendingResults:{one:event.seen?0:1},holeResults:[],scores:{two:0},config:cfg}]};
  return <TooltipProvider><BrowserRouter><ReviewGate childId="child" matchId="match" userId="two" home={home as any}>{()=> <p>Your playable hole is ready</p>}</ReviewGate></BrowserRouter></TooltipProvider>;
 }
 return <TooltipProvider><BrowserRouter><div className="arcade-run" data-shell-presentation-mode="fullscreen">{params.has('config')&&<MegaCompetitionSettings courses={INITIAL_COURSES} value={config} onChange={setConfig}/>}{params.has('replay')?<MegaHoleReplay view={view} elapsed={elapsed} identity="local-replay" userId="proof" actorName={players[0].name} players={players} results={results}/>:<MegaCompetitionBoard view={view} userId="proof" now={Date.now()} canAct pending={false} onIntent={intent=>{actions.push(intent);board=applyIntent(board,intent,Date.now());setView(projectRun(board,Date.now()));}} scorecard={frame=><MegaCompetitionScorecard course={view.config.name} holes={holes} hole={view.hole} players={players} results={results.filter(r=>r.actor!=='one'||frame.scoring?.finished)}/>} />}</div></BrowserRouter></TooltipProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
