import {expect, it, vi} from 'vitest';
import {createPlaybackSession} from './playbackSession';

it('reasserts playback and restores the original category after repeated activation', () => {
  const session = {type:'ambient'}, owner = createPlaybackSession(() => session);
  owner.activate(); owner.activate(); expect(session.type).toBe('playback');
  owner.release(); expect(session.type).toBe('ambient'); owner.release(); expect(session.type).toBe('ambient');
});
it('retires interrupted effects and resumes only on recovery, then removes the listener', () => {
  const session = Object.assign(new EventTarget(), {type:'auto',state:'active'});
  const owner = createPlaybackSession(() => session), interrupted=vi.fn(), recovered=vi.fn();
  const stop=owner.observe(interrupted,recovered);
  session.state='inactive';session.dispatchEvent(new Event('statechange'));expect(recovered).not.toHaveBeenCalled();
  session.state='interrupted';session.dispatchEvent(new Event('statechange'));expect(interrupted).toHaveBeenCalledTimes(1);
  session.state='active';session.dispatchEvent(new Event('statechange'));expect(recovered).toHaveBeenCalledTimes(1);
  stop();session.state='interrupted';session.dispatchEvent(new Event('statechange'));expect(interrupted).toHaveBeenCalledTimes(1);
});
it('preserves another feature category and supports reacquisition', () => {
  const session = {type:'auto'}, owner = createPlaybackSession(() => session);
  owner.activate(); session.type = 'play-and-record'; owner.release(); expect(session.type).toBe('play-and-record');
  owner.activate(); owner.release(); expect(session.type).toBe('play-and-record');
});
it('feature-detects absent and restricted APIs without blocking standard audio', () => {
  for (const read of [() => undefined, () => { throw Error('denied'); }, () => ({get type(){return 'auto';},set type(_v:string){throw Error('unsupported');}})]) {
    const owner = createPlaybackSession(read); expect(() => {owner.activate();owner.release();}).not.toThrow();
  }
});
