import {useEffect,useRef,useState} from 'react';
import {useTriTowers} from '@/hooks/useTriTowers';
import {TriTowersRules,TriTowersView} from './TriTowersView';
import {triTowersRpc} from '@/lib/triTowers/client';
import {useGameChatContext} from '@/hooks/GameChatContext';
import {MobileChatPanel} from '@/components/MobileChatPanel';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import type {Projection} from '@/lib/triTowers/model';
interface Props {dealerGameId:string;userId:string;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;
 sessionEnded:boolean;onTerminalActive:(active:boolean)=>void;onTerminalComplete:(id:string)=>void}
export function TriTowersGame(props:Props){
  const game=useTriTowers(props.dealerGameId),chat=useGameChatContext(),announcements=useAnnouncements();
  const [history,setHistory]=useState<{revision:number;frame:Projection}[]>([]),[error,setError]=useState(''),[closing,setClosing]=useState(false);
  const terminal=useRef<string|null>(null),completed=useRef<string|null>(null),callbacks=useRef(props);callbacks.current=props;
  const complete=(view:Projection)=>{
    if(completed.current===view.identity.dealerGameId)return;
    completed.current=view.identity.dealerGameId;
    callbacks.current.onTerminalComplete(`tri-towers|winseq|${view.identity.sessionId}|${view.identity.dealerGameId}|1`);
    callbacks.current.onTerminalActive(false);
  };
  useEffect(()=>{
    if(!game.view?.settlement||terminal.current===props.dealerGameId||props.sessionEnded)return;
    if(game.view.finished){complete(game.view);return;}
    terminal.current=props.dealerGameId;callbacks.current.onTerminalActive(true);
    announcements.emit({id:`match_win:tri-towers:${props.dealerGameId}`,type:'match_win',scope:{dealerGameId:game.view.identity.sessionId,roundId:game.view.identity.roundId},
      payload:{text:`TriTowers complete · ${game.view.players.map(p=>`${p.name}: ${game.view!.scores[p.id].toLocaleString()}`).join(' · ')}`},ttlMs:10000});
  },[game.view,props.dealerGameId,props.sessionEnded,announcements]);
  useEffect(()=>{if(game.view?.finished)complete(game.view);},[game.view]);
  useEffect(()=>{if(props.activeTab!=='history')return;let alive=true;
    void triTowersRpc<typeof history>('tri_towers_history',{p_dealer_game_id:props.dealerGameId}).then(rows=>{if(alive)setHistory(rows);}).catch(e=>{if(alive)setError(e.message);});
    return()=>{alive=false;};
  },[props.activeTab,props.dealerGameId]);
  if(!game.view)return <div role="status" className="p-4">{game.error||'Connecting to TriTowers…'} <button onClick={game.reconnect}>Reconnect</button></div>;
  const view=game.view;
  const close=async()=>{if(closing)return;setClosing(true);try{await triTowersRpc('tri_towers_close',{p_dealer_game_id:props.dealerGameId});complete(view);
  }catch(e){setError((e as Error).message);}finally{setClosing(false);}};
  const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>:
    props.activeTab==='history'?<div className="space-y-2">{history.map(row=><p key={row.revision}>#{row.revision} · {row.frame.event.label} · {row.frame.score.toLocaleString()}</p>)}</div>:
    <><TriTowersRules/><div>{view.players.map(p=><p key={p.id}>{p.name} · {p.id in view.scores?view.scores[p.id].toLocaleString():'Turn pending'}</p>)}</div></>;
  return <TriTowersView {...game} view={view} onIntent={game.act} activeTab={props.activeTab} setActiveTab={props.setActiveTab}
    panel={panel} sessionEnded={props.sessionEnded} onContinue={view.settlement&&!closing?()=>void close():undefined}
    error={(error||game.error||!game.connected)&&<div role="status" className="tri-error">{error||game.error||'Reconnecting…'} <button onClick={game.reconnect}>Reconnect</button></div>}/>;
}
