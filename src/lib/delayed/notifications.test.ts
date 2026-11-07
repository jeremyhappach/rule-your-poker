import {expect,it} from 'vitest';
import {compactTurnTime,turnDestination} from './notifications';
import type {Home} from './client';
it.each([[28*3600000,'28h left'],[3600000,'1h left'],[3599999,'60m left'],[59*60000,'59m left'],[1000,'1m left'],[0,'0m left']])('formats %s milliseconds compactly', (ms,label)=>{expect(compactTurnTime(new Date(10000+ms).toISOString(),10000)).toBe(label);});
it('excludes expired gameplay from direct-entry turn counting',()=>{
 const home={id:'m',status:'active',held:false,serverAt:1000,lineup:[{id:'one',actor:'viewer',expiresAt:new Date(10000).toISOString(),playable:true},{id:'expired',actor:'viewer',expiresAt:new Date(10000).toISOString(),playable:false}]} as Home;
 expect(turnDestination(home,'viewer')).toBe('/delayed/m/play/one');
});
