import {cardPlayCue, cardPassCue} from '@/lib/audio/cardActionCues';
import {cardSwooshCueAt} from '@/lib/audio/cardSwoosh';
import {celebrationCueAt} from '@/lib/audio/celebrationCue';
import {scoreCountCue} from '@/lib/run21/scoreCountCue';
import {megaHoleCue, megaFinalCue, megaCupCue, megaTeeCue} from '@/lib/megaCardGolf/audio';
export const references = [
  {id:'current-play', title:'Approved card play', cue:cardPlayCue},
  {id:'current-pass', title:'Approved card pass / draw', cue:cardPassCue},
  {id:'current-flight', title:'Canonical card flight', cue:cardSwooshCueAt(0,100)},
  {id:'current-count', title:'Shared score count-up', cue:scoreCountCue(0,1000,0,1300)},
  {id:'current-fanfare', title:'TriTowers / Run21 fanfare', cue:celebrationCueAt()},
  {id:'mega-hole', title:'Mega Card Golf · hole', cue:megaHoleCue},
  {id:'mega-final', title:'Mega Card Golf · final', cue:megaFinalCue},
  {id:'mega-cup', title:'Mega Card Golf · cup', cue:megaCupCue},
  {id:'mega-tee', title:'Mega Card Golf · tee', cue:megaTeeCue},
];
