import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {fiveAliveAsyncOperation} from './async.js';
import {fiveAliveArcadeOperation} from './arcade.js';
import {createSealedGame,createSoloGame} from './rules.js';

for(const version of ['esdb-five-alive/1','esdb-five-alive/2','unknown']){
 it(`both adapters select the frozen vocabulary ${version}`,async()=>{
  const actor=randomUUID(),opponent=randomUUID(),id=randomUUID(),config={version:'five-alive/1',poolVersion:version};
  const word=version==='esdb-five-alive/1'?'APPLE':'ABOUT';
  const answers=[{word,difficulty:1},{word:'BREAD',difficulty:2},{word:'CLOUD',difficulty:3}] as const;
  let commits=0;
  const child={id,game_type:'five-alive',revision:1,segment:1,terminal:false,held:false,status:'active',organizer:actor,opponent,config,outcome:null,state:{fiveAlive:createSealedGame([actor,opponent],answers)}};
  const run={id,user_id:actor,game:'five-alive',ruleset:version.endsWith('/1')?'five-alive/1':'five-alive/2',revision:1,status:'active',score:0,config,state:{...createSoloGame(answers),runId:id,userId:actor,config,round:1,status:'active',score:0}};
  const rpc=async(name:string,args:Record<string,any>)=>{
   if(name==='delayed_five_alive_load')return child;
   if(name==='arcade_load')return run;
   commits++;
   if(name==='delayed_five_alive_commit')return {outcome:'committed',record:{...child,revision:2,state:{fiveAlive:args.p_game}}};
   if(name==='arcade_commit')return {outcome:'committed',record:{...run,revision:2,state:args.p_state,score:args.p_state.score}};
   throw Error(name);
  };
  const command={op:'action',requestId:randomUUID(),revision:1,intent:{type:'guess',word}};
  const asyncAction=()=>fiveAliveAsyncOperation(rpc,actor,{...command,childId:id,segment:1});
  const arcadeAction=()=>fiveAliveArcadeOperation(rpc,actor,{...command,runId:id,roundId:id+':1'});
  if(version==='unknown'){
   await expect(asyncAction()).rejects.toThrow('five_alive:unknown_vocabulary');
   await expect(arcadeAction()).rejects.toThrow('five_alive:unknown_vocabulary');expect(commits).toBe(0);
  }else{
   expect((await asyncAction()).view.ownResult?.answer).toBe(word);
   expect((await arcadeAction()).view.revealed[0].answer).toBe(word);expect(commits).toBe(2);
  }
 });
}
