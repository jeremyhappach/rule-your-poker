import {useEffect,useMemo,useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {ElevenUpGame} from '@/components/elevenUp/ElevenUpGame';
import {elevenTransport} from '@/lib/elevenUp/client';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
export function SoloElevenUp({runId,userId}:{runId:string;userId:string}){
 const navigate=useNavigate(),live=useRef(hasTriStart(runId));
 const transport=useMemo(()=>elevenTransport(runId,userId,true),[runId,userId]);
 useEffect(()=>()=>retireTriStart(runId),[runId]);
 return <ElevenUpGame id={runId} userId={userId} solo transport={transport} liveEntry={live.current} onComplete={()=>navigate('/arcade/eleven-up?result='+runId,{replace:true})}/>;
}
