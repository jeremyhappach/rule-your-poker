import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {fiveAliveAsyncOperation} from './async.js';
import {createSealedGame,submitSealedGuess} from './rules.js';

it('projects only the viewer and seals a submitted word until both finish',async()=>{
 const organizer=randomUUID(),opponent=randomUUID(),id=randomUUID();
 let row={id,game_type:'five-alive',revision:1,segment:1,terminal:false,held:false,status:'active',organizer,opponent,
  config:{poolVersion:'esdb-five-alive/1'},outcome:null,state:{fiveAlive:createSealedGame([organizer,opponent],[{word:'APPLE',difficulty:1},{word:'BREAD',difficulty:2},{word:'CLOUD',difficulty:3}])}};
 let writes=0;
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  if(name==='delayed_five_alive_load')return {...row,receipt:null};
  if(name==='delayed_five_alive_commit'){const game=args.p_game as typeof row.state.fiveAlive;writes++;row={...row,revision:row.revision+1,segment:row.segment+(game.current-row.state.fiveAlive.current),state:{fiveAlive:game}};return {outcome:'committed',record:row};}
  throw Error(name);
 };
 const body=(revision:number,segment:number,word:string)=>({op:'action',childId:id,requestId:randomUUID(),revision,segment,intent:{type:'guess',word}});
 const alice=await fiveAliveAsyncOperation(rpc,organizer,body(1,1,'APPLE'));
 expect(alice.view.current).toEqual({completed:true,waiting:true});
 expect(alice.view.ownScore).toBe(0);expect(alice.view.ownResult?.answer).toBe('APPLE');
 const bob=await fiveAliveAsyncOperation(rpc,opponent,{op:'state',childId:id});
 expect(JSON.stringify(bob)).not.toContain('APPLE');expect(bob.view.opponentScore).toBe(0);
 const result=await fiveAliveAsyncOperation(rpc,opponent,body(2,1,'APPLE'));
 expect(result.view.round).toBe(2);expect(result.view.opponentScore).toBe(800);
 expect(result.view.revealed[0].opponent.answer).toBe('APPLE');expect(writes).toBe(2);
});

it('retries only an opponent-only same-round conflict with the original receipt identity',async()=>{
 const organizer=randomUUID(),opponent=randomUUID(),id=randomUUID(),requestId=randomUUID();
 const original=createSealedGame([organizer,opponent],[{word:'APPLE',difficulty:1},{word:'BREAD',difficulty:2},{word:'CLOUD',difficulty:3}]);
 const row={id,game_type:'five-alive',revision:1,segment:1,terminal:false,held:false,status:'active',organizer,opponent,config:{poolVersion:'esdb-five-alive/1'},outcome:null,state:{fiveAlive:original}};
 const concurrent=submitSealedGuess(original,opponent,'APPLE',()=>true);
 let calls=0;
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  if(name==='delayed_five_alive_load')return row;
  calls++;
  expect(args.p_request).toBe(requestId);
  expect((args.p_fingerprint as {revision:number}).revision).toBe(1);
  if(calls===1)return {outcome:'conflict',record:{...row,revision:2,state:{fiveAlive:concurrent}}};
  expect(args.p_revision).toBe(2);
  const game=args.p_game as typeof original;
  expect(game.current).toBe(1);
  expect(game.rounds[0][0].completed).toBe(true);
  expect(game.rounds[1][0].completed).toBe(true);
  return {outcome:'committed',record:{...row,revision:3,segment:2,state:{fiveAlive:game}}};
 };
 const result=await fiveAliveAsyncOperation(rpc,organizer,{op:'action',childId:id,requestId,revision:1,segment:1,intent:{type:'guess',word:'APPLE'}});
 expect(calls).toBe(2);expect(result.view.round).toBe(2);
});

it('does not retry a conflict that changed the requesting player',async()=>{
 const organizer=randomUUID(),opponent=randomUUID(),id=randomUUID();
 const game=createSealedGame([organizer,opponent],[{word:'APPLE',difficulty:1},{word:'BREAD',difficulty:2},{word:'CLOUD',difficulty:3}]);
 const row={id,game_type:'five-alive',revision:1,segment:1,terminal:false,held:false,status:'active',organizer,opponent,config:{poolVersion:'esdb-five-alive/1'},outcome:null,state:{fiveAlive:game}};
 let calls=0;
 const rpc=async(name:string)=>{
  if(name==='delayed_five_alive_load')return row;
  calls++;
  return {outcome:'conflict',record:{...row,revision:2,state:{fiveAlive:submitSealedGuess(game,organizer,'BREAD',()=>true)}}};
 };
 await expect(fiveAliveAsyncOperation(rpc,organizer,{op:'action',childId:id,requestId:randomUUID(),revision:1,segment:1,intent:{type:'guess',word:'APPLE'}})).rejects.toThrow('delayed:stale_action');
 expect(calls).toBe(1);
});

it('admits a pre-load peer update but rejects own progress, future and unproven revisions',async()=>{
 const organizer=randomUUID(),opponent=randomUUID(),id=randomUUID();
 const original=createSealedGame([organizer,opponent],[{word:'APPLE',difficulty:1},{word:'BREAD',difficulty:2},{word:'CLOUD',difficulty:3}]);
 const game=submitSealedGuess(original,opponent,'APPLE',()=>true);
 const row={id,game_type:'five-alive',revision:2,segment:1,terminal:false,held:false,status:'active',organizer,opponent,config:{poolVersion:'esdb-five-alive/1'},outcome:null,state:{fiveAlive:game},actor_revision:0};
 const body={op:'action',childId:id,requestId:randomUUID(),revision:1,segment:1,intent:{type:'guess',word:'APPLE'}};
 let writes=0;
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  if(name==='delayed_five_alive_load')return row;
  writes++;expect(args.p_revision).toBe(2);expect((args.p_fingerprint as {revision:number}).revision).toBe(1);
  return {outcome:'committed',record:{...row,revision:3,segment:2,state:{fiveAlive:args.p_game}}};
 };
 expect((await fiveAliveAsyncOperation(rpc,organizer,body)).view.round).toBe(2);
 expect(writes).toBe(1);
 for(const override of [{actor_revision:2},{actor_revision:undefined},{segment:2}]){
  await expect(fiveAliveAsyncOperation(async()=>({...row,...override}),organizer,body)).rejects.toThrow('delayed:stale_action');
 }
 await expect(fiveAliveAsyncOperation(rpc,organizer,{...body,revision:3})).rejects.toThrow('delayed:stale_action');
 expect(writes).toBe(1);
});
