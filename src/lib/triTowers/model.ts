export const TRI_TOWERS = {id:'tri-towers',label:'TriTowers',presentationMode:'fullscreen',minPlayers:2,maxPlayers:7,publicSelection:false} as const;
/** Unverified arcade details are explicit adaptation choices; see TRITOWERS_RULES.md. */
export const RULES = {version:'ptown-tritowers/1',stages:2,bonusThreshold:80000,maxBonusStages:1,
  runStep:1000,peakBonuses:[5000,10000,15000],stageMs:120000,readyMs:30000,holdMs:5000,timePerSecond:100,wrap:true} as const;
export interface Player {id:string;userId:string;name:string;seat:number;isBot?:boolean}
export type Intent = {type:'start'|'draw'|'continue'|'give_up'|'take_score'} | {type:'remove';index:number};
export interface Command {dealerGameId:string;requestId:string;revision:number;intent:Intent}
export interface Rules {version:string;stages:number;bonusThreshold:number;maxBonusStages:number;runStep?:number;streakAwards?:readonly number[];drawPenalty?:number;peakBonuses:readonly number[];stageMs:number;readyMs:number;holdMs:number;timePerSecond:number;stockPerCard?:number;wrap:boolean}
export const isV2=(rules:Rules)=>rules.version==='tri-towers/2';
export const nextRemovalAward=(rules:Rules,run:number)=>rules.streakAwards?.[Math.min(run,rules.streakAwards.length-1)]??(run+1)*(rules.runStep??0);
export interface StageResult {playerId:string;stage:number;score:number;reason:string;stockBonus?:number;
  id?:string;scoreBefore?:number;stageScore?:number;timeBonus?:number;completedAt?:number;finishTurn?:boolean}
export interface State {
  identity:{sessionId:string;dealerGameId:string;roundId:string};
  players:Player[];rules:Rules;turnIndex:number;stage:number;
  phase:'ready'|'playing'|'stage_complete'|'complete';deck:number[];removed:number[];
  cursor:number;waste:number;run:number;score:number;deadline:number;
  scores:Record<string,number>;stages:StageResult[];event:{label:string;points:number};
}
export interface Projection extends Omit<State,'deck'> {
  financial?:{balances:Record<string,number>;resultId:string|null;batch:import('@/lib/canonicalShell/ChipPresentationLedger').ChipPresentationBatch|null};
  cards:(number|null)[];stockRemaining:number;activePlayerId:string|null;viewerId:string|null;
  canAct:boolean;revision:number;serverAt:number;settlement:Record<string,number>|null;paused:boolean;pausedAt?:number|null;finished:boolean;
}
export const children=(i:number):number[] => i<3?[3+i*2,4+i*2]:i<9?
  [9+Math.floor((i-3)/2)*3+(i-3)%2,10+Math.floor((i-3)/2)*3+(i-3)%2]:i<18?[18+i-9,19+i-9]:[];
export const exposed=(removed:number[],i:number)=>i>=0&&i<28&&!removed.includes(i)&&children(i).every(c=>removed.includes(c));
export const adjacent=(a:number,b:number)=>Math.abs(a%13-b%13)===1||Math.abs(a%13-b%13)===12;
export const legalMoves=(s:Pick<State,'removed'|'waste'|'deck'>)=>Array.from({length:28},(_,i)=>i).filter(i=>exposed(s.removed,i)&&adjacent(s.deck[i],s.waste));
export const cardName=(card:number)=>`${['A','2','3','4','5','6','7','8','9','10','J','Q','K'][card%13]} of ${['spades','hearts','diamonds','clubs'][Math.floor(card/13)]}`;
export const position=(i:number)=>i<3?{x:1.5+3*i,y:0}:i<9?{x:1+3*Math.floor((i-3)/2)+(i-3)%2,y:1}:i<18?{x:.5+i-9,y:2}:{x:i-18,y:3};
