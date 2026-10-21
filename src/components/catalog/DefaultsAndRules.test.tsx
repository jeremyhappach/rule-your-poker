// @vitest-environment jsdom
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
vi.mock('@/integrations/supabase/client',()=>import('../../../dev/lobby-catalog/mockSupabase'));
vi.mock('@/lib/debugHarness/useGlobalDebugMode',()=>({useHarnessesMode:()=>({enabled:false,loading:false,toggle:vi.fn()})}));
vi.mock('@/lib/debugHarness/runtimeCache',()=>({setHarnessCacheValue:vi.fn()}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:vi.fn(async({game})=>({currentRuleset:game==='tri-towers'?'tri-towers/5':'royal-flash/3'}))}));
import {GameDefaultsConfig} from '../GameDefaultsConfig';
import {RulesContent} from '../rules/RulesContent';
import {reset,writes} from '../../../dev/lobby-catalog/mockSupabase';
beforeEach(()=>{reset();vi.stubGlobal("ResizeObserver",class {observe(){} unobserve(){} disconnect(){}});});afterEach(cleanup);
function category(name:string){fireEvent.mouseDown(screen.getByRole('tab',{name}),{button:0,ctrlKey:false});}
describe('defaults persistence and rules versions',()=>{
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
