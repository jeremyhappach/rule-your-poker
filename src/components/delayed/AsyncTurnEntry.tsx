import {useLocation,useParams} from 'react-router-dom';
import {AsyncTurnStage} from './AsyncTurnStage';
export function AsyncTurnEntry(){
 const {matchId,childId}=useParams(),{state}=useLocation(),hint=state?.asyncEntry;
 const matchingTurn=!!matchId&&!!childId&&hint?.matchId===matchId&&hint?.childId===childId;
 const title=matchingTurn&&hint.reviewPending&&hint.opponentName?'Showing '+hint.opponentName+"'s results":undefined;
 return <AsyncTurnStage matchId={matchId} title={title}/>;
}
