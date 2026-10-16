// Deterministic executable specification for tests/offline previews. Production
// clients never import this module; PostgreSQL owns every live transition.
import {RULES,legalMoves,exposed,adjacent,type State,type Player,type Intent,type Projection} from './model';
export function deal(s:State,deck:number[],now:number):State {
  if(deck.length!==52||new Set(deck).size!==52||deck.some(c=>!Number.isInteger(c)||c<0||c>51))throw Error('deck');
  return {...s,deck:[...deck],removed:[],cursor:29,waste:deck[28],run:0,phase:'ready',deadline:now+RULES.readyMs,event:{label:'Ready',points:0}};
}
export function create(identity:State['identity'],players:Player[],deck:number[],now:number):State {
  if(players.length<2||players.length>7||new Set(players.map(p=>p.id)).size!==players.length)throw Error('players');
  return deal({identity,players,rules:RULES,turnIndex:0,stage:1,phase:'ready',deck:[],removed:[],cursor:29,waste:0,run:0,score:0,deadline:0,scores:{},stages:[],event:{label:'',points:0}},deck,now);
}
export function reduce(prior:State,intent:Intent|{type:'tick'},now:number,nextDeck:()=>number[]):State {
  const s=structuredClone(prior);if(s.phase==='complete')throw Error('complete');
  const player=s.players[s.turnIndex];
  const finishPlayer=()=>{
    s.scores[player.id]=s.score;s.turnIndex++;s.stage=1;s.score=0;
    if(s.turnIndex===s.players.length){s.phase='complete';s.deadline=0;s.event={label:'Competition complete',points:0};return s;}
    return deal(s,nextDeck(),now);
  };
  const finishStage=(reason:string,bonus=0)=>{
    if(s.stages.some(r=>r.playerId===player.id&&r.stage===s.stage))throw Error('stage_already_final');
    const before=s.stages.filter(r=>r.playerId===player.id&&r.stage<s.stage).at(-1)?.score??0;
    s.score+=bonus;
    s.stages.push({id:[s.identity.dealerGameId,s.identity.roundId,player.id,s.stage].join(':'),playerId:player.id,
      stage:s.stage,score:s.score,scoreBefore:before,stageScore:s.score-before,timeBonus:bonus,reason,completedAt:now,
      finishTurn:['timeout','give_up'].includes(reason)||!(s.stage<RULES.stages||s.stage===RULES.stages&&s.score>=RULES.bonusThreshold)});
    s.phase='stage_complete';s.deadline=now+RULES.holdMs;
    s.event={label:reason==='cleared'?'All Three Towers Cleared!':reason==='take_score'?'Score taken':reason==='timeout'?'Time expired':reason==='give_up'?'Turn given up':'Stage complete',points:bonus};
    return s;
  };
  if(s.phase==='stage_complete'){
    if(now<s.deadline){if(intent.type==='tick'||intent.type==='continue')return s;throw Error('phase');}
    const result=s.stages.at(-1);
    if(result?.finishTurn??!(s.stage<RULES.stages||s.stage===RULES.stages&&s.score>=RULES.bonusThreshold))return finishPlayer();
    const next=deal({...s,stage:s.stage+1},nextDeck(),now);
    return {...next,phase:'playing',deadline:now+RULES.stageMs,event:{label:'Stage started',points:0}};
  }
  if(now>=s.deadline)return s.phase==='playing'?finishStage('timeout'):finishPlayer();
  if(intent.type==='give_up')return s.phase==='playing'?finishStage('give_up'):finishPlayer();
  if(intent.type==='tick')return s;
  if(s.phase==='ready'&&intent.type==='start'){s.phase='playing';s.deadline=now+RULES.stageMs;s.event={label:'Stage started',points:0};return s;}
  if(s.phase!=='playing')throw Error('phase');
  if(intent.type==='take_score')return finishStage('take_score');
  if(intent.type==='remove'){
    if(!Number.isInteger(intent.index)||!exposed(s.removed,intent.index)||!adjacent(s.deck[intent.index],s.waste))throw Error('illegal');
    s.removed.push(intent.index);s.waste=s.deck[intent.index];s.run++;
    let points=s.run*RULES.runStep;
    if(intent.index<3)points+=RULES.peakBonuses[s.removed.filter(i=>i<3).length-1];
    s.score+=points;s.event={label:intent.index<3?'Tower cleared':`Run ${s.run}`,points};
  }else if(intent.type==='draw'){
    if(s.cursor>=52)throw Error('stock');s.waste=s.deck[s.cursor++];s.run=0;s.event={label:'Stock drawn',points:0};
  }else throw Error('intent');
  if(s.removed.length===28||s.cursor===52&&!legalMoves(s).length){
    const cleared=s.removed.length===28;
    const bonus=cleared?Math.max(0,Math.floor((s.deadline-now)/1000))*RULES.timePerSecond:0;
    return finishStage(cleared?'cleared':'exhausted',bonus);
  }
  return s;
}
export function project(s:State,viewerId:string|null,revision=0,now=0):Projection {
  const {deck,...visible}=s;return {...structuredClone(visible),cards:deck.slice(0,28).map((c,i)=>exposed(s.removed,i)?c:null),
    stockRemaining:52-s.cursor,activePlayerId:s.phase==='complete'?null:s.players[s.turnIndex].id,viewerId,
    canAct:s.phase!=='complete'&&s.players[s.turnIndex].id===viewerId,revision,serverAt:now,settlement:null,paused:false,finished:false};
}
