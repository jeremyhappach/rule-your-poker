import type {ChessState} from './rules';

type Result=Pick<ChessState,'players'|'winnerIds'|'reason'>;
/** Names come from the saved participants; outcome identity always uses UUIDs. */
export function chessResultText(state:Result){
 const winner=state.players.find(p=>p.id===state.winnerIds[0]);
 if(state.winnerIds.length!==1)return 'Draw';
 const loser=state.players.find(p=>p.id!==winner?.id);
 if(state.reason==='timeout')return `${loser?.name??'Player'} timed out · ${winner?.name??'Opponent'} wins`;
 if(state.reason==='resignation')return `${loser?.name??'Player'} forfeited · ${winner?.name??'Opponent'} wins`;
 return `${state.reason==='checkmate'?'Checkmate · ':''}${winner?.name??'Player'} wins`;
}
