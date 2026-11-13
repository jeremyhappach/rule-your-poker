import {useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {Chess,type Color,type Square,type PieceSymbol} from 'chess.js';
import {promotionOptions,type ChessIntent,type ChessMove} from '@/lib/chess/rules';
import type {ChessSnapshot} from '@/lib/chess/client';
import {ChessPiece,pieceNames} from './ChessPiece';
import {chessSound} from '@/lib/chess/sound';
import {chessMotion,type ChessSound} from '@/lib/chess/presentation';
import {useChessMoveDraft,type ChessMoveIntent} from '@/hooks/useChessMoveDraft';
import './chess.css';
export const CHESS_OPPONENT_HOLD_MS=3000,CHESS_MESSAGE_FADE_MS=200,CHESS_YOUR_TURN_HOLD_MS=2000;
type TurnMessage='opponent'|'fading'|'your-turn'|null;
type Drag={from:Square;x:number;y:number;startX:number;startY:number;moved:boolean};
export function ChessBoard({view:v,pending,onIntent,players,onMovePresentationComplete,returningToLobby=false,announceOpponentMove=false}:{view:ChessSnapshot;pending:boolean;onIntent:(i:ChessIntent,expectedRevision?:number)=>Promise<boolean>;players?:ReactNode;onMovePresentationComplete?:()=>void;returningToLobby?:boolean;announceOpponentMove?:boolean}){
 const ref=useRef<HTMLDivElement>(null),dragRef=useRef<Drag|null>(null),suppressClick=useRef(false);
 const [selected,select]=useState<Square|null>(null),[drag,setDrag]=useState<Drag|null>(null),[rejected,reject]=useState<Square|null>(null),[promotion,setPromotion]=useState<{from:Square;to:Square}|null>(null),[motion,setMotion]=useState<ChessMove|null>(null),[arrived,setArrived]=useState(false),[displayFen,setDisplayFen]=useState(v.fen);
 const [turnMessage,setTurnMessage]=useState<TurnMessage>(null),finishPresentation=useRef<()=>void>(()=>{}),startMotion=useRef<()=>void>(()=>{});
 const white=v.players[0].id===v.viewerId,viewer:Color=white?'w':'b';
 const engine=useMemo(()=>new Chess(v.fen),[v.fen]),display=useMemo(()=>new Chess(displayFen),[displayFen]);
 const available=v.canAct&&v.opened&&!v.paused&&!v.finished&&!pending&&!motion&&!returningToLobby&&!turnMessage&&v.phase==='playing';
 const scope=[v.identity.sessionId,v.identity.dealerGameId,v.identity.roundId,v.viewerId,v.turn,v.fen].join(':');
 const submit=async(intent:ChessMoveIntent,revision:number)=>{try{const ok=await onIntent(intent,revision);if(!ok&&ref.current)rejectMove(intent.to);return ok;}catch{if(ref.current)rejectMove(intent.to);return false;}};
 const draft=useChessMoveDraft(scope,v.revision,available,submit),active=available&&!draft.draft&&!draft.submitting;
 useLayoutEffect(()=>{setPromotion(null);},[scope,v.revision]);
 const squares=useMemo(()=>Array.from({length:64},(_,i)=>`${'abcdefgh'[white?i%8:7-i%8]}${white?8-Math.floor(i/8):1+Math.floor(i/8)}` as Square),[white]);
 const index=(s:Square)=>squares.indexOf(s),position=(s:Square)=>({left:(index(s)%8)*12.5+'%',top:Math.floor(index(s)/8)*12.5+'%'});
 const previous=useRef({key:'',ply:-1}),soundStops=useRef<(()=>void)[]>([]);
 // Commit the pre-move position and announcement before the first visible frame.
 useLayoutEffect(()=>{
  select(null);setPromotion(null);setDrag(null);dragRef.current=null;setArrived(false);setTurnMessage(null);
  const move=v.moves.at(-1),key=`ptown:chess:seen:${v.viewerId}:${v.identity.dealerGameId}`;
  let seen=previous.current.key===key?previous.current.ply:-1;try{seen=Math.max(seen,Number(localStorage.getItem(key)??-1));}catch{/* Memory fallback. */}
  previous.current={key,ply:v.moves.length};try{localStorage.setItem(key,String(v.moves.length));}catch{/* Storage may be unavailable. */}
  if(!move||move.ply<=seen||document.hidden){setMotion(null);setDisplayFen(v.fen);onMovePresentationComplete?.();return;}
  const announce=announceOpponentMove&&move.color!==viewer&&v.phase==='playing';
  const media=matchMedia('(prefers-reduced-motion: reduce)'),timers:ReturnType<typeof setTimeout>[]=[];
  const later=(run:()=>void,ms:number)=>timers.push(setTimeout(run,ms));
  const clear=()=>{timers.forEach(clearTimeout);soundStops.current.forEach(s=>s());soundStops.current=[];};
  let completed=false;
  const finish=()=>{
   if(completed)return;completed=true;setDisplayFen(v.fen);setMotion(null);
   if(announce){setTurnMessage('your-turn');later(()=>{setTurnMessage(null);onMovePresentationComplete?.();},CHESS_YOUR_TURN_HOLD_MS);}
   else onMovePresentationComplete?.();
  };
  finishPresentation.current=finish;
  const start=()=>{setTurnMessage(null);if(media.matches)finish();else setMotion(move);};
  startMotion.current=start;
  setDisplayFen(v.moves.at(-2)?.fen??v.initialFen);setMotion(null);
  if(announce){setTurnMessage('opponent');later(()=>{if(media.matches)start();else setTurnMessage('fading');},CHESS_OPPONENT_HOLD_MS);}
  else start();
  const settle=()=>{
   if(document.hidden){clear();completed=true;setTurnMessage(null);setDisplayFen(v.fen);setMotion(null);onMovePresentationComplete?.();}
   else if(media.matches&&!completed){clear();finish();}
  };
  document.addEventListener('visibilitychange',settle);media.addEventListener('change',settle);
  return()=>{clear();document.removeEventListener('visibilitychange',settle);media.removeEventListener('change',settle);};
 },[v.identity.dealerGameId,v.viewerId,v.moves.length,v.fen,onMovePresentationComplete,announceOpponentMove]);
 useEffect(()=>{if(!rejected)return;const id=setTimeout(()=>reject(null),220);return()=>clearTimeout(id);},[rejected]);
 const rejectMove=(square:Square)=>{reject(square);soundStops.current.push(chessSound(`${v.viewerId}:${v.identity.dealerGameId}:invalid:${crypto.randomUUID()}`,'invalid',ref.current));};
 const attempt=async(from:Square,to:Square)=>{
  if(!active)return false;const moves=engine.moves({square:from,verbose:true}).filter(m=>m.to===to);
  if(!moves.length){rejectMove(to);return false;}
  if(moves.some(m=>m.promotion)){setPromotion({from,to});return true;}
  select(null);return draft.stage({type:'move',from,to});
 };
 const release=(e:React.PointerEvent,cancel=false)=>{const d=dragRef.current;if(!d)return;dragRef.current=null;if(!d.moved){setDrag(null);return;}suppressClick.current=true;setDrag(null);select(null);if(cancel)return;
  const rect=ref.current!.getBoundingClientRect(),col=Math.floor((e.clientX-rect.left)/rect.width*8),row=Math.floor((e.clientY-rect.top)/rect.height*8),target=col>=0&&col<8&&row>=0&&row<8?squares[row*8+col]:undefined;
  if(target&&engine.moves({square:d.from,verbose:true}).some(m=>m.to===target)&&active){void attempt(d.from,target);}else if(active){rejectMove(target??d.from);}
 };
 const moveStyle=(m:ChessMove,from=m.from,to=m.to)=>({...position(from),'--dx':(index(to)%8-index(from)%8)*100+'%','--dy':(Math.floor(index(to)/8)-Math.floor(index(from)/8))*100+'%','--delay':'0ms','--move-duration':`${chessMotion[m.piece==='n'?'hop':'slide']}ms`} as CSSProperties);
 const soundStart=(e:React.AnimationEvent,type:ChessSound)=>{
  if(e.target!==e.currentTarget||!motion)return;
  soundStops.current.push(chessSound(`${v.viewerId}:${v.identity.dealerGameId}:${motion.ply}`,type,ref.current));
 };
 return <div className="chess-artifacts" data-canonical-felt-interaction-layer>{players}<div className="chess-board" ref={ref} role="group" aria-label="Chess board" onPointerMove={e=>{const d=dragRef.current;if(!d)return;const rect=ref.current!.getBoundingClientRect();d.x=(e.clientX-rect.left)/rect.width*100;d.y=(e.clientY-rect.top)/rect.height*100;d.moved||=Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>5;if(d.moved)setDrag({...d});}} onPointerUp={e=>release(e)} onPointerCancel={e=>release(e,true)}>
  {squares.map(square=>{const p=display.get(square),hide=motion&&(motion.from===square||motion.rook?.from===square||motion.capture?.square===square);return <button type="button" key={square} data-square={square} className={'chess-square '+(('abcdefgh'.indexOf(square[0])+Number(square[1]))%2?'light':'dark')} data-drafting={draft.draft?.intent.from===square||undefined} data-dragging={drag?.from===square||undefined} data-selected={selected===square||undefined} data-rejected={rejected===square||undefined} aria-label={square+(p?' '+(p.color==='w'?'White ':'Black ')+pieceNames[p.type]:'')} aria-pressed={selected===square} onPointerDown={e=>{suppressClick.current=false;if(!active||e.button!==0||engine.get(square)?.color!==viewer)return;select(square);e.currentTarget.setPointerCapture(e.pointerId);const d={from:square,x:0,y:0,startX:e.clientX,startY:e.clientY,moved:false};dragRef.current=d;}} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}if(!active)return;if(selected&&selected!==square){void attempt(selected,square);return;}if(engine.get(square)?.color===viewer)select(square);}}>{p&&!hide&&<ChessPiece {...p}/>}</button>;})}
  {drag&&<div className="chess-floating chess-drag-ghost" aria-hidden="true" style={{left:`calc(${drag.x}% - 6.25%)`,top:`calc(${drag.y}% - 6.25%)`}}><ChessPiece color={viewer} type={engine.get(drag.from)?.type??'p'}/></div>}
  {draft.draft&&<div className="chess-floating chess-drag-ghost chess-pending-ghost" aria-hidden="true" style={position(draft.draft.intent.to)}><ChessPiece color={viewer} type={draft.draft.intent.promotion??engine.get(draft.draft.intent.from)?.type??'p'}/></div>}
  {motion&&<div key={`${v.identity.dealerGameId}:${motion.ply}`} className="chess-motion" aria-hidden="true"><div className={'chess-floating chess-slide '+(motion.piece==='n'?'chess-hop':'')} style={moveStyle(motion)} onAnimationStart={e=>soundStart(e,motion.piece==='n'?'hop':'slide')} onAnimationEnd={e=>{if(e.target===e.currentTarget){if(motion.capture)setArrived(true);else{finishPresentation.current();}}}}><ChessPiece color={motion.color} type={motion.piece}/></div>{motion.rook&&<div className="chess-floating chess-slide" style={moveStyle(motion,motion.rook.from,motion.rook.to)}><ChessPiece color={motion.color} type="r"/></div>}{motion.capture&&!arrived&&<div className="chess-floating chess-capture-target" style={position(motion.capture.square)}><ChessPiece color={motion.capture.color} type={motion.capture.piece}/></div>}{motion.capture&&arrived&&<div className="chess-floating chess-poof" data-color={motion.capture.color} style={{...position(motion.capture.square),'--capture-duration':`${chessMotion.poof}ms`} as CSSProperties} onAnimationStart={e=>soundStart(e,'poof')} onAnimationEnd={e=>{if(e.target===e.currentTarget){finishPresentation.current();}}}>
   {Array.from({length:9},(_,i)=>{const col=i%3,row=Math.floor(i/3);return <span className="chess-fragment" key={i} style={{clipPath:`polygon(${col*33.333}% ${row*33.333}%,${(col+1)*33.333}% ${row*33.333}%,${(col+1)*33.333}% ${(row+1)*33.333}%,${col*33.333}% ${(row+1)*33.333}%)`,'--fragment-x':`${(col-1)*24+(i%2?5:-5)}%`,'--fragment-y':`${row*13-8}%`,'--fragment-turn':`${(i%2?1:-1)*(7+i*3)}deg`} as CSSProperties}><ChessPiece color={motion.capture!.color} type={motion.capture!.piece}/></span>;})}
   {Array.from({length:24},(_,i)=><i key={i} style={{'--dust-x':`${Math.cos(i*2.4)*(35+i*1.4)}%`,'--dust-y':`${Math.sin(i*2.4)*32+18}%`,'--dust-delay':`${35+i%5*22}ms`,'--dust-size':`${3+i%3}%`} as CSSProperties}/>)}
  </div>}</div>}
 {turnMessage&&<div className="chess-lobby-return chess-turn-message" data-stage={turnMessage} onAnimationEnd={e=>{if(e.target===e.currentTarget&&turnMessage==='fading')startMotion.current();}} style={{'--message-fade-duration':`${CHESS_MESSAGE_FADE_MS}ms`} as CSSProperties} role="status" aria-live="polite"><div>{turnMessage==='your-turn'?'Your Turn':"Opponent's Move..."}</div></div>}
 {returningToLobby&&<div className="chess-lobby-return" role="status" aria-live="polite"><div>Returning to lobby</div></div>}
 </div>
 {draft.draft&&<button className="chess-undo" onClick={draft.cancel} aria-label="Undo pending move"><span>Undo</span><span className="chess-undo-count" aria-hidden="true">{draft.seconds}s</span></button>}
 {promotion&&<div className="chess-tray" role="dialog" aria-label="Choose revival or promotion">{promotionOptions(v,viewer).map((p,i)=><button key={p.reviveId??i} aria-label={(p.reviveId?'Revive ':'Promote to ')+pieceNames[p.piece]} disabled={!active} onClick={()=>{if(draft.stage({type:'move',...promotion,promotion:p.piece,reviveId:p.reviveId})){setPromotion(null);select(null);}}}><ChessPiece color={viewer} type={p.piece}/></button>)}<button aria-label="Close promotion choices" onClick={()=>setPromotion(null)}>×</button></div>}

 </div>;
}
