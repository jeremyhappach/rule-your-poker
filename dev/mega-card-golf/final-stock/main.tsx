import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {MegaCardGolfGame} from '@/components/megaCardGolf/MegaCardGolfGame';
import {INITIAL_COURSES,MEGA_STAND_PAT_RULESET} from '@/lib/megaCardGolf/config';
import {applyIntent,createRun,projectRun,type Intent} from '@/lib/megaCardGolf/engine';
import {emptyPresentation,receivePresentation,presentationFrame} from '@/lib/megaCardGolf/presentation';
import '@/index.css';
import '@/components/megaCardGolf/megaCardGolf.css';
import '../preview.css';
const params=new URLSearchParams(location.search),at=Date.now();
const config={...INITIAL_COURSES[0],holes:1,initialExposed:0,discardAllowance:Number(params.get('discards')??0),stockAllowance:params.has('nonfinal')?2:1};
const deck=[0,1,2,3,4,5,11,...Array.from({length:52},(_,i)=>i).filter(i=>i>5&&i!==11)];
const initial=applyIntent(createRun('local-stand-pat','fixture',config,[deck],at,MEGA_STAND_PAT_RULESET),{type:'draw'},at+1);
function Preview(){
 const [run,setRun]=useState(initial),[clock,setClock]=useState(performance.now());
 const [queue,setQueue]=useState(()=>receivePresentation(emptyPresentation(),projectRun(initial,at+1),performance.now()));
 useEffect(()=>{const id=setInterval(()=>setClock(performance.now()),40);return()=>clearInterval(id);},[]);
 const act=(intent:Intent)=>{const next=applyIntent(run,intent,Date.now());setRun(next);setQueue(q=>receivePresentation(q,projectRun(next,Date.now()),performance.now(),false,intent));};
 const frame=presentationFrame(queue,clock)!;
 return <div className="mega-app" data-screen="game"><MegaCardGolfGame view={frame.view} presentation={frame} now={Date.now()} busy={false} onIntent={act} onExit={()=>{}}/><output hidden data-testid="authority">{JSON.stringify({cards:run.cards,results:run.results,discards:run.discards,status:run.status})}</output></div>;
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><BrowserRouter><Preview/></BrowserRouter></TooltipProvider>);
