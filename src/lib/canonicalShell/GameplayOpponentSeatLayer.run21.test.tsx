// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
const cluster = vi.hoisted(() => vi.fn());
vi.mock('./CanonicalSeatCluster', () => ({CanonicalSeatCluster: (props: any) => {cluster(props); return props.children??null;}}));
vi.mock('./SeatAnchorLayer', () => ({useSeatAnchorsOptional: () => ({byPosition: new Map([[2, {slot: 1}]])})}));
vi.mock('./PreSessionSeatLayer', () => ({usePreSessionSeatOwned: () => false}));
vi.mock('./ActivePlayerHUD', () => ({ActivePlayerHUD: () => null}));
vi.mock('@/components/AutoRollIndicator', () => ({AutoRollIndicator: () => null}));
vi.mock('@/components/canonicalShell/CanonicalCardBack', () => ({CanonicalCardBack: () => <span data-test-card-back/>}));
import {GameplayOpponentSeatLayer} from './GameplayOpponentSeatLayer';
afterEach(() => {cleanup(); cluster.mockClear();});
const participants = [{id: 'player', name: 'Player', position: 2, chips: 50}];
it('passes the isolated authoritative balance without enrolling it in the session money cursor', () => {
  render(<GameplayOpponentSeatLayer family="run21" participants={participants} presentation={{isolatedBalance: () => 5}}/>);
  expect(cluster.mock.calls.at(-1)?.[0]).toMatchObject({chipValue: '$5', chipAmount: undefined, playerId: 'player'});
});
it.each(['gin-rummy', 'cribbage', 'yahtzee'] as const)('preserves %s money cursor inputs', family => {
  render(<GameplayOpponentSeatLayer family={family} participants={participants}/>);
  expect(cluster.mock.calls.at(-1)?.[0]).toMatchObject({chipValue: '$50', chipAmount: 50, playerId: 'player'});
});

it('opts into existing inward name and card-row attachments without moving seats',()=>{
 render(<GameplayOpponentSeatLayer family="six-card-golf" participants={participants} presentation={{inwardSeatContent:true}}/>);
 expect(cluster.mock.calls.at(-1)?.[0]).toMatchObject({slot:1,position:2,keepNameInward:true,opponentShowdownPlacement:{attachment:'outer-edge',sprawlDirection:'inward',dxPx:0,dyPx:0}});
});
it.each(['gin-rummy','cribbage','yahtzee','run21','farkle'] as const)('leaves %s default geometry untouched',family=>{
 render(<GameplayOpponentSeatLayer family={family} participants={participants}/>);
 expect(cluster.mock.calls.at(-1)?.[0]).toMatchObject({keepNameInward:false,opponentShowdownPlacement:undefined});
});
it('represents Golf exposure without ranks and preserves all backs for existing callers',()=>{
 const view=render(<GameplayOpponentSeatLayer family="six-card-golf" participants={participants} presentation={{cardBacks:()=>({count:6,visible:true,variant:'cribbage',exposed:[true,false,true,false,false,false]})}}/>);
 expect(document.querySelectorAll('[data-seat-card-exposed]')).toHaveLength(2);
 expect(document.querySelectorAll('[data-test-card-back]')).toHaveLength(4);
 expect([...document.querySelectorAll('[data-seat-card-exposed]')].every(e=>e.textContent==='')).toBe(true);
 view.rerender(<GameplayOpponentSeatLayer family="cribbage" participants={participants} presentation={{cardBacks:()=>({count:6,visible:true,variant:'cribbage'})}}/>);
 expect(document.querySelectorAll('[data-seat-card-exposed]')).toHaveLength(0);
 expect(document.querySelectorAll('[data-test-card-back]')).toHaveLength(6);
});

it('inspects the selected participant even when aliases match and their cards are all exposed',()=>{
 const onInspectTableau=vi.fn();
 const players=[...participants,{...participants[0],id:'other-player',position:3}];
 render(<GameplayOpponentSeatLayer family="six-card-golf" participants={players} presentation={{onInspectTableau,cardBacks:()=>({count:6,visible:true,variant:'cribbage',exposed:Array(6).fill(true)})}}/>);
 const buttons=screen.getAllByRole('button',{name:'View Player tableau'});
 expect(buttons).toHaveLength(2);
 expect(buttons[1].getAttribute('aria-haspopup')).toBe('dialog');
 expect(buttons[1].closest('[data-card-anchor]')?.getAttribute('data-card-anchor')).toBe('opp-stack-3');
 fireEvent.click(buttons[1]);
 expect(onInspectTableau).toHaveBeenCalledExactlyOnceWith(players[1]);
 expect(document.querySelectorAll('[data-seat-card-exposed]')).toHaveLength(12);
});

it.each(['gin-rummy','cribbage','yahtzee','run21','farkle'] as const)('does not add an inspection target to %s without opt-in',family=>{
 render(<GameplayOpponentSeatLayer family={family} participants={participants} presentation={{cardBacks:()=>({count:6,visible:true,variant:'cribbage'})}}/>);
 expect(screen.queryByRole('button')).toBeNull();
 expect(document.querySelectorAll('[data-test-card-back]')).toHaveLength(6);
});
