// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import type {DropSnapshot,LaneResult} from '@/lib/drop357/model';
import {SoloDrop357} from './SoloDrop357';
import Drop357Rules from '@/components/rules/Drop357Rules';

const state=vi.hoisted(()=>({snapshot:null as DropSnapshot|null}));
vi.mock('@/hooks/useDrop357',()=>({useDrop357:()=>({
 snapshot:state.snapshot,now:1000,ready:true,pending:false,error:'',liveLanes:[],liveRevision:-1,
 recoveryEpoch:0,bornEnded:false,placement:null,cue:null,act:vi.fn(),reconnect:vi.fn(),
})}));
vi.mock('@/hooks/useDrop357Audio',()=>({useDrop357Audio:()=>{}}));
vi.mock('@/hooks/usePresentedScoreAudio',()=>({usePresentedScoreAudio:()=>{}}));
vi.mock('@/components/PlayingCard',()=>({PlayingCard:({card}:{card:{rank:string;suit:string}})=><span>{card.rank}{card.suit}</span>}));
vi.mock('@/components/GameplaySoundButton',()=>({GameplaySoundButton:()=>null}));
vi.mock('./ArcadeInfo',()=>({ArcadeInfo:()=>null}));
vi.mock('@/components/triTowers/TriTowersPresentation',()=>({
 TriScorePill:()=>null,TriRoundIntro:()=>null,useTriRoundPresentation:()=>({fraction:0}),
}));
afterEach(cleanup);
const natural:LaneResult={vector:[5,12,10,7,6,2],selected:[0,2,3,5,6],natural:true,
 points:1320,bonus:264,score:1584,category:'Flush',completedAt:900};
function show(result:LaneResult,cards=[47,8,39,43,11,49,44]){
 state.snapshot={id:'natty-fixture',revision:1,status:'active',ruleset:'357-drop/7',serverAt:1000,
 roundId:'natty-fixture:3',round:3,rounds:3,banked:0,score:result.score,phase:'playing',
 carryChoices:[null,null],lanes:[[null,null,null],[null,null,null,null,null],cards],laneResults:[null,null,result],
 current:null,stockLeft:38,passesLeft:1,placements:12,startedAt:0,deadline:120000,result:null,completion:null};
 return render(<MemoryRouter><SoloDrop357 runId="natty-fixture" userId="fixture"/></MemoryRouter>);
}
describe('authoritative Natty projection',()=>{
 it('shows the printed queen-high flush score and bonus on exactly the selected five',()=>{
  const {container}=show(natural);
  expect(screen.getByText('Natty +20%')).toBeTruthy();
  expect(screen.getByText('1,584')).toBeTruthy();
  const row=container.querySelector('[data-lane="7"]')!;
  expect(row.getAttribute('data-natural')).toBe('true');
  expect([...row.querySelectorAll('[data-selected="true"]')].map(x=>x.textContent)).toEqual(['10♠','2♠','6♠','Q♠','7♠']);
  expect([...row.querySelectorAll('[data-muted="true"]')].map(x=>x.textContent)).toEqual(['10♣','K♣']);
  expect(container.querySelector('[data-partial="true"]')).toBeTruthy();
 });
 it('does not infer Natty from a wild-eligible card when the server used substitution',()=>{
  show({...natural,vector:[5,15,12,10,6,2],natural:false,points:1350,bonus:0,score:1350},[47,8,39,43,11,49,31]);
  expect(screen.queryByText('Natty +20%')).toBeNull();
  expect(screen.getByText('1,350')).toBeTruthy();
 });
 it('explains highest payable score for new runs and preserves old rules help',()=>{
  const {rerender}=render(<Drop357Rules version="357-drop/7"/>);
  expect(screen.getByText(/Each row chooses the highest final score/)).toBeTruthy();
  expect(screen.getByText(/natural queen-high flush scores 1,584/)).toBeTruthy();
  rerender(<Drop357Rules version="357-drop/6"/>);
  expect(screen.queryByText(/Each row chooses the highest final score/)).toBeNull();
  expect(screen.getByText(/Ranks and kickers select the strongest hand/)).toBeTruthy();
 });
});
