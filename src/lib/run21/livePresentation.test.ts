// @vitest-environment node
import {expect,it} from 'vitest';
import {LivePresentation,optimisticPlacement} from './livePresentation';
import {act,fixtureMatch,PLAYERS,uuid} from './fixtures';
import {project} from './engine';
import {visibleHistory} from './history';
import type {Command} from './model';
it('consumes missed accepted placements in sequence before a later player frame, without duplicate delivery',()=>{
 let m=act(fixtureMatch(),PLAYERS[0].id,{type:'ready'},0);
 m=act(m,PLAYERS[0].id,{type:'place',column:0},750);
 m=act(m,PLAYERS[0].id,{type:'place',column:1},1500);
 const events=visibleHistory(m,PLAYERS[0].id),p=new LivePresentation();
 p.ingest(events);p.ingest(events);
 expect(p.advance(0)?.frame.boards[PLAYERS[0].id]?.columns.flat()).toHaveLength(0);
 expect(p.advance(749)).toBeNull();expect(p.advance(750)?.frame.boards[PLAYERS[0].id]?.columns.flat()).toHaveLength(1);
 expect(p.advance(1499)).toBeNull();expect(p.advance(1500)?.frame.boards[PLAYERS[0].id]?.columns.flat()).toHaveLength(2);
 expect(p.queue).toHaveLength(0);expect(p.sequence).toBe(events.at(-1)!.sequence);
 p.ingest(events);expect(p.queue).toHaveLength(0);
});
it('lands the known card without changing authority, deadline or next card and reconciles once',()=>{
 const m=act(fixtureMatch(),PLAYERS[0].id,{type:'ready'},0),view=project(m,PLAYERS[0].id),board=view.boards[PLAYERS[0].id]!;
 const command:Command={identity:view.identity,roundId:view.roundId!,playerId:PLAYERS[0].id,requestId:uuid(222),revision:board.revision,intent:{type:'place',column:2}};
 const shown=optimisticPlacement(view,command);
 expect(shown.boards[PLAYERS[0].id]?.columns[2]).toEqual([board.current]);
 expect(shown.boards[PLAYERS[0].id]).toMatchObject({current:null,startedAt:null,deadline:null});
 expect(board.columns[2]).toHaveLength(0);expect(optimisticPlacement(view,null)).toBe(view);
 const accepted=project(act(m,PLAYERS[0].id,{type:'place',column:2},750),PLAYERS[0].id);
 expect(optimisticPlacement(accepted,command)).toBe(accepted);expect(accepted.boards[PLAYERS[0].id]?.columns[2]).toHaveLength(1);
});
it('presents a fresh watched action with its next current card immediately while retaining backlog pacing',()=>{
 let m=act(fixtureMatch(),PLAYERS[0].id,{type:'ready'},0);
 const p=new LivePresentation();p.ingest(visibleHistory(m,PLAYERS[1].id));p.advance(0);
 const first=p.event!.frame.boards[PLAYERS[0].id]!.current;
 m=act(m,PLAYERS[0].id,{type:'place',column:0},750);
 p.ingest(visibleHistory(m,PLAYERS[1].id));expect(p.queue).toHaveLength(1);
 const accepted=p.advance(1,true)!;
 expect(accepted.frame.boards[PLAYERS[0].id]!.columns[0]).toEqual([first]);
 expect(accepted.frame.boards[PLAYERS[0].id]!.current).toBeTruthy();
 expect(accepted.frame.boards[PLAYERS[0].id]!.current).not.toEqual(first);
});
