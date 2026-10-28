// @vitest-environment jsdom
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({update:vi.fn(),error:vi.fn(),saved:vi.fn(),rows:[{id:'g',game_type:'six-card-golf',decision_timer_seconds:30,ante_amount:5,bot_decision_delay_seconds:1,pot_max_enabled:false,pussy_tax_enabled:false,golf_scoring_delay_ms:1200,golf_results_duration_ms:5000}]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:async()=>({data:{armed:false},error:null}),from:()=>({select:()=>({order:async()=>({data:mocks.rows,error:null})}),update:(v:unknown)=>{mocks.update(v);return {eq:async()=>({error:null})};}})}}));
vi.mock('@/lib/debugHarness/useGlobalDebugMode',()=>({useHarnessesMode:()=>({enabled:false,loading:false,toggle:vi.fn()})}));
vi.mock('@/lib/debugHarness/runtimeCache',()=>({setHarnessCacheValue:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:mocks.error}}));
import {GameDefaultsConfig} from '@/components/GameDefaultsConfig';
beforeEach(()=>{mocks.update.mockClear();mocks.error.mockClear();mocks.saved.mockClear();});afterEach(cleanup);
const open=async()=>{render(<GameDefaultsConfig open onOpenChange={mocks.saved}/>);await waitFor(()=>expect(screen.queryByText('Loading...')).toBeNull());fireEvent.change(screen.getByLabelText('Game'),{target:{value:'six-card-golf'}});};
it('saves both numeric Golf timing settings through the existing defaults owner',async()=>{
 await open();expect((screen.getByLabelText('Scoring Delay (ms)') as HTMLInputElement).value).toBe('1200');expect((screen.getByLabelText('Hole Results Duration (ms)') as HTMLInputElement).value).toBe('5000');
 fireEvent.change(screen.getByLabelText('Scoring Delay (ms)'),{target:{value:'1400'}});fireEvent.change(screen.getByLabelText('Hole Results Duration (ms)'),{target:{value:'6000'}});fireEvent.click(screen.getByRole('button',{name:'Save Defaults'}));
 await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({golf_scoring_delay_ms:1400,golf_results_duration_ms:6000})));expect(mocks.error).not.toHaveBeenCalled();
});
it('rejects invalid timing before sending a defaults update',async()=>{await open();fireEvent.change(screen.getByLabelText('Scoring Delay (ms)'),{target:{value:'0'}});fireEvent.click(screen.getByRole('button',{name:'Save Defaults'}));expect(mocks.error).toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();});
it.each([3,6,9,18])('saves %i holes through Game Defaults with all four choices',async holes=>{
 await open();const select=screen.getByLabelText('Match length') as HTMLSelectElement;
 expect(select.value).toBe('9');expect([...select.options].map(o=>Number(o.value))).toEqual([3,6,9,18]);
 fireEvent.change(select,{target:{value:String(holes)}});fireEvent.click(screen.getByRole('button',{name:'Save Defaults'}));
 await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({golf_holes:holes})));
});
