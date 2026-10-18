import {useEffect,useMemo,useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {RoyalFlashGame} from '@/components/royalFlash/RoyalFlashGame';
import {royalTransport} from '@/lib/royalFlash/client';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
export function SoloRoyalFlash({runId,userId}:{runId:string;userId:string}){
 const navigate=useNavigate(),live=useRef(hasTriStart(runId));
 const transport=useMemo(()=>royalTransport(runId,userId,true),[runId,userId]);
 useEffect(()=>()=>retireTriStart(runId),[runId]);
 return <RoyalFlashGame id={runId} userId={userId} solo transport={transport} liveEntry={live.current} onComplete={()=>navigate('/arcade/royal-flash?result='+runId,{replace:true})}/>;
}
