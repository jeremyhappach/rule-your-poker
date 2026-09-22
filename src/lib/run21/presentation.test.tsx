import { describe, expect, it, vi } from 'vitest';
// Layout is measured by browserProof.mjs; these assertions exercise server markup.
vi.mock('react',async original=>{const react=await original<typeof import('react')>();return {...react,useLayoutEffect:react.useEffect};});
vi.mock('@/integrations/supabase/client',()=>({supabase:new Proxy({}, {get(){throw new Error('Offline presentation test');}})}));
import { renderToStaticMarkup } from 'react-dom/server';
import { Run21Felt } from '../../components/run21/Run21Felt';
import {Run21PlayerPane,Run21Timer} from '../../components/run21/Run21PlayerPane';
import { act, fixtureDeck, fixtureMatch, IDENTITY, PLAYERS, uuid } from './fixtures';
import { advanceScorePresentation, applyCommand, createMatch, prepareRound, project } from './engine';
import {DEFAULT_CONFIG} from './model';
import { exportReplay, seekReplay } from './history';
import { standardDeck } from './rules';
const [self,other]=PLAYERS.map(p=>p.id);
const ready=()=>act(fixtureMatch(),self,{type:'ready'},0);
const render=(m=ready())=>renderToStaticMarkup(<Run21Felt view={project(m,self)} now={0} drawRect={{x:.4,y:.7,width:.2,height:.19}} onIntent={()=>{}}/>);
const pane=(m=ready())=>renderToStaticMarkup(<Run21PlayerPane view={project(m,self)} now={0} onIntent={()=>{}}/>);
describe('Run21 player presentation',()=>{
  it('shows the bot board and frozen speed while the human controls remain inactive',()=>{
    const m=act(prepareRound(createMatch(IDENTITY,[...PLAYERS].reverse(),5,DEFAULT_CONFIG,0),uuid(100),null,fixtureDeck(),0),other,{type:'ready'},0);
    const html=render(m);
    expect(html.match(/disabled=""/g)).toHaveLength(6);
    expect(html).toContain('data-playing-card-face');
    expect(pane(m)).not.toContain('is playing');expect(pane(m)).not.toContain('<button');
    expect(renderToStaticMarkup(<Run21Timer view={project(m,self)} now={1000}/>)).toContain('Speed 250');
  });
  it('renders five empty columns with only totals visible and accessible action indexes',()=>{
    const html=render();
    expect(html.match(/class="run21-column"/g)).toHaveLength(5);
    expect(html.match(/class="run21-column-total">0</g)).toHaveLength(5);
    expect(html).toContain('aria-label="Place in column 5, total 0"');
    expect(html).not.toMatch(/>\s*[1-5]\s*</);
    expect(html).not.toContain('empty-column');
    expect(html).not.toContain('run21.round');
  });
  it('shows the actual current face and reserves the only back for the deck',()=>{
    const m=ready(),html=render(m),card=m.rounds[0].boards[self].current!;
    expect(html).toContain(`aria-label="${card.rank} of ${card.suit}"`);
    expect(html.match(/data-playing-card-face/g)).toHaveLength(1);
    expect(html.match(/data-playing-card-hidden/g)).toHaveLength(1);
    expect(html).not.toMatch(/run21-(discard|passed)/);
  });
  it('removes used Pass and resets the one-use allowance at the next round',()=>{
    let m=act(ready(),self,{type:'pass'},1);
    expect(pane(m)).not.toContain('Pass');
    expect(render(m)).not.toContain('run21.pass');
    m=act(m,self,{type:'place',column:0},1);m=act(m,self,{type:'expire'},250001);m=advanceScorePresentation(m,255001);
    m=act(m,other,{type:'place',column:0},255001);m=act(m,other,{type:'expire'},505001);m=advanceScorePresentation(m,510001);
    for(const id of [self,other])m=act(m,id,{type:'acknowledge'},510001);
    m=prepareRound(m,uuid(800),m.rounds[0].id,fixtureDeck(),510001);
    expect(m.rounds[1].boards[self].passesUsed).toBe(0);
    expect(pane(m)).not.toContain('Pass used');
    expect(project(m,null).passUsed[self]).toBe(false);
  });
  it('replays Pass as an empty current slot before the next face, without a second card record',()=>{
    const m=act(ready(),self,{type:'pass'},1),replay=exportReplay(m,self);
    const index=replay.steps.findIndex(s=>s.substeps[0]?.type==='pass_used');
    expect(index).toBeGreaterThan(0);
    expect(seekReplay(replay,index).boards[self]!.current).toBeNull();
    expect(seekReplay(replay,index+1).boards[self]!.current).not.toBeNull();
    expect(JSON.stringify(replay)).not.toContain('discard');
  });
  it.each([96,97])('renders Collect admission at aggregate %i',sum=>{
    const m=ready(),deck=standardDeck();
    m.rounds[0].boards[self].startedAt=0;m.rounds[0].boards[self].deadline=250000;
    // Four 20s, then 16 or 17: exact rule boundary, unique physical cards.
    m.rounds[0].boards[self].columns=[...Array.from({length:4},(_,i)=>[deck[i*13+11],deck[i*13+12]]),[deck[9],deck[sum-91]]];
    const html=pane(m),button=html.match(/<button[^>]*class="run21-collect-button"[^>]*>/)![0];
    expect(button.includes('disabled')).toBe(sum<97);
  });
  it('publishes accepted moves and Pass status to observers without future cards',()=>{
    const m=act(ready(),self,{type:'pass'},100);
    const view=project(m,null);
    expect(view.boards[self]).toEqual(m.rounds[0].boards[self]);expect(view.boards[other]).toBeNull();
    expect(view.passUsed).toEqual({[self]:true,[other]:false});
    const html=renderToStaticMarkup(<Run21PlayerPane view={view} now={100} onIntent={()=>{}}/>);
    expect(html).not.toContain('<button');
    const replay=exportReplay(m,null),index=replay.steps.findIndex(s=>s.substeps[0]?.type==='pass_used');
    const frame=seekReplay(replay,index);
    expect(frame.boards[self]?.passesUsed).toBe(1);expect(frame.passUsed[self]).toBe(true);
    expect(JSON.stringify(frame)).not.toContain('secret');
  });
  it('increments cumulative scores once at each completed turn, including duplicate commands',()=>{
    let m=fixtureMatch({...DEFAULT_CONFIG,multipliers:{7:50}},[{rank:'7',suit:'clubs'}]);
    m=act(m,self,{type:'ready'},0);
    m=act(m,self,{type:'place',column:0},1);m=act(m,self,{type:'collect'},2);
    expect(project(m,self).cumulative[self]).toBe(12500);
    m=advanceScorePresentation(m,5002);m=act(m,other,{type:'place',column:0},5002);
    const r=m.rounds[0],command={identity:m.identity,roundId:r.id,playerId:other,requestId:uuid(9900),revision:r.boards[other].revision,intent:{type:'expire' as const}};
    m=applyCommand(m,command,{kind:'service'},255002).state;
    expect(project(m,self).cumulative[self]).toBe(12500);
    expect(project(applyCommand(m,command,{kind:'service'},255002).state,self).cumulative[self]).toBe(12500);
    m=advanceScorePresentation(m,260002);for(const id of [self,other])m=act(m,id,{type:'acknowledge'},260002);
    m=prepareRound(m,uuid(8800),r.id,fixtureDeck(),260002);
    expect(project(m,self).cumulative[self]).toBe(12500);
  });
  it('presents the same deadline as a draining bar without mutating the round',()=>{
    const m=act(ready(),self,{type:'place',column:0},0),before=JSON.stringify(m),view=project(m,self);
    for(const [at,remaining] of [[0,250000],[125000,125000],[250000,0]]){
      const html=renderToStaticMarkup(<Run21Timer view={view} now={at}/>);
      expect(html).toContain('role="progressbar"');expect(html).toContain(`data-run21-time-remaining="${remaining}"`);
      expect(html).toContain('Speed');
    }
    expect(JSON.stringify(m)).toBe(before);
  });
  it('keeps the opening speed frozen and then displays the active opponent after scoring',()=>{
    let m=ready();const view=project(m,self);
    expect(renderToStaticMarkup(<Run21Timer view={view} now={100000}/>)).toContain('data-run21-time-remaining="250000"');
    m=act(m,self,{type:'place',column:0},0);m=act(m,self,{type:'expire'},250000);m=advanceScorePresentation(m,255000);
    const watching=project(m,self),html=render(m);
    expect(html.match(/disabled=""/g)).toHaveLength(6);
    expect(html).toContain('data-playing-card-face');
    expect(pane(m)).not.toContain('is playing');expect(pane(m)).not.toContain('<button');
    expect(renderToStaticMarkup(<Run21Timer view={watching} now={255000}/>)).toContain('Speed 250');
  });
});

