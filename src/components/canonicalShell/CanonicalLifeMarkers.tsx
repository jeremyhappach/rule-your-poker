/** Gameplay lives, never financial chips. An already-committed loss is only presented. */
export function CanonicalLifeMarkers({losses,previous=losses,dissolve=false,elapsed=0}:{losses:number;previous?:number;dissolve?:boolean;elapsed?:number}){
 const count=Math.max(0,3-(dissolve?previous:losses));
 return <span data-canonical-lives aria-label={losses>=4?'Eliminated':losses===3?'Last Chance':`${3-losses} lives`} style={{display:'inline-flex',alignItems:'center',gap:4,whiteSpace:'nowrap',fontSize:11,fontWeight:700}}>
 {Array.from({length:count},(_,i)=><span key={i} data-life-dissolve={dissolve&&losses>previous&&i===count-1||undefined} style={{width:10,height:10,borderRadius:'50%',background:'#facc15',border:'1px solid #854d0e',animation:dissolve&&losses>previous&&i===count-1?'canonical-life-dissolve 650ms ease-out both':undefined,animationDelay:-Math.min(elapsed,650)+'ms'}}/>)}
 {losses>=4?(dissolve&&previous===3?<span data-life-dissolve style={{animation:'canonical-life-dissolve 650ms ease-out both',animationDelay:-Math.min(elapsed,650)+'ms'}}>Last Chance</span>:'Eliminated'):losses===3?'Last Chance':null}
 </span>;
}
