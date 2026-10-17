import {type ReactNode} from 'react';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {isV2,RULES,type Rules,type Projection,type Intent} from '@/lib/triTowers/model';
import {TriTowersBoard} from './TriTowersBoard';
export {TriTowersBoard} from './TriTowersBoard';
import {usePresentationPlayerChipBalance} from '@/lib/canonicalShell/ChipTransportProvider';
import {useTriTowersFinancialPresentation} from './useTriTowersFinancialPresentation';
import './triTowers.css';
import {stagePresentation} from '@/lib/triTowers/stagePresentation';
import type {TriIntentBuffer} from '@/lib/triTowers/intentBuffer';
import {triTimingEnabled,downloadTriTiming} from '@/lib/triTowers/diagnostics';

export function TriTowersRules({rules=RULES,solo=false}:{rules?:Rules;solo?:boolean}){if(isV2(rules))return <div className="tri-rules"><h3>How to play</h3>{triTimingEnabled()&&<button onClick={downloadTriTiming}>Download timing report</button>}
  <p>Remove exposed cards one rank above or below the waste. Kings wrap to Aces. Each round has a fresh independent deck and 23 stock draws.</p>
  <p>Consecutive removals award {rules.streakAwards?.map(n=>n.toLocaleString()).join(', ')}, then {rules.streakAwards?.at(-1)?.toLocaleString()} per card. Drawing resets the streak and deducts {rules.drawPenalty} from your cumulative score, with a floor of zero.</p>
  <p>Towers add {rules.peakBonuses.map(n=>n.toLocaleString()).join(' / ')}. Clear or Take Score adds {rules.timePerSecond} per whole second remaining. Only clear adds {rules.stockPerCard?.toLocaleString()} per unused stock card. There is no extra all-clear award.</p>
  <p>{solo?'Play two base rounds.':'Everyone plays round one, then round two, starting left of the caller with the caller last.'} A cumulative {rules.bonusThreshold.toLocaleString()} after round two earns exactly one bonus round{solo?'':' in that same order'}. No free replay.</p>
  <p>{rules.roundIntroMs?`Each round starts with a ${rules.roundIntroMs/1000}-second introduction. `:''}Each round allows {rules.readyMs/1000} seconds to play your first valid card or draw; that action starts the full {rules.stageMs/1000}-second clock. Missed Ready or timeout ends only this round. Take Score keeps your total and ends this round. Results hold for {rules.holdMs/1000} seconds.</p>
  <p>{solo?'Clocks keep running when you leave or background the game. Abandoning the whole game excludes it from the leaderboard.':'Highest scores share losing stakes; all-player ties move no chips.'} P-Town accepted scoring · {rules.version}.</p></div>;
 return <div className="tri-rules"><h3>How to play · legacy v1</h3>
  <p>Remove an exposed card one rank above or below the waste. Aces connect Kings and Twos. Clear the three peaks. Draw a stock card when you want to start a new run.</p>
  <p>Each run scores 1,000, then 2,000, then 3,000… Drawing resets the run. Capturing the peaks awards 5,000, 10,000 and 15,000. Clear all three for 100 points per remaining second.</p>
  <p>Play two stages, then one bonus stage if you reach 80,000. You finish your whole turn before the next player receives a new independent deal. Everyone watches the same exposed board.</p>
  <p>Ready expires after 30 seconds; each stage lasts 120 seconds. Timeout or Give up records your earned score and ends your turn. Highest scores share the losing stakes; all-player ties move no chips.</p>
  <p>Take Score keeps your earned points and ends only this stage, without a clear bonus. Every stage result stays visible for five seconds; your next eligible stage starts automatically.</p>
  <p>PTown arcade rules v1. Numerical scoring, timing and wrapping are explicit adaptation choices pending owner acceptance.</p></div>;}
interface Props {input?:TriIntentBuffer;userId?:string;view:Projection;now:number;pending?:boolean;connected?:boolean;liveEntry?:boolean;presentationEpoch?:number;onIntent:(intent:Intent)=>void;
  activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;panel:ReactNode;sessionEnded?:boolean;onContinue?:()=>void;error?:ReactNode}
