import {useEffect,useRef,type CSSProperties} from 'react';
import type {Color} from 'chess.js';
import {ChessPiece} from './ChessPiece';
import {chessForfeitSound} from '@/lib/chess/forfeitSound';
import {CHESS_FORFEIT_BURST_MS} from '@/lib/chess/forfeitPresentation';
import './forfeit.css';

export function ChessForfeitEffect({id,color,elapsed,position}:{id:string;color:Color;elapsed:number;position:CSSProperties}){
 const surface=useRef<HTMLDivElement>(null),initial=useRef(elapsed);
 useEffect(()=>chessForfeitSound(id,initial.current,surface.current),[id]);
 const burst=elapsed>=CHESS_FORFEIT_BURST_MS;
 const style={...position,'--forfeit-delay':-Math.max(0,burst?initial.current-CHESS_FORFEIT_BURST_MS:initial.current)+'ms'} as CSSProperties;
 return <div ref={surface} className="chess-forfeit-effect" data-burst={burst} style={style} aria-hidden="true">
  {!burst?<div className="chess-forfeit-charge"><ChessPiece color={color} type="k"/></div>:<>
   <div className="chess-forfeit-shock"/><div className="chess-forfeit-flare"/>
   {Array.from({length:20},(_,i)=>{const col=i%4,row=Math.floor(i/4),angle=i*2.399;return <div key={i} className="chess-forfeit-shard" style={{clipPath:`polygon(${col*25}% ${row*20}%,${(col+1)*25}% ${row*20}%,${(col+1)*25}% ${(row+1)*20}%,${col*25}% ${(row+1)*20}%)`,'--dx':Math.cos(angle)*(150+i*10)+'%','--dy':Math.sin(angle)*(130+i*8)-60+'%','--rot':(i%2?1:-1)*(90+i*17)+'deg'} as CSSProperties}><ChessPiece color={color} type="k"/></div>;})}
   {Array.from({length:30},(_,i)=><i key={'e'+i} className="chess-forfeit-ember" style={{'--dx':Math.cos(i*2.399)*(1500+i*90)+'%','--dy':Math.sin(i*2.399)*(1400+i*85)-500+'%'} as CSSProperties}/>)}
   {Array.from({length:9},(_,i)=><i key={'s'+i} className="chess-forfeit-smoke" style={{'--dx':Math.cos(i*2.1)*100+'%','--dy':-80-i*18+'%'} as CSSProperties}/>)}
  </>}
 </div>;
}
