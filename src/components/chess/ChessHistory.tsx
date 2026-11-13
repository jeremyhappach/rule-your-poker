import {useEffect,useState} from 'react';
import {Chess} from 'chess.js';
import {supabase} from '@/integrations/supabase/client';
import {Sheet,SheetContent,SheetDescription,SheetTitle} from '@/components/ui/sheet';
import type {ChessState} from '@/lib/chess/rules';
import {ChessPiece,pieceNames} from './ChessPiece';
import './chess.css';
export type ChessSavedPosition=Pick<ChessState,'identity'|'fen'|'initialFen'|'players'|'moves'|'winnerIds'|'reason'|'phase'>&{viewerId:string};
type Saved={id:string;sessionId:string;completedAt:number;state:ChessSavedPosition};
export function ChessFinalPosition({view:v}:{view:ChessSavedPosition}){
 let engine:Chess;try{engine=new Chess(v.fen);}catch{return <p role="alert">The saved board is unavailable.</p>;}
 const white=v.players[0].id===v.viewerId,squares=Array.from({length:64},(_,i)=>`${'abcdefgh'[white?i%8:7-i%8]}${white?8-Math.floor(i/8):1+Math.floor(i/8)}`);
 const winner=v.players.find(p=>p.id===v.winnerIds[0]),outcome=v.winnerIds.length===2?'Draw':winner?.id===v.viewerId?'You won':(winner?.name??'Opponent')+' won';
 return <section className="chess-history"><h3>Final position · {v.reason==='checkmate'?'Checkmate':'Game complete'}</h3><p>{outcome} · {v.moves.length} {v.moves.length===1?'move':'moves'}</p><div className="chess-board chess-history-board" role="img" aria-label="Saved final Chess board">{squares.map(square=>{const p=engine.get(square as any);return <div key={square} data-history-square={square} className={'chess-square '+(('abcdefgh'.indexOf(square[0])+Number(square[1]))%2?'light':'dark')} aria-label={square+(p?' '+(p.color==='w'?'White ':'Black ')+pieceNames[p.type]:'')}>{p&&<ChessPiece {...p}/>}</div>;})}</div><p>Saved final board · read only</p><details><summary>Moves</summary><ol>{v.moves.map(m=><li key={m.ply}>{m.ply}. {m.from} → {m.to}{m.capture?' · capture':''}{m.promotion?' · promotion':''}</li>)}</ol></details></section>;
}
export function ChessSavedHistory({mode,matchId,id}:{mode:'live'|'async';matchId?:string;id?:string}){
 const [rows,setRows]=useState<Saved[]|null>(null),[error,setError]=useState(''),[attempt,retry]=useState(0);
 useEffect(()=>{let alive=true;setRows(null);setError('');void (supabase.rpc as any)('chess_history',{p_mode:mode,p_match:matchId??null,p_id:id??null}).then(({data,error}:any)=>{if(!alive)return;if(error||!Array.isArray(data))setError('Saved Chess boards could not be loaded.');else setRows(data);}).catch(()=>{if(alive)setError('Saved Chess boards could not be loaded.');});return()=>{alive=false;};},[mode,matchId,id,attempt]);
 if(error)return <div role="alert"><p>{error}</p><button onClick={()=>retry(n=>n+1)}>Retry</button></div>;
 if(!rows)return <p role="status">Loading saved Chess boards…</p>;
 if(!rows.length)return <p>No completed Chess games to show.</p>;
 return <div className="chess-saved-history">{rows.map((row,i)=><details key={row.id} open={rows.length===1||undefined}><summary>P-Town Chess · {new Date(row.completedAt).toLocaleString()}</summary><ChessFinalPosition view={row.state}/></details>)}{rows.length===50&&<p>Showing the 50 most recent Chess games.</p>}</div>;
}
export function ChessHistoryButton({mode,matchId,id,onOpenChange,label='History'}:{mode:'live'|'async';matchId?:string;id?:string;onOpenChange?:(open:boolean)=>void;label?:string}){
 const [open,setOpen]=useState(false);const change=(value:boolean)=>{setOpen(value);onOpenChange?.(value);};
 return <><button className="chess-history-button" onClick={()=>change(true)}>{label}</button><Sheet open={open} onOpenChange={change}><SheetContent className="fullscreen-game-panel"><SheetTitle>P-Town Chess · History</SheetTitle><SheetDescription>Completed games · saved final positions</SheetDescription><div className="fullscreen-game-panel-body">{open&&<ChessSavedHistory mode={mode} matchId={matchId} id={id}/>}</div></SheetContent></Sheet></>;
}
