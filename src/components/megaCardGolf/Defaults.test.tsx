// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('@/integrations/supabase/client',()=>import('../../../dev/lobby-catalog/mockSupabase'));
vi.mock('@/lib/debugHarness/useGlobalDebugMode',()=>({useHarnessesMode:()=>({enabled:false,loading:false,toggle:vi.fn()})}));
vi.mock('@/lib/debugHarness/runtimeCache',()=>({setHarnessCacheValue:vi.fn()}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:vi.fn()}));
import {arcadeRequest} from '@/lib/arcade/client';
import {GameDefaultsConfig} from '../GameDefaultsConfig';
import {MegaDefaultsConnected} from './MegaDefaultsConnected';
import {INITIAL_COURSES} from '@/lib/megaCardGolf/config';
beforeEach(()=>vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
it('uses the existing lobby Defaults section and preserves exact revision/settings/archive save contract',async()=>{
 vi.mocked(arcadeRequest).mockImplementation(async()=>({courses:INITIAL_COURSES,isAdmin:true}));
 render(<GameDefaultsConfig open onOpenChange={()=>{}}/>);
 fireEvent.change(await screen.findByRole('combobox',{name:'Game'}),{target:{value:'mega-card-golf'}});
 fireEvent.change(await screen.findByLabelText('Stock draws per hole'),{target:{value:'15'}});
 const save=screen.getByRole('button',{name:'Save defaults'});expect(save.hasAttribute('disabled')).toBe(true);
 fireEvent.click(screen.getByLabelText('Archive this course’s board and start a fresh board'));fireEvent.click(save);
 await waitFor(()=>expect(arcadeRequest).toHaveBeenCalledWith(expect.objectContaining({game:'mega-card-golf',op:'defaults',id:'sunny-meadows',revision:1,settings:expect.objectContaining({stockAllowance:15}),boardChoice:'archive'})));
});
it('does not expose the editor when catalog denies admin access',async()=>{
 vi.mocked(arcadeRequest).mockResolvedValue({courses:INITIAL_COURSES,isAdmin:false});
 render(<MegaDefaultsConnected/>);await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'Save defaults'})).toBeNull();
});
