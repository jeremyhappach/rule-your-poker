/** Gameplay and viewer disclosure have independent monotone revisions. */
function withoutTransportClocks(value:unknown):unknown{
 if(Array.isArray(value))return value.map(withoutTransportClocks);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='serverAt').map(([key,item])=>[key,withoutTransportClocks(item)]));
 return value;
}
export function admitTurnSnapshot<T extends {revision:number;reviewRevision?:number;serverAt:number;totals:unknown;pendingResults?:unknown;holeResults?:unknown}>(old:T|null,next:T):boolean{
 if(!old)return true;
 if(next.revision<old.revision||(next.reviewRevision??0)<(old.reviewRevision??0))return false;
 if(next.revision!==old.revision)return true;
 const sameReview=(next.reviewRevision??0)===(old.reviewRevision??0);
 const stable=(v:T)=>{const {serverAt,totals,pendingResults,holeResults,reviewRevision,...gameplay}=v;return withoutTransportClocks(sameReview?{...gameplay,totals,pendingResults,holeResults}:gameplay);};
 if(JSON.stringify(stable(old))!==JSON.stringify(stable(next)))throw Error('Conflicting turn snapshot. Reconnect safely.');
 return true;
}
