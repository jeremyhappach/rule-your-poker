// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,waitFor} from '@testing-library/react';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
import {RecentLoginsDialog} from './RecentLoginsDialog';
afterEach(()=>{cleanup();rpc.mockReset();});
it('loads only when opened, preserves server order and formats last-seen locally with Never for missing activity',async()=>{
 const timestamp='2026-10-18T17:00:00Z';rpc.mockResolvedValue({data:[{id:'a',name:'Recent',last_seen_at:timestamp},{id:'b',name:'No activity',last_seen_at:null}],error:null});
 const ui=render(<RecentLoginsDialog open={false} onOpenChange={()=>{}}/>);expect(rpc).not.toHaveBeenCalled();
 ui.rerender(<RecentLoginsDialog open onOpenChange={()=>{}}/>);await waitFor(()=>expect(ui.getByText('Never')).toBeTruthy());
 expect(rpc).toHaveBeenCalledWith('admin_recent_activity');
 expect(ui.getByText(new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'long'}).format(new Date(timestamp)))).toBeTruthy();
 expect(ui.getAllByRole('row').map(row=>row.textContent)).toEqual(['PlayerLast seen',expect.stringMatching(/^Recent/),'No activityNever']);
});
it('shows server authorization failures without retaining player activity',async()=>{
 rpc.mockResolvedValue({data:null,error:{message:'activity:admin_required'}});
 const ui=render(<RecentLoginsDialog open onOpenChange={()=>{}}/>);await waitFor(()=>expect(ui.getByRole('alert').textContent).toBe('activity:admin_required'));
 expect(ui.queryByRole('table')).toBeNull();
});
