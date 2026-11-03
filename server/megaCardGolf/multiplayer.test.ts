import {describe,it,expect} from 'vitest';
import {liveTransition,projectLive,type MegaLiveRow} from './multiplayer';
import {competitionConfig,MEGA_HOLE_COUNTS} from '../../src/lib/megaCardGolf/competition';
import {INITIAL_COURSES} from '../../src/lib/megaCardGolf/config';
import {golfVisibleSubtotal} from '../../src/lib/golf/scoring';
describe('live Mega shares Arcade rules across competition lengths',()=>{
 for(const course of INITIAL_COURSES)for(const holes of MEGA_HOLE_COUNTS)it(course.id+' '+holes+' holes with three independent players',()=>{
  const players=[0,1,2].map(i=>({id:'p'+i,userId:'u'+i,name:'Player',seat:i+1,isBot:false,chips:100}));
  const row:MegaLiveRow={dealer_game_id:'game',game_id:'session',round_id:'round',server_at:1000,revision:0,paused_at:null,settlement:null,finished:false,viewer:'p0',financial:null,state:{identity:{sessionId:'session',dealerGameId:'game',roundId:'round'},rules:{...competitionConfig(course,holes),holes},players,phase:'ready',turnIndex:0,hole:1,deadline:1000,board:null,runs:{},scores:Object.fromEntries(players.map(p=>[p.id,0])),results:[],holes:[]}};
  for(let turn=0;turn<holes*3;turn++){
   row.server_at=row.state.deadline;row.state=liveTransition(row,{type:'tick'});
   expect(row.state.board!.hole).toBe(Math.floor(turn/3)+1);
   for(let i=0;i<course.initialExposed;i++){row.server_at++;row.state=liveTransition(row,{type:'open',indices:[i]});}
   row.server_at++;row.state=liveTransition(row,{type:'stand-pat'});
   const result=row.state.results.at(-1)!;
   expect(result.score).toBe(golfVisibleSubtotal(result.cards));
   expect(row.state.deadline).toBeGreaterThan(result.endsAt);
   expect(row.state.results).toHaveLength(turn+1);
   expect(JSON.stringify(projectLive(row))).not.toContain('"decks"');
  }
  expect(row.state.phase).toBe('complete');expect(row.state.holes).toHaveLength(holes);
  for(const p of players)expect(row.state.scores[p.id]).toBe(row.state.results.filter(r=>r.actor===p.id).reduce((sum,r)=>sum+r.score,0));
 });
});
