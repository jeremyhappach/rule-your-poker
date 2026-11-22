import {useEffect,useState} from 'react';
import {wordsRpc} from './client';
import type {Placement,WordsSnapshot} from './model';

export interface PlacementPreview {points:number;invalidWords:string[];words:{word:string;points:number}[]}
/** Advisory server evaluation. Never submits a move or enters the snapshot pipeline. */
export function usePlacementPreview(view:WordsSnapshot,items:Placement[],enabled:boolean){
 const request=JSON.stringify({p_version:view.rules.version,p_board:view.board,p_rack:view.rack,p_items:items});
 const key=JSON.stringify([view.identity,view.viewerId,view.revision,view.turn,request]);
 const [answer,setAnswer]=useState<{key:string;preview:PlacementPreview}|null>(null);
 useEffect(()=>{
  const args=JSON.parse(request) as Record<string,unknown>&{p_items:Placement[]};
  if(!enabled||!args.p_items.length)return;
  let current=true;
  // Coalesce rapid tile edits; every answer is bound to this exact placement.
  const timer=setTimeout(()=>{
   void wordsRpc<PlacementPreview>('ptown_words_preview',args)
    .then(preview=>{if(current&&Number.isSafeInteger(preview.points)&&preview.points>=0)setAnswer({key,preview});})
    .catch(()=>{/* Submission retains its own authoritative validation and feedback. */});
  },120);
  return()=>{current=false;clearTimeout(timer);};
 },[key,request,enabled]);
 return enabled&&items.length&&answer?.key===key?answer.preview:null;
}
