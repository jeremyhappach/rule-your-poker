import {expect,it} from 'vitest';
import {latestTurnReview,type Reviews} from './reviews';

it.each(['ptown-words','quintzee','run21','tri-towers','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown'])('%s selects latest eligible play and never falls back to history',game=>{
 const events=Array.from({length:13},(_,i)=>({id:String(i),kind:'attempt' as const,actor:'opponent',round:i+1,score:10,at:'',receipt:{game,rules:{}},board:{},seen:false}));
 const value={events,turnReviewId:'12'} as Reviews;
 expect(latestTurnReview(value)?.round).toBe(13);
 events[12].seen=true;expect(latestTurnReview(value)).toBeUndefined();
 expect(events.slice(0,12).every(e=>!e.seen)).toBe(true);
});
it('does not replay a legacy Words turn already disclosed through gameplay',()=>{
 const value={events:[{id:'old',kind:'attempt',round:12,seen:false}],turnReviewId:'old',revealedThrough:12} as Reviews;
 expect(latestTurnReview(value)).toBeUndefined();
});
it('does not treat a completed outcome as an opponent turn',()=>{
 expect(latestTurnReview({events:[{id:'final',kind:'child',round:0,seen:false}],turnReviewId:null} as Reviews)).toBeUndefined();
});
