/** Presentation only: callers supply authoritative remaining time and duration. */
export function RoundTimeBar({remaining,full,waiting=false,speed}:{remaining:number;full:number;waiting?:boolean;speed?:number}){
 const percent=Math.max(0,Math.min(100,100*remaining/full));
 return <div className="run21-timer" role="progressbar" aria-label="Round time remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
  aria-valuetext={waiting?`Speed ${speed}, waiting for first placement`:`${(remaining/1000).toFixed(1)} seconds remaining`} data-run21-time-remaining={remaining}>
  <span className={`run21-timer-fill ${percent>10?'bg-green-500':percent>5?'bg-yellow-500':'bg-destructive'}`} data-run21-time-tone={percent>10?'success':percent>5?'warning':'danger'} style={{width:`${percent}%`}}/>
 </div>;
}
