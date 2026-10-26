import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {MegaArcade} from '@/components/megaCardGolf/MegaArcade';
import {INITIAL_COURSES,type MegaRuleset} from '@/lib/megaCardGolf/config';
import {applyIntent,createRun,projectRun,recoverRun} from '@/lib/megaCardGolf/engine';
import type {AudioManager} from '@/lib/audio/audioManager';
import '@/index.css';
import '@/components/megaCardGolf/megaCardGolf.css';
const params=new URLSearchParams(location.search),ruleset=('mega-card-golf/'+(params.get('version')??4)) as MegaRuleset;
const config={...INITIAL_COURSES[0],holes:2,stockAllowance:Number(params.get('stock')??16),discardAllowance:Number(params.get('discards')??5)};
let run=createRun('local-transition','fixture',config,Array.from({length:2},()=>Array.from({length:52},(_,i)=>i)),Date.now(),ruleset);
if(!params.has('opening')){
 run=ruleset==='mega-card-golf/1'?applyIntent(run,{type:'open',indices:[0,5]},Date.now()):applyIntent(applyIntent(run,{type:'open',indices:[0]},Date.now()),{type:'open',indices:[5]},Date.now());
 run=applyIntent(run,{type:'draw'},Date.now());
}
const changes=new Set<(revision?:number)=>void>(),actions:unknown[]=[],events:unknown[]=[];
const fixture={actions,events,snapshot:()=>projectRun(run,Date.now()),nextHole:()=>{run=applyIntent(run,{type:'stand-pat'},Date.now());run=recoverRun(run,run.deadline);changes.forEach(cb=>cb());}};
Object.assign(window,{megaFixture:fixture});
params.set('run',run.id);history.replaceState(null,'','?'+params);
const request=async(body:any)=>{
 if(body.op==='catalog')return {courses:[config],boards:[],archives:[],active:run.id};
 if(body.op==='state'){
  events.push({at:performance.now(),event:'state-start',revision:run.revision});
  if(params.has('echoes'))await new Promise(resolve=>setTimeout(resolve,400));
  run=recoverRun(run,Date.now());events.push({at:performance.now(),event:'state-end',revision:run.revision});return projectRun(run,Date.now());
 }
 if(body.op==='action'){
  actions.push(body.intent);events.push({at:performance.now(),event:'command-start',intent:body.intent.type,revision:run.revision});await new Promise(resolve=>setTimeout(resolve,200));
  run=applyIntent(run,body.intent,Date.now());const revision=run.revision;
  events.push({at:performance.now(),event:'command-response',intent:body.intent.type,revision});
  if(params.has('echoes'))setTimeout(()=>{events.push({at:performance.now(),event:'realtime-echo',revision});changes.forEach(cb=>cb(revision));},700);
  return projectRun(run,Date.now());
 }
 if(body.op==='leaderboard')return {rows:[],self:null,personalBest:null};
 throw Error('Unsupported local fixture operation');
};
createRoot(document.getElementById('root')!).render(<TooltipProvider><BrowserRouter><MegaArcade request={request as any} userId="fixture" audio={{request:()=>()=>{}} as unknown as AudioManager} subscribe={(_id,cb)=>{changes.add(cb);return()=>{changes.delete(cb);};}}/></BrowserRouter></TooltipProvider>);
