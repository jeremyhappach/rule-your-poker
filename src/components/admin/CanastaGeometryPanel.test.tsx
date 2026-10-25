// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {GeometryLabDraftProvider} from '@/lib/geometryLab/GeometryLabDraftProvider';
import {getCanastaGeometry,CANASTA_GEOMETRY_DEFAULTS} from '@/components/canasta/geometry';
import {CanastaGeometryPanel} from './CanastaGeometryPanel';
vi.mock('@/integrations/supabase/client',()=>({supabase:new Proxy({},{get(){throw Error('No database access in preview test');}})}));
afterEach(cleanup);
it('previews bounded Canasta drafts and restores the committed settings on close without database access',()=>{
 const view=render(<GeometryLabDraftProvider><CanastaGeometryPanel/></GeometryLabDraftProvider>);
 const input=screen.getByLabelText('Canasta Card width');fireEvent.focus(input);fireEvent.change(input,{target:{value:'60'}});fireEvent.blur(input);
 expect(getCanastaGeometry().cardWidth).toBe(60);
 const overlap=screen.getByLabelText('Canasta Hand fan overlap');fireEvent.change(overlap,{target:{value:'.9'}});fireEvent.blur(overlap);expect(getCanastaGeometry().handOverlap).toBe(.14);
 view.unmount();expect(getCanastaGeometry()).toEqual(CANASTA_GEOMETRY_DEFAULTS);
});
