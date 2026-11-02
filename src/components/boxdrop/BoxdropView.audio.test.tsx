// @vitest-environment jsdom
import {cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const audio=vi.hoisted(()=>({present:vi.fn(),request:vi.fn()}));
vi.mock('@/lib/audio/presentationSound',()=>({presentSound:audio.present}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{request:audio.request}}));
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:({children}:any)=><div data-fullscreen-board-slot=""><div data-canonical-felt-interaction-layer=""/>{children}</div>}));
vi.mock('@/components/triTowers/TriTowersPresentation',()=>({useTriRoundPresentation:()=>null,TriRoundIntro:()=>null}));
vi.mock('@/lib/boxdrop/roundPresentation',()=>({boxdropRoundPresentation:()=>null}));
vi.mock('@/lib/boxdrop/model',()=>({boxdropPlayWindow:()=>({playable:true,remaining:50000,phase:'playing'})}));
import {BoxdropView} from './BoxdropView';
const box={id:1,value:2,color:'blue'},scale={stage:1,status:'active',sum:0,target:32,limit:5,boxes:[]};
const initial:any={scope:'game:round',revision:0,solo:true,round:1,players:[],canAct:true,paused:false,board:{rules:{version:'v1'},phase:'playing',deadline:50000,score:0,current:box,queue:[],recycleIndicator:1000,scales:[scale],event:{label:'Place a box',points:0}}};
const placed={...initial,revision:1,board:{...initial.board,current:{...box,id:2},scales:[{...scale,sum:2,boxes:[box]}],event:{label:'Box placed',points:0,scale:0,box}}};
const props={userId:'user',now:1000,pending:false,error:'',epoch:0,onIntent:vi.fn(),onReconnect:vi.fn()};
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('plays only when the accepted box exists on the scale, never on click or duplicate revision',()=>{
 const ui=render(<BoxdropView {...props} view={initial}/>);expect(audio.present).not.toHaveBeenCalled();
 fireEvent.click(ui.getByRole('button',{name:/Scale 1/}));expect(audio.present).not.toHaveBeenCalled();
 ui.rerender(<BoxdropView {...props} view={placed}/>);expect(audio.present).toHaveBeenCalledOnce();
 expect(audio.present.mock.lastCall?.[2]?.getAttribute('data-box-id')).toBe('1');expect(audio.request).not.toHaveBeenCalled();
 ui.rerender(<BoxdropView {...props} view={placed}/>);expect(audio.present).toHaveBeenCalledOnce();
});
it.each([{epoch:1},{replay:true},{connected:false},{activeTab:'scores'},{sessionEnded:true}])('silences restored/hidden placement %o',override=>{
 const ui=render(<BoxdropView {...props} view={initial}/>);ui.rerender(<BoxdropView {...props} {...override as any} view={placed}/>);expect(audio.present).not.toHaveBeenCalled();
});
