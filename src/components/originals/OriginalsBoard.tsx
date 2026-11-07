import {useState,type ReactNode} from 'react';
import {CribLabTable} from '@/components/arcade/SoloCribLab';
import {ChuckyRoundTable} from '@/components/arcade/ChuckyRoundTable';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import type {LabSnapshot,LabCommand} from '@/lib/cribLab/model';
import type {V2Snapshot} from '@/lib/chuckyShowdown/model';
import CribLabRules from '@/components/rules/CribLabRules';
import ChuckyShowdownRules from '@/components/rules/ChuckyShowdownRules';
import './originals.css';

interface Props {
 game:'crib-lab'|'chucky-showdown';
 board:LabSnapshot|V2Snapshot;
 userId:string;
 now:number;
 pending:boolean;
 canAct:boolean;
 live:boolean;
 epoch:number;
 error:string;
 reconnect:()=>void;
 onIntent:(intent:{type:string;items?:number[];level?:number})=>void;
 activeTab:ShellTabId;
 setActiveTab:(tab:ShellTabId)=>void;
 navigation?:ReactNode;
 scores?:ReactNode;
 cue?:LabCommand|null;
 panel?:ReactNode;
 onPresentationDone?:()=>void;
}

/** The game renderers receive presentation and intent callbacks only. */
export function OriginalsBoard(props:Props){
 const {board,userId,now,pending,canAct,live,epoch,error,reconnect,onIntent}=props;
 const lab=props.game==='crib-lab';
 const [choice,setChoice]=useState<{revision:number;at:number;level?:number}|null>(null);
 const common={now,pending,ready:canAct,error,reconnect,bornEnded:false};
 const content=lab?(()=>{
  const v=board as LabSnapshot;
  return <CribLabTable competitive onPresentationDone={props.onPresentationDone} runId={v.id} userId={userId} game={{
   ...common,snapshot:v,liveTransition:live?v.transition?.id??'':'',
   countAfter:live?-Infinity:now,deal:live?v.roundId:'',count:v.result?v.roundId:'',
   cue:live?props.cue??null:null,act:(type,items)=>onIntent({type,items}),
  }}/>;
 })():(()=>{
  const v=board as V2Snapshot;
  return <ChuckyRoundTable competitive onPresentationDone={props.onPresentationDone} v={v} userId={userId} game={{
   ...common,snapshot:v,recoveryEpoch:epoch,silent:!live,
   livePhase:live?v.phase+':'+v.since:'',choice:pending&&choice?.revision===v.revision?choice:null,
   act:(type,level)=>{setChoice({revision:v.revision,at:now,level});onIntent({type,level});},
  }}/>;
 })();
 return <FullscreenGameShell className="originals-competition" title={lab?'Crib Lab':'Chucky Showdown'}
  description={'Round '+board.round+' / 3'} activeTab={props.activeTab} setActiveTab={props.setActiveTab}
  navigation={props.navigation} scores={props.scores} announcement={false}
  panel={props.panel??(lab?<CribLabRules version={board.ruleset} config={{version:'crib-lab/2',durationMs:(board as LabSnapshot).durationMs}}/>:<ChuckyShowdownRules config={(board as V2Snapshot).config}/>)}>
  {content}
 </FullscreenGameShell>;
}
