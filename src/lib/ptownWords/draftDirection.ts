import type {Placement,Tile} from './model';
/** A direction exists only when draft tiles form one contiguous line through committed tiles. */
export function nextDraftSquare(draft:Placement[],board:(Tile|null)[]):number|null {
 if(draft.length<2)return null;
 const squares=draft.map(p=>p.square).sort((a,b)=>a-b),row=Math.floor(squares[0]/15),col=squares[0]%15;
 const step=squares.every(s=>Math.floor(s/15)===row)?1:squares.every(s=>s%15===col)?15:0;
 if(!step)return null;const occupied=new Set(squares);
 for(let s=squares[0];s<=squares.at(-1)!;s+=step)if(!occupied.has(s)&&!board[s])return null;
 let next=squares.at(-1)!+step;
 while(next<225&&(step!==1||Math.floor(next/15)===row)&&(board[next]||occupied.has(next)))next+=step;
 return next<225&&(step!==1||Math.floor(next/15)===row)?next:null;
}
