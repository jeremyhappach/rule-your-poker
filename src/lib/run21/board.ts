import type {Board,Card,Config} from './model.js';
import {canFinish,duration,isPerfectBoard,legalColumns,total} from './rules.js';
import {turnReleaseAt} from './roundIntro.js';

export type BoardAction={type:'place';column:number}|{type:'pass'|'collect'};
export function emptyBoard(playerId:string,config:Config):Board{
 return {playerId,columns:Array.from({length:config.columns},()=>[]),passesUsed:0,presented:[],current:null,cardIndex:0,revision:0,startedAt:null,deadline:null,result:null};
}
/** Called only when orchestration gives this participant their turn. */
export function startBoardClock(board:Board,config:Config,at:number){
 if(config.clockStart==='intro_end'){
  board.startedAt=at+(config.roundIntroMs??0);board.deadline=board.startedAt+duration(config);board.firstPlacementDeadline=null;
 }else if(config.firstPlacementSeconds!==undefined)board.firstPlacementDeadline=at+(config.roundIntroMs??0)+config.firstPlacementSeconds*1000;
}
export function presentBoardCard(board:Board,deck:readonly Card[]):boolean{
 board.current=deck[board.cardIndex]??null;
 if(board.current)board.presented.push(structuredClone(board.current));
 return board.current!==null;
}
export function boardActionError(board:Board,config:Config,action:BoardAction,at:number):string|null{
 const release=turnReleaseAt(board,config);
 if(release!==null&&at<release)return 'round_intro';
 if(action.type==='place'&&(!Number.isInteger(action.column)||!legalColumns(board,config).includes(action.column)))return 'column_locked';
 if(action.type==='pass'&&board.passesUsed>=config.passes)return 'pass_used';
 if(action.type==='collect'&&!canFinish(board,config))return 'collect_unavailable';
 return null;
}
/** Shared board mutation; adapters own events, round results and progression. */
export function moveBoardCard(board:Board,config:Config,action:{type:'place';column:number}|{type:'pass'},at:number):'bust'|'collect'|null{
 if(action.type==='place'){
  if(board.startedAt===null){board.startedAt=at;board.deadline=at+duration(config);if(board.firstPlacementDeadline!==undefined)board.firstPlacementDeadline=null;}
  board.columns[action.column].push(board.current!);
 }else board.passesUsed++;
 board.current=null;board.cardIndex++;
 if(board.columns.some(c=>total(c,config.target).bust))return 'bust';
 return action.type==='place'&&isPerfectBoard(board,config)?'collect':null;
}
