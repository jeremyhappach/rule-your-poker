import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {fiveAliveArcadeOperation} from './arcade.js';
import {createSoloGame} from './rules.js';

it('uses the existing Arcade commit boundary and never returns future answers',async()=>{
 const actor=randomUUID(),id=randomUUID(),rules={version:'five-alive/1',poolVersion:'esdb-five-alive/1'};
 const answers=[{word:'APPLE',difficulty:1},{word:'BREAD',difficulty:2},{word:'CLOUD',difficulty:3}];
 let run={id,user_id:actor,game:'five-alive',ruleset:'five-alive/1',revision:0,status:'active',score:0,config:rules,
  state:{...createSoloGame(answers),runId:id,userId:actor,config:rules,round:1,status:'active',score:0}};
 let commits=0;
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  if(name==='arcade_load')return {...run,receipt:null};
  if(name==='arcade_commit'){const state=args.p_state as typeof run.state;commits++;run={...run,state,revision:run.revision+1,status:state.status,score:state.score};return {outcome:'committed',record:run};}
  throw Error(name);
 };
 const body={op:'action',runId:id,revision:0,roundId:id+':1',requestId:randomUUID(),intent:{type:'guess',word:'ZZZZZ'}};
 await expect(fiveAliveArcadeOperation(rpc,actor,body)).rejects.toThrow('arcade:invalid_guess');
 expect(commits).toBe(0);
 const result=await fiveAliveArcadeOperation(rpc,actor,{...body,intent:{type:'guess',word:'APPLE'}});
 expect(commits).toBe(1);expect(result.score).toBe(800);
 expect(JSON.stringify(result)).not.toContain('BREAD');
 expect(JSON.stringify(result)).not.toContain('CLOUD');
 expect(result.view.revealed[0].answer).toBe('APPLE');
});
