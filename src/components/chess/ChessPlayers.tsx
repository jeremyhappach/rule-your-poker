import {useId,useState,type ReactNode} from 'react';
import {Archive,X} from 'lucide-react';
import type {Color} from 'chess.js';
import type {ChessSnapshot} from '@/lib/chess/client';
import {ChessPiece,pieceNames} from './ChessPiece';
/** Captured inventory is indexed by the victim's color, not the captor's color. */
export function ChessPlayers({view:v,balance}:{view:ChessSnapshot;balance?:(id:string)=>ReactNode}){
 const [open,setOpen]=useState<string|null>(null),id=useId();
 return <div className="chess-players">{[...v.players].sort((a,b)=>Number(b.id===v.viewerId)-Number(a.id===v.viewerId)).map(p=>{
  const index=v.players.findIndex(player=>player.id===p.id),color=index===0?'White':'Black',victim:Color=index===0?'b':'w',mine=p.id===v.viewerId,pieces=v.captured[victim],label=mine?'Captured by you':'Captured by '+p.name,expanded=open===p.id;
  return <div className="chess-player-slot" data-mine={mine} key={p.id}><div className="chess-player" data-color={color.toLowerCase()} data-active={v.phase==='playing'&&v.turnIndex===index} aria-label={p.name+', '+color+(v.turnIndex===index?', to move':'')}><span>{p.name}</span>{balance?.(p.id)}</div><button className="chess-captures-toggle" aria-label={label} aria-expanded={expanded} aria-controls={id+p.id} onClick={()=>setOpen(expanded?null:p.id)}><Archive size={17} aria-hidden="true"/><span>{pieces.length}</span></button>
   {expanded&&<section className="chess-captured-tray" id={id+p.id} role="dialog" aria-label={label} onKeyDown={e=>{if(e.key==='Escape'){setOpen(null);(e.currentTarget.previousElementSibling as HTMLElement)?.focus();}}}><header><strong>{label}</strong><button aria-label="Close captured pieces" onClick={()=>setOpen(null)}><X size={18} aria-hidden="true"/></button></header><div className="chess-captured-pieces">{pieces.length?pieces.map(piece=><span key={piece.id} aria-label={(victim==='w'?'White ':'Black ')+pieceNames[piece.type]} data-piece-color={victim}><ChessPiece color={victim} type={piece.type}/></span>):<span className="chess-captured-empty">None yet</span>}</div></section>}
  </div>;
 })}</div>;
}
