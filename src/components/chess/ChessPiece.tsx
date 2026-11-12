import {useId} from 'react';
import type {Color,PieceSymbol} from 'chess.js';
export const pieceNames={k:'King',q:'Queen',r:'Rook',b:'Bishop',n:'Knight',p:'Pawn'};
const shapes:Record<PieceSymbol,string>={
 p:'M25 46 C32 39 33 30 32 27 C18 21 22 6 32 6 C43 6 47 21 35 27 C34 34 37 42 42 46 Z',
 r:'M23 46 L26 25 L19 21 L19 9 L26 9 L26 16 L30 16 L30 9 L36 9 L36 16 L40 16 L40 9 L47 9 L47 21 L39 25 L42 46 Z',
 b:'M24 46 C28 40 29 33 27 29 C18 20 27 15 32 7 C36 12 43 17 40 24 L33 16 L30 19 L37 28 C34 34 37 41 41 46 Z',
 n:'M22 46 C20 34 28 28 29 24 L22 29 L13 26 L15 20 L26 10 L28 5 L32 10 L40 9 C51 22 47 34 43 46 Z',
 q:'M23 45 L17 19 L27 27 L32 13 L38 27 L48 19 L41 45 Z',
 k:'M24 45 C25 35 14 30 18 23 C21 17 28 20 29 23 L29 17 L25 17 L25 12 L29 12 L29 6 L35 6 L35 12 L39 12 L39 17 L35 17 L35 23 C40 16 49 21 47 28 C46 34 39 39 41 45 Z'};
/** Opaque vector sculpture derived from the handoff's filled, outlined direction. */
export function ChessPiece({color,type}:{color:Color;type:PieceSymbol}){const id=useId().replace(/:/g,'');const white=color==='w';return <svg className="chess-piece" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id={id}><stop stopColor={white?'#fff9dc':'#898792'}/><stop offset=".4" stopColor={white?'#fce7b9':'#444552'}/><stop offset="1" stopColor={white?'#c39b6c':'#202330'}/></linearGradient></defs><g fill={'url(#'+id+')'} stroke="#111e2c" strokeWidth="2.8" strokeLinejoin="round"><path d={shapes[type]}/>{type==='q'&&<><circle cx="16" cy="17" r="4"/><circle cx="32" cy="10" r="4"/><circle cx="49" cy="17" r="4"/></>}<path d="M22 44 Q32 48 43 44 L44 49 Q50 53 47 57 Q32 62 17 57 Q14 53 20 49 Z"/><path d="M21 48 Q32 52 44 48" fill="none" stroke={white?'#fff5d3':'#93909c'} strokeWidth="2"/></g>{type==='n'&&<path d="M23 19 Q26 15 29 17 Q27 22 23 19" fill="#111e2c"/>}</svg>;}
