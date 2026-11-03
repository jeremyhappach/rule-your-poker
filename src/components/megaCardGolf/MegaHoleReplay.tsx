import {useEffect,useMemo} from 'react';
import type {MegaView} from '@/lib/megaCardGolf/engine';
import {presentationFrame,savedHolePresentation} from '@/lib/megaCardGolf/presentation';
import {platformAudio} from '@/lib/audio/platformAudio';
import {megaCue} from '@/lib/megaCardGolf/audio';
import {MegaCardGolfGame} from './MegaCardGolfGame';
import {MegaCompetitionScorecard} from './MegaCompetitionScorecard';
import type {CompetitionResult} from '@/lib/megaCardGolf/competition';
import './megaCardGolf.css';
const noop=()=>{};
export function MegaHoleReplay({view,elapsed,identity,userId,actorName,players,results=[],sound=false}:{view:MegaView;elapsed:number;identity:string;userId:string;actorName:string;players:{id:string;name:string}[];results?:CompetitionResult[];sound?:boolean}){
 const timeline=useMemo(()=>savedHolePresentation(view,0,identity),[view,identity]);
 const frame=presentationFrame(timeline,elapsed)!;
 useEffect(()=>{
  if(!sound||!frame.cue?.fresh||document.hidden||!navigator.onLine)return;
  return platformAudio.request({userId,id:frame.cue.id,expiresAt:performance.now()+megaCue(frame.cue.kind).durationMs+200,cue:megaCue(frame.cue.kind)});
 },[sound,userId,frame.cue?.id]);
 return <MegaCardGolfGame replay view={frame.view} presentation={frame} now={view.deadline} busy canAbandon={false} playerName={actorName} onIntent={noop} onExit={noop}
  competitionScorecard={<MegaCompetitionScorecard course={view.config.name} holes={view.config.holes} hole={view.hole} players={players} results={results} write={frame.scoring?.finished?{actor:view.id.split(':').at(-1)!,hole:view.hole}:undefined}/>} />;
}
