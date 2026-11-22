import {FiveAliveBoard} from './FiveAliveBoard';
import {FiveAliveScoreLine,type FiveAliveWordResult} from './FiveAliveResults';

/** Saved results are static. Live completion and opponent playback own effects. */
export function FiveAliveOwnResult({round,result,prior,opponentScore,opponentName,waiting,onClose,onWords}:{
 round:number;result:FiveAliveWordResult;prior:number;opponentScore:number;opponentName:string;waiting:boolean;onClose:()=>void;onWords:()=>void;
}){
 return <FiveAliveBoard mode="async" round={round} score={prior+(result.score??0)} opponentScore={opponentScore} opponentName={opponentName}
  current={{completed:true,waiting,guesses:result.guesses}} pending onSubmit={()=>{}} onBack={onClose}
  notice={<><div className="five-alive-last-result"><strong>Your Word {round} — {result.answer}</strong><FiveAliveScoreLine label="You" result={result}/></div><button className="five-alive-word-results" onClick={onWords}>View Words</button></>}/>;
}
