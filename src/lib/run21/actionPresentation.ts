import type {BoardProjection,Command,Intent} from './model';
import {legalColumns} from './rules';

export type PendingRun21Action=Pick<Command,'roundId'|'playerId'|'requestId'|'revision'> & {
 intent:Intent|{type:'abandon'};identity?:Command['identity'];runRevision?:number;
};
export class UncertainRun21Action extends Error {}
export function pendingPlacement<T extends BoardProjection>(view:T,command:PendingRun21Action|null):T {
 if(!command||command.intent.type!=='place'||view.roundId!==command.roundId||view.active_player_id!==command.playerId||view.viewerId!==command.playerId||view.revealed||view.scorePresentation||view.pausedAt!=null)return view;
 const board=view.boards[command.playerId],column=command.intent.column;
 if(!board?.current||board.result||board.revision!==command.revision||!legalColumns(board,view.config).includes(column))return view;
 return {...view,boards:{...view.boards,[command.playerId]:{...board,current:null,columns:board.columns.map((cards,i)=>i===column?[...cards,board.current!]:cards)}}};
}
export function storedAction(value:unknown):value is PendingRun21Action {
 const c=value as PendingRun21Action;
 return !!c&&typeof c.requestId==='string'&&typeof c.roundId==='string'&&typeof c.playerId==='string'&&Number.isSafeInteger(c.revision)&&
  !!c.intent&&(['pass','collect','abandon'].includes(c.intent.type)||c.intent.type==='place'&&Number.isInteger(c.intent.column));
}
