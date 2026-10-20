import {useEffect,useMemo,useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {TripFlipGame} from '@/components/tripFlip/TripFlipGame';
import {tripFlipTransport} from '@/lib/tripFlip/client';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
export function SoloTripFlip({runId,userId}:{runId:string;userId:string}){
 const navigate=useNavigate(),live=useRef(hasTriStart(runId));
 const transport=useMemo(()=>tripFlipTransport(runId,userId,true),[runId,userId]);
 useEffect(()=>()=>retireTriStart(runId),[runId]);
 return <TripFlipGame id={runId} userId={userId} solo transport={transport} liveEntry={live.current} onComplete={()=>navigate('/arcade/trip-flip?result='+runId,{replace:true})}/>;
}
