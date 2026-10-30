import {NotificationProvider,NotificationBell} from '@/components/delayed/NotificationBell';
import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,Link} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import Delayed from '@/pages/Delayed';
import {QuintzeeView} from '@/components/quintzee/QuintzeeView';
import {QUINTZEE_CATEGORIES} from '@/lib/quintzee/model';
import '@/index.css';
import '@/lib/delayed/delayed.css';
import './live-preview.css';
const query=new URLSearchParams(location.search);
function Preset(){useEffect(()=>{const level=Number(query.get('zoom')??0);if(!level)return;const observer=new MutationObserver(()=>{const cell=document.querySelector<HTMLElement>('[data-square="112"]');if(cell){observer.disconnect();cell.click();if(level===2)setTimeout(()=>cell.click(),50);}});observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();},[]);return null;}
function QuintzeePreview(){
 const [now,setNow]=useState(Date.now()),[start]=useState(Date.now());useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),50);return()=>clearInterval(t);},[]);
 const mode=query.get('bonus')??'both',upper=mode==='both'||mode==='upper'?35:0,fill=mode==='both'||mode==='fill'?35:0;
 const reason=fill?'all_categories':'timeout',complete=now-start>=1500,completedAt=start+1500;
 const scores=Object.fromEntries(QUINTZEE_CATEGORIES.map((c,i)=>[c,i<6?(upper?i*3+4:1):10]));if(!complete||!fill)delete scores.chance;
 const rules={version:'quintzee/3',durationMs:180000,clearBonus:35,upperBonus:35,upperThreshold:63,resultMs:4300,rounds:2,maxRounds:3};
 const subtotal=100+upper+fill,result={reason,categorySubtotal:100,upperSubtotal:upper?69:6,upperBonus:upper,clearBonus:fill,rawSubtotal:subtotal,multiplier:100,remainingMs:0,stageScore:subtotal*100,scoreBefore:0,score:subtotal*100,completedAt};
 const replay=query.has('replay');
 return <div className="arcade-run async-turn" data-shell-presentation-mode="fullscreen"><QuintzeeView replay={replay} actor={replay?'b':'a'} userId={replay?'b':'a'} now={now} pending={false} error="" onIntent={()=>{}} onReconnect={()=>{}} snapshot={{id:'fixture',scope:'fixture:'+mode,revision:complete?2:1,theme:'modern',pausedAt:null,status:'active',outcome:'current',serverAt:now,playerNames:{a:'Alex',b:'Blair'},state:{rules,players:replay?['a','b']:['a'],scores:{a:complete?result.score:0,b:0},turnIndex:0,round:1,qualified:[],results:[],finished:false,board:{rules,phase:complete?'stage_complete':'playing',deadline:complete?completedAt+4300:start+180000,dice:[1,2,3,4,5],held:[],rollsRemaining:1,rollSerial:0,scores,potentials:{chance:15},scoreBefore:0,score:complete?result.score:0,result:complete?result:null}}} as any}/></div>;
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><BrowserRouter><NotificationProvider><Preset/><Routes><Route path="/scenarios/bell" element={<main className="preview-secondary"><h1>Notification visibility check</h1><p>Secondary test screen. This is not the main P-Town Poker lobby.</p><div className="preview-bell-row"><NotificationBell/><span>The bell is visible here and hidden after entering the async match.</span></div><nav><Link to="/delayed/match">Enter async match</Link><a href="/">Return to Words preview</a><a href="/scenarios">Other preview scenarios</a></nav></main>}/><Route path="/delayed" element={<Delayed/>}/><Route path="/delayed/:matchId" element={<Delayed/>}/><Route path="/delayed/:matchId/play/:childId" element={<Delayed/>}/><Route path="/quintzee" element={<QuintzeePreview/>}/></Routes></NotificationProvider></BrowserRouter></ResponsiveGeometryProvider></TooltipProvider>);
