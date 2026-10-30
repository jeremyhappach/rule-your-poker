import type {QuintzeeResult,QuintzeeRules} from '@/lib/quintzee/model';
/** Only a revealed authoritative result resolves bonuses, never card heuristics. */
export function QuintzeeBonuses({rules,upper,result}:{rules:QuintzeeRules;upper:number;result:QuintzeeResult|null}){
 const upperEarned=result?result.upperBonus>0:undefined,fillEarned=result?result.reason==='all_categories'||result.clearBonus>0:undefined;
 return <div className="q-bonuses"><div className="q-upper-bonus" data-earned={upperEarned}>
  <span>UPPER BONUS{result&&<span className="sr-only">{upperEarned?' achieved':' not achieved'}</span>}</span>
  {upperEarned!==false&&<em>= +{result?.upperBonus??rules.upperBonus}</em>}
  <b data-upper-progress aria-label={`Upper score ${upper} of ${rules.upperThreshold}`}>{upper}/{rules.upperThreshold}</b>
 </div><div className="q-filled-bonus" data-earned={fillEarned}>
  <span>FILL ALL{result&&<span className="sr-only">{fillEarned?' achieved':' not achieved'}</span>}</span>
  {fillEarned!==false&&<em>= +{result?.clearBonus??rules.clearBonus}</em>}
 </div></div>;
}
