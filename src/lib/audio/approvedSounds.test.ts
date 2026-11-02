// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {approvedSound,diceLandingSound,cribbageHighlightCue} from './approvedSounds';
import {loadAuditionedFixtures} from './approvedSounds.fixture';
import {audioHarness} from './audioTestHarness';
import {decodePCM} from './pcm';

let h:ReturnType<typeof audioHarness>;
beforeAll(loadAuditionedFixtures);
beforeEach(async()=>{vi.useFakeTimers();sessionStorage.clear();h=audioHarness();for(let i=0;i<5;i++)await Promise.resolve();});
afterEach(()=>{h.dispose();vi.useRealTimers();vi.restoreAllMocks();});
const play=(name:Parameters<typeof approvedSound>[0],id:string=name)=>h.manager.present({userId:'user',id,cue:approvedSound(name)});

it.each(['deal-paper','flip-soft','dice-land','dice-land-soft','peg-wood','holm-glass-recorded','winner-a'])('ships the exact approved audition bytes: %s',name=>{
 const source=readFileSync(resolve(`dev/sound-lab/assets/${name}.wav`));
 const shipped=readFileSync(resolve(`src/assets/audio/${name}.wav`));
 const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 expect(hash(shipped)).toBe(hash(source));
 const pcm=decodePCM(shipped.buffer.slice(shipped.byteOffset,shipped.byteOffset+shipped.byteLength));
 expect(pcm.rate).toBe(32000);expect(pcm.samples.every(Number.isFinite)).toBe(true);
 expect(Math.max(...pcm.samples.map(Math.abs))).toBeLessThan(1);
});
it.each([['357-beeps','drop-countdown-beeps'],['chucky-heartbeat','chucky-heartbeat']])('ships the selected smoke audition: %s',(audition,asset)=>{
 const hash=(file:string)=>createHash('sha256').update(readFileSync(resolve(file))).digest('hex');
 expect(hash(`src/assets/audio/${asset}.wav`)).toBe(hash(`dev/sound-smoke/assets/${audition}.wav`));
});
it.each([[[],6,null],[[2],6,'diceOne'],[[2,2],6,'diceOne'],[[0,4],6,'diceMany'],[[0,1,2,3,4],5,'diceMany'],[[-1,6,1.5],6,null]] as const)('counts actual valid unique landing dice %j',(indices,count,sound)=>expect(diceLandingSound(indices,count)).toBe(sound));
it('groups dense deals, consumes suppression, and caches the decoded AudioBuffer',()=>{
 for(let i=0;i<20;i++)play('slide','deal:'+i);
 expect(h.starts()).toHaveLength(1);
 vi.advanceTimersByTime(200);play('slide','deal:1');expect(h.starts()).toHaveLength(1);
 play('slide','deal:new');expect(h.starts()).toHaveLength(2);expect(h.ctx.createBuffer).toHaveBeenCalledTimes(1);
});
it('lets final victory preempt routine sounds and consumes lower-priority events during it',()=>{
 play('slide');const slide=h.nodes.find(n=>n.kind==='buffer')!;
 play('winner');expect(slide.stop).toHaveBeenCalledTimes(1);
 play('peg');play('flip');expect(h.starts()).toHaveLength(2);
 vi.advanceTimersByTime(1300);play('peg');expect(h.starts()).toHaveLength(2);
 play('peg','fresh');expect(h.starts()).toHaveLength(3);
});
it('consumes unknown preference, muted, unavailable, and locked events without later catch-up',async()=>{
 h.manager.setPreference('user',false);play('winner','muted');h.manager.setPreference('user',true);
 h.manager.present({userId:'user',id:'unloaded'});h.manager.present({userId:'user',id:'unloaded',cue:approvedSound('winner')});
 h.state('suspended');play('slide','locked');h.state('running');play('slide','locked');play('winner','muted');expect(h.starts()).toHaveLength(0);
 play('flip','new');expect(h.starts()).toHaveLength(1);
});
it('stops the actual sample immediately on mute and does not replay on unmute or manager recreation',()=>{
 play('winner');const source=h.nodes.find(n=>n.kind==='buffer')!;h.manager.setPreference('user',false);
 expect(source.stop).toHaveBeenCalledTimes(1);expect(source.disconnect).toHaveBeenCalled();
 h.manager.setPreference('user',true);play('winner');expect(h.starts()).toHaveLength(1);
 const second=audioHarness();second.manager.present({userId:'user',id:'winner',cue:approvedSound('winner')});expect(second.starts()).toHaveLength(0);second.dispose();
});
it('creates one fixed, short dyad for a scoring highlight; repeated identities cannot count up',()=>{
 expect(cribbageHighlightCue.durationMs).toBe(190);play('cribbageHighlight','hand:target:pair1');play('cribbageHighlight','hand:target:pair1');
 expect(h.starts()).toHaveLength(2);vi.advanceTimersByTime(200);play('cribbageHighlight','hand:target:pair2');expect(h.starts()).toHaveLength(4);
});
