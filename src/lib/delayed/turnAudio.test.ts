import {expect,it} from 'vitest';
import {localTurnPresentation} from './turnAudio';
const board={playerId:'me',columns:[[],[],[],[],[]],current:{rank:'2',suit:'spades'},passesUsed:0,cardIndex:3,revision:3,result:null};
const before:any={id:'child',matchId:'match',game:'run21',actor:'me',segment:3,round:2,revision:8,board,config:{},ownResults:[]};
const command={op:'action',childId:'child',segment:3,revision:8,requestId:'local',intent:{type:'place',column:0}};
const after:any={...before,revision:9,board:{...board,current:{rank:'3',suit:'hearts'},cardIndex:4,revision:4,columns:[[board.current],[],[],[],[]]}};
it('requires the accepted card, column and revision rather than a successful response alone',()=>{
 expect(localTurnPresentation(before,after,command,'me').event).toMatchObject({type:'card_placed',sequence:9,actorId:'me',operands:{column:0}});
 for(const changed of [{revision:10},{id:'different'},{matchId:'different'},{actor:'other'},{segment:5},{held:true},{board:{...after.board,columns:[[after.board.current],[],[],[],[]]}},{board:{...after.board,passesUsed:1}},{board:{...after.board,revision:3}}])
  expect(localTurnPresentation(before,{...after,...changed},command,'me').event).toBeNull();
 expect(localTurnPresentation(before,after,{...command,intent:{type:'place',column:8}},'me').event).toBeNull();
});
it('admits a final placement from the exact just-finished own attempt',()=>{
 const final={...after.board,result:{reason:'bust'}};
 const ended={...after,actor:'other',segment:4,board:null,ownResults:[{round:2,board:final}]};
 expect(localTurnPresentation(before,ended,command,'me').event?.frame.boards.me).toBe(final);
 expect(localTurnPresentation(before,{...ended,ownResults:[{round:1,board:final}]},command,'me').event).toBeNull();
});
it('does not turn state reads, wrong actors or old starts into live presentation',()=>{
 expect(localTurnPresentation(before,after,{...command,op:'state'},'me').event).toBeNull();
 expect(localTurnPresentation(before,after,command,'other').event).toBeNull();
 expect(localTurnPresentation(before,after,{...command,intent:{type:'start'}},'me').start).toBe(false);
 expect(localTurnPresentation({...before,board:null},after,{...command,intent:{type:'start'}},'me').start).toBe(true);
});
