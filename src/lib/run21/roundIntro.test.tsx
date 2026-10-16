import {describe, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {act, fixtureMatch, PLAYERS, uuid} from './fixtures';
import {advanceScorePresentation, applyCommand, expireFirstPlacement, project} from './engine';
import {DEFAULT_CONFIG} from './model';
import {roundIntro, turnReleaseAt} from './roundIntro';
import {strikeBoxingBell} from './boxingBell';
import {Run21RoundIntro} from '@/components/run21/Run21RoundIntro';
const [self, other] = PLAYERS.map(p => p.id);
const config = {...DEFAULT_CONFIG, firstPlacementSeconds: 30, roundIntroMs: 2500};
const start = () => act(fixtureMatch(config), self, {type: 'ready'}, 1000);

describe('persisted Run21 round release', () => {
  it('reserves a full 30 seconds after the intro and leaves the speed clock untouched', () => {
    const m = start(), board = m.rounds[0].boards[self];
    expect(board.firstPlacementDeadline).toBe(33500);
    expect(turnReleaseAt(board, config)).toBe(3500);
    expect(board.startedAt).toBeNull(); expect(board.deadline).toBeNull();
    expect(expireFirstPlacement(m, 33499, false)).toBe(m);
    expect(expireFirstPlacement(m, 33500, false).automaticPlayers).toEqual([self]);
  });
  it.each([{type:'place' as const,column:0},{type:'pass' as const},{type:'collect' as const}])('rejects early $type for both player and service authority', intent => {
    const m=start(), command={identity:m.identity,roundId:m.rounds[0].id,playerId:self,requestId:uuid(800),revision:m.rounds[0].boards[self].revision,intent};
    for(const principal of [{kind:'player' as const,playerId:self},{kind:'service' as const}])
      expect(applyCommand(m,command,principal,3499)).toMatchObject({status:'rejected',reason:'round_intro',state:m});
    const accepted=applyCommand(m,command,{kind:'player',playerId:self},3500);
    expect(accepted.status).toBe('accepted');
    expect(applyCommand(accepted.state,command,{kind:'player',playerId:self},3500).status).toBe('duplicate');
    if(intent.type==='place')expect(accepted.state.rounds[0].boards[self]).toMatchObject({startedAt:3500,deadline:253500});
  });
  it('uses the same identity/deadline on refresh and never replays after release or a card', () => {
    const m=start(), view=project(m,self), resumed=project(JSON.parse(JSON.stringify(m)),self);
    expect(roundIntro(view,1000)?.key).toBe(roundIntro(resumed,3000)?.key);
    expect(roundIntro(resumed,3000)?.remaining).toBe(500);
    expect(roundIntro(resumed,3500)).toBeNull();
    expect(roundIntro(resumed,0)).toBeNull(); // Cached snapshot before server-clock admission.
    expect(roundIntro(project(act(m,self,{type:'pass'},3500),self),3500)).toBeNull();
    expect(roundIntro(project(act(m,self,{type:'place',column:0},3500),self),3500)).toBeNull();
  });
  it('presents one new intro on the next player boundary, never during the score hold', () => {
    let m=act(start(),self,{type:'collect'},3500);
    expect(roundIntro(project(m,self),4000)).toBeNull();
    m=advanceScorePresentation(m,8500);
    expect(roundIntro(project(m,self),8500)).toMatchObject({round:1,label:'RUN21 BOT IS UP',remaining:2500});
    expect(roundIntro(project(m,other),8500)?.label).toBe('YOUR TURN');
    expect(m.rounds[0].boards[other].firstPlacementDeadline).toBe(41000);
  });
  it('uses canonical pause shifting and preserves old matches with no intro', () => {
    const m=start();m.pausedAt=2000;
    expect(roundIntro(project(m,self),8000)?.remaining).toBe(1500);
    m.rounds[0].boards[self].firstPlacementDeadline!+=6000;m.pausedAt=null;
    expect(roundIntro(project(m,self),8000)?.remaining).toBe(1500);
    const old=act(fixtureMatch({...DEFAULT_CONFIG,firstPlacementSeconds:30}),self,{type:'ready'},1000);
    expect(roundIntro(project(old,self),1000)).toBeNull();
    expect(old.rounds[0].boards[self].firstPlacementDeadline).toBe(31000);
  });
  it('renders round/authoritative name without countdown or acknowledgment controls', () => {
    const view=project(start(),other);view.players[0].name='Hap';
    const html=renderToStaticMarkup(<Run21RoundIntro view={view} now={1000}/>);
    expect(html).toContain('ROUND 1');expect(html).toContain('HAP IS UP');
    expect(html).not.toMatch(/<button|progressbar|role="timer"/);
    expect(renderToStaticMarkup(<Run21RoundIntro view={view} now={3500}/>)).toBe('');
  });
  it('schedules exactly two equal gong strikes and never queues locked audio', () => {
    const starts:number[]=[];
    const ctx={state:'running',currentTime:10,destination:{},createOscillator:()=>({frequency:{setValueAtTime:vi.fn()},connect:vi.fn(),start:(t:number)=>starts.push(t),stop:vi.fn(),disconnect:vi.fn()}),
      createGain:()=>({gain:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()})};
    strikeBoxingBell(ctx as unknown as AudioContext);
    expect(starts).toEqual([10,10,10,10,10.32,10.32,10.32,10.32]);
    ctx.state='suspended';strikeBoxingBell(ctx as unknown as AudioContext);expect(starts).toHaveLength(8);
  });
});
