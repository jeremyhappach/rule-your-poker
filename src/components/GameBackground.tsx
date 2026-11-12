import {useEffect,useState} from 'react';
import {downloadArtwork} from '@/lib/arcade/artwork';
import {gameBackground} from '@/lib/gameBackgrounds/catalog';
import './gameBackground.css';

/** Presentation only: the authoritative game snapshot chooses the stable ID. */
export function GameBackground({id}:{id?:string|null}){
 const photo=gameBackground(id);
 const [image,setImage]=useState<{id:string;url:string}|null>(null);
 useEffect(()=>{
  if(!photo)return;
  let alive=true,url:string|undefined;
  void downloadArtwork(photo.path).then(blob=>{
   if(!alive)return;
   url=URL.createObjectURL(blob);setImage({id:photo.id,url});
  }).catch(()=>{/* The existing solid felt remains usable when artwork is unavailable. */});
  return()=>{alive=false;if(url)URL.revokeObjectURL(url);};
 },[photo]);
 return <div className="game-photo-background" aria-hidden="true" data-background-id={photo?.id}>
  {photo&&image?.id===photo.id&&<img src={image.url} alt="" draggable={false} style={{objectPosition:photo.position,transform:photo.scale?`scale(${photo.scale})`:undefined,transformOrigin:photo.origin}}/>}
 </div>;
}
