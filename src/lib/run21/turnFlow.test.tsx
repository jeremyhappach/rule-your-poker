import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('react',async original=>{const r=await original<typeof import('react')>();return {...r,useLayoutEffect:r.useEffect};});
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import {advanceScorePresentation,applyCommand,createMatch,prepareRound,project} from './engine';
import {act,fixtureDeck,fixtureMatch,IDENTITY,PLAYERS,uuid} from './fixtures';
import {DEFAULT_CONFIG,SCORE_PRESENTATION_MS,type Intent} from './model';
import {speedAt} from './rules';
import {displayedPlayerId,displayedScore} from './presentation';
import {Run21Felt} from '@/components/run21/Run21Felt';
import {Run21Timer,Run21PlayerPane} from '@/components/run21/Run21PlayerPane';
import {run21Announcement} from './announcement';
import {visibleHistory,exportReplay,seekReplay} from './history';
const [human,bot]=PLAYERS.map(p=>p.id);
function command(m:ReturnType<typeof fixtureMatch>,id:string,intent:Intent,n=9000){return {identity:m.identity,roundId:m.rounds.at(-1)!.id,playerId:id,requestId:uuid(n),revision:m.rounds.at(-1)!.boards[id].revision,intent};}
const admit=(reverse=false)=>{
 const m=prepareRound(createMatch(IDENTITY,reverse?[...PLAYERS].reverse():PLAYERS,5,DEFAULT_CONFIG,0),uuid(100),null,fixtureDeck(),0);
 return act(m,m.rounds[0].active_player_id!,{type:'ready'},0);
};
describe('Run21 live sequential turn flow',()=>{
 it.each([false,true])('admits one public board with a frozen clock (bot first: %s)',reverse=>{
  const m=admit(reverse),active=reverse?bot:human,inactive=reverse?human:bot,view=project(m,inactive);
  expect(m.rounds[0].boards[active]).toMatchObject({startedAt:null,deadline:null});
  expect(m.rounds[0].boards[inactive]).toMatchObject({current:null,startedAt:null,deadline:null});
  expect(view.boards[active]!.current).toEqual(project(m,active).boards[active]!.current);
  expect(displayedPlayerId(view)).toBe(active);
  for(const intent of [{type:'place',column:0},{type:'pass'},{type:'collect'}] as Intent[])
   expect(applyCommand(m,command(m,inactive,intent),{kind:'player',playerId:inactive},100).reason).toBe('not_your_turn');
  const html=renderToStaticMarkup(<Run21Felt view={view} now={100000} drawRect={{x:.4,y:.7,width:.2,height:.2}} onIntent={()=>{}}/>);
  expect(html).toContain('data-playing-card-face');expect(html.match(/disabled=""/g)).toHaveLength(6);
  const timer=renderToStaticMarkup(<Run21Timer view={view} now={100000}/>);
  expect(timer).toContain('Speed 250');expect(timer).toContain('data-run21-time-remaining="250000"');
  expect(renderToStaticMarkup(<Run21PlayerPane view={view} now={100000} onIntent={()=>{}}/>)).not.toContain('<button');
  expect(JSON.stringify(view)).not.toMatch(/"secret"|"salt"|"cards":\[/);
 });
 it('keeps admission, Pass, invalid actions, duplicate requests and reconnect unstarted; starts once on placement',()=>{
  let m=admit();const pass=command(m,human,{type:'pass'});
  m=applyCommand(m,pass,{kind:'player',playerId:human},100000).state;
  expect(applyCommand(m,pass,{kind:'player',playerId:human},200000)).toMatchObject({status:'duplicate',state:m});
  expect(applyCommand(m,command(m,human,{type:'place',column:5},8999),{kind:'player',playerId:human},200000).reason).toBe('column_locked');
  m=JSON.parse(JSON.stringify(m));
  expect(m.rounds[0].boards[human]).toMatchObject({startedAt:null,deadline:null,passesUsed:1});
  expect(speedAt(m.rounds[0].boards[human],m.config,200000)).toBe(250);
  expect(project(m,bot).boards[human]!.current).toEqual(project(m,human).boards[human]!.current);
  const placement=command(m,human,{type:'place',column:0},9001);
  m=applyCommand(m,placement,{kind:'player',playerId:human},200000).state;
  expect(m.rounds[0].boards[human]).toMatchObject({startedAt:200000,deadline:450000});
  expect(m.events.find(e=>e.type==='card_placed')!.operands.speed).toBe(250);
  expect(applyCommand(m,placement,{kind:'player',playerId:human},200100)).toMatchObject({status:'duplicate',state:m});
  expect(speedAt(m.rounds[0].boards[human],m.config,200100)).toBe(250);
  expect(speedAt(m.rounds[0].boards[human],m.config,201000)).toBe(249);
  expect(project(m,bot).boards[human]!.columns).toEqual(project(m,human).boards[human]!.columns);
  expect(visibleHistory(m,bot).some(e=>e.type==='card_placed')).toBe(true);
 });
 it('orders score announcement, calculation, count-up, board clear and next admission without starting the next clock',()=>{
  // Real accepted placements using a deterministic deck, not fabricated result/score rows.
  const prefix=Array.from({length:4},(_,s)=>['10','J','Q','K'].map(rank=>({rank:rank as '10',suit:['clubs','diamonds','hearts','spades'][s] as 'clubs'}))).flat();
  let m=act(fixtureMatch(DEFAULT_CONFIG,prefix),human,{type:'ready'},0);
  for(let i=0;i<10;i++)m=act(m,human,{type:'place',column:Math.floor(i/2)},100+i);
  m=act(m,human,{type:'collect'},200);
  const round=m.rounds[0],frozen=JSON.stringify(round.boards[human]),v=project(m,bot),result=round.boards[human].result!;
  expect(result).toMatchObject({aggregate:100,multiplier:200,speed:250,score:50000});
  expect(round.active_player_id).toBeNull();expect(round.revealed).toBe(false);
  expect(round.boards[bot]).toMatchObject({current:null,startedAt:null,deadline:null});
  expect(run21Announcement(v).title).toBe('You scored 100!');
  const html=renderToStaticMarkup(<Run21Felt view={v} now={200}/>);
  expect(html).toContain('200 × 250 = 50,000');
  expect([200,2700,5200].map(at=>displayedScore(v,human,at))).toEqual([0,25000,50000]);
  expect(m.cumulative[human]).toBe(50000);
  expect(advanceScorePresentation(m,5199)).toBe(m);
  expect(applyCommand(m,command(m,bot,{type:'pass'}),{kind:'player',playerId:bot},5199).reason).toBe('not_your_turn');
  m=advanceScorePresentation(JSON.parse(JSON.stringify(m)),5200);
  expect(m.rounds[0].active_player_id).toBe(bot);expect(m.rounds[0].scorePresentation).toBeNull();
  expect(JSON.stringify(m.rounds[0].boards[human])).toBe(frozen);
  expect(m.rounds[0].boards[bot]).toMatchObject({startedAt:null,deadline:null,columns:[[],[],[],[],[]]});
  expect(m.rounds[0].boards[bot].current).toEqual(round.boards[human].presented[0]);
  expect(displayedPlayerId(project(m,human))).toBe(bot);
  m=act(m,bot,{type:'place',column:0},5300);m=act(m,bot,{type:'expire'},255300);
  expect(m.rounds[0].boards[bot].result).toMatchObject({reason:'timeout',score:0});
  expect(run21Announcement(project(m,human)).title).toContain('TIME EXPIRED');
  expect(m.rounds[0].revealed).toBe(false);
  m=advanceScorePresentation(m,255300+SCORE_PRESENTATION_MS);
  expect(m.rounds[0].revealed).toBe(true);expect(m.cumulative[human]).toBe(50000);
  expect(JSON.stringify(m.rounds[0].boards[human])).toBe(frozen);
  const replay=exportReplay(m,bot);expect(seekReplay(replay,replay.steps.length-1)).toEqual(project(m,bot));
 });
});