it.each([[224999,'success'],[225000,'warning'],[237499,'warning'],[237500,'danger'],[250000,'danger']] as const)('uses fractional authoritative timer threshold at %i', (at,tone)=>{
 const m=act(ready(),self,{type:'place',column:0},0);
 expect(renderToStaticMarkup(<Run21Timer view={project(m,self)} now={at}/>)).toContain('data-run21-time-tone="'+tone+'"');
});

it('rejects contradictory final scores and preserves totals after board clearing',async()=>{
 const {assertFinalScores}=await import('./presentation');
 const {eventSnapshot}=await import('./livePresentation');
 const view=project(ready(),self);view.cumulative={[self]:105000,[other]:35850};view.winnerId=self;
 view.settlement={key:'test',winnerId:self,loserId:other,amount:5,resultId:uuid(501),transferBatchId:uuid(502),at:1};
 expect(()=>assertFinalScores(view)).not.toThrow();
 const cleared=eventSnapshot({view,revision:1,serverAt:1,balances:{},finished:false},{sequence:1,type:'score_presentation_completed',at:1,roundId:view.roundId,actorId:self,requestId:null,operands:{},frame:view});
 expect(cleared.view.cumulative).toEqual(view.cumulative);expect(()=>assertFinalScores(cleared.view)).not.toThrow();
 expect(()=>assertFinalScores({...view,cumulative:{[self]:0,[other]:35850}})).toThrow('mismatch');
 expect(project(ready(),self).cumulative).toEqual({[self]:0,[other]:0});
});
