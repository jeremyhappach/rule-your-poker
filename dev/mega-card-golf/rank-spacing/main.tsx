import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {MegaCard,MegaCardGolfGame} from '@/components/megaCardGolf/MegaCardGolfGame';
import {PlayingCard} from '@/components/PlayingCard';
import {INITIAL_COURSES,MEGA_STAND_PAT_RULESET} from '@/lib/megaCardGolf/config';
import {createRun,projectRun} from '@/lib/megaCardGolf/engine';
import type {MegaFrame} from '@/lib/megaCardGolf/presentation';
import '@/index.css';
import '@/components/megaCardGolf/megaCardGolf.css';
import './preview.css';

const params=new URLSearchParams(location.search),before=params.has('before');
document.documentElement.dataset.comparison=before?'before':'after';
const at=Date.now(),config=INITIAL_COURSES[0];
const run=createRun('local-type-preview','fixture',config,Array.from({length:config.holes},()=>Array.from({length:52},(_,i)=>i)),at,MEGA_STAND_PAT_RULESET);
// Static presentation fixture, never submitted to an authority or transport.
const view={...projectRun(run,at),phase:'playing' as const,cards:[9,23,37,51,0,14],exposed:Array(6).fill(true),pending:22};
function Preview(){
 if(params.has('game'))return <div className="mega-app" data-screen="game"><MegaCardGolfGame view={view} presentation={params.has('arrive')?{replacement:{index:0,stage:'arrive'}} as MegaFrame:undefined} now={at} busy={false} onIntent={()=>{}} onExit={()=>{}}/></div>;
 return <main className="type-preview">
  <header><h1>Mega large card faces · {before?'Before':'After'}</h1><p>Local visual fixture. All 52 cards, unchanged 5:7 containers.</p>
   <nav><a href="?before">Before</a><a href="?">After</a><a href="?game&before">Before board + stock</a><a href="?game">After board + stock</a></nav></header>
  <section className="type-grid" aria-label="All ranks and suits">{Array.from({length:52},(_,card)=><div className="type-slot" key={card}><MegaCard card={card} label="Face" disabled/></div>)}</section>
  <h2>Shared faces — must remain unchanged</h2><section className="shared-faces">{(['small','medium','large'] as const).map(tier=><div key={tier}><p>{tier}</p><PlayingCard card={{rank:'10',suit:'♥'}} frontStyle="megatouch" tier={tier}/></div>)}</section>
 </main>;
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><BrowserRouter><Preview/></BrowserRouter></TooltipProvider>);
