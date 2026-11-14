import {useLayoutEffect,useRef,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import type {scoreFrame} from '@/lib/ptownWords/scorePresentation';
import {SCORE_FLIGHT} from '@/lib/ptownWords/scorePresentation';

type Frame=NonNullable<ReturnType<typeof scoreFrame>>;
/** Measure the transformed tiles and score pill in the same viewport space.
 * This portal is visual only; no hit target, scroll lock or gameplay callback. */
export function WordsScoreFlight({root,squares,frame,paused}:{root:RefObject<HTMLDivElement>;squares:number[];frame:Frame;paused:boolean}){
 const badge=useRef<HTMLDivElement>(null),latest=useRef({frame,paused,at:performance.now()});
 useLayoutEffect(()=>{latest.current={frame,paused,at:performance.now()};},[frame,paused]);
 const squareKey=squares.join(',');
 useLayoutEffect(()=>{
  let request=0;
  const draw=()=>{
   const el=badge.current,host=root.current,{frame:f,paused:held,at}=latest.current;
   const target=host?.querySelector<HTMLElement>(`[data-score-player="${f.playerId}"]`);
   const board=host?.querySelector('.words-viewport')?.getBoundingClientRect();
   const cells=squareKey.split(',').filter(Boolean).flatMap(s=>{
    const rect=host?.querySelector(`[data-square="${s}"]`)?.getBoundingClientRect();
    return rect&&rect.width&&rect.height&&board&&rect.right>board.left&&rect.left<board.right&&rect.bottom>board.top&&rect.top<board.bottom?[rect]:[];
   });
   if(el&&target&&board&&cells.length){
    const end=target.getBoundingClientRect();
    const from={x:(Math.max(board.left,Math.min(...cells.map(r=>r.left)))+Math.min(board.right,Math.max(...cells.map(r=>r.right))))/2,
     y:(Math.max(board.top,Math.min(...cells.map(r=>r.top)))+Math.min(board.bottom,Math.max(...cells.map(r=>r.bottom))))/2};
    const halfWidth=el.offsetWidth/2,halfHeight=el.offsetHeight/2;
    from.x=Math.max(board.left+halfWidth,Math.min(board.right-halfWidth,from.x));
    from.y=Math.max(board.top+halfHeight,Math.min(board.bottom-halfHeight,from.y));
    const progress=Math.min(1,f.progress+(f.phase==='flight'&&!held?(performance.now()-at)/SCORE_FLIGHT:0));
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t=reduced?0:progress;
    el.style.left=`${from.x+(end.left+end.width/2-from.x)*t}px`;
    el.style.top=`${from.y+(end.top+end.height/2-from.y)*t}px`;
    el.style.visibility=f.phase==='reveal'||f.phase==='after'?'hidden':'visible';
   }else if(el)el.style.visibility='hidden';
   request=requestAnimationFrame(draw);
  };
  draw();return()=>cancelAnimationFrame(request);
 },[root,squareKey,frame.id]);
 return createPortal(<div ref={badge} className="words-score-flight" aria-hidden="true" data-score-flight={frame.playerId} data-phase={frame.phase}>+{frame.points}</div>,document.body);
}
