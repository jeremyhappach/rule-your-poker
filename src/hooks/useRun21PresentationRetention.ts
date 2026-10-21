import {useCallback,useRef} from 'react';
import {useLocalTerminalPresentation} from '@/lib/canonicalShell/localTerminalPresentation';

/** Match-scoped adapter to the shell's existing local presentation owner. */
export function useRun21PresentationRetention<T extends {dealerGameId:string;firstRoundId:string}>(
  sessionId:string|null, live:T|null,gameType:'run21'|'eleven-up'|'royal-flash'|'race-poker'|'battle-31'|'boxdrop'|'trip-flip'|'take-two'='run21',
) {
  const observed=useRef<{sessionId:string|null;snapshot:T|null;completed:Set<string>}>({sessionId,snapshot:null,completed:new Set()});
  if(observed.current.sessionId!==sessionId)observed.current={sessionId,snapshot:null,completed:new Set()};
  const prior=observed.current.snapshot;
  // Keep the old identity until its presentation completes, even if setup has
  // already produced a successor. Fresh terminal mounts have no observed live match.
  if(live&&!observed.current.completed.has(live.dealerGameId)&&(!prior||prior.dealerGameId===live.dealerGameId))
    observed.current.snapshot={...live,firstRoundId:prior?.firstRoundId??live.firstRoundId};
  const snapshot=observed.current.snapshot;
  const terminal=useLocalTerminalPresentation({sessionId,
    scope:sessionId&&snapshot?{gameId:sessionId,gameType,dealerGameId:snapshot.dealerGameId,roundId:snapshot.firstRoundId,handNumber:1}:null,
    live:!!live&&live.dealerGameId===snapshot?.dealerGameId,
    terminal:!!snapshot&&live?.dealerGameId!==snapshot.dealerGameId,snapshot,
  });
  const complete=useCallback((token:string)=>{
    const [family,phase,gameId,dealerGameId,handNumber,resultId,roundId]=token.split('|');
    const current=observed.current;
    if(family!==gameType||phase!=='winseq'||gameId!==current.sessionId||handNumber!=='1'||!resultId||
      dealerGameId!==current.snapshot?.dealerGameId||roundId!==current.snapshot.firstRoundId)return false;
    current.completed.add(dealerGameId);current.snapshot=null;
    terminal.complete(token);
    return true;
  },[terminal.complete,gameType]);
  return {pending:terminal.pending,snapshot,complete};
}
