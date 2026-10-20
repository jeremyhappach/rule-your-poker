export function TakeTwoAllClear({bonus,elapsed,opacity,reduced}:{bonus:number;elapsed:number;opacity:number;reduced:boolean}){
 const burst=Math.min(1,elapsed/650),pulse=reduced?1:1+Math.sin(Math.min(1,elapsed/450)*Math.PI)*.12;
 return <div className="take-all-clear" aria-label={`All clear! +${bonus.toLocaleString()}!`} style={{opacity:reduced?1:opacity}}>
  {!reduced&&Array.from({length:12},(_,i)=>{const angle=i*Math.PI/6;return <span key={i} className="take-clear-spark" aria-hidden="true" style={{left:`${50+Math.cos(angle)*36*burst}%`,top:`${50+Math.sin(angle)*40*burst}%`,opacity:burst,transform:`translate(-50%,-50%) rotate(${i*30}deg)`}}>{['♠','♥','♦','♣'][i%4]}</span>;})}
  <div className="take-clear-title" style={{transform:`scale(${pulse})`}}><h2>ALL CLEAR!</h2><strong>+{bonus.toLocaleString()}!</strong></div>
 </div>;
}
