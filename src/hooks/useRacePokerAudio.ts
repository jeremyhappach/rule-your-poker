import {useEffect,useRef} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {racePokerCue} from '@/lib/racePoker/audio';
import type {RacePokerSnapshot} from '@/lib/racePoker/model';
/** Only newly observed live edges admit sound; recovered authority changes epoch. */
export function useRacePokerAudio(v:RacePokerSnapshot,userId:string,epoch:number,seconds:number,connected:boolean,error:string,activeTab:string,sessionEnded:boolean,reduced=false){
 const b=v.board;
 const previous=useRef({scope:v.scope,revision:v.revision,epoch,seconds,phase:b.phase});
 useEffect(()=>{
  const p=previous.current;previous.current={scope:v.scope,revision:v.revision,epoch,seconds,phase:b.phase};
  if(p.epoch!==epoch||!connected||error||v.paused||activeTab!=='cards'||document.hidden||sessionEnded)return;
  let kind:Parameters<typeof racePokerCue>[0]|undefined;
  if(p.scope===v.scope&&p.revision<v.revision&&b.phase==='playing'&&b.hand.length)kind='card';
  if(p.scope===v.scope&&p.phase==='playing'&&b.phase==='stage_complete'&&b.result?.points)kind='hoof';
  if(p.scope===v.scope&&b.phase==='playing'&&p.seconds>seconds&&(seconds===5||seconds===2))kind='warning';
  if(p.phase==='stage_complete'&&b.phase==='complete'&&v.terminal?.winnerIds.length===1&&v.terminal.winnerIds.includes(v.viewerId))kind='victory';
  if(reduced&&kind!=='warning')return;
  if(kind)return platformAudio.request({userId,id:`race-poker:${v.scope}:${v.revision}:${kind}:${seconds}`,expiresAt:performance.now()+1500,cue:racePokerCue(kind)});
 },[v.scope,v.revision,epoch,seconds,b.phase,connected,error,v.paused,activeTab,sessionEnded,userId,reduced]);
}
