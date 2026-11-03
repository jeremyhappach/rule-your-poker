import {useEffect,useRef,useState,type ReactNode} from 'react';
import {MegaCardGolfGame} from './MegaCardGolfGame';
import type {Intent,MegaView} from '@/lib/megaCardGolf/engine';
import {emptyPresentation,presentationFrame,receiveCompetitionPresentation,type MegaPresentation,type MegaFrame} from '@/lib/megaCardGolf/presentation';
import {platformAudio} from '@/lib/audio/platformAudio';
import {megaCue} from '@/lib/megaCardGolf/audio';
import {approvedSound} from '@/lib/audio/approvedSounds';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import './megaCardGolf.css';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';

/** Shared interactive presentation; all transport, turn and money ownership stays outside. */
export function MegaCompetitionBoard({view,userId,now,paused=false,canAct,pending,onIntent,scorecard,navigation,playerName,onPresentationDone,activeTab,setActiveTab,panel}:{view:MegaView;paused?:boolean;userId:string;now:number;canAct:boolean;pending:boolean;onIntent:(intent:Intent)=>void|Promise<unknown>;scorecard?:ReactNode|((frame:MegaFrame)=>ReactNode);navigation?:ReactNode;playerName?:string|((view:MegaView)=>string);onPresentationDone?:()=>void;activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void;panel?:ReactNode}){
 const [timeline,setTimeline]=useState<MegaPresentation>(emptyPresentation),[clock,setClock]=useState(performance.now());
 const command=useRef<{revision:number;intent:Intent}|null>(null),draw=useRef<string|null>(null),done=useRef<string|null>(null);
 const pauseStart=useRef<number|null>(null);
 useEffect(()=>{const at=performance.now();if(paused){pauseStart.current=at;setClock(at);}else if(pauseStart.current!==null){const delta=at-pauseStart.current;pauseStart.current=null;setTimeline(old=>({...old,events:old.events.map(e=>({...e,start:e.start+delta,end:e.end+delta}))}));setClock(at);}},[paused]);
 const boundary=view.id+':'+view.hole;
 useEffect(()=>{
  const at=paused?(pauseStart.current??performance.now()):performance.now(),fresh=command.current?.revision===view.revision-1?command.current.intent:undefined;command.current=null;
  setTimeline(old=>receiveCompetitionPresentation(old,view,at,fresh));setClock(at);
 },[view]);
 const frame=presentationFrame(timeline,clock,typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 const locked=!!frame?.locked;
 useEffect(()=>{if(!locked||paused)return;let id:number;const step=()=>{setClock(performance.now());id=requestAnimationFrame(step);};id=requestAnimationFrame(step);return()=>cancelAnimationFrame(id);},[locked,boundary,paused]);
 useEffect(()=>{if(paused||!frame?.cue?.fresh||document.hidden||!navigator.onLine)return;return platformAudio.request({userId,id:frame.cue.id,expiresAt:performance.now()+megaCue(frame.cue.kind).durationMs+200,cue:megaCue(frame.cue.kind)});},[userId,frame?.cue?.id,paused]);
 const act=(intent:Intent)=>{if(!canAct||pending||locked||document.hidden)return;command.current={revision:view.revision,intent};void onIntent(intent);};
 const autoKey=boundary+':'+view.revision,auto=canAct&&!pending&&!locked&&view.phase==='playing'&&view.pending===null&&view.stockRemaining>0&&now<view.deadline;
 useEffect(()=>{if(!auto||document.hidden||!navigator.onLine||draw.current===autoKey)return;draw.current=autoKey;act({type:'draw'});},[auto,autoKey]);
 useEffect(()=>{if(view.phase==='scoring'&&timeline.latest===view&&!locked&&done.current!==boundary){done.current=boundary;onPresentationDone?.();}},[view,timeline.latest,locked,boundary,onPresentationDone]);
 return <MegaCardGolfGame view={frame?.view??view} presentation={frame??undefined} now={now} busy={pending||!canAct} autoDrawPending={auto} canAbandon={false} onIntent={act} onExit={()=>{}} competitionScorecard={typeof scorecard==='function'&&frame?scorecard(frame):typeof scorecard==='function'?undefined:scorecard} navigation={navigation} playerName={typeof playerName==='function'?playerName(frame?.view??view):playerName} activeTab={activeTab} setActiveTab={setActiveTab} panel={panel}
  onSound={(kind,id,surface)=>platformAudio.present({userId,id:'palette:'+kind+':mega:'+id,cue:isSoundSurfaceVisible(surface)?approvedSound(kind):undefined})}/>;
}
