import {RulesContent} from '@/components/rules/RulesContent';
import '@/components/catalog/catalog.css';
import {useEffect,useId,useState,type ReactNode} from 'react';
import {Info,Upload} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle,DialogTrigger} from '@/components/ui/dialog';
import {downloadArtwork,replaceArtwork,validateArtwork,type ArcadeGame,type Artwork} from '@/lib/arcade/artwork';

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
export function ArcadeInfo({game,name,ruleset,children,admin=false,artwork,onArtwork,onOpen}:{game:ArcadeGame;name:string;ruleset?:string;children?:ReactNode;admin?:boolean;artwork?:Artwork;onArtwork?:(row:Artwork)=>void;onOpen?:()=>void}){
  const [open,setOpen]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const inputId=useId();
  async function upload(file:File){
    if(busy||!artwork)return;
    setBusy(true);setError('');
    try{
      validateArtwork(file);
      const bitmap=await createImageBitmap(file);bitmap.close();
      onArtwork?.(await replaceArtwork(game,file,artwork.object_path));
    }catch(e){setError(e instanceof Error?e.message:'Unable to read this image.');}
    finally{setBusy(false);}
  }
  return <Dialog open={open} onOpenChange={value=>{setOpen(value);if(value)onOpen?.();}}>
    <DialogTrigger asChild><button type="button" className="arcade-info-button" aria-label={name+' rules and info'}><Info size={21} aria-hidden="true"/></button></DialogTrigger>
    <DialogContent className="arcade-info"><DialogTitle>{name} · Rules &amp; info</DialogTitle>
      <DialogDescription>{game!=='yahtzee'?'How to play and compare your scores.':'Coming Soon'}</DialogDescription>
      {open&&(game==='yahtzee'?<p>Arcade rules will be available when this game launches.</p>:<RulesContent game={game} version={ruleset} mode="arcade"/>)}
      {children}
      {admin&&<div className="arcade-upload">
        <label htmlFor={inputId}>{busy?'Uploading…':artwork?.object_path?'Replace artwork':'Upload artwork'}</label>
        <Upload size={16} aria-hidden="true"/>
        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!artwork} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/>
        <small>JPEG, PNG, or WebP · Up to 2 MB</small>
      </div>}
      {error&&<p role="alert">{error}</p>}
    </DialogContent>
  </Dialog>;
}
