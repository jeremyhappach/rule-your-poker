import {useEffect,useReducer,useRef} from 'react';
import {subscribeAuthoritativeRecoverySnapshot} from '@/lib/realtimeAuthoritativeCatchup';

/** Retry an idempotent authority request, never its presentation or settlement.
 * A receipt belongs to one mounted identity; late replies cannot affect its successor.
 * Automatic retries are finite. Explicit/session recovery starts a fresh budget.
 */
export function useCompletionRetry(identity:string) {
  const [revision,wake]=useReducer(n=>n+1,0);
  const owner=useRef({identity,generation:0,alive:true,flight:false,accepted:false,attempts:0,retryAt:0,timer:undefined as ReturnType<typeof setTimeout>|undefined});
  if(owner.current.identity!==identity){
    owner.current.alive=false;clearTimeout(owner.current.timer);
    owner.current={identity,generation:0,alive:true,flight:false,accepted:false,attempts:0,retryAt:0,timer:undefined};
  }
  const current=owner.current;
  useEffect(()=>{
    current.alive=true;current.generation++;current.flight=false;
    const stop=subscribeAuthoritativeRecoverySnapshot(()=>{
      if(!current.alive)return;
      current.attempts=0;current.retryAt=0;wake();
    });
    return()=>{current.alive=false;current.generation++;clearTimeout(current.timer);stop();};
  },[current]);
  return {
    revision,
    reset(){if(!current.alive)return;current.attempts=0;current.retryAt=0;current.accepted=false;wake();},
    begin(){
      if(!current.alive||current.flight||current.accepted||current.attempts>=4||Date.now()<current.retryAt)return null;
      current.flight=true;current.attempts++;
      let finished=false;const generation=current.generation;
      return {
        isCurrent:()=>current.alive&&generation===current.generation,
        defer(){if(finished)return;finished=true;if(!current.alive||generation!==current.generation)return;current.flight=false;current.attempts--;},
        succeed(after:()=>void){if(finished)return;finished=true;if(!current.alive||generation!==current.generation)return;current.flight=false;current.accepted=true;after();},
        fail(after:()=>void){if(finished)return;finished=true;if(!current.alive||generation!==current.generation)return;current.flight=false;after();
          if(current.attempts<4){current.retryAt=Date.now()+1000;clearTimeout(current.timer);current.timer=setTimeout(()=>{if(current.alive)wake();},1000);}
        },
      };
    },
  };
}
