import {useEffect,useMemo,useState,useRef} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {PtownWordsView} from '@/components/ptownWords/PtownWordsView';
import {usePtownWords} from '@/hooks/usePtownWords';
import type {WordsTransport} from '@/lib/ptownWords/client';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {delayedRpc,signed} from '@/lib/delayed/client';
import {NotificationBell} from './NotificationBell';
import {wordsRpc} from '@/lib/ptownWords/client';
type View=WordsSnapshot&{outcome?:{reason:string;winner:string|null;delta:number};error?:string};
export function WordsTurn({childId,matchId,userId}:{childId:string;matchId:string;userId:string}){
 const navigate=useNavigate(),[tab,setTab]=useState<ShellTabId>('cards'),returnAfterWord=useRef(false);
 const transport=useMemo<WordsTransport>(()=>({
  load:async()=>{try{return await wordsRpc<View>('delayed_words_snapshot',{p_child:childId});}catch(error){const home=await delayedRpc<{removedAt?:string}>('delayed_home',{p_match:matchId});if(home.removedAt)navigate('/delayed/'+matchId,{replace:true});throw error;}},
  send:async c=>{try{await wordsRpc<View>('delayed_words_action',{p_child:childId,p_request:c.requestId,p_revision:c.revision,p_action:c.intent.type,p_items:'items'in c.intent?c.intent.items:null});return await wordsRpc<View>('delayed_words_snapshot',{p_child:childId});}catch(e){if(e instanceof Error&&e.message.startsWith('delayed:'))throw Error('ptown_words:'+e.message);throw e;}},
  subscribe:(changed,connected)=>{const channel=supabase.channel('async-words:'+childId).on('postgres_changes',{event:'*',schema:'public',table:'delayed_match_updates',filter:'user_id=eq.'+userId},p=>{if((p.new as {match_id:string}).match_id===matchId)changed();}).subscribe(s=>connected(s==='SUBSCRIBED'));return()=>{void supabase.removeChannel(channel);};}
 }),[childId,matchId,userId,navigate]);
 const game=usePtownWords(childId,userId,transport,'ptown:async-words:request'),v=game.snapshot as View|null;
 useEffect(()=>{if(v?.finished&&!returnAfterWord.current)navigate('/delayed/'+matchId,{replace:true});},[v?.finished,matchId,navigate]);
 useEffect(()=>{if(!v||v.phase==='complete'||v.paused)return;const timer=setTimeout(()=>void game.reconnect(),Math.max(0,Math.min(2147483647,v.deadline-v.serverAt+50)));return()=>clearTimeout(timer);},[v?.revision,v?.deadline,v?.paused]);
 if(!v)return <main className="delayed-page"><Link to={'/delayed/'+matchId}>Match Home</Link><p role="status">{game.error||'Restoring Words…'}</p><button onClick={()=>void game.reconnect()}>Retry</button></main>;
 if(v.identity.sessionId!==matchId)return <p role="alert">Match identity mismatch.</p>;
 const panel=<><Link to={'/delayed/'+matchId}>Match Home</Link><p>36 hours per turn. Last Call after 24 hours. Deadline expiry forfeits this Words game. No time banks or player pauses.</p><p>ENABLE2K dictionary. Blanks score zero. Exchange needs seven tiles in the bag. Four consecutive passes end the game; final rack deductions and the standard tie comparison apply.</p>{v.moves.map(m=><p key={m.turn}>{v.players.find(p=>p.id===m.playerId)?.name}: {m.action==='place'?m.words.map(w=>w.word).join(', '):m.action} · {m.points}</p>)}</>;
 return <div className="async-words-turn"><div className="delayed-turn-nav"><Link to={'/delayed/'+matchId}>Match Home</Link><span>Play money · {game.now>=v.deadline?'Deadline reached':game.now>=v.deadline-12*3600000?'Last Call':'36-hour turns'}</span></div>
 {v.outcome&&<div className="delayed-terminal" role="status"><strong>{v.outcome.delta>0?'You won':v.outcome.delta<0?'You lost':'Draw'}{v.outcome.reason==='timeout_forfeit'?' by forfeit':''} · {signed(v.outcome.delta)}</strong><p>{v.settlement?'One parent settlement recorded.':'Provisional child result. The parent settles when every game is complete.'}</p><Link to={'/delayed/'+matchId}>View result and receipt</Link></div>}
 <PtownWordsView onMovePresentationComplete={player=>{if(player===v.viewerId&&(returnAfterWord.current||!v.canAct)){returnAfterWord.current=false;navigate('/delayed/'+matchId);}}} navigation={<nav aria-label="Words information"><button onClick={()=>setTab('lobby')}>Rules</button><button onClick={()=>setTab('history')}>History</button></nav>} asyncDraftUserId={userId} view={v} now={game.now} pending={game.pending} connected={game.connected} error={game.error} errorVersion={game.errorVersion} activeTab={tab} setActiveTab={setTab} panel={panel} sessionEnded={false} onReconnect={game.reconnect} onIntent={async intent=>{returnAfterWord.current=intent.type==='place';const ok=await game.act(intent);if(!ok)returnAfterWord.current=false;if(ok&&intent.type!=='place')navigate('/delayed/'+matchId);return ok;}}/>
 </div>;
}
