export interface ScoreAchievements {kind:'first'|'broken'|'matched'|'lower';overallKind:'first'|'broken'|'matched'|'lower';rank:number;topTen:boolean;priorBest?:number|null;overallPriorBest?:number|null}
export function scoreAchievementLabels(name:string,record?:ScoreAchievements){
 if(!record)return [];
 const labels:string[]=[];
 if(record.overallKind==='first'||record.overallKind==='broken')labels.push(`${name}: AN ALL-TIME HIGH SCORE!`);
 else if(record.overallKind==='matched')labels.push(`${name} matched the all-time high`);
 if(record.kind==='first'||record.kind==='broken')labels.push(`${name}’s all-time high`);
 else if(record.kind==='matched')labels.push(`${name} matched their all-time high`);
 if(record.topTen)labels.push(`${name}: #${record.rank} on the leaderboard`);
 return labels;
}
