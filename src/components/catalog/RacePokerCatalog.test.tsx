// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('@/integrations/supabase/client',()=>import('../../../dev/lobby-catalog/mockSupabase'));
vi.mock('@/lib/debugHarness/useGlobalDebugMode',()=>({useHarnessesMode:()=>({enabled:false,loading:false,toggle:vi.fn()})}));
vi.mock('@/lib/debugHarness/runtimeCache',()=>({setHarnessCacheValue:vi.fn()}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:vi.fn()}));
import {arcadeRequest} from '@/lib/arcade/client';
import {ARCADE_GAMES,findGame,eligibility} from '@/lib/gameCatalog';
import {DealerGamePicker} from './DealerGamePicker';
import {GameDefaultsConfig} from '../GameDefaultsConfig';
import {GameRules} from '../GameRules';
import {RulesContent} from '../rules/RulesContent';
import {reset,writes,supabase} from '../../../dev/lobby-catalog/mockSupabase';
import fixture from '../../../dev/lobby-catalog/production-fixture.json';
const candidateDefault={...fixture.defaults.find(r=>r.game_type==='boxdrop')!,game_type:'race-poker',ante_amount:5};
beforeEach(()=>{reset([candidateDefault]);vi.clearAllMocks();vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('is multiplayer only, exactly two seats, and accepts a strategic bot in either qualified money mode',()=>{
 const game=findGame('race-poker')!;
 expect(game.modes).toEqual(['multiplayer']);expect(ARCADE_GAMES.some(g=>g.id===game.id)).toBe(false);
 for(const realMoney of [false,true])for(const humans of [1,2])expect(eligibility(game,{players:2,humans,realMoney},{'race-poker':true})).toBeNull();
 for(const roster of [{players:1,humans:1},{players:3,humans:2},{players:2,humans:0}])expect(eligibility(game,roster,{'race-poker':true})).not.toBeNull();
 expect(eligibility(game,{players:2,humans:2},{})).toBe('Currently unavailable');
});
it('keeps the dealer choice absent when closed and rejects unsupported rosters when visible',()=>{
 const select=vi.fn(),props={previousGame:'race-poker',roster:{players:2,humans:1},onSelect:select};
 const ui=render(<DealerGamePicker {...props} access={{}}/>);expect(screen.queryByRole('button',{name:'Race Poker'})).toBeNull();
 ui.rerender(<DealerGamePicker {...props} access={{'race-poker':true}}/>);fireEvent.click(screen.getByRole('button',{name:'Race Poker'}));expect(select).toHaveBeenCalledWith('race-poker');select.mockClear();
 ui.rerender(<DealerGamePicker {...props} roster={{players:3,humans:2}} access={{'race-poker':true}}/>);fireEvent.click(screen.getByRole('button',{name:/Race Poker/}));expect(select).not.toHaveBeenCalled();
});
it('edits the candidate stake through the existing defaults collection without altering rules',async()=>{
 render(<GameDefaultsConfig open onOpenChange={()=>{}}/>);await screen.findByLabelText('Default stake / ante ($)');
 fireEvent.mouseDown(screen.getByRole('tab',{name:'Other'}),{button:0,ctrlKey:false});fireEvent.change(screen.getByRole('combobox',{name:'Game'}),{target:{value:'race-poker'}});
 expect((screen.getByLabelText('Default stake / ante ($)') as HTMLInputElement).value).toBe('5');
 fireEvent.change(screen.getByLabelText('Default stake / ante ($)'),{target:{value:'9'}});
 fireEvent.click(screen.getByRole('button',{name:'Save Defaults'}));await waitFor(()=>expect(writes).toHaveLength(16));
 expect(writes).toContainEqual(expect.objectContaining({key:'race-poker',patch:expect.objectContaining({ante_amount:9})}));
});
it('opens the approved frozen help from Rules/Info without requesting Arcade admission or rules',async()=>{
 const rpc=vi.spyOn(supabase,'rpc');render(<GameRules open onOpenChange={()=>{}}/>);
 fireEvent.mouseDown(screen.getByRole('tab',{name:'Other'}),{button:0,ctrlKey:false});fireEvent.change(screen.getByRole('combobox',{name:'Game'}),{target:{value:'race-poker'}});
 await screen.findByText(/Approved Ptown adaptation/,{}, {timeout:10000});expect(screen.getByText(/You have 30 seconds/)).toBeTruthy();expect(screen.getByText(/except after your fifth card/)).toBeTruthy();
 expect(arcadeRequest).not.toHaveBeenCalledWith(expect.objectContaining({game:'race-poker'}));expect(rpc).not.toHaveBeenCalledWith('arcade_rules_help',expect.objectContaining({p_ruleset:'race-poker/1'}));
});
it('does not silently substitute v1 help for an unknown historical version',async()=>{
 render(<RulesContent game="race-poker" version="race-poker/unknown"/>);await screen.findByRole('alert');expect(screen.queryByText(/Approved Ptown adaptation/)).toBeNull();
});
