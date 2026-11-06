import {memo,useState,type CSSProperties} from 'react';
import {PlayingCard} from '@/components/PlayingCard';
import type {Card} from '@/lib/cardUtils';
export const CardSlot=memo(function CardSlot({card,flip,showSuit}:{card?:Card;flip?:boolean;showSuit?:boolean}){
  return <span className="cs-card" aria-label={card?card.rank+card.suit:'Face-down card'}>
    <span key={card?'face':'back'} className={card&&flip?'cs-flip':''}>
      <PlayingCard alwaysShowMegatouchSuit={showSuit} frontStyle="megatouch" size="sm" card={card} isHidden={!card} style={{width:'100%',height:'100%'}}/>
    </span></span>;
});
export function EndRun({disabled,abandon}:{disabled:boolean;abandon:()=>void}){
  const [confirm,setConfirm]=useState(false);
  return <div className="cs-exit">
    {confirm?<><p>End this run without a leaderboard score?</p>
      <button disabled={disabled} onClick={abandon}>End run</button>
      <button onClick={()=>setConfirm(false)}>Keep playing</button></>:
      <button disabled={disabled} onClick={()=>setConfirm(true)}>Abandon run</button>}
  </div>;
}
export function Riffle(){
  return <div className="cs-riffle" role="img" aria-label="Shuffling the remaining deck">
    {Array.from({length:12},(_,i)=><i key={i} style={{'--side':i%2===0?-1:1,'--i':i} as CSSProperties}/>)}
  </div>;
}
