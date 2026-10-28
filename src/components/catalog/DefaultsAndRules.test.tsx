// @vitest-environment jsdom
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
vi.mock('@/integrations/supabase/client',()=>import('../../../dev/lobby-catalog/mockSupabase'));
vi.mock('@/lib/debugHarness/useGlobalDebugMode',()=>({useHarnessesMode:()=>({enabled:false,loading:false,toggle:vi.fn()})}));
vi.mock('@/lib/debugHarness/runtimeCache',()=>({setHarnessCacheValue:vi.fn()}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:vi.fn(async({game})=>({currentRuleset:game==='tri-towers'?'tri-towers/5':'royal-flash/3'}))}));
import defaultsFixture from '../../../dev/lobby-catalog/production-fixture.json';
import {GameDefaultsConfig} from '../GameDefaultsConfig';
import {RulesContent} from '../rules/RulesContent';
import {reset,writes} from '../../../dev/lobby-catalog/mockSupabase';
beforeEach(()=>{reset();vi.stubGlobal("ResizeObserver",class {observe(){} unobserve(){} disconnect(){}});});afterEach(cleanup);
function category(name:string){fireEvent.mouseDown(screen.getByRole('tab',{name}),{button:0,ctrlKey:false});}
describe('defaults persistence and rules versions',()=>{
 it.each(['classic','modern'])('saves Quintzee round duration independently of decision timing (%s)',async(theme)=>{
 reset([{...defaultsFixture.defaults[0],game_type:'quintzee',quintzee_theme:theme,quintzee_round_seconds:240,decision_timer_seconds:10} as typeof defaultsFixture.defaults[number]]);
 const close=vi.fn();render(<GameDefaultsConfig open onOpenChange={close}/>);await screen.findByRole('combobox',{name:'Game'});category('Dice');fireEvent.change(screen.getByRole('combobox',{name:'Game'}),{target:{value:'quintzee'}});
 const field=await screen.findByLabelText('Round duration (seconds)');expect((field as HTMLInputElement).value).toBe('240');
 fireEvent.change(field,{target:{value:'300'}});category('Cards');category('Dice');fireEvent.change(screen.getByRole('combobox',{name:'Game'}),{target:{value:'quintzee'}});expect((screen.getByLabelText('Round duration (seconds)') as HTMLInputElement).value).toBe('300');
 fireEvent.click(screen.getByRole('button',{name:'Save Defaults'}));await waitFor(()=>expect(close).toHaveBeenCalledWith(false));
 expect(writes).toContainEqual(expect.objectContaining({table:'game_defaults',key:'quintzee',patch:expect.objectContaining({quintzee_round_seconds:300,decision_timer_seconds:10,quintzee_theme:theme})}));
 });
 it.each(['59','601','240.5',''])('does not save invalid Quintzee duration %s',async(value)=>{
 reset([{...defaultsFixture.defaults[0],game_type:'quintzee',quintzee_round_seconds:240} as typeof defaultsFixture.defaults[number]]);
 render(<GameDefaultsConfig open onOpenChange={()=>{}}/>);await screen.findByRole('combobox',{name:'Game'});category('Dice');fireEvent.change(screen.getByRole('combobox',{name:'Game'}),{target:{value:'quintzee'}});
 fireEvent.change(await screen.findByLabelText('Round duration (seconds)'),{target:{value}});fireEvent.click(screen.getByRole('button',{name:'Save Defaults'}));expect(writes).toHaveLength(0);
 });
 it('saves Battle31 turn duration through canonical defaults without match writes',async()=>{
 reset([{...defaultsFixture.defaults[0],game_type:'battle-31',decision_timer_seconds:15} as typeof defaultsFixture.defaults[number]]);
 const close=vi.fn();render(<GameDefaultsConfig open onOpenChange={close}/>);await screen.findByRole('combobox',{name:'Game'});category('Cards');fireEvent.change(screen.getByRole('combobox',{name:'Game'}),{target:{value:'battle-31'}});
 fireEvent.change(await screen.findByLabelText('Turn duration (seconds)'),{target:{value:'30'}});fireEvent.click(screen.getByRole('button',{name:'Save Defaults'}));await waitFor(()=>expect(close).toHaveBeenCalledWith(false));
 expect(writes).toContainEqual(expect.objectContaining({key:'battle-31',patch:expect.objectContaining({decision_timer_seconds:30})}));writes.forEach(w=>expect(w).toMatchObject({table:'game_defaults'}));
 });
 it('saves Canasta mode and Expert timer through the existing defaults owner',async()=>{
 reset([{...defaultsFixture.defaults[0],game_type:'canasta',decision_timer_seconds:120,canasta_mode:'beginner'} as typeof defaultsFixture.defaults[number]]);
 const close=vi.fn();render(<GameDefaultsConfig open onOpenChange={close}/>);await screen.findByRole('combobox',{name:'Game'});category('Cards');fireEvent.change(screen.getByRole('combobox',{name:'Game'}),{target:{value:'canasta'}});
 fireEvent.change(await screen.findByLabelText('Match pacing'),{target:{value:'expert'}});fireEvent.change(screen.getByLabelText('Expert turn timer (seconds)'),{target:{value:'150'}});fireEvent.click(screen.getByRole('button',{name:'Save Defaults'}));await waitFor(()=>expect(close).toHaveBeenCalledWith(false));
 expect(writes).toContainEqual(expect.objectContaining({key:'canasta',patch:expect.objectContaining({canasta_mode:'expert',decision_timer_seconds:150})}));
 });
 it('retains legacy and new stake drafts across categories and saves the existing collection',async()=>{
 const close=vi.fn();render(<GameDefaultsConfig open onOpenChange={close}/>);
 const ante=await screen.findByLabelText('Default stake / ante ($)');fireEvent.change(ante,{target:{value:'17'}});
 category('Other');fireEvent.change(screen.getByRole('combobox',{name:'Game'}),{target:{value:'boxdrop'}});
 fireEvent.change(screen.getByLabelText('Default stake / ante ($)'),{target:{value:'23'}});
 category('Cards');expect((screen.getByLabelText('Default stake / ante ($)') as HTMLInputElement).value).toBe('17');
 fireEvent.click(screen.getByRole('button',{name:'Save Defaults'}));await waitFor(()=>expect(close).toHaveBeenCalledWith(false));
 expect(writes).toContainEqual(expect.objectContaining({key:'holm',patch:expect.objectContaining({ante_amount:17})}));
 expect(writes).toContainEqual(expect.objectContaining({key:'boxdrop',patch:expect.objectContaining({ante_amount:23})}));
 expect(writes.length).toBe(15);
 });
 it('retains Farkle drafts across game switches and uses only its separate save path',async()=>{
 render(<GameDefaultsConfig open onOpenChange={()=>{}}/>);await screen.findByRole('combobox',{name:'Game'});category('Dice');fireEvent.change(screen.getByRole('combobox',{name:'Game'}),{target:{value:'farkle'}});
 fireEvent.change(await screen.findByLabelText('Default stake'),{target:{value:'19'}});category('Cards');category('Dice');fireEvent.change(screen.getByRole('combobox',{name:'Game'}),{target:{value:'farkle'}});
 expect((screen.getByLabelText('Default stake') as HTMLInputElement).value).toBe('19');fireEvent.click(screen.getByRole('button',{name:'Save Farkle Defaults'}));await screen.findByText('Farkle defaults saved for future games.');
 expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({key:'farkle',patch:{ante_amount:19}});
 category('Cards');fireEvent.click(screen.getByRole('button',{name:'Save Defaults'}));await waitFor(()=>expect(writes).toHaveLength(16));expect(writes.filter((w:any)=>w.key==='farkle').at(-1)).toMatchObject({patch:{ante_amount:19}});
 });
 it('cancel does not persist and reopening reloads stored values',async()=>{
 const ui=render(<GameDefaultsConfig open onOpenChange={()=>{}}/>);fireEvent.change(await screen.findByLabelText('Default stake / ante ($)'),{target:{value:'99'}});fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(writes).toHaveLength(0);
 ui.rerender(<GameDefaultsConfig open={false} onOpenChange={()=>{}}/>);ui.rerender(<GameDefaultsConfig open onOpenChange={()=>{}}/>);await waitFor(()=>expect((screen.getByLabelText('Default stake / ante ($)') as HTMLInputElement).value).toBe('3'));
 });
 it('resolves current TriTowers help rather than the old /2 fallback',async()=>{render(<RulesContent game="tri-towers" mode="arcade"/>);await screen.findByText(new RegExp('tri-towers/5'));});
 it('passes the selected legacy Royal Flash version to its renderer',async()=>{render(<RulesContent game="royal-flash" version="royal-flash/1" mode="arcade"/>);await screen.findByText(/Place the next card anywhere/);expect(screen.queryByText(/Filling all 25 squares/)).toBeNull();});
});
