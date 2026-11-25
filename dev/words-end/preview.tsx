import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {PtownWordsView} from '@/components/ptownWords/PtownWordsView';
import {WordsEndSequence} from '@/components/ptownWords/WordsEndSequence';
import {finalWordsFixture,viewer,opponent} from '@/lib/delayed/wordsFinalReview.fixture';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import '@/index.css';
const v=finalWordsFixture().snapshot;
v.rackCounts={[viewer]:1,[opponent]:0};
const query=new URLSearchParams(location.search);
if(query.has('four'))for(let i=3;i<=4;i++){const id='player-'+i;v.players.push({id,userId:id,name:'Opponent '+i,seat:i,isBot:false});v.rackCounts[id]=7;v.scores[id]=100;v.preAdjustmentScores![id]=107;}
if(query.has('active')){v.phase='playing';v.finished=false;v.terminal=undefined;v.rackCounts[opponent]=4;}
function App(){const [scores,setScores]=useState(v.preAdjustmentScores),[done,setDone]=useState(false),[tab,setTab]=useState<ShellTabId>('cards');return <div data-shell-presentation-mode="fullscreen" style={{display:'flex'}}><PtownWordsView gameplay={false} view={v} now={v.serverAt} displayScores={scores} terminalContent={v.phase==='complete'&&!done?<WordsEndSequence view={v} mode="async" onScores={setScores} onComplete={()=>setDone(true)}/>:undefined} pending={false} connected error="" activeTab={tab} setActiveTab={setTab} panel={<p>Fixture</p>} sessionEnded={false} onIntent={async()=>false} onReconnect={()=>{}}/></div>;}
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><MemoryRouter><App/></MemoryRouter></ResponsiveGeometryProvider></TooltipProvider>);
