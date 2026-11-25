// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {finalWordsFixture,viewer,opponent,childId} from '@/lib/delayed/wordsFinalReview.fixture';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/ptownWords/client',()=>({wordsRpc:mock.rpc}));
import {WordsEndSequence} from './WordsEndSequence';
const advance=async(ms:number)=>act(async()=>{await vi.advanceTimersByTimeAsync(ms);});
beforeEach(()=>{vi.useFakeTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});mock.rpc.mockResolvedValue({id:childId,revision:7,racks:{[viewer]:[{id:1,face:'A',value:1}],[opponent]:[]},before:{[viewer]:246,[opponent]:384},scores:{[viewer]:245,[opponent]:385}});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it.each(['live','async'] as const)('%s reveals racks, applies each signed adjustment, then completes once',async mode=>{
 const scores=vi.fn(),complete=vi.fn();render(<WordsEndSequence view={finalWordsFixture().snapshot} mode={mode} onScores={scores} onComplete={complete}/>);await advance(0);
 expect(screen.getByLabelText('A, 1 points')).toBeTruthy();expect(screen.queryByText('246 − 1 = 245')).toBeNull();expect(scores).toHaveBeenLastCalledWith({[viewer]:246,[opponent]:384});
 await advance(2000);expect(screen.getByText('246 − 1 = 245')).toBeTruthy();expect(screen.queryByText('384 + 1 = 385')).toBeNull();
 await advance(1800);expect(screen.getByText('384 + 1 = 385')).toBeTruthy();expect(scores).toHaveBeenLastCalledWith({[viewer]:245,[opponent]:385});expect(complete).not.toHaveBeenCalled();
 await advance(3800);expect(complete).toHaveBeenCalledTimes(1);await advance(10000);expect(complete).toHaveBeenCalledTimes(1);
});
it('cannot advance past unavailable racks and retries the same read',async()=>{
 mock.rpc.mockRejectedValueOnce(Error('offline'));const complete=vi.fn();render(<WordsEndSequence view={finalWordsFixture().snapshot} mode="async" onScores={()=>{}} onComplete={complete}/>);await advance(20000);expect(complete).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Retry'}));await advance(0);expect(screen.getByLabelText('A, 1 points')).toBeTruthy();await advance(7600);expect(complete).toHaveBeenCalledTimes(1);
});
it('rejects a different result instead of mixing final totals',async()=>{
 mock.rpc.mockResolvedValue({id:'other',racks:{}});const complete=vi.fn();render(<WordsEndSequence view={finalWordsFixture().snapshot} mode="live" onScores={()=>{}} onComplete={complete}/>);await advance(20000);expect(screen.getByText('Unable to load remaining tiles.')).toBeTruthy();expect(complete).not.toHaveBeenCalled();
});
it('background time cannot finish the visible sequence',async()=>{
 const complete=vi.fn();render(<WordsEndSequence view={finalWordsFixture().snapshot} mode="live" onScores={()=>{}} onComplete={complete}/>);await advance(1000);Object.defineProperty(document,'hidden',{configurable:true,value:true});await act(async()=>document.dispatchEvent(new Event('visibilitychange')));await advance(30000);expect(complete).not.toHaveBeenCalled();
});
