// @vitest-environment jsdom
import {afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {loadAuditionedFixtures} from '@/lib/audio/approvedSounds.fixture';
import {cribbagePointsCue,approvedSound} from '@/lib/audio/approvedSounds';
import {presentCribbageScore,presentCribbageGo,cribbageSlideSoundRef} from './sounds';
const shared=vi.hoisted(()=>({present:vi.fn(),visible:true}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{getSnapshot:()=>({userId:'user'}),present:(...a:unknown[])=>shared.present(...a)}}));
vi.mock('@/lib/audio/presentationSound',()=>({isSoundSurfaceVisible:()=>shared.visible}));
let h:ReturnType<typeof audioHarness>;
beforeAll(loadAuditionedFixtures);
beforeEach(async()=>{vi.useFakeTimers();sessionStorage.clear();shared.visible=true;h=audioHarness();shared.present.mockImplementation((...a)=>h.manager.present(a[0], a[1]));for(let i=0;i<5;i++)await Promise.resolve();});
afterEach(()=>{h.dispose();vi.useRealTimers();});
it.each([1,2,4,12,29])('plays exactly %i copies of the original peg sample, 90 ms apart, once per award',points=>{
 presentCribbageScore(points,'award',document.body);presentCribbageScore(points,'award',document.body);
 expect(h.starts()).toHaveLength(points);
 h.starts().forEach((at,i)=>expect(at).toBeCloseTo(10+i*.09));
 expect(h.ctx.createBuffer).toHaveBeenCalledWith(1,3840,32000);
 expect(h.nodes.filter(n=>n.kind==='oscillator')).toHaveLength(0);
});
it('reuses the existing two-note womp only for a zero award',()=>{
 presentCribbageScore(0,'zero-hand',document.body);presentCribbageScore(0,'zero-hand',document.body);
 expect(h.nodes.filter(n=>n.kind==='oscillator')).toHaveLength(2);
 expect(h.starts()).toEqual([10,10.45]);expect(h.ctx.createBufferSource).not.toHaveBeenCalled();
});
it('gives Go one distinct falling tone, separate from an actual last-card peg click',()=>{
 presentCribbageGo('declaration',document.body);presentCribbageGo('declaration',document.body);
 expect(h.nodes.filter(n=>n.kind==='oscillator')).toHaveLength(1);
 expect(h.ctx.createBufferSource).not.toHaveBeenCalled();expect(h.starts()).toEqual([10]);
 presentCribbageScore(1,'last-card',document.body);
 expect(h.starts()).toEqual([10,10]);
 expect(h.nodes.filter(n=>n.kind==='buffer')).toHaveLength(1);
});
it('mute cancels every scheduled point and consumes muted/hidden identities',()=>{
 presentCribbageScore(12,'long',document.body);h.manager.setPreference('user',false);
 expect(h.nodes.filter(n=>n.kind==='buffer').every(n=>n.stop.mock.calls.length===1)).toBe(true);
 presentCribbageScore(4,'muted',document.body);h.manager.setPreference('user',true);
 shared.visible=false;presentCribbageScore(4,'hidden',null);shared.visible=true;
 presentCribbageScore(4,'hidden',document.body);presentCribbageScore(4,'muted',document.body);expect(h.starts()).toHaveLength(12);
});
it('sounds each discarded card despite the ordinary dense-deal cooldown and consumes duplicate transitions',()=>{
 const node=document.createElement('div');document.body.append(node);
 for(const id of ['discard:0','discard:1']){
  cribbageSlideSoundRef(id,true)(node);
  for(let i=0;i<2;i++)node.ontransitionrun?.({target:node,propertyName:'left'} as unknown as TransitionEvent);
 }
 expect(h.starts()).toHaveLength(2);expect(approvedSound('slide')?.policy?.intervalMs).toBe(160);node.remove();
});
it('does not synthesize points for invalid awards or unloaded data',()=>{
 expect(cribbagePointsCue(0)).toBeUndefined();expect(cribbagePointsCue(-1)).toBeUndefined();expect(cribbagePointsCue(1.5)).toBeUndefined();
});

it('a scoring card slide coexists with every point instead of suppressing either cue',()=>{
 const node=document.createElement('div');document.body.append(node);
 presentCribbageScore(4,'flush',node);cribbageSlideSoundRef('scoring-card',true)(node);
 node.ontransitionrun?.({target:node,propertyName:'left'} as unknown as TransitionEvent);
 expect(h.starts()).toHaveLength(5);expect(h.nodes.filter(n=>n.kind==='buffer').every(n=>n.stop.mock.calls.length===0)).toBe(true);node.remove();
});
