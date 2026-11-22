// @vitest-environment jsdom
import {act,renderHook,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {WordsSnapshot} from './model';
import {usePlacementPreview} from './usePlacementPreview';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('./client',()=>({wordsRpc:rpc}));
const view={identity:{sessionId:'s',dealerGameId:'d',roundId:'r'},viewerId:'me',revision:1,turn:1,rules:{version:'ptown-words/4'},board:Array(225).fill(null),rack:[{id:1,face:'Q',value:10}]} as WordsSnapshot;
const items=[{tileId:1,square:112,letter:'Q'}];
beforeEach(()=>{vi.useFakeTimers();rpc.mockReset();});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('shows server points even for invalid words and coalesces edits without sending a command',async()=>{
 rpc.mockResolvedValue({points:42,invalidWords:['QQ'],words:[{word:'QQ',points:42}]});
 const {result,rerender}=renderHook(({draft})=>usePlacementPreview(view,draft,true),{initialProps:{draft:items}});
 rerender({draft:[{...items[0],square:113}]});
 await act(async()=>vi.advanceTimersByTime(120));
 expect(result.current?.points).toBe(42);expect(result.current?.invalidWords).toEqual(['QQ']);
 expect(rpc).toHaveBeenCalledTimes(1);expect(rpc.mock.calls[0][0]).toBe('ptown_words_preview');
 expect(rpc.mock.calls[0][1].p_items[0].square).toBe(113);
});
it('discards late responses for edited, recalled and successor-turn placements',async()=>{
 const replies:((x:unknown)=>void)[]=[];
 rpc.mockImplementation(()=>new Promise(resolve=>replies.push(resolve)));
 const {result,rerender}=renderHook(({v,draft})=>usePlacementPreview(v,draft,true),{initialProps:{v:view,draft:items}});
 await act(async()=>vi.advanceTimersByTime(120));
 rerender({v:view,draft:[{...items[0],square:113}]});
 await act(async()=>{replies[0]({points:42});});
 expect(result.current).toBeNull();
 await act(async()=>vi.advanceTimersByTime(120));
 rerender({v:{...view,turn:2,revision:2},draft:[]});
 await act(async()=>{replies[1]({points:80});});
 expect(result.current).toBeNull();
});
it('clears the old total immediately and leaves structural or connection errors to submission',async()=>{
 rpc.mockResolvedValueOnce({points:20,invalidWords:[],words:[]}).mockRejectedValueOnce(Error('ptown_words:gap'));
 const {result,rerender}=renderHook(({draft,enabled})=>usePlacementPreview(view,draft,enabled),{initialProps:{draft:items,enabled:true}});
 await act(async()=>vi.advanceTimersByTime(120));expect(result.current?.points).toBe(20);
 rerender({draft:[{...items[0],square:114}],enabled:true});expect(result.current).toBeNull();
 await act(async()=>vi.advanceTimersByTime(120));expect(result.current).toBeNull();
 rerender({draft:items,enabled:false});expect(result.current).toBeNull();
});
