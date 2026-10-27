import type {WordsSnapshot} from './model';
export function wordPresentation(v:WordsSnapshot,now:number){
 const p=v.movePresentation,at=v.paused?v.pausedAt??now:now;
 if(!p||p.version!==1||p.turn!==v.turn-1||at>=p.readyAt||v.finished)return null;
 const move=v.moves.find(m=>m.turn===p.turn&&m.playerId===p.playerId&&m.action==='place');
 return move?{...p,move,at,id:`${v.identity.dealerGameId}:${p.turn}`,opponent:p.playerId!==v.viewerId}:null;
}
export function playedWord(v:WordsSnapshot){
 const p=v.movePresentation,move=p&&v.moves.find(m=>m.turn===p.turn);if(!move)return null;
 const horizontal=p.squares.length<2||p.squares.every(s=>Math.floor(s/15)===Math.floor(p.squares[0]/15));
 return move.words.find(w=>w.direction===(horizontal?0:1))??move.words[0];
}
export function wordSquares(v:WordsSnapshot){
 const move=v.movePresentation&&v.moves.find(m=>m.turn===v.movePresentation!.turn);
 return [...new Set(move?.words.flatMap(w=>typeof w.square==='number'&&typeof w.direction==='number'?[...w.word].map((_,i)=>w.square!+i*(w.direction===1?15:1)):[])??[])];
}
/** A second tap cancels the pending first tap before it can alter the draft. */
export function boardTapGate(single:(square:number)=>void,double:()=>void,delay=300){
 let pending:ReturnType<typeof setTimeout>|undefined,last:{x:number;y:number}|undefined;
 const cancel=()=>{if(pending)clearTimeout(pending);pending=undefined;last=undefined;};
 return {cancel,tap(square:number,x:number,y:number){
  if(pending&&last&&Math.hypot(x-last.x,y-last.y)<=36){cancel();double();return;}
  cancel();last={x,y};pending=setTimeout(()=>{pending=undefined;last=undefined;single(square);},delay);
 }};
}
