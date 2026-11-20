/** The approved audit resolves model disagreement by primary composite score. */
export const RELATIVE_DIFFICULTY_VERSION = 'five-alive-relative/1';
export interface RelativeReviewWord {
 word: string; score: number;
 components: {solveEffort:number;feedbackAmbiguity:number;letterAndPosition:number;repetition:number;vowelAndBigrams:number;recognitionCredit:number};
}
export function resolveRelativeDifficulty(rows: readonly RelativeReviewWord[], approvedWords: readonly string[]) {
 const approved=new Set(approvedWords),seen=new Set<string>();
 if(approvedWords.length!==1021||approved.size!==1021||rows.length!==approved.size)throw Error('five_alive:difficulty_pool_integrity');
 for(const row of rows){
  const c=row.components, values=Object.values(c);
  const raw=c.solveEffort+c.feedbackAmbiguity+c.letterAndPosition+c.repetition+c.vowelAndBigrams-c.recognitionCredit;
  const score=Math.max(0,Math.min(100,Math.round(raw*2)/2));
  if(!/^[A-Z]{5}$/.test(row.word)||!approved.has(row.word)||seen.has(row.word)||values.length!==6||values.some(v=>!Number.isFinite(v))||!Number.isFinite(row.score)||score!==row.score)throw Error('five_alive:difficulty_pool_integrity');
  seen.add(row.word);
 }
 const sorted=[...rows].sort((a,b)=>a.score-b.score||(a.word<b.word?-1:a.word>b.word?1:0));
 const choices=sorted.flatMap((row,i)=>i>0&&row.score!==sorted[i-1].score?[{count:i,lower:sorted[i-1].score,upper:row.score,gap:row.score-sorted[i-1].score,cumulative:i/rows.length}]:[]);
 if(choices.length<4)throw Error('five_alive:difficulty_insufficient_separation');
 const boundaries=[.1,.3,.7,.9].map(target=>{
  const nearby=choices.filter(c=>Math.abs(c.cumulative-target)<=.03);
  const candidates=nearby.length?nearby:choices;
  const selected=[...candidates].sort((a,b)=>b.gap-a.gap||Math.abs(a.cumulative-target)-Math.abs(b.cumulative-target)||a.count-b.count)[0];
  return (selected.lower+selected.upper)/2;
 });
 if(boundaries.some((b,i)=>i>0&&b<=boundaries[i-1]))throw Error('five_alive:difficulty_insufficient_separation');
 const answers=sorted.map(row=>({word:row.word,difficulty:1+boundaries.filter(b=>row.score>b).length})).sort((a,b)=>a.word<b.word?-1:a.word>b.word?1:0);
 return {version:RELATIVE_DIFFICULTY_VERSION,boundaries,answers,counts:[1,2,3,4,5].map(t=>answers.filter(a=>a.difficulty===t).length)};
}
