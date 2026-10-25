/** Presentation only: never calculate a score from concealed tableau cards. */
export const golfScoreLabel=(score:number)=>score===0?'E':score>0?'+'+score:String(score);
