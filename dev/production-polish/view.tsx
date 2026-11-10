import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {QuintzeeView} from '@/components/quintzee/QuintzeeView';
import type {QuintzeeSnapshot} from '@/lib/quintzee/model';
import {Run21FullscreenActions} from '@/components/run21/Run21PlayerPane';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import {DEFAULT_CONFIG,type BoardProjection} from '@/lib/run21/model';
import '@/components/run21/run21.css';
import '@/index.css';
import '@/lib/arcade/arcade.css';
import '@/lib/delayed/delayed.css';
const mode=new URLSearchParams(location.search).get('mode')??'arcade';
const parameters=new URLSearchParams(location.search);
const runView:BoardProjection={config:DEFAULT_CONFIG,roundId:'round',roundNumber:1,viewerId:'a',players:[{id:'a',name:'Alex'}],active_player_id:'a',revealed:false,cumulative:{a:0},boards:{a:{playerId:'a',columns:[[],[],[],[],[]],passesUsed:0,presented:[],current:{rank:'A',suit:'clubs'},cardIndex:0,revision:0,startedAt:0,deadline:250000,result:null}},...(parameters.has('paused')?{pausedAt:125000}:{})};
function RunFixture(){return <div className="arcade-run" data-shell-presentation-mode="fullscreen"><FullscreenGameShell title="Run21" description="Round 1" activeTab="cards" setActiveTab={()=>{}} panel={null} actions={<div className="run21-fullscreen-footer"><Run21FullscreenActions view={runView} now={Number(parameters.get('now')??0)}/></div>}><div/></FullscreenGameShell></div>;}
const rules={version:'quintzee/3',durationMs:180000,readyMs:30000,clearBonus:35,upperBonus:35,upperThreshold:63,bonusThreshold:80000,resultMs:4300,introMs:2500,rounds:2,maxRounds:3,speedMin:100,speedRange:200} as const;
const snapshot:QuintzeeSnapshot={id:'layout',scope:'layout:1',revision:1,theme:'modern',pausedAt:null,status:'active',outcome:'current',serverAt:1000,playerNames:{a:'Alex',b:'Blair'},state:{rules,players:mode==='arcade'?['a']:['a','b'],scores:{a:0,b:0},turnIndex:0,round:1,qualified:[],results:[],finished:false,board:{rules,phase:'playing',deadline:180000,startedAt:0,dice:[5,3,5,4,5],held:[],rollsRemaining:2,rollSerial:0,scores:{fives:5},potentials:{chance:22},scoreBefore:0,score:5,result:null}}};
function Fixture(){const [tab,setTab]=useState<any>('cards');return <div className={'arcade-run '+(mode==='async'?'async-turn quintzee-async-turn':'')} data-shell-presentation-mode="fullscreen">{mode==='async'&&<div className="delayed-turn-nav"><a href="/delayed/fixture">Alex vs. Blair</a><span>Real money · 36-hour turns</span></div>}<QuintzeeView snapshot={snapshot} actor="a" now={1000} pending={false} error="" onIntent={intent=>{(window as any).intents.push(intent);}} onReconnect={()=>{}} activeTab={tab} setActiveTab={setTab}/></div>;}
(window as any).intents=[];
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><BrowserRouter>{parameters.get('game')==='run21'?<RunFixture/>:<Fixture/>}</BrowserRouter></ResponsiveGeometryProvider></TooltipProvider>);
