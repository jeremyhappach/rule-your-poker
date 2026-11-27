// @vitest-environment jsdom
import {StrictMode} from 'react';
import {afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render} from '@testing-library/react';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {loadAuditionedFixtures} from '@/lib/audio/approvedSounds.fixture';
import {FiveAliveBoard,type FiveAliveBoardProps} from './FiveAliveBoard';
import {endAnimation} from './animationTestEvent';

const fixture=vi.hoisted(()=>({manager:null as unknown as ReturnType<typeof audioHarness>['manager']}));
vi.mock('@/lib/audio/platformAudio',()=>({get platformAudio(){return fixture.manager;}}));
let audio:ReturnType<typeof audioHarness>;
beforeAll(loadAuditionedFixtures);
beforeEach(async()=>{
 vi.useFakeTimers();sessionStorage.clear();audio=audioHarness();fixture.manager=audio.manager;
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 Object.defineProperty(document,'hidden',{configurable:true,value:false});
 vi.spyOn(document.documentElement,'clientWidth','get').mockReturnValue(390);
 vi.spyOn(document.documentElement,'clientHeight','get').mockReturnValue(844);
 // At the opening edge the rotated tile can have zero projected width. Its
 // stationary row remains visible; use the real visibility guard and mixer.
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
  return {x:20,y:100,left:20,top:100,right:320,bottom:150,width:this.classList.contains('five-alive-tile')?0:300,height:50,toJSON:()=>({})};
 });
});
afterEach(()=>{cleanup();audio.dispose();vi.restoreAllMocks();vi.useRealTimers();});
const props=(mode:FiveAliveBoardProps['mode']):FiveAliveBoardProps=>({mode,round:1,score:0,pending:true,
 current:{completed:false,guesses:[{word:'STARE',feedback:['absent','absent','present','absent','correct']}]},
 reveal:{id:'command-uuid',row:0},onSubmit:vi.fn(),onBack:vi.fn()});
function open(container:HTMLElement){
 const tile=container.querySelector('[data-reveal=close]')!;
 endAnimation(tile,'five-alive-flip-close');
 const event=new Event('webkitAnimationStart',{bubbles:true});
 Object.defineProperty(event,'animationName',{value:'five-alive-flip-open'});
 fireEvent(tile,event);return {tile,event};
}

it.each(['arcade','async'] as const)('plays five edge-on flips once in %s, including repeated events and remounts',mode=>{
 const p=props(mode),ui=render(<StrictMode><FiveAliveBoard {...p}/></StrictMode>);
 for(let column=0;column<5;column++){
  const {tile,event}=open(ui.container);expect(audio.starts()).toHaveLength(column+1);
  fireEvent(tile,event);ui.rerender(<StrictMode><FiveAliveBoard {...p}/></StrictMode>);
  expect(audio.starts()).toHaveLength(column+1);
  endAnimation(tile,'five-alive-flip-open');vi.advanceTimersByTime(440);
 }
 ui.unmount();const remount=render(<FiveAliveBoard {...p}/>);
 open(remount.container);expect(audio.starts()).toHaveLength(5);
 remount.rerender(<FiveAliveBoard {...p} reveal={{id:'next-command-uuid',row:0}}/>);
 open(remount.container);expect(audio.starts()).toHaveLength(6);
});

it.each(['arcade','async'] as const)('consumes muted flips in %s without replaying on unmute',mode=>{
 audio.manager.setPreference('user',false);
 const ui=render(<FiveAliveBoard {...props(mode)}/>),{tile,event}=open(ui.container);
 expect(audio.starts()).toHaveLength(0);
 audio.manager.setPreference('user',true);fireEvent(tile,event);expect(audio.starts()).toHaveLength(0);
 endAnimation(tile,'five-alive-flip-open');open(ui.container);expect(audio.starts()).toHaveLength(1);
 audio.manager.setPreference('user',false);
 expect(audio.nodes.find(node=>node.kind==='buffer')?.stop).toHaveBeenCalled();
});

it('keeps restored rows and hidden reveals silent',()=>{
 const p=props('async'),ui=render(<FiveAliveBoard {...p} reveal={undefined}/>);
 expect(audio.starts()).toHaveLength(0);
 Object.defineProperty(document,'hidden',{configurable:true,value:true});
 ui.rerender(<FiveAliveBoard {...p}/>);const {tile,event}=open(ui.container);
 Object.defineProperty(document,'hidden',{configurable:true,value:false});fireEvent(tile,event);
 expect(audio.starts()).toHaveLength(0);
});
