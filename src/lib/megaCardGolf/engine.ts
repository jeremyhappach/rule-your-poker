import {golfVisibleSubtotal} from '../golf/scoring.js';
import {MEGA_RULESET,MEGA_SEQUENTIAL_RULESET,MEGA_STAND_PAT_RULESET,usesSequentialOpening,type MegaRuleset,type CourseConfig} from './config.js';
export type Intent={type:'draw'|'discard'|'stand-pat'|'abandon'}|{type:'replace';index:number}|{type:'open';indices:number[]};
export interface HoleResult {hole:number;cards:number[];score:number;total:number;reason:'exposed'|'stock'|'timeout';hidden:number[];startedAt:number;endsAt:number}
export interface MegaRun {
 id:string;owner:string;ruleset:MegaRuleset;config:CourseConfig;revision:number;
 status:'active'|'completed'|'abandoned';phase:'opening'|'playing'|'scoring';hole:number;cards:number[];exposed:boolean[];
 decks:number[][];draws:number;discards:number;pending:number|null;discardTop:number|null;
 deadline:number;results:HoleResult[];score:number;completedAt:number|null;
}
export interface MegaView extends Omit<MegaRun,'decks'|'owner'|'cards'> {cards:(number|null)[];serverAt:number;dueAt:number|null;stockRemaining:number;discardsRemaining:number}
function deal(s:MegaRun,at:number){
 s.cards=s.decks[s.hole-1].slice(0,6);s.exposed=Array(6).fill(false);
 s.draws=0;s.discards=0;s.pending=null;s.discardTop=null;s.phase=s.config.initialExposed?'opening':'playing';s.deadline=at+s.config.completionSeconds*1000;
}
export function createRun(id:string,owner:string,config:CourseConfig,decks:number[][],at:number,ruleset:MegaRuleset=MEGA_RULESET):MegaRun {
 if(ruleset!==MEGA_RULESET&&ruleset!==MEGA_SEQUENTIAL_RULESET&&ruleset!==MEGA_STAND_PAT_RULESET)throw Error('Unsupported Mega ruleset');
 if(decks.length!==config.holes||decks.some(d=>d.length!==52||new Set(d).size!==52||d.some(c=>!Number.isInteger(c)||c<0||c>51)))throw Error('Invalid private decks');
 const s:MegaRun={id,owner,ruleset,config:structuredClone(config),revision:0,status:'active',phase:'playing',hole:1,cards:[],exposed:[],decks:structuredClone(decks),draws:0,discards:0,pending:null,discardTop:null,deadline:0,results:[],score:0,completedAt:null};
 deal(s,at);return s;
}
function closeHole(s:MegaRun,at:number,reason:HoleResult['reason']){
 const hidden=s.exposed.flatMap((shown,i)=>shown?[]:[i]);
 const score=golfVisibleSubtotal(s.cards);s.score+=score;s.exposed.fill(true);
 // On expiry the unresolved draw never replaces a tableau card by itself.
 if(s.pending!==null)s.discardTop=s.pending;s.pending=null;
 const endsAt=at+hidden.length*650+4300;
 s.results.push({hole:s.hole,cards:[...s.cards],score,total:s.score,reason,hidden,startedAt:at,endsAt});
 s.phase='scoring';s.deadline=endsAt;
 if(s.hole===s.config.holes){s.status='completed';s.completedAt=at;}
}
/** Pure server reducer: catches up from saved boundaries, including zero-client/zero-draw holes. */
export function recoverRun(input:MegaRun,at:number):MegaRun {
 const s=structuredClone(input);
 while(s.status==='active'&&at>=s.deadline){
  const boundary=s.deadline;
  if(s.phase==='playing'||s.phase==='opening')closeHole(s,boundary,'timeout');
  else {s.hole++;deal(s,boundary);}
  s.revision++;
 }
 return s;
}
/** Shared eligibility; the existing server recovery/commit boundary still owns expiry. */
export function canStandPat(s:Pick<MegaRun,'ruleset'|'status'|'phase'|'pending'|'draws'|'config'>){
 return s.ruleset===MEGA_STAND_PAT_RULESET&&s.status==='active'&&s.phase==='playing'&&s.pending!==null&&s.draws===s.config.stockAllowance;
}
export function applyIntent(input:MegaRun,intent:Intent,at:number):MegaRun {
 const s=recoverRun(input,at);
 if(s.revision!==input.revision)throw Error('The hole changed. Reconnect to continue.');
 if(s.status!=='active')throw Error('This run has ended');
 if(intent.type==='abandon'){s.status='abandoned';s.pending=null;s.revision++;return s;}
 if(s.phase==='opening'){
  const sequential=usesSequentialOpening(s.ruleset),required=sequential?1:s.config.initialExposed;
  if(intent.type!=='open'||!Array.isArray(intent.indices)||intent.indices.length!==required||new Set(intent.indices).size!==intent.indices.length||intent.indices.some(i=>!Number.isInteger(i)||i<0||i>5||s.exposed[i]))throw Error('Choose the required opening cards');
  intent.indices.forEach(i=>{s.exposed[i]=true;});
  if(s.exposed.filter(Boolean).length===s.config.initialExposed)s.phase='playing';
  s.revision++;return s;
 }
 if(s.phase!=='playing')throw Error('The hole is scoring');
 switch(intent.type){
  case 'draw':
   if(s.pending!==null||s.draws>=s.config.stockAllowance)throw Error('Finish the current draw');
   s.pending=s.decks[s.hole-1][6+s.draws];s.draws++;break;
  case 'stand-pat':
   if(!canStandPat(s))throw Error('Stand Pat requires the final pending stock card');
   s.discardTop=s.pending;s.pending=null;break;
  case 'discard':
   if(s.pending===null||s.discards>=s.config.discardAllowance)throw Error('No immediate discard available');
   s.discardTop=s.pending;s.pending=null;s.discards++;break;
  case 'replace':
   if(s.pending===null||!Number.isInteger(intent.index)||intent.index<0||intent.index>5)throw Error('Choose a card to replace');
   s.discardTop=s.cards[intent.index];s.cards[intent.index]=s.pending;s.pending=null;s.exposed[intent.index]=true;break;
  default:throw Error('Invalid action');
 }
 // Owner choice: finish the last draw before closing. No low-stock forced reveal.
 if(s.pending===null){if(s.exposed.every(Boolean))closeHole(s,at,'exposed');else if(s.draws===s.config.stockAllowance)closeHole(s,at,'stock');}
 s.revision++;return s;
}
export function projectRun(s:MegaRun,at:number):MegaView {
 const {decks:_,owner:__,...publicState}=structuredClone(s);
 return {...publicState,cards:s.cards.map((c,i)=>s.exposed[i]?c:null),serverAt:at,dueAt:s.status==='active'?s.deadline:s.status==='completed'?s.deadline:null,stockRemaining:s.config.stockAllowance-s.draws,discardsRemaining:s.config.discardAllowance-s.discards};
}
export function acceptView(previous:MegaView|null,next:MegaView){
 if(!previous||previous.id!==next.id)return next;
 if(next.revision<previous.revision)return previous;
 const semantic=(v:MegaView)=>JSON.stringify({...v,serverAt:0});
 if(next.revision===previous.revision&&semantic(previous)!==semantic(next))throw Error('Conflicting run snapshot');
 return next;
}
