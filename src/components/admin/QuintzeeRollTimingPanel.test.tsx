// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {GeometryLabDraftProvider,useGeometryLabDraft} from '@/lib/geometryLab/GeometryLabDraftProvider';
import {_setFromLocalCommit,getSnapshot} from '@/lib/geometryLab/defaultsRegistry';
import {QUINTZEE_ROLL_TIMING_KEY as key} from '@/lib/geometryLab/quintzeeRollTiming';
import {QuintzeeRollTimingPanel} from './QuintzeeRollTimingPanel';
vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});
const {upsert}=vi.hoisted(()=>({upsert:vi.fn().mockResolvedValue({error:null})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({upsert})}}));
function Controls(){const {applyAll,cancelAll,applyError}=useGeometryLabDraft();return <><button onClick={()=>void applyAll()}>Apply</button><button onClick={cancelAll}>Cancel</button><span>{applyError}</span></>;}
afterEach(()=>{cleanup();_setFromLocalCommit(key,{durationMs:1500});upsert.mockClear();});
it('stages, cancels, applies and resets through the standard modal persistence owner',async()=>{
 render(<GeometryLabDraftProvider><QuintzeeRollTimingPanel/><Controls/></GeometryLabDraftProvider>);
 const input=screen.getByLabelText('Roll duration (milliseconds)');
 fireEvent.change(input,{target:{value:'750'}});expect(getSnapshot(key)).toEqual({durationMs:1500});expect(upsert).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Cancel'));expect((input as HTMLInputElement).value).toBe('1500');
 fireEvent.change(input,{target:{value:'750'}});fireEvent.click(screen.getByText('Apply'));
 await waitFor(()=>expect(getSnapshot(key)).toEqual({durationMs:750}));
 expect(upsert).toHaveBeenCalledWith([expect.objectContaining({key,value:{durationMs:750}})],{onConflict:'key'});
 fireEvent.click(screen.getByText('Reset section (draft only)'));expect(getSnapshot(key)).toEqual({durationMs:750});expect((input as HTMLInputElement).value).toBe('1500');
 fireEvent.click(screen.getByText('Apply'));await waitFor(()=>expect(getSnapshot(key)).toEqual({durationMs:1500}));
});
it('retains committed duration and editable draft when persistence fails',async()=>{
 upsert.mockResolvedValueOnce({error:{message:'Permission denied'}});
 render(<GeometryLabDraftProvider><QuintzeeRollTimingPanel/><Controls/></GeometryLabDraftProvider>);
 fireEvent.change(screen.getByLabelText('Roll duration (milliseconds)'),{target:{value:'750'}});fireEvent.click(screen.getByText('Apply'));
 await screen.findByText('Permission denied');expect(getSnapshot(key)).toEqual({durationMs:1500});expect((screen.getByLabelText('Roll duration (milliseconds)') as HTMLInputElement).value).toBe('750');
});
