// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {render,cleanup} from '@testing-library/react';
import {MegaArcadePage} from './MegaArcadePage';
const fixture=vi.hoisted(()=>({props:null as any,change:null as any,status:null as any,remove:vi.fn()}));
vi.mock('./MegaArcade',()=>({MegaArcade:(props:any)=>{fixture.props=props;return null;}}));
vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{}}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{
 const channel={on:(_type:any,_filter:any,cb:any)=>{fixture.change=cb;return channel;},subscribe:(cb:any)=>{fixture.status=cb;return channel;}};return channel;
},removeChannel:fixture.remove}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('forwards only matching run revisions and keeps reconnect/malformed notices as full refreshes',()=>{
 render(<MegaArcadePage userId="u"/>);const changed=vi.fn(),stop=fixture.props.subscribe('run-a',changed);
 fixture.change({new:{run_id:'run-a',revision:7}});expect(changed).toHaveBeenLastCalledWith(7);
 fixture.change({new:{run_id:'other-run',revision:99}});expect(changed).toHaveBeenCalledTimes(1);
 for(const revision of [undefined,null,-1,1.5,'7']){fixture.change({new:{run_id:'run-a',revision}});expect(changed).toHaveBeenLastCalledWith(undefined);}
 fixture.status('SUBSCRIBED');expect(changed).toHaveBeenLastCalledWith();
 stop();expect(fixture.remove).toHaveBeenCalledOnce();
});
