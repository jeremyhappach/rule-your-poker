import {turnLabel} from '@/lib/ptownWords/turnPresentation';
import {AsyncSessionName} from './AsyncSessionName';
import {playingTopic,usePlayingPresence} from '@/lib/delayed/playingPresence';
import {useEffect,useMemo,useState,useRef} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {PtownWordsView} from '@/components/ptownWords/PtownWordsView';
import {usePtownWords} from '@/hooks/usePtownWords';
import type {WordsTransport} from '@/lib/ptownWords/client';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
import {acceptWordsSnapshot} from '@/lib/ptownWords/model';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {delayedRpc,signed} from '@/lib/delayed/client';
import {ASYNC_SCORE_HOLD_MS} from '@/lib/delayed/reviewPresentation';
import {wordsRpc} from '@/lib/ptownWords/client';
type View=WordsSnapshot&{outcome?:{reason:string;winner:string|null;delta:number};error?:string};
type WordsTurnProps={childId:string;matchId:string;userId:string;realMoney?:boolean;sessionName?:string};
// Entry must not mount command recovery until a fresh, side-effect-free read
// establishes ownership. A saved command from another visit is not viewing.
export function WordsTurn(props:WordsTurnProps){
 const {childId,matchId,userId}=props;
 const [entry,setEntry]=useState<View|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let cancelled=false;setEntry(null);setError('');
  void wordsRpc<View>('delayed_words_inspect',{p_child:childId}).then(value=>{
   acceptWordsSnapshot(null,value,childId);
   if(value.identity.sessionId!==matchId||value.viewerId!==userId)throw Error('Match identity mismatch.');
   if(!cancelled)setEntry(value);
  }).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Unable to load Words.');});
  return()=>{cancelled=true;};
 },[childId,matchId,userId,attempt]);
 if(!entry)return <main className="delayed-page"><Link to={'/delayed/'+matchId}>Match Home</Link><p role="status">{error||'Restoring Words…'}</p>{error&&<button onClick={()=>setAttempt(n=>n+1)}>Retry</button>}</main>;
 return entry.phase==='playing'&&!entry.finished&&entry.activePlayerId!==entry.viewerId
  ?<WordsInspection {...props} snapshot={entry}/>:<ActiveWordsTurn {...props}/>;
}
function WordsInformation({view:v,matchId}:{view:View;matchId:string}){
 return <><Link to={'/delayed/'+matchId}>Match Home</Link><p>36 hours per turn. Last Call after 24 hours. Deadline expiry forfeits this Words game. {v.rules.timeBankUses ? `On entry you have ${v.rules.turnMs/60000} minutes and two +3-minute banks per player per game. Running out of playable time passes the turn.` : "This match uses the earlier 36-hour rules without an active-turn clock or time banks. New matches use the five-minute clock and two banks."}</p><p>ENABLE2K dictionary. Blanks score zero. Exchange needs seven tiles in the bag. Four consecutive passes end the game; final rack deductions and the standard tie comparison apply.</p>{v.moves.map(m=><p key={m.turn}>{v.players.find(p=>p.id===m.playerId)?.name}: {turnLabel(m)} · {m.points}</p>)}</>;
}
function WordsInspection({snapshot,matchId,userId,realMoney=false,sessionName='Match Home'}:WordsTurnProps&{snapshot:View}){
 const [tab,setTab]=useState<ShellTabId>('cards');
 const panel=<WordsInformation view={snapshot} matchId={matchId}/>;
 return <div className="async-words-turn"><div className="delayed-turn-nav"><Link aria-label="Match Home" to={'/delayed/'+matchId}><AsyncSessionName realMoney={realMoney}>{sessionName}</AsyncSessionName></Link><span>{realMoney?'Real money':'Play money'} · 36-hour turns</span></div>
  <PtownWordsView readOnly asyncDraftUserId={userId} view={snapshot} now={snapshot.serverAt} pending={false} connected error="" activeTab={tab} setActiveTab={setTab} panel={panel} sessionEnded={false} onReconnect={()=>{}} onIntent={async()=>false} navigation={<nav aria-label="Words information"><button onClick={()=>setTab('lobby')}>Rules</button><button onClick={()=>setTab('history')}>History</button></nav>}/>
 </div>;
}
function ActiveWordsTurn({childId,matchId,userId,realMoney=false,sessionName='Match Home'}:WordsTurnProps){
 const navigate=useNavigate(),[tab,setTab]=useState<ShellTabId>('cards'),returnAfterWord=useRef(false),[returnAt,setReturnAt]=useState<number|null>(null);
 const transport=useMemo<WordsTransport>(()=>({
  load:async()=>{try{return await wordsRpc<View>('delayed_words_snapshot',{p_child:childId});}catch(error){const home=await delayedRpc<{removedAt?:string}>('delayed_home',{p_match:matchId});if(home.removedAt)navigate('/delayed/'+matchId,{replace:true});throw error;}},
  send:async c=>{try{return await wordsRpc<View>('delayed_words_action',{p_child:childId,p_request:c.requestId,p_revision:c.revision,p_action:c.intent.type,p_items:'items'in c.intent?c.intent.items:null});}catch(e){if(e instanceof Error&&e.message.startsWith('delayed:'))throw Error('ptown_words:'+e.message);throw e;}},
  subscribe:(changed,connected)=>{const channel=supabase.channel('async-words:'+childId).on('postgres_changes',{event:'*',schema:'public',table:'delayed_match_updates',filter:'user_id=eq.'+userId},p=>{if((p.new as {match_id:string}).match_id===matchId)changed();}).subscribe(s=>connected(s==='SUBSCRIBED'));return()=>{void supabase.removeChannel(channel);};}
 }),[childId,matchId,userId,navigate]);
 const game=usePtownWords(childId,userId,transport,'ptown:async-words:request'),v=game.snapshot as View|null;
 useEffect(()=>{if(v?.finished&&!returnAfterWord.current)navigate('/delayed/'+matchId+'?review='+childId,{replace:true});},[v?.finished,matchId,childId,navigate]);
 useEffect(()=>{if(!v||v.phase==='complete'||v.paused)return;const timer=setTimeout(()=>void game.reconnect(),Math.max(0,Math.min(2147483647,v.deadline-v.serverAt+50)));return()=>clearTimeout(timer);},[v?.revision,v?.deadline,v?.paused]);
 useEffect(()=>{if(returnAt!==null&&game.now>=returnAt)navigate('/delayed/'+matchId+(v?.finished?'?review='+childId+'&finished=1':''),{replace:true});},[returnAt,game.now,v?.finished,matchId,childId,navigate]);
 usePlayingPresence(tab==='cards'&&v&&v.identity.sessionId===matchId&&v.canAct&&!v.paused&&!v.finished&&v.phase==='playing'&&game.connected&&game.now>=(v.movePresentation?.readyAt??0)&&game.now<v.deadline?playingTopic(matchId,childId,userId,v.deadline):null,true);
 if(!v)return <main className="delayed-page"><Link to={'/delayed/'+matchId}>Match Home</Link><p role="status">{game.error||'Restoring Words…'}</p><button onClick={()=>void game.reconnect()}>Retry</button></main>;
 if(v.identity.sessionId!==matchId)return <p role="alert">Match identity mismatch.</p>;
 const panel=<WordsInformation view={v} matchId={matchId}/>;
 return <div className="async-words-turn"><div className="delayed-turn-nav"><Link aria-label="Match Home" to={'/delayed/'+matchId}><AsyncSessionName realMoney={realMoney}>{sessionName}</AsyncSessionName></Link><span>{realMoney?'Real money':'Play money'} · {v.playDeadline!=null?'Timed turn':game.now>=v.deadline?'Deadline reached':game.now>=v.deadline-12*3600000?'Last Call':v.playDeadline===undefined?'36-hour turns':'36-hour availability'}</span></div>
 {v.outcome&&<div className="delayed-terminal" role="status"><strong>{v.outcome.delta>0?'You won':v.outcome.delta<0?'You lost':'Draw'}{v.outcome.reason==='timeout_forfeit'?' by forfeit':''} · {signed(v.outcome.delta)}</strong><p>{v.settlement?'One parent settlement recorded.':'Provisional child result. The parent settles when every game is complete.'}</p><Link to={'/delayed/'+matchId}>View result and receipt</Link></div>}
 <PtownWordsView onMovePresentationComplete={player=>{if(player===v.viewerId&&(returnAfterWord.current||!v.canAct)){returnAfterWord.current=true;setReturnAt(prior=>prior??game.now+ASYNC_SCORE_HOLD_MS);}}} navigation={<nav aria-label="Words information"><button onClick={()=>setTab('lobby')}>Rules</button><button onClick={()=>setTab('history')}>History</button></nav>} asyncDraftUserId={userId} view={v} now={game.now} pending={game.pending} connected={game.connected} error={game.error} errorVersion={game.errorVersion} activeTab={tab} setActiveTab={setTab} panel={panel} sessionEnded={false} onReconnect={game.reconnect} onIntent={async intent=>{returnAfterWord.current=intent.type==='place';const ok=await game.act(intent);if(!ok)returnAfterWord.current=false;if(ok&&['exchange','pass'].includes(intent.type))navigate('/delayed/'+matchId);return ok;}}/>
 </div>;
}
