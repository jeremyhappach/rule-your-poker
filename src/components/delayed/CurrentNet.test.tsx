// @vitest-environment jsdom
import {render,cleanup} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {CurrentNet} from './CurrentNet';
import type {Home} from '@/lib/delayed/client';
afterEach(cleanup);
it('uses the already projected viewer net and unsettled value without inspecting hidden results',()=>{
 const home={players:[{id:'a',name:'Alex Long Name'},{id:'b',name:'Blair'}],net:-1234567.89,unsettled:9876543.21,lineup:[{terminal:false,stake:1}]} as Home;
 const ui=render(<CurrentNet home={home} userId="b"/>);
 expect(ui.getByText('$9,876,543.21 unsettled')).toBeTruthy();
 expect(ui.container.querySelectorAll('.async-current-net-player')[0].textContent).toBe('Alex Long Name+$1,234,567.89');
 expect(ui.container.querySelectorAll('.async-current-net-player')[1].textContent).toBe('Blair−$1,234,567.89');
});
it('retains zero and the existing legacy unsettled fallback',()=>{
 const home={players:[{id:'a',name:'Alex'}],net:0,unsettled:0,lineup:[{terminal:false,stake:4},{terminal:true,stake:10}]} as Home;
 const ui=render(<CurrentNet home={home} userId="a"/>);expect(ui.getByText('$0 unsettled')).toBeTruthy();
 ui.rerender(<CurrentNet home={{...home,unsettled:undefined}} userId="a"/>);expect(ui.getByText('$4 unsettled')).toBeTruthy();
});
