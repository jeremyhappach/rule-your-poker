import type {ChipPresentationBatch} from '../canonicalShell/ChipPresentationLedger';
export interface Tile {id:number;face:string;value:number;letter?:string;blank?:boolean}
export interface Placement {tileId:number;square:number;letter:string}
export type Intent={type:'place';items:Placement[]}|{type:'exchange';items:{tileId:number}[]}|{type:'pass'|'request_pause'}|{type:'time_bank';items:{slot:number}[]};
export interface WordsSnapshot {
 identity:{sessionId:string;dealerGameId:string;roundId:string};revision:number;serverAt:number;
 rules:{version:string;dictionaryId:string;dictionarySha256:string;turnMs:number;timeBankUses?:number;timeBankMs?:number};
 timeBankSpent?:Record<string,number[]>;hostUserId?:string;pauseVersion?:number;
 pauseRequest?:{id:string;playerId:string;hostUserId:string;pauseVersion:number};
 board:(Tile|null)[];rack:Tile[];rackCounts:Record<string,number>;bagCount:number;
 players:{id:string;userId:string;name:string;seat:number;isBot:boolean}[];scores:Record<string,number>;
 viewerId:string;activePlayerId:string;turn:number;deadline:number;phase:'playing'|'complete';
 canAct:boolean;paused:boolean;pausedAt:number|null;finished:boolean;settlement:Record<string,number>|null;
 financial:{balances:Record<string,number>;resultId:string|null;batch:ChipPresentationBatch|null};
 terminal?:{resultId:string;winnerIds:string[];score:number;startedAt:number;deadline:number};
 moves:{turn:number;playerId:string;action:string;points:number;count:number;words:{word:string;points:number;square?:number;direction?:number}[]}[];
 movePresentation?:{version:1;turn:number;playerId:string;squares:number[];startedAt:number;announceAt:number;readyAt:number;flipMs:number;focusMs:number;noticeMs:number};
 event:{label:string;points:number};rackDeductions?:Record<string,number>;
}
export function acceptWordsSnapshot(old:WordsSnapshot|null,next:WordsSnapshot,id:string){
 if(next.identity?.dealerGameId!==id||!Number.isSafeInteger(next.revision)||next.board?.length!==225||!Array.isArray(next.rack)||next.rack.length>7)throw Error('Invalid Ptown Words snapshot');
 if(old&&next.revision<old.revision)return old;
 if(old&&next.revision===old.revision){const semantic=(v:WordsSnapshot)=>JSON.stringify({...v,serverAt:0,financial:undefined});if(semantic(old)!==semantic(next))throw Error('Conflicting Ptown Words snapshot');}
 return next;
}
/** Presentation labels only. PostgreSQL owns all premium scoring. */
export function premiumAt(square:number):string{
 const r=Math.floor(square/15),c=square%15;
 if(([0,14].includes(r)&&[0,7,14].includes(c))||(r===7&&[0,14].includes(c)))return 'TW';
 if((r===c||r+c===14)&&((r>=1&&r<=4)||(r>=10&&r<=13)||r===7))return 'DW';
 if(([1,13].includes(r)&&[5,9].includes(c))||([5,9].includes(r)&&[1,5,9,13].includes(c)))return 'TL';
 if(([0,14].includes(r)&&[3,11].includes(c))||([2,12].includes(r)&&[6,8].includes(c))||([3,11].includes(r)&&[0,7,14].includes(c))||([6,8].includes(r)&&[2,6,8,12].includes(c))||(r===7&&[3,11].includes(c)))return 'DL';
 return '';
}
