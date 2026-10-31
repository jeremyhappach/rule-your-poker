// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/webPush/browser',()=>({pushEnabled:true}));
vi.mock('@/lib/delayed/client',()=>({delayedRpc:vi.fn()}));
import {PushPreferences} from './PushPreferences';
const initial={invitations:false,asyncDefault:false,newTable:false,quietEnabled:false,quietStart:'22:00',quietEnd:'07:00',quietZone:'UTC'};
function fixture(){
 let prefs={...initial},enabled=false;
 const rpc=vi.fn(async(name:string,args:any={})=>{
  if(name==='notification_preferences'){prefs={...prefs,...args.p_patch};return prefs;}
  if(args.p_enabled!==undefined)enabled=args.p_enabled;return enabled;
 });
 const device={status:()=> 'permission-needed',prepare:vi.fn(),enableDevice:vi.fn(async()=> 'enabled'),disableDevice:vi.fn(async()=>{})};
 const props={userId:'a',rpc:rpc as any,device};
 return {rpc,device,props,settings:()=>prefs};
}
afterEach(cleanup);
describe('Notifications match accordion',()=>{
 it('starts closed with usable checkbox; checkbox saves without expanding or prompting',async()=>{
  const f=fixture();render(<PushPreferences {...f.props} matchId="m"/>);
  const box=screen.getByRole('checkbox',{name:'Enable push notifications for this match'}),details=screen.getByRole('button',{name:'Notification details'});
  await waitFor(()=>expect((box as HTMLInputElement).disabled).toBe(false));
  expect(details.getAttribute('aria-expanded')).toBe('false');expect(screen.queryByRole('button',{name:'Enable on this device'})).toBeNull();
  fireEvent.click(box);await waitFor(()=>expect((box as HTMLInputElement).checked).toBe(true));
  expect(details.getAttribute('aria-expanded')).toBe('false');expect(f.device.enableDevice).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenCalledWith('async_push_preference',{p_match:'m',p_enabled:true});
 });
 it('expansion has an accessible panel and never saves or enables the device',async()=>{
  const f=fixture();render(<PushPreferences {...f.props} matchId="m"/>);
  await waitFor(()=>expect(f.rpc).toHaveBeenCalledTimes(2));const count=f.rpc.mock.calls.length;
  const details=screen.getByRole('button',{name:'Notification details'});fireEvent.click(details);
  expect(details.getAttribute('aria-expanded')).toBe('true');expect(document.getElementById(details.getAttribute('aria-controls')!)?.hidden).toBe(false);
  expect(screen.getByRole('button',{name:'Enable on this device'})).toBeTruthy();expect(f.rpc).toHaveBeenCalledTimes(count);expect(f.device.enableDevice).not.toHaveBeenCalled();
  fireEvent.click(details);expect(screen.queryByRole('button',{name:'Enable on this device'})).toBeNull();
 });
 it('resets closed for a different match and on remount',async()=>{
  const f=fixture();const view=render(<PushPreferences {...f.props} matchId="m"/>);fireEvent.click(screen.getByRole('button',{name:'Notification details'}));
  view.rerender(<PushPreferences {...f.props} matchId="n"/>);expect(screen.getByRole('button',{name:'Notification details'}).getAttribute('aria-expanded')).toBe('false');
  view.unmount();render(<PushPreferences {...f.props} matchId="n"/>);expect(screen.getByRole('button',{name:'Notification details'}).getAttribute('aria-expanded')).toBe('false');
 });
 it('keeps a failed save visible while collapsed and preserves unchecked state',async()=>{
  const f=fixture();const original=f.rpc.getMockImplementation()!;f.rpc.mockImplementation(async(name,args)=>{if(args?.p_enabled!==undefined)throw Error('offline');return original(name,args);});
  render(<PushPreferences {...f.props} matchId="m"/>);const box=screen.getByRole('checkbox');await waitFor(()=>expect((box as HTMLInputElement).disabled).toBe(false));fireEvent.click(box);
  expect(await screen.findByRole('alert')).toBeTruthy();expect((box as HTMLInputElement).checked).toBe(false);expect(screen.getByRole('button',{name:'Notification details'}).getAttribute('aria-expanded')).toBe('false');
 });
 it('disables header preference until loads succeed but permits reading details',()=>{
  const f=fixture();f.rpc.mockImplementation(()=>new Promise(()=>{}));render(<PushPreferences {...f.props} matchId="m"/>);
  expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Notification details'}));expect(screen.getByRole('button',{name:'Enable on this device'})).toBeTruthy();
 });
});
it('global invitations and your-turn default save independently; there is no invitation match override',async()=>{
 const f=fixture();render(<PushPreferences {...f.props}/>);const invitations=screen.getByRole('checkbox',{name:'Match invitations'}),turn=screen.getByRole('checkbox',{name:'Your turn'});
 await waitFor(()=>expect((invitations as HTMLInputElement).disabled).toBe(false));fireEvent.click(invitations);await waitFor(()=>expect(f.settings().invitations).toBe(true));expect(f.settings().asyncDefault).toBe(false);
 fireEvent.click(turn);await waitFor(()=>expect(f.settings().asyncDefault).toBe(true));expect(f.settings().invitations).toBe(true);
 cleanup();render(<PushPreferences {...f.props} matchId="m"/>);expect(screen.queryByRole('checkbox',{name:'Match invitations'})).toBeNull();
});
