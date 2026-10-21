import type {Rank} from '../cardUtils';
import type {PhysicalCard} from '../cardGames/physicalCard';
import {VERSION,CONTRACT,fixtureDeck,redThree,standard,natural,wild,meldError,openingReport,
  pileStatus,compareCards,canastas,rulesFor,type Meld} from './rules';

export type Seat = {id:string;userId:string|null;kind:'human'|'bot';seat:number};
export type Group = {rank:Rank;ids:string[]};
export type Action = {type:'draw'} | {type:'pickup';qualifiers:string[];opening:Group[]}
  | {type:'meld';groups:Group[]} | {type:'finish';groups:Group[];discard:string|null}
  | {type:'end-exhausted'};
export type Command = {requestId:string;matchId:string;handId:string;turn:number;generation:number;revision:number;playerId:string;action:Action};
export type Hand = {id:string;number:number;dealer:number;stock:PhysicalCard[];pile:PhysicalCard[];
  players:Record<string,{cards:PhysicalCard[];reds:PhysicalCard[];melds:Meld[];opened:boolean;openingScore:number}>;
  active:string;turn:number;phase:'draw'|'meld'|'complete';source:'stock'|'pile'|null;
  openedAtTurnStart:boolean;deadline:number;generation:number;result:null|{scores:Record<string,number>;out:string|null;concealed:boolean}};
export type Match = {version:typeof VERSION;id:string;sessionId:string;stake:number;realMoney:boolean;seats:Seat[];
  revision:number;updatedAt:number;hand:Hand|null;totals:Record<string,number>;
  completed:{id:string;number:number;scores:Record<string,number>}[];winner:string|null;
  receipts:Record<string,{signature:string;revision:number}>;automatic:string[];
  pause:null|{at:number;remaining:number;expired:boolean;episode:number;reason:'manual'|'inactivity'|'recovery'};pauseEpisode:number};
