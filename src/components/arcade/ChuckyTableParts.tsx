import {AlertDialog,AlertDialogTrigger,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {ArcadeAbandonButton} from '@/components/arcade/ArcadeAbandonButton';
import {memo,type CSSProperties} from 'react';
import {PlayingCard} from '@/components/PlayingCard';
import type {Card} from '@/lib/cardUtils';
export const CardSlot=memo(function CardSlot({card,flip,classicFace}:{card?:Card;flip?:boolean;classicFace?:boolean}){
  return <span className="cs-card" aria-label={card?card.rank+card.suit:'Face-down card'}>
    <span key={card?'face':'back'} className={card&&flip?'cs-flip':''}>
      <PlayingCard frontStyle={classicFace ? "arcade-classic" : "megatouch"} size="sm" card={card} isHidden={!card} style={{width:'100%',height:'100%'}}/>
    </span></span>;
});
export function EndRun({disabled,abandon}:{disabled:boolean;abandon:()=>void}){
  return <AlertDialog><AlertDialogTrigger asChild><ArcadeAbandonButton disabled={disabled}/></AlertDialogTrigger>
    <AlertDialogContent><AlertDialogTitle>Abandon this run?</AlertDialogTitle>
      <AlertDialogDescription>This run will end without a leaderboard score. Clocks continue while this dialog is open.</AlertDialogDescription>
      <AlertDialogFooter><AlertDialogCancel>Keep playing</AlertDialogCancel>
        <AlertDialogAction disabled={disabled} onClick={abandon}>Abandon run</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>;
}
export function Riffle(){
  return <div className="cs-riffle" role="img" aria-label="Shuffling the remaining deck">
    {Array.from({length:12},(_,i)=><i key={i} style={{'--side':i%2===0?-1:1,'--i':i} as CSSProperties}/>)}
  </div>;
}
