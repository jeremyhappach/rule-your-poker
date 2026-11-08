import {RulesContent} from '@/components/rules/RulesContent';
import '@/components/catalog/catalog.css';
import {useEffect,useState,type ReactNode} from 'react';
import {Info} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle,DialogTrigger} from '@/components/ui/dialog';
import {downloadArtwork,type ArcadeGame} from '@/lib/arcade/artwork';

export function ArcadeArtwork({path}:{path:string|null}){
  const [image,setImage]=useState<{path:string;url:string}|null>(null);
  useEffect(()=>{
    if(!path)return;
    let alive=true,url:string|undefined;
    void downloadArtwork(path).then(blob=>{if(alive){url=URL.createObjectURL(blob);setImage({path,url});}}).catch(()=>{});
    return()=>{alive=false;if(url)URL.revokeObjectURL(url);};
  },[path]);
  return path&&image?.path===path?<img className="arcade-artwork" src={image.url} alt=""/>:null;
}
export function ArcadeInfo({game,name,ruleset,children,onOpen,banner=false,triggerLabel}:{game:ArcadeGame;name:string;ruleset?:string;children?:ReactNode;onOpen?:()=>void;banner?:boolean;triggerLabel?:string}){
  const [open,setOpen]=useState(false);
  return <Dialog open={open} onOpenChange={value=>{setOpen(value);if(value)onOpen?.();}}>
    <DialogTrigger asChild><button type="button" className={'arcade-info-button'+(banner?' arcade-info-button--banner':'')+(triggerLabel?' arcade-info-button--labeled':'')} aria-label={name+' rules and info'}>
      {banner?<span className="arcade-info-face" aria-hidden="true">i</span>:<Info size={21} aria-hidden="true"/>}{triggerLabel&&<span>{triggerLabel}</span>}
    </button></DialogTrigger>
    <DialogContent className="arcade-info"><DialogTitle>{name} · Rules &amp; info</DialogTitle>
      <DialogDescription>{game!=='yahtzee'?'How to play and compare your scores.':'Coming Soon'}</DialogDescription>
      {open&&(game==='yahtzee'?<p>Arcade rules will be available when this game launches.</p>:<RulesContent game={game} version={ruleset} mode="arcade"/>)}
      {children}
    </DialogContent>
  </Dialog>;
}
