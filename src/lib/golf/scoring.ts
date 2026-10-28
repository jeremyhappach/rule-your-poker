/** Canonical public Six-Card Golf values, matching private.golf_points/golf_score. */
export function golfPublicValue(card:number){const rank=card%13;return rank===1?-2:rank===12?0:rank>=10?10:rank+1;}
/** A concealed partner cannot cancel a visible card. Complete boards use the same scorer. */
export function golfVisibleSubtotal(cards:(number|null)[]){let total=0;for(let i=0;i<3;i++){const a=cards[i],b=cards[i+3];if(a!==null&&b!==null&&a%13===b%13)continue;if(a!==null)total+=golfPublicValue(a);if(b!==null)total+=golfPublicValue(b);}return total;}
