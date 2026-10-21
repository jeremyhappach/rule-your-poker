import {expect,it} from 'vitest';
import {acceptElevenSnapshot,arcadeSnapshot,multiplayerSnapshot} from './model';
const raw={identity:{dealerGameId:'d',roundId:'r'},revision:1,serverAt:100,stage:1,players:[{id:'p',name:'Player',seat:1}],scores:{p:7},stages:[],settlement:null,viewerId:'p',activePlayerId:'p'};
it('projects persisted takeover flags and accepts their changed revision across reconnect',()=>{
 const old=multiplayerSnapshot(raw),automatic=multiplayerSnapshot({...raw,revision:2,players:[{...raw.players[0],autoplay:true,sitOutNextHand:true}]});
 expect(old.players[0].autoplay).toBe(false);
 expect(acceptElevenSnapshot(old,automatic,'d').players[0]).toMatchObject({autoplay:true,sitOutNextHand:true,score:7});
 expect(acceptElevenSnapshot(automatic,old,'d')).toBe(automatic);
 expect(()=>acceptElevenSnapshot(automatic,{...old,revision:2},'d')).toThrow('conflicting');
});
it('treats legacy absent flags and explicit false flags identically',()=>{
 expect(()=>acceptElevenSnapshot(multiplayerSnapshot(raw),multiplayerSnapshot({...raw,players:[{...raw.players[0],autoplay:false,sitOutNextHand:false}]}),'d')).not.toThrow();
});
it('does not introduce multiplayer control flags into Arcade',()=>{
 const solo=arcadeSnapshot({id:'a',revision:1,serverAt:0,status:'active',view:{roundId:'r',round:1},score:9},'user');
 expect(solo.players[0]).not.toHaveProperty('autoplay');expect(solo.solo).toBe(true);
});
