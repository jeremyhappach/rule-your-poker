import {useEffect,useMemo,useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {TakeTwoGame} from '@/components/takeTwo/TakeTwoGame';
import {takeTwoTransport} from '@/lib/takeTwo/client';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
export function SoloTakeTwo({runId,userId}:{runId:string;userId:string}){
 const navigate=useNavigate(),live=useRef(hasTriStart(runId));
 const transport=useMemo(()=>takeTwoTransport(runId,userId,true),[runId,userId]);
 useEffect(()=>()=>retireTriStart(runId),[runId]);
 return <TakeTwoGame id={runId} userId={userId} solo transport={transport} liveEntry={live.current} onComplete={()=>navigate('/arcade/take-two?result='+runId,{replace:true})}/>;
}
