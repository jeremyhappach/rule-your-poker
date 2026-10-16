import type {CSSProperties} from 'react';
import type {stagePresentation} from '@/lib/triTowers/stagePresentation';

export function TriTowersStageResult({result}:{result:NonNullable<ReturnType<typeof stagePresentation>>}){
  const title=result.reason==='cleared'?'All Three Towers Cleared!':result.reason==='take_score'?'Score Taken':
    result.reason==='timeout'?'Time Expired':result.reason==='give_up'?'Turn Ended':'Stage Complete';
  return <div className="tri-stage-result" data-stage-result={result.id} data-reason={result.reason}
    style={{'--result-elapsed':`${-result.elapsed}ms`} as CSSProperties}>
    {result.reason==='cleared'&&<div className="tri-clear-towers" aria-hidden="true">♠ <span>♠</span> ♠</div>}
    <h2>{title}</h2>
    <p>Stage {result.stage} <strong>+{result.stageScore.toLocaleString()}</strong></p>
    {result.timeBonus>0&&<p className="tri-time-bonus">Time bonus +{result.timeBonus.toLocaleString()}</p>}
    <div className="tri-count" aria-hidden="true"><small>{result.scoreBefore.toLocaleString()} →</small>
      <strong className="tri-count-animated">{result.displayScore.toLocaleString()}</strong>
      <strong className="tri-count-reduced">{result.score.toLocaleString()}</strong></div>
    <p className="sr-only" role="status">{title}. Stage score {result.stageScore}. Total {result.score}.</p>
    <small>Continuing automatically</small>
  </div>;
}
