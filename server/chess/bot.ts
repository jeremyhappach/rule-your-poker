import {Chess, type PieceSymbol} from 'chess.js';
import {playChess, promotionOptions, type ChessIntent, type ChessState} from '../../src/lib/chess/rules.js';
import {chessBotDifficulty, CHESS_BOT_VERSION} from '../../src/lib/chess/botConfig.js';

type MoveIntent = Extract<ChessIntent, {type:'move'}>;
const values: Record<PieceSymbol, number> = {p:100,n:320,b:335,r:500,q:900,k:0};
const budgets = {easy:{depth:1,nodes:120},medium:{depth:2,nodes:900},expert:{depth:4,nodes:3500}};
const exhausted = Symbol('search budget');

/** The same reducer validates every search branch, including captured-piece revival. */
export function chessBotMoves(state: ChessState): MoveIntent[] {
  const engine = new Chess(state.fen);
  const seen = new Set<string>();
  return engine.moves({verbose:true}).flatMap<MoveIntent>(move => {
    const key = move.from+move.to;
    if (seen.has(key)) return [];
    seen.add(key);
    return move.promotion
      ? promotionOptions(state, engine.turn()).map(option => ({type:'move' as const,from:move.from,to:move.to,promotion:option.piece,reviveId:option.reviveId}))
      : [{type:'move' as const,from:move.from,to:move.to}];
  }).sort((a,b) => {
    const priority = (move:MoveIntent) => (values[engine.get(move.to)?.type ?? 'k']*10) + (move.promotion ? values[move.promotion] : 0) - values[engine.get(move.from)!.type];
    return priority(b)-priority(a) || (a.from+a.to+(a.promotion??'')).localeCompare(b.from+b.to+(b.promotion??''));
  });
}

function evaluate(state:ChessState, actor:string):number {
  if (state.phase==='complete') return state.winnerIds.length===2 ? 0 : state.winnerIds[0]===actor ? 100000 : -100000;
  const color = state.players[0].id===actor ? 'w' : 'b';
  let score=0;
  for (const row of new Chess(state.fen).board()) for (const piece of row) if (piece) {
    const file=piece.square.charCodeAt(0)-97,rank=Number(piece.square[1])-1;
    const center=7-Math.abs(file-3.5)-Math.abs(rank-3.5);
    const positional=piece.type==='p' ? (piece.color==='w'?rank:7-rank)*7 : piece.type==='n'||piece.type==='b' ? center*9 : 0;
    score+=(piece.color===color?1:-1)*(values[piece.type]+positional);
  }
  return score;
}

export function chooseChessBotMove(state:ChessState, at:number) {
  if (state.mode!=='live'||state.phase!=='playing'||!state.players[state.turnIndex].isBot||at>=state.deadline) throw Error('chess:bot_not_due');
  if (state.bot?.version!==CHESS_BOT_VERSION) throw Error('chess:bot_version');
  const difficulty=chessBotDifficulty(state.bot.difficulty),budget=budgets[difficulty];
  const actor=state.players[state.turnIndex].id,moves=chessBotMoves(state);
  if (!moves.length) throw Error('chess:bot_no_move');
  let nodes=0,depthCompleted=0,best=moves[0];
  const stopAt=performance.now()+600;
  const search=(position:ChessState,depth:number,alpha:number,beta:number):number=>{
    if (++nodes>budget.nodes||performance.now()>=stopAt) throw exhausted;
    if (!depth||position.phase==='complete') return evaluate(position,actor);
    const maximize=position.players[position.turnIndex].id===actor;
    let score=maximize?-Infinity:Infinity;
    for (const move of chessBotMoves(position)) {
      const next=playChess(position,position.players[position.turnIndex].id,move,at);
      const value=search(next,depth-1,alpha,beta);
      score=maximize?Math.max(score,value):Math.min(score,value);
      if (maximize) alpha=Math.max(alpha,score); else beta=Math.min(beta,score);
      if (beta<=alpha) break;
    }
    return score;
  };
  // Publish only a completed depth, so a node limit cannot favor partially searched moves.
  for (let depth=1;depth<=budget.depth;depth++) {
    let candidate=best,score=-Infinity;
    try {
      for (const move of [best,...moves.filter(move=>move!==best)]) {
        const value=search(playChess(state,actor,move,at),depth-1,score,Infinity);
        if (value>score) {score=value;candidate=move;}
      }
      best=candidate;depthCompleted=depth;
      if (score>=100000) break;
    } catch(error) {if (error!==exhausted) throw error;break;}
  }
  return {intent:best,nodes:Math.min(nodes,budget.nodes),depth:depthCompleted,difficulty};
}
