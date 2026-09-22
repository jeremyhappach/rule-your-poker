// @vitest-environment jsdom
import {act as reactAct} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,it,expect,vi} from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import {CanonicalAnnouncementProvider,useAnnouncementContext} from '@/lib/canonicalShell/announcements';
import {Run21Announcement} from '@/components/run21/Run21Announcement';
import {run21Announcement} from './announcement';
import {act,fixtureMatch,PLAYERS,uuid,fixtureDeck} from './fixtures';
import {advanceScorePresentation,prepareRound,project} from './engine';
import {exportReplay,seekReplay} from './history';
import type {Projection} from './model';
const [self,bot]=PLAYERS.map(p=>p.id);
const ready=()=>act(act(fixtureMatch(),self,{type:'ready'},0),self,{type:'place',column:0},0);
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;

describe('Run21 canonical round narration',()=>{
  it('publishes the active board and public phases without future deck evidence',()=>{
    expect(project(fixtureMatch(),null).playStatus).toEqual({[self]:'playing',[bot]:'waiting'});
    const opening=act(fixtureMatch(),self,{type:'ready'},0);
    expect(project(opening,null).playStatus).toEqual({[self]:'playing',[bot]:'waiting'});
    expect(run21Announcement(project(opening,self)).title).toBe('You are playing round 1/3');
    expect(project(act(opening,self,{type:'place',column:0},100),null).playStatus).toEqual({[self]:'playing',[bot]:'waiting'});
    const view=project(ready(),null);
    expect(view.playStatus).toEqual({[self]:'playing',[bot]:'waiting'});
    expect(view.boards[self]?.columns[0]).toHaveLength(1);expect(view.boards[bot]).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/"secret"|"salt"/);
  });
  it('names each active player in order and announces completion only after both finish',()=>{
    let m=ready();
    expect(run21Announcement(project(m,self)).title).toBe('You are playing round 1/3');
    m=act(m,self,{type:'expire'},250000);
    expect(run21Announcement(project(m,self)).title).toContain('TIME EXPIRED');
    m=advanceScorePresentation(m,255000);
    expect(run21Announcement(project(m,self)).title).toBe('Run21 bot is playing round 1/3');
    m=act(m,bot,{type:'place',column:0},255000);
    m=act(m,bot,{type:'expire'},505000);m=advanceScorePresentation(m,510000);
    expect(run21Announcement(project(m,self)).title).toBe('Round 1/3 complete');
    for(const id of [self,bot])m=act(m,id,{type:'acknowledge'},510000);
    m=prepareRound(m,uuid(801),m.rounds[0].id,fixtureDeck(),510000);
    expect(run21Announcement(project(m,self)).title).toBe('You are playing round 2/3');
  });
  it('keeps the announcement stable through card actions and reads recorded phases on seek',()=>{
    let m=ready();const initial=run21Announcement(project(m,self)).id;
    m=act(m,self,{type:'pass'},100);
    expect(run21Announcement(project(m,self)).id).toBe(initial);
    m=act(m,self,{type:'expire'},250000);m=advanceScorePresentation(m,255000);m=act(m,bot,{type:'place',column:0},255000);m=act(m,bot,{type:'expire'},505000);m=advanceScorePresentation(m,510000);
    const replay=exportReplay(m,self);
    const index=replay.steps.findIndex(s=>s.substeps[0]?.type==='card_placed'&&s.substeps[0]?.actorId===bot);
    expect(run21Announcement(seekReplay(replay,index)).title).toBe('Run21 bot is playing round 1/3');
    const lastFinish=replay.steps.map(s=>s.substeps[0]?.type).lastIndexOf('timeout');
    expect(run21Announcement(seekReplay(replay,lastFinish)).title).toContain('TIME EXPIRED');
    expect(run21Announcement(seekReplay(replay,replay.steps.length-1)).title).toBe('Round 1/3 complete');
    const old={...project(m,self),playStatus:undefined} as unknown as Projection;
    expect(()=>run21Announcement(old)).not.toThrow();
  });
  it('uses one canonical ambient event and retires it across replay, identity and unmount boundaries',()=>{
    const container=document.createElement('div'),root=createRoot(container);
    const m=ready(),view=project(m,self);
    function State(){const ctx=useAnnouncementContext();return <output>{ctx?.active?.payload?.title as string??''}</output>;}
    const render=(next:Projection|null)=>reactAct(()=>root.render(<CanonicalAnnouncementProvider dealerGameId={next?.identity.dealerGameId??view.identity.dealerGameId}>
      {next&&<Run21Announcement view={next}/>}<State/>
    </CanonicalAnnouncementProvider>));
    try{
      render(view);expect(container.textContent).toBe('You are playing round 1/3');
      render(structuredClone(view));expect(container.textContent).toBe('You are playing round 1/3');
      const next=structuredClone(view);next.roundId=uuid(802);next.roundNumber=2;
      render(next);expect(container.textContent).toBe('You are playing round 2/3');
      render(view);expect(container.textContent).toBe('You are playing round 1/3');
      next.identity.dealerGameId=uuid(803);render(next);
      expect(container.textContent).toBe('You are playing round 2/3');
      render(null);expect(container.textContent).toBe('');
    }finally{reactAct(()=>root.unmount());container.remove();}
  });
});
