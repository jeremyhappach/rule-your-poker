import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ChessFinalPosition,type ChessSavedPosition} from '@/components/chess/ChessHistory';
import {AsyncGameHeader} from './AsyncGameHeader';
import {AsyncSessionName} from './AsyncSessionName';
import {delayedRpc,gameName,type ChildSummary,type Home} from '@/lib/delayed/client';
import {money} from '@/lib/delayed/reviews';
import {matchRecordPath,validateMatchRecord,type MatchRecord,type GameRecord} from '@/lib/delayed/matchRecord';
import {ownRoundProjection,FIVE_ALIVE_RULES} from '../../../server/fiveAlive/rules';
import {fiveAliveTiers} from '@/components/fiveAlive/FiveAliveResults';
import {QUINTZEE_LABELS} from '@/lib/quintzee/model';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
import {cardName} from '@/lib/triTowers/model';
import './matchRecord.css';

const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString():'Unavailable';
const text=(value:unknown)=>typeof value==='string'?value.replace(/_/g,' '):'';
function Outcome({child,home}:{child:ChildSummary;home:Home}){
 const result=child.result;
 if(!result)return <span>Result unavailable</span>;
 const winner=home.players.find(p=>p.id===result.winner)?.name;
 return <span>{result.winner?(winner??'Winner')+' won':'Draw'} · {money(result.delta)}
  {result.reason&&result.reason!=='normal'?' · '+text(result.reason):''}</span>;
}
function Scores({child,home}:{child:ChildSummary;home:Home}){
 return <div className="delayed-scoreboard" aria-label="Final game scores">{home.players.map(p=>
  <div key={p.id}><span>{p.name}</span><strong>{number(child.scores?.[p.id])}</strong></div>)}</div>;
}

/** History never mounts the active match, review, sound, timer or action owners. */
export function CompletedMatchRecord({matchId,userId,childId}:{matchId:string;userId:string;childId?:string}){
 const [record,setRecord]=useState<MatchRecord|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let alive=true;setRecord(null);setError('');
  void delayedRpc<MatchRecord>('delayed_match_record',{p_match:matchId,p_child:childId??null})
   .then(value=>{const checked=validateMatchRecord(value,matchId,userId,childId);if(alive)setRecord(checked);})
   .catch(()=>{if(alive)setError('Completed match record could not be loaded.');});
  return()=>{alive=false;};
 },[matchId,userId,childId,retry]);
 const home=record?.home,child=home?.lineup.find(c=>c.id===childId);
 return <main className="delayed-page delayed-match-page async-match-record">
  <header><Link to={childId?matchRecordPath(matchId):'/?sessions=completed'}>{childId?'← Match record':'← Completed matches'}</Link><h1>{childId?'Completed game':'Completed match'}</h1></header>
  {error?<div role="alert"><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>:!home?<p role="status">Loading completed record…</p>:<>
   <h2><AsyncSessionName realMoney={home.realMoney}>{home.players.map(p=>p.name).join(' vs. ')}</AsyncSessionName></h2>
   <p>Read-only match record{home.settledAt?' · '+new Date(home.settledAt).toLocaleString():''}</p>
   {child&&record.detail?<section aria-label={gameName(child.game)+' completed record'}>
    <AsyncGameHeader game={child.game} name={gameName(child.game)} stake={child.stake}/>
    <Scores home={home} child={child}/><p><Outcome home={home} child={child}/></p>
    <GameDetails record={record.detail} home={home}/>
   </section>:<ul className="delayed-lineup" aria-label="Completed match games">
    {[...home.lineup].sort((a,b)=>a.ordinal-b.ordinal).map(c=><li key={c.id} className="delayed-game-card" data-completed>
     <AsyncGameHeader game={c.game} name={gameName(c.game)} stake={c.stake}/>
     <Scores home={home} child={c}/><p><Outcome home={home} child={c}/></p>
     <Link className="delayed-secondary" to={matchRecordPath(matchId,c.id)}>View completed {gameName(c.game)}</Link>
    </li>)}
   </ul>}
  </>}
 </main>;
}

