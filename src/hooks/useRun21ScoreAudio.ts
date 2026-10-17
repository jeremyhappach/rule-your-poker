import {usePresentedScoreAudio} from './usePresentedScoreAudio';
import type {BoardProjection} from '@/lib/run21/model';

export function useRun21ScoreAudio(userId:string,scope:string,view:BoardProjection|undefined,now:number,enabled=true){
  const phase=view?.scorePresentation;
  const active=enabled&&view?.pausedAt==null&&phase&&phase.to>phase.from&&now>=phase.startedAt&&now<phase.endsAt;
  const key=active?JSON.stringify([scope,view.roundId,phase.playerId,phase.from,phase.to]):null;
  usePresentedScoreAudio(userId,key?'run21-count:'+key:null,phase,now);
}