export function TriTowersView({userId="",view:v,now,pending=false,connected=true,liveEntry=false,presentationEpoch=0,onIntent,activeTab,setActiveTab,panel,sessionEnded,onContinue,error,input}:Props){
  const player=v.players.find(p=>p.id===v.activePlayerId),v2=isV2(v.rules),at=v.paused?(v.pausedAt??v.serverAt):now;
  const canAct=v.canAct&&v.viewerId===v.activePlayerId&&!player?.isBot&&connected&&!(input?input.uncertain:pending)&&!v.paused&&at<v.deadline;
  const financial=useTriTowersFinancialPresentation(v,sessionEnded);
  const result=stagePresentation(v,now);
  const controls=v.phase==='complete'?<button onClick={onContinue} disabled={!onContinue||!!v.financial&&!financial.ready}>Continue</button>:
    v.phase==='intro'?null:v.phase==='ready'?v2?null:<button disabled={!canAct} onClick={()=>onIntent({type:'start'})}>{canAct?'Start my turn':`Waiting for ${player?.name}`}</button>:
    v.phase==='stage_complete'?null:
    v.viewerId===v.activePlayerId&&!player?.isBot?<button className="tri-take-score" disabled={!canAct} onClick={()=>onIntent({type:'take_score'})}>Take Score</button>:null;
  return <FullscreenGameShell className={v.phase==='complete'||sessionEnded?'':'tri-scene'} title="TriTowers" description={v.phase==='complete'?'Final scores':`Round ${v.stage}${v.stage>2?' · Bonus':''}`}
    activeTab={activeTab} setActiveTab={setActiveTab} panel={panel} sessionEnded={sessionEnded}
    scores={(v.phase==='complete'||sessionEnded)&&<div className="tri-scores" aria-label="Competition scores">{v.players.map(p=><div key={p.id} data-active={p.id===v.activePlayerId}>
      <span>{p.name}</span><strong>{p.id===v.activePlayerId?<><span className="tri-count-animated">{(result?.displayScore??v.score).toLocaleString()}</span><span className="tri-count-reduced">{v.score.toLocaleString()}</span></>:p.id in v.scores?v.scores[p.id].toLocaleString():'Waiting'}</strong>
      <small>{v.settlement?'Final':p.id===v.activePlayerId?v.phase==='ready'?'Ready':'Playing':v2?`${v.stages.filter(r=>r.playerId===p.id).length} rounds completed`:p.id in v.scores?'Final':'Up next'}</small>
      {v.financial&&<TriTowersBalance player={p} raw={v.financial.balances[p.id]}/>}
    </div>)}</div>}
    actions={!sessionEnded&&v.phase==='complete'?<div className="tri-actions">{controls}</div>:undefined}>
    <div className="tri-game" data-tri-towers data-phase={v.phase} data-turn={v.viewerId===v.activePlayerId?'active':'watching'}>
      {error}
      {!sessionEnded&&<>
        {v.phase==='complete'?<div className="tri-complete"><span>COMPETITION COMPLETE</span><h2>{v.players.filter(p=>v.scores[p.id]===Math.max(...Object.values(v.scores))).map(p=>p.name).join(' & ')} wins</h2><p>All turns recorded. {v.settlement===null?'Confirming settlement…':'Settlement recorded.'}</p></div>:
        <>
          <TriTowersBoard diagnosticRevision={v.revision} input={input} liveEntry={liveEntry} recoveryEpoch={presentationEpoch} userId={userId} connected={connected} presentationActive={activeTab==='cards'} takeScore={controls} roundLabel={v.stage===3?'BONUS ROUND':`ROUND ${v.stage}`} turnLabel={v.viewerId===v.activePlayerId?'YOUR TURN':`${player?.name??'Player'}’S TURN`} scores={v.players.map(p=>({id:p.id,name:p.name,score:p.id===v.activePlayerId?v.score:v.scores[p.id]??0,active:p.id===v.activePlayerId,balance:v.financial?<TriTowersBalance player={p} raw={v.financial.balances[p.id]}/>:undefined}))} view={v} canAct={canAct} onIntent={onIntent} result={result} now={at} paused={v.paused} roundKey={`${v.identity.dealerGameId}:${v.identity.roundId}:${v.activePlayerId}:${v.stage}`}/>
        </>}
      </>}
    </div>
  </FullscreenGameShell>;
}
function TriTowersBalance({player,raw}:{player:Projection['players'][number];raw:number|undefined}){
 const balance=usePresentationPlayerChipBalance(player.id,raw??0);
 return <small className="tri-balance" data-chip-center={player.seat} data-chip-reaction-target={player.seat} data-tri-balance={player.id} aria-label={`${player.name} balance ${raw===undefined?'unavailable':balance}`}>{raw===undefined?'—':balance} chips</small>;
}
