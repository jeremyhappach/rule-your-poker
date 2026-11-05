import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {DelayedTurn} from '@/components/delayed/DelayedTurn';
import {SoloTriTowers} from '@/components/arcade/SoloTriTowers';
import {platformAudio} from '@/lib/audio/platformAudio';
import {preloadApprovedSounds} from '@/lib/audio/approvedSounds';
import {grantTriStart} from '@/lib/triTowers/roundTimeline';
import {audioTrace} from '@/lib/audio/audioTrace';
import {AudioDiagnostics} from '@/components/AudioDiagnostics';
import {QuintzeeView} from '@/components/quintzee/QuintzeeView';
import '@/index.css';
const p=(window as any).proof;
(window as any).manager=platformAudio;
(window as any).trace=audioTrace;
if(new URLSearchParams(location.search).get('trace')==='1')audioTrace.start();
for(const name of ['follow','present','request'] as const){const original=platformAudio[name].bind(platformAudio);(platformAudio as any)[name]=(e:any,...args:any[])=>{p.events.push({method:name,id:e.id,at:performance.now()});return original(e,...args);};}
platformAudio.install();platformAudio.setUser('me');
void preloadApprovedSounds();
const mode=new URLSearchParams(location.search).get('mode'),arcade=mode==='arcade';
if(arcade)grantTriStart('child');
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><BrowserRouter><Routes>
 <Route path="/turn" element={mode==='quintzee'?<QuintFixture/>:arcade?<SoloTriTowers runId="child" userId="me"/>:<DelayedTurn childId="child" matchId="match" userId="me"/>}/>
 <Route path="/diagnostics" element={<AudioDiagnostics onClose={()=>{}}/>}/>
 <Route path="/delayed/match" element={<h1>Match destination</h1>}/>
</Routes></BrowserRouter></ResponsiveGeometryProvider></TooltipProvider>);
function QuintFixture(){
 const [scope,setScope]=useState('round');(window as any).resetDice=()=>setScope('next');
 const rules={version:'quintzee/3',durationMs:180000,resultMs:5000,clearBonus:35,upperThreshold:63,upperBonus:35,bonusThreshold:80000,rounds:2,maxRounds:3,introMs:2500,speedMin:100,speedRange:200};
 const snapshot:any={id:'q',scope,revision:1,theme:'modern',pausedAt:null,status:'active',outcome:'current',serverAt:Date.now(),state:{rules,players:['me'],scores:{me:0},round:1,turnIndex:0,qualified:[],results:[],finished:false,board:{rules,phase:'playing',deadline:Date.now()+180000,dice:[2,2,3,4,5],held:[],rollsRemaining:2,rollSerial:1,scores:{},potentials:{},scoreBefore:0,score:0,result:null}}};
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen"><QuintzeeView snapshot={snapshot} actor="me" now={Date.now()} pending={false} error="" onIntent={()=>{}} onReconnect={()=>{}}/></div>;
}
