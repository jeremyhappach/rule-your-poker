export const LIFE_LOSS_PRESENTATION_MS=1600;
export const CHIP_LIFE_SIZE=8;
export const CHIP_LIFE_GAP=1;
// Matches the final scale of canonical-life-dissolve; the rendered regression
// checks its complete envelope, including the opaque 2.6x hold.
export const LIFE_LOSS_MAX_SCALE=3.3;
/** Gameplay lives, never financial chips. Seek the persisted presentation clock. */
export function CanonicalLifeMarkers({losses,previous=losses,dissolve=false,elapsed=0,variant='default'}:{losses:number;previous?:number;dissolve?:boolean;elapsed?:number;variant?:'default'|'chip'}){
 const losing=dissolve&&losses>previous&&elapsed>=0&&elapsed<LIFE_LOSS_PRESENTATION_MS;
 const count=Math.max(0,3-(losing?previous:losses));
 // Paused CSS animation + negative delay seeks exactly once to server elapsed time.
 // A normal running animation plus a changing negative delay would double its speed.
 // The chip-adjacent contact point remains fixed while scaling, including
 // when the row tilts downward to fit inside the canonical seat frame.
 const motion={animation:`canonical-life-dissolve ${LIFE_LOSS_PRESENTATION_MS}ms linear both`,animationPlayState:'paused' as const,animationDelay:-Math.max(0,Math.min(elapsed,LIFE_LOSS_PRESENTATION_MS))+'ms',transformOrigin:variant==='chip'?'var(--canonical-life-contact,14.64466094067262% 14.64466094067262%)':undefined};
 return <span data-canonical-lives aria-label={losses>=4?'Eliminated':losses===3?'Last Chance':`${3-losses} lives`} style={{display:'inline-flex',alignItems:'center',gap:variant==='chip'?CHIP_LIFE_GAP:4,whiteSpace:'nowrap',fontSize:11,fontWeight:700,transform:variant==='chip'&&count===0?'translateX(calc(26px - 100%))':undefined}}>
 {Array.from({length:count},(_,i)=><span key={i} data-life-dissolve={losing&&i===count-1||undefined} style={{width:variant==='chip'?CHIP_LIFE_SIZE:10,height:variant==='chip'?CHIP_LIFE_SIZE:10,borderRadius:'50%',background:'#facc15',border:'1px solid #854d0e',...(losing&&i===count-1?motion:{})}}/>)}
 {losses>=4?(losing&&previous===3?<span data-life-dissolve style={motion}>Last Chance</span>:'Eliminated'):losses===3&&!losing?'Last Chance':null}
 </span>;
}
