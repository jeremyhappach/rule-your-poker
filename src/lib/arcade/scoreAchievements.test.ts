import {expect,it} from 'vitest';
import {scoreAchievementLabels,winnerAchievementLabels,type ScoreAchievements} from './scoreAchievements';
const base:ScoreAchievements={kind:'lower',overallKind:'lower',rank:20,topTen:false};
it('emits no current-score achievement for a historical best or matched record',()=>{
 expect(winnerAchievementLabels('Hap',base)).toEqual([]);
 expect(winnerAchievementLabels('Hap',{...base,kind:'matched',overallKind:'matched'})).toEqual([]);
});
it('combines exact top ten placement and newly established personal/overall records once',()=>{
 expect(winnerAchievementLabels('Hap',{...base,kind:'broken',overallKind:'broken',rank:1,topTen:true})).toEqual(['Hap: AN ALL-TIME HIGH SCORE!','Hap: New personal best!','Hap: #1 on the leaderboard']);
 expect(winnerAchievementLabels('Hap',{...base,rank:6,topTen:true})).toEqual(['Hap: #6 on the leaderboard']);
 expect(scoreAchievementLabels('Loser',{...base,kind:'broken',rank:8,topTen:true})).toHaveLength(2);
});
