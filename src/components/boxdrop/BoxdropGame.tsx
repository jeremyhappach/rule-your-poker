import {useEffect,useRef,useState} from 'react';
import {useBoxdrop,type BoxdropTransport} from '@/hooks/useBoxdrop';
import {BoxdropLoading,BoxdropView} from './BoxdropView';
import {ArcadeCompletion} from '@/components/run21/ArcadeCompletion';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogAction,AlertDialogCancel,AlertDialogFooter} from '@/components/ui/alert-dialog';
interface Props {id:string;userId:string;solo:boolean;transport:BoxdropTransport;liveEntry?:boolean;onComplete:()=>void}
/** Orchestration adapter. The multiplayer parent supplies its canonical shell;
 * solo mounts no multiplayer, financial, seating or session lifecycle owners. */
export function BoxdropGame({id,userId,solo,transport,liveEntry=false,onComplete}:Props){
 const game=useBoxdrop(id,userId,transport),initial=useRef(true),completedOnEntry=useRef(false),done=useRef(false),callback=useRef(onComplete);callback.current=onComplete;
 const [finalUntil,setFinalUntil]=useState<number|null>(null);
 const [abandon,setAbandon]=useState(false);
 useEffect(()=>{if(!game.snapshot)return;if(initial.current){initial.current=false;completedOnEntry.current=game.snapshot.finished;}
  if(!solo||!game.snapshot.finished||done.current)return;
  if(completedOnEntry.current||game.snapshot.abandoned){done.current=true;callback.current();return;}
  if(game.now>=game.snapshot.board.deadline&&finalUntil===null)setFinalUntil(performance.now()+2500);
  if(finalUntil!==null&&performance.now()>=finalUntil){done.current=true;callback.current();}
 },[solo,game.snapshot,game.now,finalUntil]);
 if(!game.snapshot)return <BoxdropLoading solo={solo} error={game.error} onReconnect={game.reconnect}/>;
 const view=<BoxdropView view={game.snapshot} userId={userId} now={game.now} pending={game.pending} connected={game.connected} error={game.error} epoch={game.epoch} liveEntry={liveEntry} onIntent={game.act} onReconnect={game.reconnect} onFinish={solo?undefined:onComplete} onAbandon={solo&&!game.snapshot.finished?()=>setAbandon(true):undefined}/>;
 return solo?<div className="arcade-run" data-shell-presentation-mode="fullscreen">{view}{finalUntil!==null&&performance.now()<finalUntil&&<ArcadeCompletion score={game.snapshot.players[0].score} record={game.snapshot.completion}/>}<AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon game?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard. Clocks continue while this dialog is open.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={game.pending||game.snapshot.finished} onClick={()=>void game.act({type:'abandon'})}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>:view;
}
