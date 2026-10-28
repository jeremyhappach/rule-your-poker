import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {MegaCardGolfGame} from '@/components/megaCardGolf/MegaCardGolfGame';
import {INITIAL_COURSES,MEGA_ANYTIME_STAND_PAT_RULESET} from '@/lib/megaCardGolf/config';
import {applyIntent,createRun,projectRun,type Intent} from '@/lib/megaCardGolf/engine';
import {emptyPresentation,receivePresentation,presentationFrame} from '@/lib/megaCardGolf/presentation';
import '@/index.css';
import '@/components/megaCardGolf/megaCardGolf.css';
import '../rank-spacing/preview.css';
const params=new URLSearchParams(location.search),at=Date.now();
const config={...INITIAL_COURSES[0],holes:1,discardAllowance:Number(params.get('discards')??0),stockAllowance:Number(params.get('stock')??3)};
const first=[9,23,37,51,0,14,22],deck=[...first,...Array.from({length:52},(_,i)=>i).filter(i=>!first.includes(i))];
let initial=createRun('local-anytime','fixture',config,[deck],at,MEGA_ANYTIME_STAND_PAT_RULESET);
if(!params.has('opening')){
 initial=applyIntent(applyIntent(initial,{type:'open',indices:[0]},at+1),{type:'open',indices:[1]},at+2);
 if(!params.has('noPending'))initial=applyIntent(initial,{type:'draw'},at+3);
}
function Preview(){
 const [run,setRun]=useState(initial),[clock,setClock]=useState(performance.now());
 const [queue,setQueue]=useState(()=>receivePresentation(emptyPresentation(),projectRun(initial,at+3),performance.now()));
 useEffect(()=>{const id=setInterval(()=>setClock(performance.now()),40);return()=>clearInterval(id);},[]);
 const act=(intent:Intent)=>{const next=applyIntent(run,intent,Date.now());setRun(next);setQueue(q=>receivePresentation(q,projectRun(next,Date.now()),performance.now(),false,intent));};
 const frame=presentationFrame(queue,clock)!;
 return <div className="mega-app" data-screen="game"><MegaCardGolfGame view={frame.view} presentation={frame} now={Date.now()} busy={false} onIntent={act} onExit={()=>{}}/><output hidden data-testid="authority">{JSON.stringify({cards:run.cards,results:run.results,discards:run.discards,draws:run.draws,status:run.status,revision:run.revision,pending:run.pending})}</output></div>;
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><BrowserRouter><Preview/></BrowserRouter></TooltipProvider>);
