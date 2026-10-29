import {useLocation,useParams} from 'react-router-dom';
import {AsyncTurnStage} from './AsyncTurnStage';
export function AsyncTurnEntry(){
 const {matchId,childId}=useParams(),{state}=useLocation(),hint=state?.asyncEntry;
 const title=hint?.matchId===matchId&&hint?.childId===childId?(hint.reviewPending&&hint.opponentName?'Showing '+hint.opponentName+"'s results":undefined):undefined;
 return <AsyncTurnStage matchId={matchId} title={title}/>;
}
