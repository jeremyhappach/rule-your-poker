// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const bus=vi.hoisted(()=>({channels:[] as any[]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:(topic:string,options:unknown)=>{
 const c={topic,options,state:{},sync:()=>{},status:(_:string)=>{},on:vi.fn((_e,_f,cb)=>{c.sync=cb;return c;}),subscribe:vi.fn(cb=>{c.status=cb;return c;}),track:vi.fn(),untrack:vi.fn(),presenceState:()=>c.state};bus.channels.push(c);return c;
},removeChannel:vi.fn()}}));
import {playingTopic,presenceLeases,usePlayingPresence,PLAYING_TTL_MS} from './playingPresence';
beforeEach(()=>{bus.channels=[];vi.useFakeTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('uses exact match/child/actor/availability identity',()=>{expect(playingTopic('m','c','a',10)).toBe('delayed-playing:m:c:a:10');expect(playingTopic('m','c','b',10)).not.toBe(playingTopic('m','c','a',10));});
it('expires unchanged snapshots and retains another active device',()=>{
 const leases=presenceLeases(),first={tab:[{presence_ref:'one',beat:'1'}]};
 expect(leases.read(first,0)).toBe(true);expect(leases.read(first,PLAYING_TTL_MS)).toBe(false);
 expect(leases.read({...first,second:[{presence_ref:'two',beat:'2'}]},PLAYING_TTL_MS)).toBe(true);
 expect(leases.read(first,PLAYING_TTL_MS+1)).toBe(false);expect(leases.read({},PLAYING_TTL_MS+2)).toBe(false);
});
it('publishes privately only while visible and stops on completion, background and stale callbacks',()=>{
 const {rerender,unmount}=renderHook(({topic})=>usePlayingPresence(topic,true),{initialProps:{topic:'one' as string|null}});
 const first=bus.channels[0];expect(first.options.config.private).toBe(true);act(()=>first.status('SUBSCRIBED'));expect(first.track).toHaveBeenCalledTimes(1);
 act(()=>{Object.defineProperty(document,'hidden',{value:true});document.dispatchEvent(new Event('visibilitychange'));});expect(first.untrack).toHaveBeenCalledTimes(1);
 act(()=>{first.status('SUBSCRIBED');vi.advanceTimersByTime(20_000);});expect(first.track).toHaveBeenCalledTimes(1);
 act(()=>{Object.defineProperty(document,'hidden',{value:false});document.dispatchEvent(new Event('visibilitychange'));});const second=bus.channels[1];act(()=>second.status('SUBSCRIBED'));expect(second.track).toHaveBeenCalledTimes(1);
 rerender({topic:null});expect(second.untrack).toHaveBeenCalledTimes(1);unmount();
});
it('observers never publish; disconnect clears; reconnect refetches; old topics cannot light a new card',()=>{
 const refresh=vi.fn(),{result,rerender}=renderHook(({topic})=>usePlayingPresence(topic,false,refresh),{initialProps:{topic:'one'}}),first=bus.channels[0];
 act(()=>first.status('SUBSCRIBED'));expect(refresh).not.toHaveBeenCalled();expect(first.track).not.toHaveBeenCalled();expect(result.current).toBe(false);
 act(()=>{first.state={tab:[{presence_ref:'p',beat:'1'}]};first.sync();});expect(result.current).toBe(true);
 act(()=>first.status('CHANNEL_ERROR'));expect(result.current).toBe(false);act(()=>first.status('SUBSCRIBED'));expect(refresh).toHaveBeenCalledTimes(1);
 rerender({topic:'two'});act(()=>first.sync());expect(result.current).toBe(false);
 act(()=>bus.channels[1].status('SUBSCRIBED'));expect(refresh).toHaveBeenCalledTimes(1);
});
