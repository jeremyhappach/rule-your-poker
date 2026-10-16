import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {createSoloRun,advanceSolo,applySolo,soloProjection,nextDue} from './run21';
import {assertConfig,DEFAULT_CONFIG} from '../run21/model';
import {duration,speedAt,scoreBoard} from '../run21/rules';
import {turnReleaseAt,roundIntro} from '../run21/roundIntro';
import {Run21Timer} from '../../components/run21/Run21PlayerPane';
import {fixtureDeck,PLAYERS,uuid} from '../run21/fixtures';
import type {ArcadeConfig,RunRecord} from './model';

export const config:ArcadeConfig={...DEFAULT_CONFIG,preset:'run21/arcade-2',clockStart:'intro_end',
 speed:{start:280,decrement:2,intervalMs:420,bands:[{until:200,intervalMs:420},{until:0,intervalMs:900}]},
 roundIntroMs:2500,roundDurationMs:106800,scorePresentationMs:5000,silverCelebrationMs:2800,goldCelebrationMs:3800};
const row:RunRecord={id:uuid(22),user_id:PLAYERS[0].id,game:'run21',ruleset:'run21/arcade-2',config,revision:0,state:null,status:'active',created_at:new Date(0).toISOString(),server_at:0};
const create=()=>createSoloRun(row,0,()=>fixtureDeck([],3).cards);
describe('Arcade Run21 scoring version two',()=>{
 it('uses every accepted tick boundary, including the band transition and zero',()=>{
  assertConfig(config);expect(duration(config)).toBe(106800);
  const b=create().board;
  for(const [elapsed,value] of [[-1,280],[0,280],[419,280],[420,278],[16799,202],[16800,200],[17699,200],[17700,198],[106799,2],[106800,0],[999999,0]])
   expect(speedAt(b,config,2500+elapsed),String(elapsed)).toBe(value);
 });
 it('freezes the intro-end origin; pass, placement and reload do not restart it',()=>{
  let s=create();expect(s.board.startedAt).toBe(2500);expect(s.board.deadline).toBe(109300);expect(s.board.firstPlacementDeadline).toBeNull();
  expect(turnReleaseAt(s.board,config)).toBe(2500);
  const view=soloProjection({...row,state:s},'You',0).view;
  expect(roundIntro(view,2499)).not.toBeNull();expect(roundIntro(view,2500)).toBeNull();
  expect(()=>applySolo(s,{type:'place',column:0},2499)).toThrow('round_intro');
  s=applySolo(s,{type:'pass'},2500);s=applySolo(s,{type:'place',column:0},4500);
  const resumed=advanceSolo(JSON.parse(JSON.stringify(s)),10000);
  expect(resumed.board.startedAt).toBe(2500);expect(resumed.board.deadline).toBe(109300);
  expect(resumed.board.firstPlacementDeadline).toBeNull();
 });
 it('renders the same configured speed that scoring uses',()=>{
  const s=create(),view=soloProjection({...row,state:s},'You',0).view;
  for(const [t,speed]of [[2500,280],[2920,278],[19300,200],[20200,198],[109300,0]])
   expect(renderToStaticMarkup(<Run21Timer view={view} now={t}/>)).toContain('data-run21-speed="'+speed+'"');
 });
 it('gives deadline precedence even on a qualifying board',()=>{
  const s=create();s.board.columns=Array.from({length:5},()=>[{rank:'K' as const,suit:'hearts' as const},{rank:'Q' as const,suit:'spades' as const}]);
  expect(scoreBoard(s.board,config,'collect',109299).score).toBe(400);
  expect(scoreBoard(s.board,config,'collect',109300).score).toBe(0);
  for(const t of [109300,109301]){
   const expired=advanceSolo(s,t);expect(expired.results[0]).toMatchObject({reason:'timeout',score:0,at:109300});
   expect(()=>applySolo(s,{type:'collect'},t)).toThrow('result_presentation');
  }
 });
 it('finishes exactly three untouched rounds with no browsers or tie extension',()=>{
  const s=advanceSolo(create(),999999);
  expect(s.status).toBe('completed');expect(s.round).toBe(3);expect(s.results).toHaveLength(3);
  expect(s.results.map(r=>[r.at,r.score])).toEqual([[109300,0],[223600,0],[337900,0]]);
  expect(nextDue(s)).toBeNull();expect(advanceSolo(s,1000000)).toEqual(s);
  expect(()=>applySolo(create(),{type:'pause'} as never,2500)).toThrow('invalid_action');
 });
 it('retains historical constant clocks and first-placement expiry',()=>{
  for(const intervalMs of [100,1000]){
   const legacy={...DEFAULT_CONFIG,speed:{...DEFAULT_CONFIG.speed,intervalMs},firstPlacementSeconds:30,roundIntroMs:2500,roundDurationMs:250*intervalMs,scorePresentationMs:5000,silverCelebrationMs:2800,goldCelebrationMs:3800};
   const s=createSoloRun({...row,config:legacy,ruleset:'run21/arcade-1'},0);
   expect(s.board.startedAt).toBeNull();expect(s.board.firstPlacementDeadline).toBe(32500);
   expect(advanceSolo(s,32500).status).toBe('expired');
   const started=applySolo(s,{type:'place',column:0},30000);
   expect(started.board.deadline).toBe(30000+250*intervalMs);
   expect(speedAt(started.board,legacy,30000+intervalMs)).toBe(249);
  }
  expect(DEFAULT_CONFIG.speed).toEqual({start:250,decrement:1,intervalMs:1000});
 });
 it('matches the immutable migration config and preserves multipliers',()=>{
  const sql=readFileSync('supabase/arcade/run21-scoring.sql','utf8');
  const persisted=JSON.parse(sql.match(/\$config\$([\s\S]*?)\$config\$/)![1]);
  expect(persisted).toEqual(config);expect(config.multipliers).toEqual(DEFAULT_CONFIG.multipliers);
 });
});
