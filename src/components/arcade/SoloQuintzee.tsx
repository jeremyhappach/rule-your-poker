import {useEffect,useMemo,useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {QuintzeeView} from '@/components/quintzee/QuintzeeView';
import {quintzeeTransport} from '@/lib/quintzee/client';
import {useQuintzee} from '@/hooks/useQuintzee';
import {ArcadeCompletion} from '@/components/run21/ArcadeCompletion';
import type {QuintzeeProductionSnapshot} from '@/lib/quintzee/client';
export function SoloQuintzee({runId,userId}:{runId:string;userId:string}){
 const navigate=useNavigate(),transport=useMemo(()=>quintzeeTransport(runId,userId,true),[runId,userId]);
 const game=useQuintzee(runId,userId,transport),v=game.snapshot as QuintzeeProductionSnapshot|null;
 const first=useRef(true),endedOnEntry=useRef(false),done=useRef(false);
 useEffect(()=>{
  if(!v)return;
  if(first.current){first.current=false;endedOnEntry.current=v.status!=='active';}
  if(done.current||v.status==='active')return;
  if(endedOnEntry.current||v.status==='abandoned'||game.now>=v.state.board.deadline+2500){done.current=true;navigate('/arcade/quintzee?result='+runId,{replace:true});}
 },[v,game.now,navigate,runId]);
 if(!v)return <div role="status">{game.error||'Loading Quintzee…'}{game.error&&<button onClick={game.reconnect}>Reconnect</button>}</div>;
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen"><QuintzeeView snapshot={v} actor={userId} now={game.now} pending={game.pending} error={game.error} onIntent={game.act} onReconnect={game.reconnect}/>{v.status==='completed'&&game.now>=v.state.board.deadline&&<ArcadeCompletion score={v.state.scores[userId]} record={v.completion}/>}</div>;
}
