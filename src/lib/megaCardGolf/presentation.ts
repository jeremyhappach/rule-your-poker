import {golfPublicValue} from '../golf/scoring';
import {acceptView,type MegaView,type Intent,type HoleResult} from './engine';

export const formatGolfScore=(score:number|null|undefined)=>score==null?'—':score===0?'E':score>0?'+'+score:String(score);
export function scoreSteps(cards:number[]){
 const steps:{indices:number[];points:number;total:number}[]=[];let total=0;
 for(let i=0;i<3;i++){
  if(cards[i]%13===cards[i+3]%13)steps.push({indices:[i,i+3],points:0,total});
  else for(const index of [i,i+3]){total+=golfPublicValue(cards[index]);steps.push({indices:[index],points:golfPublicValue(cards[index]),total});}
 }
 return steps;
}
type Replacement={kind:'replacement';key:string;start:number;end:number;view:MegaView;index:number;oldCard:number;newCard:number};
type Scoring={kind:'scoring';key:string;start:number;end:number;view:MegaView;result:HoleResult};
export type PresentationEvent=Replacement|Scoring;
export interface MegaPresentation {latest:MegaView|null;events:PresentationEvent[]}
export const emptyPresentation=():MegaPresentation=>({latest:null,events:[]});
export function receivePresentation(state:MegaPresentation,next:MegaView,at:number,silent=false,intent?:Intent):MegaPresentation{
 const previous=state.latest,accepted=acceptView(previous,next);
 if(accepted!==next)return state;
 if(silent||!previous||previous.id!==next.id||next.status==='abandoned')return {latest:next,events:[]};
 let events=state.events.filter(e=>e.end>at),start=Math.max(at,events.at(-1)?.end??at);
 // Only the exact committed replacement response establishes the old hidden value.
 // A later/replayed snapshot must never be interpreted as a fresh reveal receipt.
 if(intent?.type==='replace'&&next.revision===previous.revision+1&&next.hole===previous.hole
  &&previous.cards[intent.index]===null&&previous.pending!==null
  &&next.cards[intent.index]===previous.pending&&next.discardTop!==null){
  events.push({kind:'replacement',key:next.id+'/replace/'+next.revision,start,end:start+2200,index:intent.index,
   oldCard:next.discardTop,newCard:previous.pending,view:{...previous,revision:next.revision,pending:null}});
  start+=2200;
 }
 for(const result of next.results.filter(r=>!previous.results.some(p=>p.hole===r.hole))){
  const end=start+result.hidden.length*500+scoreSteps(result.cards).length*900+1400;
  const view:MegaView={...next,hole:result.hole,phase:'scoring',pending:null,cards:result.cards,exposed:Array(6).fill(true),
   score:result.total,results:next.results.filter(r=>r.hole<=result.hole)};
  events.push({kind:'scoring',key:next.id+'/hole/'+result.hole,start,end,view,result});start=end;
 }
 return {latest:next,events};
}
export function presentationFrame(state:MegaPresentation,at:number,reduced=false){
 const event=state.events.find(e=>e.end>at),view=event?.view??state.latest;
 if(!view)return null;
 if(event?.kind==='replacement'){
  const age=Math.max(0,at-event.start),stage=age<1500?'reveal':age<1850?'dissolve':'arrive';
  const cards=[...event.view.cards];cards[event.index]=stage==='arrive'?event.newCard:event.oldCard;
  return {view:{...view,cards},locked:true,replacement:{index:event.index,stage},scoring:null,cue:null};
 }
 if(event?.kind==='scoring'){
  const age=Math.max(0,at-event.start),revealEnd=event.result.hidden.length*500,steps=scoreSteps(event.result.cards);
  const index=Math.floor((age-revealEnd)/900),step=index>=0?steps[Math.min(index,steps.length-1)]:null;
  const finished=index>=steps.length,progress=reduced?1:Math.min(1,Math.max(0,(age-revealEnd-index*900)/500));
  const prior=index>0?steps[Math.min(index-1,steps.length-1)].total:0;
  const tally=finished?event.result.score:step?Math.round(prior+(step.total-prior)*progress):0;
  const cards=view.cards.map((c,i)=>event.result.hidden.indexOf(i)>=Math.floor(age/500)&&age<revealEnd?null:c);
  const fresh=age-revealEnd-index*900<200;
  const cue=index>=0?(finished?index===steps.length?{id:event.key+'/finish',kind:'hole' as const,fresh}:null:{id:event.key+'/step/'+index,kind:'cup' as const,fresh}):null;
  return {view:{...view,cards},locked:true,replacement:null,scoring:{tally,finished,indices:finished?[]:step?.indices??[],points:step?.points??null,revealing:age<revealEnd},cue};
 }
 const result=view.phase==='scoring'?view.results.find(r=>r.hole===view.hole):null;
 return {view,locked:false,replacement:null,scoring:result?{tally:result.score,finished:true,indices:[],points:null,revealing:false}:null,cue:null};
}
export type MegaFrame=NonNullable<ReturnType<typeof presentationFrame>>;
