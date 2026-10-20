import {useEffect,useMemo,useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {BoxdropGame} from '@/components/boxdrop/BoxdropGame';
import {boxdropTransport} from '@/lib/boxdrop/client';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
export function SoloBoxdrop({runId,userId}:{runId:string;userId:string}){
 const navigate=useNavigate(),live=useRef(hasTriStart(runId));
 const transport=useMemo(()=>boxdropTransport(runId,userId,true),[runId,userId]);
 useEffect(()=>()=>retireTriStart(runId),[runId]);
 return <BoxdropGame id={runId} userId={userId} solo transport={transport} liveEntry={live.current} onComplete={()=>navigate('/arcade/boxdrop?result='+runId,{replace:true})}/>;
}
