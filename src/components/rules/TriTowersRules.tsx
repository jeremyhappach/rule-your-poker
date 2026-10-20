import type {RuleRendererProps} from '@/lib/gameCatalog/types';
import {isV2,RULES,type Rules} from '@/lib/triTowers/model';
import {triTimingEnabled,downloadTriTiming} from '@/lib/triTowers/diagnostics';
export function TriTowersRules({rules=RULES,solo=false}:{rules?:Rules;solo?:boolean}){if(isV2(rules))return <div className="tri-rules"><h3>How to play</h3>{triTimingEnabled()&&<button onClick={downloadTriTiming}>Download timing report</button>}
  <p>Remove exposed cards one rank above or below the waste. Kings wrap to Aces. Each round has a fresh independent deck and 23 stock draws.</p>
  <p>Consecutive removals award {rules.streakAwards?.map(n=>n.toLocaleString()).join(', ')}, then {rules.streakAwards?.at(-1)?.toLocaleString()} per card. Drawing resets the streak and deducts {rules.drawPenalty} from your cumulative score, with a floor of zero.</p>
  <p>Towers add {rules.peakBonuses.map(n=>n.toLocaleString()).join(' / ')}. Clear or Take Score adds {rules.timePerSecond} per whole second remaining. Only clear adds {rules.stockPerCard?.toLocaleString()} per unused stock card. There is no extra all-clear award.</p>
  <p>{solo?'Play two base rounds.':'Everyone plays round one, then round two, starting left of the caller with the caller last.'} A cumulative {rules.bonusThreshold.toLocaleString()} after round two earns exactly one bonus round{solo?'':' in that same order'}. No free replay.</p>
  <p>{rules.roundIntroMs?`Each round starts with a ${rules.roundIntroMs/1000}-second introduction. `:''}Each round allows {rules.readyMs/1000} seconds to play your first valid card or draw; that action starts the full {rules.stageMs/1000}-second clock. Missed Ready or timeout ends only this round. Take Score keeps your total and ends this round. Results hold for {rules.holdMs/1000} seconds.{rules.clearCelebrationMs?` Clearing all towers adds a ${rules.clearCelebrationMs/1000}-second celebration first.`:''}</p>
  <p>{solo?'Clocks keep running when you leave or background the game. Abandoning the whole game excludes it from the leaderboard.':'Highest scores share losing stakes; all-player ties move no chips.'} P-Town accepted scoring · {rules.version}.</p></div>;
 return <div className="tri-rules"><h3>How to play · legacy v1</h3>
  <p>Remove an exposed card one rank above or below the waste. Aces connect Kings and Twos. Clear the three peaks. Draw a stock card when you want to start a new run.</p>
  <p>Each run scores 1,000, then 2,000, then 3,000… Drawing resets the run. Capturing the peaks awards 5,000, 10,000 and 15,000. Clear all three for 100 points per remaining second.</p>
  <p>Play two stages, then one bonus stage if you reach 80,000. You finish your whole turn before the next player receives a new independent deal. Everyone watches the same exposed board.</p>
  <p>Ready expires after 30 seconds; each stage lasts 120 seconds. Timeout or Give up records your earned score and ends your turn. Highest scores share the losing stakes; all-player ties move no chips.</p>
  <p>Take Score keeps your earned points and ends only this stage, without a clear bonus. Every stage result stays visible for five seconds; your next eligible stage starts automatically.</p>
  <p>PTown arcade rules v1. Numerical scoring, timing and wrapping are explicit adaptation choices pending owner acceptance.</p></div>;}

export default function CatalogRules({config,version,solo}:RuleRendererProps){return <TriTowersRules rules={config as Rules} solo={solo}/>;}
