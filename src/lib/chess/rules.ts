import {Chess,type Color,type PieceSymbol,type Square} from 'chess.js';
import configuration from './configuration.json' with {type:'json'};
import type {ChessBotDifficulty} from './botConfig.js';
export const CHESS_RULES=configuration;
export type Promotion='q'|'r'|'b'|'n';
export interface ChessPlayer {id:string;userId:string;name:string;seat:number;isBot:boolean}
export interface CapturedPiece {id:string;type:PieceSymbol}
export interface ChessMove {ply:number;from:Square;to:Square;color:Color;piece:PieceSymbol;promotion?:Promotion;capture?:{square:Square;piece:PieceSymbol;color:Color};rook?:{from:Square;to:Square};at:number;fen:string}
export interface ChessState {
 bot?:{version:'ptown-chess-bot/1';difficulty:ChessBotDifficulty};
 identity:{sessionId:string;dealerGameId:string;roundId:string};rules:typeof CHESS_RULES;
 mode:'live'|'async';players:ChessPlayer[];backgroundId:string;initialFen:string;fen:string;
 phase:'playing'|'complete';turnIndex:number;turn:number;deadline:number;opened:boolean;clockDuration:number;
 moves:ChessMove[];captured:Record<Color,CapturedPiece[]>;banks:Record<string,number[]>;
 positions:string[];scores:Record<string,number>;winnerIds:string[];reason?:string;
 movePresentation?:{readyAt:number};
 terminal?:{resultId:string;winnerIds:string[];score:number;startedAt:number;deadline:number};
}
export type ChessIntent={type:'move';from:Square;to:Square;promotion?:Promotion;reviveId?:string}|{type:'open'}|{type:'bank';slot:number}|{type:'resign'};
const eligible=(p:CapturedPiece)=>['q','r','b','n'].includes(p.type);
export function promotionOptions(s:ChessState,color:Color){const lost=s.captured[color].filter(eligible);return lost.length?lost.map(p=>({piece:p.type as Promotion,reviveId:p.id})):(['q','r','b','n'] as Promotion[]).map(piece=>({piece,reviveId:undefined}));}
export function chessPosition(s:Pick<ChessState,'fen'|'captured'>){return s.fen.split(' ').slice(0,4).join(' ')+'|'+(['w','b'] as Color[]).map(c=>s.captured[c].filter(eligible).map(p=>p.type).sort().join('')).join('|');}
export function newChess(input:Pick<ChessState,'identity'|'players'|'backgroundId'|'mode'>,at:number,initialFen?:string):ChessState {
 if(input.players.length!==2||input.players[0].id===input.players[1].id||input.players.every(p=>p.isBot)||(input.mode==='async'&&input.players.some(p=>p.isBot)))throw Error('chess:invalid_players');
 const engine=new Chess(initialFen);const s:ChessState={...input,rules:CHESS_RULES,initialFen:engine.fen(),fen:engine.fen(),phase:'playing',turnIndex:engine.turn()==='w'?0:1,turn:1,opened:input.mode==='live',clockDuration:CHESS_RULES.turnMs,deadline:at+(input.mode==='live'?CHESS_RULES.turnMs:CHESS_RULES.availabilityMs),moves:[],captured:{w:[],b:[]},banks:Object.fromEntries(input.players.map(p=>[p.id,[]])),positions:[],scores:Object.fromEntries(input.players.map(p=>[p.id,0])),winnerIds:[]};
 s.positions=[chessPosition(s)];return s;
}
export function finishChess(s:ChessState,winner:string|null,reason:string){s.phase='complete';s.reason=reason;s.winnerIds=winner?[winner]:s.players.map(p=>p.id);s.scores=Object.fromEntries(s.players.map(p=>[p.id,winner===p.id?1:0]));return s;}
export function chessTimeout(input:ChessState,at:number){const s=structuredClone(input);if(s.phase==='playing'&&at>=s.deadline)finishChess(s,s.players[1-s.turnIndex].id,'timeout');return s;}
/** Shared server reducer. Browser may inspect legal destinations, never commit a state. */
export function playChess(input:ChessState,actor:string,intent:ChessIntent,at:number):ChessState {
 const s=structuredClone(input);
 if(s.rules.version!==CHESS_RULES.version)throw Error('chess:rules');
 if(s.phase!=='playing'||at>=s.deadline)throw Error('chess:deadline');
 if(s.players[s.turnIndex].id!==actor)throw Error('chess:not_your_turn');
 if(intent.type==='open'){
  if(s.mode!=='async')throw Error('chess:invalid_action');
  if(!s.opened){s.opened=true;s.clockDuration=s.rules.turnMs;s.deadline=at+s.rules.turnMs;}return s;
 }
 if(!s.opened)throw Error('chess:turn_not_open');
 if(intent.type==='resign')return finishChess(s,s.players[1-s.turnIndex].id,'resignation');
 if(intent.type==='bank'){
  if(![0,1].includes(intent.slot)||s.banks[actor].includes(intent.slot))throw Error('chess:bank_used');
  s.banks[actor].push(intent.slot);s.deadline+=s.rules.timeBankMs;s.clockDuration+=s.rules.timeBankMs;return s;
 }
 if(intent.type!=='move'||!/^[a-h][1-8]$/.test(intent.from)||!/^[a-h][1-8]$/.test(intent.to))throw Error('chess:invalid_action');
 const engine=new Chess(s.fen),color=engine.turn();
 const choices=engine.moves({square:intent.from,verbose:true}).filter(m=>m.to===intent.to);
 if(!choices.length)throw Error('chess:illegal_move');
 const promoting=choices.some(m=>m.promotion);
 if(promoting){
  const option=promotionOptions(s,color).find(p=>p.piece===intent.promotion&&p.reviveId===intent.reviveId);
  if(!option)throw Error('chess:promotion_required');
  if(option.reviveId)s.captured[color]=s.captured[color].filter(p=>p.id!==option.reviveId);
 }else if(intent.promotion||intent.reviveId)throw Error('chess:invalid_promotion');
 const move=engine.move({from:intent.from,to:intent.to,promotion:intent.promotion});
 const ply=s.moves.length+1;
 const event:ChessMove={ply,from:move.from,to:move.to,color,piece:move.piece,promotion:move.promotion as Promotion|undefined,at,fen:engine.fen()};
 if(move.captured){
  const victim:Color=color==='w'?'b':'w';s.captured[victim].push({id:`${s.identity.dealerGameId}:${ply}`,type:move.captured});
  event.capture={piece:move.captured,color:victim,square:move.isEnPassant()?`${move.to[0]}${move.from[1]}` as Square:move.to};
 }
 if(move.isKingsideCastle()||move.isQueensideCastle())event.rook={from:`${move.isKingsideCastle()?'h':'a'}${move.from[1]}` as Square,to:`${move.isKingsideCastle()?'f':'d'}${move.from[1]}` as Square};
 s.fen=engine.fen();s.moves.push(event);s.turnIndex=engine.turn()==='w'?0:1;s.turn++;s.opened=s.mode==='live';s.clockDuration=s.rules.turnMs;s.deadline=at+(s.opened?s.rules.turnMs:s.rules.availabilityMs);
 const key=chessPosition(s);s.positions.push(key);
 if(engine.isCheckmate())finishChess(s,actor,'checkmate');
 else if(engine.isStalemate())finishChess(s,null,'stalemate');
 else if(engine.isInsufficientMaterial())finishChess(s,null,'insufficient_material');
 else if(engine.isDrawByFiftyMoves())finishChess(s,null,'fifty_moves');
 else if(s.positions.filter(p=>p===key).length>=3)finishChess(s,null,'repetition');
 return s;
}
