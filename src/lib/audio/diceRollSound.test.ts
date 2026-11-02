// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({present:vi.fn(),visible:vi.fn(()=>true),cancel:vi.fn(),cue:{durationMs:4000},snapshot:{userId:'user'}}));
vi.mock('./platformAudio',()=>({platformAudio:{getSnapshot:()=>mocks.snapshot,present:mocks.present}}));
vi.mock('./approvedSounds',()=>({approvedSound:()=>mocks.cue}));
vi.mock('./presentationSound',()=>({isSoundSurfaceVisible:mocks.visible}));
import {startDiceRollSound} from './diceRollSound';
afterEach(()=>{vi.clearAllMocks();mocks.visible.mockReturnValue(true);});
it('admits the exact Yahtzee cue once without queueing and exposes the manager stop',()=>{
 mocks.present.mockImplementation((event,scheduled)=>scheduled(mocks.cancel));
 const stop=startDiceRollSound('yahtzee:uuid:round:roll',document.body);
 expect(mocks.present).toHaveBeenCalledWith({userId:'user',id:'palette:cupRoll:yahtzee:uuid:round:roll',cue:mocks.cue},expect.any(Function));
 stop();expect(mocks.cancel).toHaveBeenCalledOnce();
});
it.each(['horses:uuid:roll','scc:uuid:roll',undefined])('does not integrate an unapproved roll mapping %s',id=>{
 startDiceRollSound(id,document.body);expect(mocks.present).not.toHaveBeenCalled();
});
it('consumes an invisible edge without a cue',()=>{
 mocks.visible.mockReturnValue(false);startDiceRollSound('yahtzee:hidden',null);
 expect(mocks.present.mock.lastCall?.[0].cue).toBeUndefined();
});
