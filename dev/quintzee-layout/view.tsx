import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Link} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {QuintzeeView} from '@/components/quintzee/QuintzeeView';
import {QuintzeeRulesIcon} from '@/components/quintzee/QuintzeeRulesIcon';
import type {QuintzeeSnapshot} from '@/lib/quintzee/model';
import '@/index.css';
import '@/lib/arcade/arcade.css';
import '@/lib/delayed/delayed.css';
const params=new URLSearchParams(location.search),mode=params.get('mode')??'arcade';
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const rules={version:'quintzee/3',durationMs:180000,readyMs:30000,clearBonus:35,upperBonus:35,upperThreshold:63,bonusThreshold:80000,resultMs:4300,introMs:2500,rounds:2,maxRounds:3,speedMin:100,speedRange:200} as const;
const initial:QuintzeeSnapshot={id:'layout',scope:'layout:1',revision:1,theme:params.has('classic')?'classic':'modern',pausedAt:null,status:'active',outcome:'current',serverAt:1000,playerNames:{[actor]:'Hap',[other]:'mcru81'},state:{rules,players:mode==='arcade'?[actor]:[actor,other],scores:{[actor]:0,[other]:0},turnIndex:0,round:1,qualified:[],results:[],finished:false,board:{rules,phase:'playing',deadline:180000,startedAt:0,dice:[5,2,4,1,2],held:[],rollsRemaining:2,rollSerial:0,scores:{},potentials:{chance:14},scoreBefore:0,score:0,result:null}}};
function Fixture(){
 const [tab,setTab]=useState<any>('cards'),[snapshot,setSnapshot]=useState(initial),[pending,setPending]=useState(false);
 Object.assign(window,{snapshot,intents:(window as any).intents??[],setSnapshot,setPending});
 const view=<QuintzeeView snapshot={snapshot} actor={actor} now={1000} pending={pending} error="" onIntent={i=>(window as any).intents.push(i)} onReconnect={()=>{}} activeTab={tab} setActiveTab={setTab} balance={mode==='multiplayer'?()=> <small>100 chips</small>:undefined} navigation={mode==='async'?<nav><button onClick={()=>setTab('lobby')}><QuintzeeRulesIcon/></button><Link to="/delayed/layout">History</Link></nav>:undefined}/>;
 // Preserve the production wrappers, including live table's 44px canonical
 // header row. Only transport/state are fixtures; the game and shell are real.
 return mode==='multiplayer'?<div data-shell-presentation-mode="fullscreen" style={{overflow:'hidden'}}><div style={{display:'grid',gridTemplateRows:'2.75rem minmax(0,1fr)',height:'100%',minHeight:0}}><div data-canonical-shell-header>Hap · Quintzee</div><div style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>{view}</div></div></div>:<div className={'arcade-run '+(mode==='async'?'async-turn quintzee-async-turn':'')} data-shell-presentation-mode="fullscreen">{mode==='async'&&<div className="delayed-turn-nav"><a href="/delayed/layout">$ Hap vs. mcru81</a><span>Real money · 36-hour turns</span></div>}{view}</div>;
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><BrowserRouter><Fixture/></BrowserRouter></ResponsiveGeometryProvider></TooltipProvider>);
