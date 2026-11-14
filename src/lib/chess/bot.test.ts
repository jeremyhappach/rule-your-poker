import {describe,it,expect,vi} from 'vitest';
import {chooseChessBotMove,chessBotMoves} from '../../../server/chess/bot';
import {recoverChess} from '../../../server/chess/recovery';
import {newChess,playChess,type ChessState} from './rules';
import {chessBotDifficulty,CHESS_BOT_DIFFICULTIES} from './botConfig';
function fixture(fen?:string):ChessState {
  const s=newChess({identity:{sessionId:'session',dealerGameId:'match',roundId:'round'},mode:'live',backgroundId:'',players:[{id:'bot',userId:'bot-user',name:'Bot',seat:0,isBot:true},{id:'human',userId:'user',name:'Player',seat:1,isBot:false}]},1000,fen);
  s.bot={version:'ptown-chess-bot/1',difficulty:'medium'};return s;
}
describe('Chess bot policy',()=>{
  it('defaults to medium and rejects unknown difficulty',()=>{expect(chessBotDifficulty(undefined)).toBe('medium');expect(()=>chessBotDifficulty('impossible')).toThrow('chess:bot_difficulty');});
  it.each(CHESS_BOT_DIFFICULTIES)('%s plays a legal opening without mutating the position',difficulty=>{
    const s=fixture();s.bot!.difficulty=difficulty;const before=structuredClone(s);
    const choice=chooseChessBotMove(s,1000),next=playChess(s,'bot',choice.intent,1000);
    expect(next.moves).toHaveLength(1);expect(next.turnIndex).toBe(1);expect(s).toEqual(before);expect(choice.nodes).toBeLessThanOrEqual(3500);expect(choice.depth).toBeGreaterThan(0);
  });
  it.each(CHESS_BOT_DIFFICULTIES)('%s takes immediate checkmate',difficulty=>{
    const s=fixture('R5bk/8/4Q1K1/8/8/8/8/8 w - - 0 1');s.bot!.difficulty=difficulty;
    const result=playChess(s,'bot',chooseChessBotMove(s,1000).intent,1000);
    expect(result.reason).toBe('checkmate');expect(result.winnerIds).toEqual(['bot']);
  });
  it('revives only a captured eligible piece and consumes its exact receipt',()=>{
    const s=fixture('7k/P7/8/8/8/8/8/7K w - - 0 1');s.captured.w=[{id:'rook',type:'r'},{id:'pawn',type:'p'}];
    const choices=chessBotMoves(s).filter(move=>move.from==='a7');
    expect(choices).toEqual([{type:'move',from:'a7',to:'a8',promotion:'r',reviveId:'rook'}]);
    const next=playChess(s,'bot',choices[0],1000);expect(next.captured.w).toEqual([{id:'pawn',type:'p'}]);
  });
  it('includes castling and en passant using the shared legal generator',()=>{
    expect(chessBotMoves(fixture('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'))).toEqual(expect.arrayContaining([{type:'move',from:'e1',to:'g1'},{type:'move',from:'e1',to:'c1'}]));
    expect(chessBotMoves(fixture('7k/8/8/3pP3/8/8/8/7K w - d6 0 1'))).toContainEqual({type:'move',from:'e5',to:'d6'});
  });
  it('cannot play a human, expired or async turn',()=>{
    const s=fixture();expect(()=>chooseChessBotMove(s,s.deadline)).toThrow('bot_not_due');s.players[0].isBot=false;expect(()=>chooseChessBotMove(s,1000)).toThrow('bot_not_due');s.players[0].isBot=true;s.mode='async';expect(()=>chooseChessBotMove(s,1000)).toThrow('bot_not_due');
  });
  it('rejects all-bot and async bot admission',()=>{
    const s=fixture();expect(()=>newChess({...s,mode:'async'},1000)).toThrow('invalid_players');s.players[1].isBot=true;expect(()=>newChess(s,1000)).toThrow('invalid_players');
  });
});
describe('Chess bot worker',()=>{
  it('requires a server lease before loading or choosing moves',async()=>{
    const rpc=vi.fn(async()=>({accepted:false}));await expect(recoverChess(rpc,'token')).rejects.toThrow('token_denied');expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('commits against the claimed revision and preserves the frozen difficulty',async()=>{
    const state=fixture();state.bot!.difficulty='easy';const calls:any[]=[];
    const rpc=vi.fn(async(name:string,args:any)=>{calls.push({name,args});if(name==='chess_bot_claim')return {accepted:true,matches:['match']};if(name==='chess_bot_load')return {state,revision:7,serverAt:1000};if(name==='chess_bot_commit')return {outcome:'committed'};});
    expect(await recoverChess(rpc,'token')).toEqual({processed:1,failures:0});
    expect(calls.find(c=>c.name==='chess_bot_commit').args).toMatchObject({p_token:'token',p_revision:7,p_actor:'bot',p_state:{bot:state.bot}});
    expect(calls.at(-1)).toEqual({name:'chess_bot_complete',args:{p_token:'token',p_failure:null}});
  });
  it('skips a paused/retired claim and reports actual failures to the lease owner',async()=>{
    const rpc=vi.fn(async(name:string,args:any)=>{if(name==='chess_bot_claim')return {accepted:true,matches:['paused','broken']};if(name==='chess_bot_load'){if(args.p_id==='paused')return null;throw Error('unavailable');}});
    expect(await recoverChess(rpc,'token')).toEqual({processed:0,failures:1});expect(rpc).toHaveBeenLastCalledWith('chess_bot_complete',{p_token:'token',p_failure:'chess:bot_recovery_failed'});
  });
});