export type Principal = {kind:'human';userId:string}|{kind:'service'};
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
function requireThat(ok:unknown,message:string):asserts ok {if(!ok)throw Error(`canasta:${message}`);}
function tick(m:Match,at:number){requireThat(Number.isSafeInteger(at)&&at>=m.updatedAt,'clock');m.updatedAt=at;}
function advance(m:Match,at:number){tick(m,at);m.revision++;assertConservation(m);return m;}
export function createMatch(input:{id:string;sessionId:string;stake:number;realMoney:boolean;seats:Seat[]},at:number):Match {
  requireThat(uuid(input.id)&&uuid(input.sessionId)&&input.seats.length===2&&new Set(input.seats.map(s=>s.id)).size===2
    &&new Set(input.seats.map(s=>s.seat)).size===2&&input.seats.every(s=>uuid(s.id)&&Number.isInteger(s.seat)&&s.seat>=0
      &&(s.kind==='human'?!!s.userId&&uuid(s.userId):s.kind==='bot'&&s.userId===null))
    &&input.seats.some(s=>s.kind==='human')&&(!input.realMoney||input.seats.every(s=>s.kind==='human'))
    &&new Set(input.seats.filter(s=>s.kind==='human').map(s=>s.userId)).size===input.seats.filter(s=>s.kind==='human').length
    &&Number.isSafeInteger(input.stake)&&input.stake>0&&Number.isSafeInteger(at)&&at>=0,'admission');
  return {...structuredClone(input),version:VERSION,revision:0,updatedAt:at,hand:null,totals:Object.fromEntries(input.seats.map(s=>[s.id,0])),
    completed:[],winner:null,receipts:{},automatic:[],pause:null,pauseEpisode:0};
}
const faceKey=(c:PhysicalCard)=>standard(c)?`${standard(c)!.rank}${standard(c)!.suit}`:'joker';
function validateDeck(cards:PhysicalCard[]){
  const expected=fixtureDeck().map(faceKey).sort();
  requireThat(cards.length===108&&new Set(cards.map(c=>c.id)).size===108&&cards.every(c=>typeof c.id==='string'&&c.id.length>0)
    &&JSON.stringify(cards.map(faceKey).sort())===JSON.stringify(expected),'deck');
}
/** Private server entry: shuffled deck never belongs in a client command. */
export function startHand(input:Match,id:string,deck:PhysicalCard[],at:number):Match {
  rulesFor(input.version);requireThat(uuid(id)&&!input.winner&&!input.pause&&(!input.hand||input.hand.phase==='complete'),'hand_boundary');
  requireThat(!input.completed.some(h=>h.id===id),'hand_identity');validateDeck(deck);
  const m=structuredClone(input),number=m.completed.length+1,dealer=(number-1)%2,stock=structuredClone(deck);
  const players:Hand['players']=Object.fromEntries(m.seats.map(s=>[s.id,{cards:[],reds:[],melds:[],opened:false,openingScore:m.totals[s.id]}]));
  // Deal alternating physical cards, then expose/replace each player's red threes.
  for(let n=0;n<15;n++)for(let offset=1;offset<=2;offset++)players[m.seats[(dealer+offset)%2].id].cards.push(stock.shift()!);
  for(let offset=1;offset<=2;offset++){
    const p=players[m.seats[(dealer+offset)%2].id];p.reds=p.cards.filter(redThree);p.cards=p.cards.filter(c=>!redThree(c));
    while(p.cards.length<15&&stock.length){const c=stock.shift()!;(redThree(c)?p.reds:p.cards).push(c);}
  }
  const initial=rulesFor(m.version).initialPile(stock),active=m.seats[(dealer+1)%2].id;
  m.hand={id,number,dealer,...initial,players,active,turn:1,phase:'draw',source:null,openedAtTurnStart:false,
    deadline:at+CONTRACT.turnMs,generation:1,result:null};
  return advance(m,at);
}
export function assertConservation(m:Match){
  if(!m.hand)return;const h=m.hand;
  validateDeck([...h.stock,...h.pile,...Object.values(h.players).flatMap(p=>[...p.cards,...p.reds,...p.melds.flatMap(g=>g.cards)])]);
}
function groupsFrom(groups:Group[],available:PhysicalCard[]):Meld[]{
  requireThat(Array.isArray(groups)&&groups.length<=13&&new Set(groups.map(g=>g.rank)).size===groups.length,'groups');
  const ids=groups.flatMap(g=>g.ids);requireThat(ids.length===new Set(ids).size,'duplicate_card');
  return groups.map(g=>({rank:g.rank,cards:g.ids.map(id=>{const c=available.find(c=>c.id===id);requireThat(c,'unowned_card');return c;})}));
}
function score(m:Match,out:string|null){
  const h=m.hand!;requireThat(!h.result,'already_scored');
  const concealed=out!==null&&!h.openedAtTurnStart;
  const scores=Object.fromEntries(m.seats.map(s=>{const p=h.players[s.id];return [s.id,rulesFor(m.version).handScore(p.melds,p.cards,p.reds.length,
    s.id===out?(concealed?'concealed':'ordinary'):'none')];}));
  h.result={scores,out,concealed};h.phase='complete';
  for(const s of m.seats)m.totals[s.id]+=scores[s.id];
  m.completed.push({id:h.id,number:h.number,scores});
  const [a,b]=m.seats.map(s=>s.id);
  if(Math.max(m.totals[a],m.totals[b])>=CONTRACT.target&&m.totals[a]!==m.totals[b])m.winner=m.totals[a]>m.totals[b]?a:b;
}
export function mandatoryPickup(m:Match){
  const h=m.hand!,p=h.players[h.active],top=h.pile.at(-1),status=pileStatus(h.pile,p.opened);
  return h.stock.length===0&&!!top&&!status.blocked&&!status.globalFreeze&&!status.personalFreeze
    &&p.melds.some(g=>g.rank===standard(top)?.rank)&&!(p.cards.length===1&&h.pile.length===1);
}
function applyAction(m:Match,action:Action,at:number){
  const h=m.hand!,p=h.players[h.active],rules=rulesFor(m.version);
  requireThat(h.phase!=='complete','hand_complete');
  if(action.type==='draw'){
    requireThat(h.phase==='draw'&&h.stock.length>0,'draw_phase');const draw=rules.stockDraw(h.stock);
    h.stock=draw.stock;p.cards.push(...draw.cards);p.reds.push(...draw.reds);h.source='stock';
    if(draw.endsImmediately)score(m,null);else h.phase='meld';return;
  }
  if(action.type==='end-exhausted'){
    requireThat(h.phase==='draw'&&h.stock.length===0&&!mandatoryPickup(m),'mandatory_pickup');score(m,null);return;
  }
  if(action.type==='pickup'){
    requireThat(h.phase==='draw','draw_phase');const top=h.pile.at(-1);requireThat(top,'empty_pile');
    const opening=groupsFrom(action.opening,[...p.cards,top]);
    const error=rules.pickupError({hand:p.cards,pile:h.pile,opened:p.opened,score:p.openingScore,existing:p.melds,qualifierIds:action.qualifiers,opening});
    requireThat(!error,error??'pickup');
    requireThat(!p.opened||opening.length===0,'unexpected_opening');
    const additions=p.opened?[{rank:standard(top)!.rank,cards:[...action.qualifiers.map(id=>p.cards.find(c=>c.id===id)!),top]}]:opening;
    const next=structuredClone(p.melds);
    for(const g of additions){const old=next.find(x=>x.rank===g.rank);if(old)old.cards.push(...g.cards);else next.push(g);}
    requireThat(next.every(g=>!meldError(g)),'pickup_meld');
    const removed=new Set(additions.flatMap(g=>g.cards.map(c=>c.id))),buried=h.pile.slice(0,-1);
    p.cards=[...p.cards.filter(c=>!removed.has(c.id)),...buried.filter(c=>!redThree(c))];
    p.reds.push(...buried.filter(redThree));p.melds=next;p.opened=true;h.pile=[];h.phase='meld';h.source='pile';
    // Pickup qualification and transfer are one commit. No timeout-completeness veto.
    if(!p.cards.length){requireThat(canastas(p.melds)>=2,'two_canastas');score(m,h.active);}return;
  }
  requireThat(h.phase==='meld','draw_required');
  const drafts=groupsFrom(action.groups,p.cards);
  if(action.type==='meld'){
    const next=structuredClone(p.melds),used=new Set(drafts.flatMap(g=>g.cards.map(c=>c.id)));
    for(const g of drafts){const old=next.find(x=>x.rank===g.rank);if(old)old.cards.push(...g.cards);else next.push(g);}
    requireThat(used.size>0&&used.size<p.cards.length&&next.every(g=>!meldError(g)),'meld_commit');
    if(!p.opened){const report=openingReport(drafts,p.openingScore);requireThat(!report.error&&report.count>=report.required,'opening');}
    p.cards=p.cards.filter(c=>!used.has(c.id));p.melds=next;p.opened=true;return;
  }
  requireThat(action.type==='finish','action');
  const plan=rules.turnPlan({hand:p.cards,existing:p.melds,drafts,discardId:action.discard,opened:p.opened,score:p.openingScore,drawSource:h.source??undefined});
  requireThat(!plan.error,plan.error??'finish');
  const discard=p.cards.find(c=>c.id===action.discard);if(discard)h.pile.push(discard);
  p.cards=plan.remaining;p.melds=plan.melds;if(drafts.length)p.opened=true;
  if(plan.out){score(m,h.active);return;}
  h.active=m.seats.find(s=>s.id!==h.active)!.id;h.turn++;h.phase='draw';h.source=null;
  h.openedAtTurnStart=h.players[h.active].opened;h.deadline=at+CONTRACT.turnMs;h.generation++;
}
export function execute(input:Match,command:Command,principal:Principal,at:number):{state:Match;duplicate:boolean}{
  rulesFor(input.version);const seat=input.seats.find(s=>s.id===command.playerId);
  requireThat(seat&&(principal.kind==='service'||seat.kind==='human'&&seat.userId===principal.userId),'unauthorized');
  requireThat(uuid(command.requestId)&&command.matchId===input.id,'command_identity');
  const signature=JSON.stringify(command),receipt=input.receipts[command.requestId];
  if(receipt){requireThat(receipt.signature===signature,'receipt_conflict');return {state:input,duplicate:true};}
  const h=input.hand;
  requireThat(h&&!input.winner&&!input.pause&&command.handId===h.id&&command.turn===h.turn&&command.generation===h.generation
    &&command.revision===input.revision&&command.playerId===h.active,'stale_command');
  requireThat(at<h.deadline,'deadline');
  const m=structuredClone(input);tick(m,at);applyAction(m,command.action,at);advance(m,at);
  m.receipts[command.requestId]={signature,revision:m.revision};return {state:m,duplicate:false};
}
export function pause(input:Match,at:number,reason:NonNullable<Match['pause']>['reason']):Match{
  if(input.pause||!input.hand||input.hand.phase==='complete'||input.winner)return input;
  const m=structuredClone(input);m.pauseEpisode++;
  m.pause={at,remaining:Math.max(0,m.hand!.deadline-at),expired:at>=m.hand!.deadline,episode:m.pauseEpisode,reason};return advance(m,at);
}
/** Canonical adapter authorizes resume and persists this transition atomically. */
export function resume(input:Match,at:number,episode:number):Match{
  requireThat(input.pause?.episode===episode,'pause_episode');const m=structuredClone(input);
  m.hand!.deadline=at+(m.pause!.expired?CONTRACT.turnMs:m.pause!.remaining);m.hand!.generation++;m.pause=null;return advance(m,at);
}
/** Worker receives canonical active-human IDs. Never calls the strategic bot. */
export function expire(input:Match,at:number,activeHumans:string[]):Match{
  const h=input.hand;if(!h||input.pause||input.winner||h.phase==='complete'||at<h.deadline)return input;
  if(input.realMoney||!input.seats.some(s=>s.kind==='human'&&s.id!==h.active&&activeHumans.includes(s.id)&&!input.automatic.includes(s.id)))
    return pause(input,at,'inactivity');
  const m=structuredClone(input);if(!m.automatic.includes(h.active))m.automatic.push(h.active);
  return mechanicalCompletion(m,at);
}
export function automaticTurn(input:Match,at:number,activeHumans:string[]):Match{
  const h=input.hand;requireThat(h&&input.automatic.includes(h.active)&&!input.pause&&!input.winner&&h.phase!=='complete','automatic_identity');
  if(input.realMoney||!input.seats.some(s=>s.kind==='human'&&s.id!==h.active&&activeHumans.includes(s.id)&&!input.automatic.includes(s.id)))return pause(input,at,'inactivity');
  return mechanicalCompletion(structuredClone(input),at);
}
function mechanicalCompletion(m:Match,at:number):Match{
  if(m.hand!.phase==='draw'){
    if(m.hand!.stock.length)applyAction(m,{type:'draw'},at);
    else if(mandatoryPickup(m))applyAction(m,{type:'pickup',qualifiers:[],opening:[]},at);
    else applyAction(m,{type:'end-exhausted'},at);
  }
  if(m.hand!.phase==='meld'){
    const p=m.hand!.players[m.hand!.active],finish=rulesFor(m.version).mechanicalFinish(p.cards,p.melds);
    if(finish.kind==='pause-recovery')return pause(advance(m,at),at,'recovery');
    applyAction(m,{type:'finish',groups:finish.kind==='meld-out'?[{rank:finish.rank,ids:[finish.cardId]}]:[],discard:finish.kind==='discard'?finish.cardId:null},at);
  }
  return advance(m,at);
}
export function takeControl(input:Match,playerId:string,principal:Principal,at:number){
  requireThat(input.seats.some(s=>s.id===playerId&&s.kind==='human'&&(principal.kind==='service'||s.userId===principal.userId)),'unauthorized');
  const m=structuredClone(input);m.automatic=m.automatic.filter(id=>id!==playerId);return advance(m,at);
}
export function project(m:Match,viewer:string|null){
  requireThat(viewer===null||m.seats.some(s=>s.id===viewer),'viewer');const h=m.hand;
  return structuredClone({version:m.version,id:m.id,sessionId:m.sessionId,stake:m.stake,revision:m.revision,seats:m.seats.map(({userId,...s})=>s),
    totals:m.totals,winner:m.winner,automatic:m.automatic,pause:m.pause,viewer,
    hand:h?{id:h.id,number:h.number,active:h.active,turn:h.turn,generation:h.generation,deadline:h.deadline,phase:h.phase,source:h.source,
      stockCount:h.stock.length,pile:h.pile,result:h.result,players:Object.fromEntries(Object.entries(h.players).map(([id,p])=>[id,
        {cards:id===viewer?p.cards:null,count:p.cards.length,reds:p.reds,melds:p.melds,opened:p.opened,openingScore:p.openingScore}]))}:null});
}
export type Projection=ReturnType<typeof project>;
export function settlementIntent(m:Match){
  if(!m.winner)return null;
  return {key:`canasta:${m.id}`,winner:m.winner,loser:m.seats.find(s=>s.id!==m.winner)!.id,amount:m.stake,scores:m.totals};
}
