import type {CardFrontTierKey} from '@/lib/cardFrontDesign/config';

// Shared, opt-in face art. PlayingCard alone admits resolved, unmasked values.
// Existing canonical/cartoon callers keep their established appearance.
export const MEGATOUCH_FACE_VARIANTS={small:{rank:62,suit:32},medium:{rank:76,suit:28},large:{rank:92,suit:23}} as const;
export function MegatouchCardFace({rank,suit,tier='medium',showSuit=true}:{rank:string;suit:string;tier?:CardFrontTierKey;showSuit?:boolean}){
 const variant=MEGATOUCH_FACE_VARIANTS[tier];
 return <svg data-megatouch-face={tier} aria-hidden="true" viewBox="0 0 100 140" width="100%" height="100%">
  <text data-megatouch-rank="" x="50" y={showSuit?91:104} textAnchor="middle" fill="currentColor" fontFamily="Georgia,serif" fontWeight="900" fontSize={rank==='10'?variant.rank*.75:variant.rank} letterSpacing="-4">{rank}</text>
  {showSuit&&<text data-megatouch-suit="" x="50" y="125" textAnchor="middle" fill="currentColor" fontSize={variant.suit}>{suit}</text>}
 </svg>;
}
