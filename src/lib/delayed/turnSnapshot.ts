/** Gameplay and viewer disclosure have independent monotone revisions. */
export function admitTurnSnapshot<T extends {revision:number;reviewRevision?:number;serverAt:number;totals:unknown;pendingResults?:unknown}>(old:T|null,next:T):boolean{
 if(!old)return true;
 if(next.revision<old.revision||(next.reviewRevision??0)<(old.reviewRevision??0))return false;
 if(next.revision!==old.revision)return true;
 const sameReview=(next.reviewRevision??0)===(old.reviewRevision??0);
 const stable=(v:T)=>{const {serverAt,totals,pendingResults,reviewRevision,...gameplay}=v;return sameReview?{...gameplay,totals,pendingResults}:gameplay;};
 if(JSON.stringify(stable(old))!==JSON.stringify(stable(next)))throw Error('Conflicting turn snapshot. Reconnect safely.');
 return true;
}
