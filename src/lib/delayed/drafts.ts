import type {Placement,WordsSnapshot} from '@/lib/ptownWords/model';
export const draftPrefix='ptown:async-words:draft:';
export const draftIdentity=(v:WordsSnapshot)=>JSON.stringify([v.viewerId,v.identity.dealerGameId,v.turn,v.board,v.rack]);
export function restoreDraft(raw:string|null,v:WordsSnapshot):Placement[]{
 try{const saved=JSON.parse(raw??'null');if(!v.canAct||v.phase!=='playing'||saved?.identity!==draftIdentity(v)||!Array.isArray(saved.placements)||saved.placements.length>7)return [];
 const tiles=new Set<number>(),squares=new Set<number>();
 for(const p of saved.placements){const tile=v.rack.find(t=>t.id===p.tileId);if(!tile||tiles.has(p.tileId)||!Number.isInteger(p.square)||p.square<0||p.square>224||v.board[p.square]||squares.has(p.square)||!/^[A-Z]$/.test(p.letter)||(tile.face!=='?'&&tile.face!==p.letter))return [];tiles.add(p.tileId);squares.add(p.square);}
 return saved.placements;
 }catch{return [];}
}
export function clearPrivateDrafts(){try{for(const key of Object.keys(localStorage))if(key.startsWith(draftPrefix))localStorage.removeItem(key);for(const key of Object.keys(sessionStorage))if((key.startsWith('ptown:async-words:request:')||key.startsWith('ptown:async-turn:request:')))sessionStorage.removeItem(key);}catch{/* Storage may be unavailable. */}}
