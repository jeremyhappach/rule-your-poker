// @vitest-environment node
import {expect,it} from 'vitest';
import {applyCommand,project} from './engine';
import {act,fixtureMatch,PLAYERS,uuid} from './fixtures';
import {chooseAction} from './bot';
import {visibleHistory,exportReplay} from './history';

it('bounded snapshots produce identical commands, receipts, privacy and replay after restart',()=>{
 let full=act(fixtureMatch(),PLAYERS[0].id,{type:'ready'},1);
 let hot={...structuredClone(full),events:[]};
 const journal=structuredClone(full.events);
 for(let n=0;n<18;n++){
  const view=project(full,PLAYERS[0].id),choice=chooseAction(view,full.updatedAt)!;
  if(!choice)break;
  const round=full.rounds.at(-1)!;
  const command={identity:full.identity,roundId:round.id,playerId:PLAYERS[0].id,
   requestId:uuid(5000+n),revision:round.boards[PLAYERS[0].id].revision,intent:choice.intent};
  const a=applyCommand(full,command,{kind:'player' as const,playerId:PLAYERS[0].id},full.updatedAt+1);
  const b=applyCommand(hot,command,{kind:'player' as const,playerId:PLAYERS[0].id},full.updatedAt+1);
  expect(b.status).toBe(a.status);expect(b.status).toBe('accepted');
  full=a.state; journal.push(...b.state.events);
  expect({...b.state,events:journal}).toEqual(full);
  expect(project(b.state,PLAYERS[1].id)).toEqual(project(full,PLAYERS[1].id));
  hot={...structuredClone(b.state),events:[]};
  expect(applyCommand(hot,command,{kind:'player',playerId:PLAYERS[0].id},hot.updatedAt+1).status).toBe('duplicate');
  if(full.rounds.at(-1)!.active_player_id!==PLAYERS[0].id)break;
 }
 expect(journal.length).toBeGreaterThan(10);
 const restored={...hot,events:journal};
 expect(visibleHistory(restored,PLAYERS[0].id)).toEqual(visibleHistory(full,PLAYERS[0].id));
 expect(exportReplay(restored,PLAYERS[0].id)).toEqual(exportReplay(full,PLAYERS[0].id));
});
