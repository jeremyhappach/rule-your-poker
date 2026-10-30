import {QUINTZEE_CATEGORIES,type QuintzeeBoard,type QuintzeeResult,type QuintzeeRules} from '@/lib/quintzee/model';
import {getUpperBonusProgress} from '@/lib/yahtzeeScoring';
/** Presentation only: use permitted committed scores, never dice or potentials.
 * A terminal result closes unresolved objectives; it never overrides a recorded zero. */
export function QuintzeeBonuses({rules,scores,result,showOutcomes=true}:{rules:QuintzeeRules;scores:QuintzeeBoard['scores'];result:QuintzeeResult|null;showOutcomes?:boolean}){
 const upperCategories=QUINTZEE_CATEGORIES.slice(0,6),upper=upperCategories.reduce((sum,c)=>sum+(scores[c]??0),0);
 const upperEarned=!showOutcomes?undefined:upper>=rules.upperThreshold?true:upperCategories.every(c=>scores[c]!==undefined)||result?false:undefined;
 const fillEarned=!showOutcomes?undefined:QUINTZEE_CATEGORIES.some(c=>scores[c]===0)?false:QUINTZEE_CATEGORIES.every(c=>(scores[c]??0)>0)?true:result?false:undefined;
 // Reuse Yahtzee pace only; its early-impossibility flag is not Quintzee's failure rule.
 const pace=getUpperBonusProgress(scores).pace,paceText=pace>0?'+'+pace:String(pace);
 return <div className="q-bonuses"><div className="q-upper-bonus" data-earned={upperEarned}>
  <span>UPPER BONUS{upperEarned!==undefined&&<span className="sr-only">{upperEarned?' achieved':' not achieved'}</span>}</span>
  {upperEarned!==false&&<em>= +{rules.upperBonus}</em>}
  <b data-upper-progress aria-label={`Upper score ${upper} of ${rules.upperThreshold}`}>{upper}/{rules.upperThreshold}</b>
  {showOutcomes&&upperEarned!==false&&<small data-upper-pace aria-label={`Upper bonus pace ${paceText}`}>{paceText}</small>}
 </div><div className="q-filled-bonus" data-earned={fillEarned}>
  <span>FILL ALL{fillEarned!==undefined&&<span className="sr-only">{fillEarned?' achieved':' not achieved'}</span>}</span>
  {fillEarned!==false&&<em>= +{rules.clearBonus}</em>}
 </div></div>;
}