const resultLabels:Record<string,string>={
 reason:'Ended by',aggregate:'Column total',speed:'Speed bonus',multiplier:'Multiplier',
 stageScore:'Round score',scoreBefore:'Previous total',score:'Cumulative score',
 categorySubtotal:'Category subtotal',upperSubtotal:'Upper subtotal',upperBonus:'Upper bonus',
 clearBonus:'Clear bonus',rawSubtotal:'Base subtotal',timeBonus:'Time bonus',stockBonus:'Stock bonus',
 firstOrderPoints:'First order points',closurePoints:'Closure points',partialPoints:'Partial points',
 speedBonus:'Speed bonus',recyclingBonus:'Recycling bonus',base:'Base score',award:'Round score',
 cumulative:'Cumulative score',fifteens:'Fifteens',pairs:'Pairs',runs:'Runs',flush:'Flush',nobs:'Nobs',total:'Total',
 folds:'Folds',cracks:'Cracks',risk:'Points at risk',bank:'Banked score',level:'Challenge level',
 samePairs:'Same-rank pairs',consecutivePairs:'Consecutive pairs',draws:'Draws',discards:'Discards',
 label:'Hand',tie:'Tied hand',
};
function Breakdown({value,exclude=[]}:{value:Record<string,unknown>|null|undefined;exclude?:string[]}){
 if(!value)return null;
 return <dl className="record-breakdown">{Object.entries(resultLabels).filter(([key])=>
  !exclude.includes(key)&&['number','string','boolean'].includes(typeof value[key])).map(([key,label])=>
  <div key={key}><dt>{label}</dt><dd>{typeof value[key]==='number'?number(value[key]):typeof value[key]==='boolean'?(value[key]?'Yes':'No'):text(value[key])}</dd></div>)}</dl>;
}
const suits:Record<string,string>={clubs:'♣',diamonds:'♦',hearts:'♥',spades:'♠','♣':'♣','♦':'♦','♥':'♥','♠':'♠'};
function CardRow({cards,label}:{cards:unknown[];label:string}){
 return <div className="record-card-row"><strong>{label}</strong><div>{cards.map((card:any,i)=>
  <span key={i} className="record-card">{card&&typeof card==='object'&&card.rank&&suits[card.suit]?card.rank+suits[card.suit]:'▧'}</span>)}</div></div>;
}
function SavedWords({board,home}:{board:WordsSnapshot;home:Home}){
 return <section><h3>Final board</h3><div className="record-word-board" role="img" aria-label="Saved final Words board">{board.board.map((tile,i)=>
  <span key={i} aria-label={tile?'Square '+(i+1)+': '+(tile.letter??tile.face):undefined}>{tile?.letter??tile?.face??''}</span>)}</div>
  <h3>Scoring history</h3><div className="record-table-wrap"><table><thead><tr><th>Turn</th><th>Player</th><th>Play</th><th>Points</th></tr></thead><tbody>
   {board.moves.map(m=><tr key={m.turn}><th scope="row">{m.turn}</th><td>{home.players.find(p=>p.id===m.playerId)?.name??'Player'}</td><td>{m.words?.map(w=>w.word+' ('+w.points+')').join(', ')||text(m.action)}</td><td>{number(m.points)}</td></tr>)}
  </tbody></table></div>
  {home.players.map(p=><p key={p.id}>{p.name}: before adjustments {number(board.preAdjustmentScores?.[p.id])} · rack deduction {number(board.rackDeductions?.[p.id])} · final {number(board.scores?.[p.id])}</p>)}
 </section>;
}
function WordResults({record,home}:{record:GameRecord;home:Home}){
 if(!record.words||!Array.isArray(record.words.players)||!Array.isArray(record.words.rounds))return <p>Saved word details unavailable.</p>;
 // The frozen v1 rule core is shared with gameplay; no new scoring formula.
 const compatible=record.config.version===FIVE_ALIVE_RULES.version&&
  JSON.stringify(record.config.baseScores)===JSON.stringify(FIVE_ALIVE_RULES.baseScores)&&
  JSON.stringify(record.config.multipliers)===JSON.stringify(FIVE_ALIVE_RULES.multipliers);
 return <section><h3>Word results</h3>{record.words.players.map((actor,index)=><section key={actor}>
  <h4>{home.players.find(p=>p.id===actor)?.name??'Player'}</h4>
  {(record.words!.rounds[index]??[]).map((round,i)=>{
   const result=compatible?ownRoundProjection(round):null;
   return <article className="record-word" key={i}><h5>Word {i+1}: {round.answer}</h5>
    <p>{fiveAliveTiers[round.difficulty]??'Unknown difficulty'} · {round.guesses.length} guesses used</p>
    {round.completed&&result?<p>Base score {number(result.solved?record.config.baseScores[round.guesses.length-1]:0)} × multiplier {number(record.config.multipliers[round.difficulty-1]/100)} = final score {number(result.score)}</p>:
     <p>{round.completed?'Scoring breakdown unavailable for this rules version.':round.guesses.length?'Unfinished when the game ended':'Not played'}</p>}
    <ol className="record-guesses" aria-label={'Word '+(i+1)+' guesses'}>{round.guesses.map((guess,j)=><li key={j}>{[...guess.word].map((letter,k)=><span key={k} data-feedback={guess.feedback[k]} aria-label={letter+' '+guess.feedback[k]}>{letter}</span>)}</li>)}</ol>
   </article>;
  })}
 </section>)}</section>;
}
function AttemptBoard({game,board}:{game:GameRecord['game'];board:Record<string,any>|null}){
 if(!board)return <p>Saved board details unavailable.</p>;
 const result=board.result;
 return <>
  <Breakdown value={result} exclude={game==='run21'?['score']:[]}/>
  {game==='run21'&&board.columns?.map((cards:unknown[],i:number)=><div key={i}><CardRow label={'Column '+(i+1)} cards={cards}/><span>Total {number(result?.totals?.[i])}</span></div>)}
  {game==='quintzee'&&<div className="record-table-wrap"><table><caption>Category scores</caption><thead><tr><th>Category</th><th>Score</th></tr></thead><tbody>
   {Object.entries(QUINTZEE_LABELS).map(([key,label])=><tr key={key}><th scope="row">{label}</th><td>{board.scores?.[key]===undefined?'Not scored':number(board.scores[key])}</td></tr>)}
  </tbody></table></div>}
  {game==='boxdrop'&&board.scales?.map((s:any,i:number)=><p key={i}>Scale {i+1}: {s.boxes.map((b:any)=>b.value).join(' + ')||'Empty'} · {s.sum}/{s.target} · {text(s.status)}</p>)}
  {game==='crib-lab'&&<>{board.hands?.map((cards:unknown[],i:number)=><section key={i}><CardRow label={'Hand '+(i+1)} cards={cards}/><Breakdown value={result?.hands?.[i]}/></section>)}{board.cut&&<CardRow label="Cut card" cards={[board.cut]}/>}</>}
  {game==='chucky-showdown'&&<><Breakdown value={board}/>{['player','community','chucky'].map(key=>board[key]&&<CardRow key={key} label={key==='player'?'Your hand':key==='chucky'?'Chucky':'Community'} cards={board[key]}/>)}{board.lastShowdown&&<><h5>Last showdown</h5><Breakdown value={board.lastShowdown}/></>}</>}
  {game==='mega-card-golf'&&board.results?.length>0&&<><p>Hole result: {text(board.results.at(-1).reason)}</p><NumberCards cards={board.results.at(-1).cards} label="Final hole cards"/></>}
  {game==='take-two'&&<><Breakdown value={board} exclude={['score']}/><NumberCards cards={board.slots??[]} label="Remaining cards"/></>}
  {game==='tri-towers'&&<><p>Cards removed: {board.removed?.length??0}</p><NumberCards cards={board.cards??[]} label="Final tableau"/>{board.waste!==undefined&&<NumberCards cards={[board.waste]} label="Upcard"/>}</>}
 </>;
}
function NumberCards({cards,label}:{cards:unknown[];label:string}){
 return <div className="record-card-row"><strong>{label}</strong><div>{cards.map((card,i)=><span className="record-card" key={i}>{typeof card==='number'&&Number.isInteger(card)&&card>=0&&card<52?cardName(card):'▧'}</span>)}</div></div>;
}
export function GameDetails({record,home}:{record:GameRecord;home:Home}){
 if(record.game==='chess')return record.board?<ChessFinalPosition view={record.board as ChessSavedPosition}/>:<p>Saved final board unavailable.</p>;
 if(record.game==='five-alive')return <WordResults record={record} home={home}/>;
 if(record.game==='ptown-words')return record.board?<SavedWords board={record.board as WordsSnapshot} home={home}/>:<p>Saved final board unavailable.</p>;
 const rounds=[...new Set(record.attempts.map(a=>a.round))].sort((a,b)=>a-b),unit=record.game==='mega-card-golf'?'Hole':'Round';
 return <><h3>{unit}-by-{unit.toLowerCase()} results</h3>
  {rounds.length?<div className="record-table-wrap"><table><caption>{gameName(record.game)} scores by {unit.toLowerCase()}</caption><thead><tr><th>{unit}</th>{home.players.map(p=><th key={p.id}>{p.name}</th>)}</tr></thead><tbody>
   {rounds.map(round=><tr key={round}><th scope="row">{round}</th>{home.players.map(p=><td key={p.id}>{number(record.attempts.find(a=>a.round===round&&a.actor===p.id)?.score)}</td>)}</tr>)}
  </tbody></table></div>:<p>No completed {unit.toLowerCase()} scores were recorded.</p>}
  {record.attempts.map(a=><details key={a.actor+':'+a.round} className="record-attempt"><summary>{home.players.find(p=>p.id===a.actor)?.name??'Player'} · {unit} {a.round} · {number(a.score)} points</summary>
   <AttemptBoard game={record.game} board={a.board}/>
  </details>)}
  {record.board&&<details><summary>State when the game ended · unfinished round</summary><AttemptBoard game={record.game} board={record.board}/></details>}
 </>;
}
